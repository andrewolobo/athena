import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";

const router = Router();

// ── GET /entities/sync ────────────────────────────────────────
// Must be registered before /:id to avoid "sync" being treated as a UUID.
router.get(
  "/sync",
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { since } = req.query;

      if (!since || typeof since !== "string") {
        return next(
          createError("Query param `since` (ISO timestamp) is required", 422),
        );
      }

      const sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        return next(
          createError("`since` must be a valid ISO 8601 timestamp", 422),
        );
      }

      const result = await pool.query(
        `SELECT id, org_id, entity_type, external_id,
                registered_by, registered_at, metadata
           FROM public.entities
          WHERE org_id = $1
            AND registered_at > $2
          ORDER BY registered_at ASC`,
        [req.user!.org_id, sinceDate.toISOString()],
      );

      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /entities ─────────────────────────────────────────────
router.get(
  "/",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(
        200,
        Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)),
      );
      const offset = (page - 1) * limit;

      const { entity_type, registered_after, search } = req.query;

      const conditions: string[] = ["org_id = $1"];
      const params: unknown[] = [req.user!.org_id];
      let idx = 2;

      if (entity_type && typeof entity_type === "string") {
        conditions.push(`entity_type = $${idx++}`);
        params.push(entity_type);
      }

      if (registered_after && typeof registered_after === "string") {
        const d = new Date(registered_after);
        if (!isNaN(d.getTime())) {
          conditions.push(`registered_at > $${idx++}`);
          params.push(d.toISOString());
        }
      }

      if (search && typeof search === "string" && search.trim()) {
        // GIN-backed case-insensitive search over the JSONB metadata blob
        conditions.push(`metadata::text ILIKE $${idx++}`);
        params.push(`%${search.trim().replace(/[%_]/g, "\\$&")}%`);
      }

      const where = conditions.join(" AND ");

      const [countResult, rowsResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FROM public.entities WHERE ${where}`,
          params,
        ),
        pool.query(
          `SELECT id, org_id, entity_type, external_id,
                  registered_by, registered_at, metadata
             FROM public.entities
            WHERE ${where}
            ORDER BY registered_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, limit, offset],
        ),
      ]);

      const total = parseInt(countResult.rows[0].count, 10);

      res.json({
        data: rowsResult.rows,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /entities ────────────────────────────────────────────
const CreateEntitySchema = z.object({
  entity_type: z.string().min(1).max(100),
  external_id: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});

router.post(
  "/",
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateEntitySchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const { entity_type, external_id, metadata } = parsed.data;

      const result = await pool.query(
        `INSERT INTO public.entities
                (org_id, entity_type, external_id, registered_by, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, org_id, entity_type, external_id,
                   registered_by, registered_at, metadata`,
        [
          req.user!.org_id,
          entity_type,
          external_id ?? null,
          req.user!.id,
          JSON.stringify(metadata ?? {}),
        ],
      );

      res.status(201).json(result.rows[0]);
    } catch (err: unknown) {
      // Unique constraint: (org_id, entity_type, external_id)
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "23505"
      ) {
        return next(
          createError(
            "An entity with this type and external_id already exists in your organisation",
            409,
          ),
        );
      }
      next(err);
    }
  },
);

// ── GET /entities/:id ─────────────────────────────────────────
router.get(
  "/:id",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT id, org_id, entity_type, external_id,
                registered_by, registered_at, metadata
           FROM public.entities
          WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.org_id],
      );

      if (!result.rows[0]) {
        return next(createError("Entity not found", 404));
      }

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
