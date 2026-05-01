/**
 * Dashboards module — named containers for pinned insights.
 *
 *   GET    /dashboards        list the caller's dashboards
 *   POST   /dashboards        create a dashboard
 *   PATCH  /dashboards/:id    update name / description / is_default / display_order
 *   DELETE /dashboards/:id    delete dashboard + cascade its insights
 *
 * Security model:
 *  - All routes gated by requireAuth(["admin", "supervisor"]).
 *  - Every read/write is scoped to req.user.id; users cannot access or
 *    modify each other's dashboards.
 *  - The is_default invariant (one default per user) is enforced in both
 *    the DB (partial unique index) and the route handler (transactional
 *    clear-then-set). The DB constraint is the authoritative backstop.
 *  - Dashboard cap (20 per user) is enforced before INSERT to keep the
 *    grid navigable; the check has a benign race under concurrent creates
 *    (acceptable at Alpha scope).
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";

const router = Router();
router.use(requireAuth(["admin", "supervisor"]));

// ── Constants ─────────────────────────────────────────────────

/** Hard cap on dashboards per user. Keeps the tab bar navigable. */
const MAX_DASHBOARDS_PER_USER = 20;

// ── Zod schemas ───────────────────────────────────────────────

const CreateDashboardSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  is_default: z.boolean().optional(),
});

const UpdateDashboardSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  is_default: z.boolean().optional(),
  display_order: z.number().int().nonnegative().optional(),
});

// ── GET /dashboards ───────────────────────────────────────────
// Returns all dashboards for the authenticated user, ordered with the
// default first, then by display_order, then by creation time.
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT id, org_id, user_id, name, description,
              is_default, display_order, created_at, updated_at
         FROM public.user_dashboards
        WHERE user_id = $1
        ORDER BY is_default DESC, display_order ASC, created_at ASC`,
      [req.user!.id],
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ── POST /dashboards ──────────────────────────────────────────
// Creates a new dashboard. If is_default=true, atomically clears the
// existing default in the same transaction before setting this one.
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateDashboardSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(parsed.error.issues[0].message, 422));
    }
    const d = parsed.data;

    // Per-user cap check. Benign race under concurrent creates is acceptable.
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM public.user_dashboards
        WHERE user_id = $1`,
      [req.user!.id],
    );
    const existing = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);
    if (existing >= MAX_DASHBOARDS_PER_USER) {
      return next(
        createError(
          `You have reached the limit of ${MAX_DASHBOARDS_PER_USER} dashboards`,
          409,
        ),
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Clear the existing default before setting a new one so the
      // partial unique index constraint is never violated mid-transaction.
      if (d.is_default) {
        await client.query(
          `UPDATE public.user_dashboards
              SET is_default = FALSE
            WHERE user_id = $1`,
          [req.user!.id],
        );
      }

      // Append after the last existing dashboard.
      const orderResult = await client.query<{ next_order: number }>(
        `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
           FROM public.user_dashboards
          WHERE user_id = $1`,
        [req.user!.id],
      );
      const display_order = orderResult.rows[0]?.next_order ?? 0;

      const insertResult = await client.query(
        `INSERT INTO public.user_dashboards
                (org_id, user_id, name, description, is_default, display_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, org_id, user_id, name, description,
                   is_default, display_order, created_at, updated_at`,
        [
          req.user!.org_id,
          req.user!.id,
          d.name,
          d.description ?? null,
          d.is_default ?? false,
          display_order,
        ],
      );

      await client.query("COMMIT");
      res.status(201).json(insertResult.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ── PATCH /dashboards/:id ─────────────────────────────────────
// Owner-only update. When is_default=true, atomically demotes any
// existing default before promoting this dashboard.
router.patch(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateDashboardSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }
      const patch = parsed.data;

      if (Object.keys(patch).length === 0) {
        return next(createError("Request body has no updatable fields", 422));
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Confirm ownership before any write.
        const ownCheck = await client.query(
          `SELECT id FROM public.user_dashboards
            WHERE id = $1 AND user_id = $2`,
          [req.params.id, req.user!.id],
        );
        if (!ownCheck.rows[0]) {
          await client.query("ROLLBACK");
          return next(createError("Dashboard not found", 404));
        }

        // Demote the current default before promoting the target row.
        if (patch.is_default === true) {
          await client.query(
            `UPDATE public.user_dashboards
                SET is_default = FALSE
              WHERE user_id = $1`,
            [req.user!.id],
          );
        }

        // Build a dynamic UPDATE — only touch fields present in the patch.
        const sets: string[] = [];
        const params: unknown[] = [];
        let idx = 1;
        const push = (col: string, val: unknown): void => {
          sets.push(`${col} = $${idx++}`);
          params.push(val);
        };

        if (patch.name !== undefined) push("name", patch.name);
        if (patch.description !== undefined)
          push("description", patch.description);
        if (patch.is_default !== undefined)
          push("is_default", patch.is_default);
        if (patch.display_order !== undefined)
          push("display_order", patch.display_order);

        sets.push(`updated_at = NOW()`);
        params.push(req.params.id, req.user!.id);
        const idParam = idx++;
        const userParam = idx++;

        const updateResult = await client.query(
          `UPDATE public.user_dashboards
              SET ${sets.join(", ")}
            WHERE id = $${idParam} AND user_id = $${userParam}
           RETURNING id, org_id, user_id, name, description,
                     is_default, display_order, created_at, updated_at`,
          params,
        );

        await client.query("COMMIT");
        res.json(updateResult.rows[0]);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /dashboards/:id ────────────────────────────────────
// Owner-only hard delete. ON DELETE CASCADE in the schema propagates
// the deletion to all user_insights rows bound to this dashboard.
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `DELETE FROM public.user_dashboards
          WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [req.params.id, req.user!.id],
      );
      if (!result.rows[0]) {
        return next(createError("Dashboard not found", 404));
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
