import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";

const router = Router();

// All device routes require admin role
router.use(requireAuth(["admin"]));

// ── GET /org/devices ──────────────────────────────────────────
// Returns all devices registered in the org, joined with user info.
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT
         d.id,
         d.user_id,
         d.device_id,
         d.sim_serial,
         d.phone_number,
         d.last_seen_at,
         d.registered_at,
         u.email          AS user_email,
         u.display_name   AS user_display_name
       FROM public.devices d
       JOIN public.users u ON u.id = d.user_id
       WHERE u.org_id = $1
       ORDER BY d.registered_at DESC`,
      [req.user!.org_id],
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /org/devices/:id ───────────────────────────────────
// Hard-deletes a device registration after verifying org ownership.
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only delete if the device belongs to this admin's org
      const check = await pool.query(
        `SELECT d.id
         FROM public.devices d
         JOIN public.users u ON u.id = d.user_id
         WHERE d.id = $1 AND u.org_id = $2`,
        [req.params.id, req.user!.org_id],
      );
      if (!check.rows[0]) {
        return next(createError("Device not found", 404));
      }

      await pool.query("DELETE FROM public.devices WHERE id = $1", [
        req.params.id,
      ]);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
