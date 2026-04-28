import { Router, Request, Response } from "express";
import { pool } from "../db";

const router = Router();

/**
 * GET /health
 * Returns API and database status.
 * Used by Nginx upstream health checks and uptime monitors.
 */
router.get("/", async (_req: Request, res: Response) => {
  let dbStatus = "ok";

  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";
  const httpStatus = status === "ok" ? 200 : 503;

  res.status(httpStatus).json({
    status,
    db: dbStatus,
    uptime: Math.floor(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

export default router;
