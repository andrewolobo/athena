import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";
import { pool } from "../db";
import { addSseClient, removeSseClient } from "../modules/notifications";

const router = Router();

// ── GET /notifications/stream ─────────────────────────────────
// Long-lived SSE connection; pushes events to supervisor/admin clients.
router.get(
  "/stream",
  requireAuth(["admin", "supervisor"]),
  (req: Request, res: Response) => {
    // SSE headers — Nginx config must set proxy_buffering off on this path
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx buffering
    });
    res.flushHeaders();

    // Send a heartbeat comment every 30 s to keep the connection alive
    // through proxies that close idle connections.
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30_000);

    const orgId = req.user!.org_id;
    addSseClient(orgId, res);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeSseClient(orgId, res);
    });
  },
);

// ── GET /notifications ────────────────────────────────────────
router.get(
  "/",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)),
      );
      const offset = (page - 1) * limit;

      const [countResult, rowsResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FROM public.notifications
            WHERE org_id = $1 AND (user_id = $2 OR user_id IS NULL)`,
          [req.user!.org_id, req.user!.id],
        ),
        pool.query(
          `SELECT id, org_id, user_id, type, title, body,
                  reference_id, reference_table, is_read, created_at
             FROM public.notifications
            WHERE org_id = $1 AND (user_id = $2 OR user_id IS NULL)
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4`,
          [req.user!.org_id, req.user!.id, limit, offset],
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

// ── PATCH /notifications/:id/read ─────────────────────────────
router.patch(
  "/:id/read",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `UPDATE public.notifications
            SET is_read = true
          WHERE id = $1
            AND org_id = $2
            AND (user_id = $3 OR user_id IS NULL)
         RETURNING id`,
        [req.params.id, req.user!.org_id, req.user!.id],
      );

      if (!result.rows[0]) {
        return next(createError("Notification not found", 404));
      }

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
