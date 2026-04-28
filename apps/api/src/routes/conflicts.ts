import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";

const router = Router();
router.use(requireAuth(["admin", "supervisor"]));

// ── GET /conflicts ────────────────────────────────────────────
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT id, org_id, entity_id, form_id,
              canonical_submission_id, canonical_table,
              branch_payload, branch_enumerator_id, branch_submitted_at,
              resolved, created_at
         FROM public.submission_conflicts
        WHERE org_id = $1 AND resolved = false
        ORDER BY created_at DESC`,
      [req.user!.org_id],
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /conflicts/:id ────────────────────────────────────────
// Returns the conflict record with the canonical payload fetched live
// from the sector table for a side-by-side diff view.
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conflictResult = await pool.query<{
      id: string;
      org_id: string;
      entity_id: string;
      form_id: string;
      canonical_submission_id: string | null;
      canonical_table: string | null;
      branch_payload: Record<string, unknown>;
      branch_enumerator_id: string | null;
      branch_submitted_at: string | null;
      resolved: boolean;
      created_at: string;
    }>(
      `SELECT id, org_id, entity_id, form_id,
              canonical_submission_id, canonical_table,
              branch_payload, branch_enumerator_id, branch_submitted_at,
              resolved, created_at
         FROM public.submission_conflicts
        WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.user!.org_id],
    );

    if (!conflictResult.rows[0]) {
      return next(createError("Conflict not found", 404));
    }

    const conflict = conflictResult.rows[0];
    let canonicalPayload: Record<string, unknown> | null = null;

    // Fetch canonical payload from the sector table if we have a reference
    if (conflict.canonical_submission_id && conflict.canonical_table) {
      const tableName = conflict.canonical_table;
      // Validate the table name is a safe identifier (schema.table format)
      if (/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(tableName)) {
        const canonResult = await pool.query(
          `SELECT payload FROM ${tableName} WHERE id = $1`,
          [conflict.canonical_submission_id],
        );
        if (canonResult.rows[0]) {
          canonicalPayload = canonResult.rows[0].payload as Record<
            string,
            unknown
          >;
        }
      }
    }

    res.json({
      ...conflict,
      canonical_payload: canonicalPayload,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /conflicts/:id/resolve ───────────────────────────────
const ResolveSchema = z.object({
  merge_strategy: z.enum(["accept_branch", "keep_canonical", "manual_merge"]),
  merged_payload: z.record(z.unknown()).optional(),
});

router.post(
  "/:id/resolve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ResolveSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const { merge_strategy, merged_payload } = parsed.data;

      if (merge_strategy === "manual_merge" && !merged_payload) {
        return next(
          createError(
            "`merged_payload` is required when merge_strategy is 'manual_merge'",
            422,
          ),
        );
      }

      // Load conflict
      const conflictResult = await pool.query<{
        id: string;
        org_id: string;
        canonical_submission_id: string | null;
        canonical_table: string | null;
        branch_payload: Record<string, unknown>;
        resolved: boolean;
      }>(
        `SELECT id, org_id, canonical_submission_id, canonical_table,
                branch_payload, resolved
           FROM public.submission_conflicts
          WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.org_id],
      );

      if (!conflictResult.rows[0]) {
        return next(createError("Conflict not found", 404));
      }

      const conflict = conflictResult.rows[0];

      if (conflict.resolved) {
        return next(createError("Conflict is already resolved", 409));
      }

      // Apply merge strategy to canonical row in sector table
      if (
        conflict.canonical_submission_id &&
        conflict.canonical_table &&
        merge_strategy !== "keep_canonical"
      ) {
        const tableName = conflict.canonical_table;

        if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(tableName)) {
          return next(createError("Invalid canonical table reference", 422));
        }

        let newPayload: Record<string, unknown>;
        if (merge_strategy === "accept_branch") {
          newPayload = conflict.branch_payload;
        } else {
          // manual_merge — merged_payload validated above
          newPayload = merged_payload!;
        }

        await pool.query(
          `UPDATE ${tableName}
              SET payload = $1
            WHERE id = $2`,
          [JSON.stringify(newPayload), conflict.canonical_submission_id],
        );
      }

      // Mark conflict resolved
      await pool.query(
        `UPDATE public.submission_conflicts
            SET resolved        = true,
                resolved_by     = $1,
                resolved_at     = NOW(),
                merge_strategy  = $2,
                merged_payload  = $3
          WHERE id = $4`,
        [
          req.user!.id,
          merge_strategy,
          merged_payload ? JSON.stringify(merged_payload) : null,
          conflict.id,
        ],
      );

      // Audit log
      await pool.query(
        `INSERT INTO public.audit_log
                (org_id, actor_id, action, target_table, target_id, after_state)
         VALUES ($1, $2, 'conflict.resolve', 'submission_conflicts', $3, $4)`,
        [
          req.user!.org_id,
          req.user!.id,
          conflict.id,
          JSON.stringify({ merge_strategy }),
        ],
      );

      res.json({ status: "resolved", merge_strategy });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
