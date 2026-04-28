import { Request, Response, NextFunction } from "express";
import logger from "../logger";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const message =
    err.isOperational || statusCode < 500
      ? err.message
      : "Internal server error";

  if (statusCode >= 500) {
    logger.error({ err, req: { method: req.method, url: req.url } }, message);
  }

  res.status(statusCode).json({ error: message });
}

/** Convenience factory for operational (user-facing) errors. */
export function createError(message: string, statusCode: number): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}
