import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";

const router = Router();

// ── GET /sectors ──────────────────────────────────────────────
// Returns every distinct sector (folder_schema) for the org,
// joined with its archive state from sector_config if present.
router.get(
  "/",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT f.folder_schema,
                COALESCE(sc.is_archived, false) AS is_archived
           FROM public.forms f
           LEFT JOIN public.sector_config sc
             ON sc.org_id = f.org_id AND sc.folder_schema = f.folder_schema
          WHERE f.org_id = $1
          ORDER BY f.folder_schema`,
        [req.user!.org_id],
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /sectors/:folder_schema/archive ─────────────────────
router.patch(
  "/:folder_schema/archive",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify the sector exists for this org
      const exists = await pool.query(
        `SELECT 1 FROM public.forms
          WHERE org_id = $1 AND folder_schema = $2
          LIMIT 1`,
        [req.user!.org_id, req.params.folder_schema],
      );

      if (!exists.rows[0]) {
        return next(createError("Sector not found", 404));
      }

      await pool.query(
        `INSERT INTO public.sector_config (org_id, folder_schema, is_archived, archived_at, archived_by)
         VALUES ($1, $2, true, NOW(), $3)
         ON CONFLICT (org_id, folder_schema)
         DO UPDATE SET is_archived = true, archived_at = NOW(), archived_by = $3`,
        [req.user!.org_id, req.params.folder_schema, req.user!.id],
      );

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /sectors/:folder_schema/unarchive ───────────────────
router.patch(
  "/:folder_schema/unarchive",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify the sector exists for this org
      const exists = await pool.query(
        `SELECT 1 FROM public.forms
          WHERE org_id = $1 AND folder_schema = $2
          LIMIT 1`,
        [req.user!.org_id, req.params.folder_schema],
      );

      if (!exists.rows[0]) {
        return next(createError("Sector not found", 404));
      }

      await pool.query(
        `INSERT INTO public.sector_config (org_id, folder_schema, is_archived, archived_at, archived_by)
         VALUES ($1, $2, false, NULL, NULL)
         ON CONFLICT (org_id, folder_schema)
         DO UPDATE SET is_archived = false, archived_at = NULL, archived_by = NULL`,
        [req.user!.org_id, req.params.folder_schema],
      );

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
