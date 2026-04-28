import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthUser, JwtPayload, Role } from "../types/auth";
import { createError } from "./errorHandler";

// Extend Express Request to carry the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Middleware that validates the HttpOnly JWT cookie and attaches
 * req.user.  Optionally restricts to specific roles.
 *
 * Usage:
 *   router.get("/org/users", requireAuth(["admin"]), handler);
 *   router.get("/submissions", requireAuth(), handler);  // any authenticated role
 */
export function requireAuth(roles?: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // cookie-parser populates req.cookies; fall back to Bearer token.
    const tokenFromCookie: string | undefined = (
      req.cookies as Record<string, string | undefined>
    )?.["athena_session"];

    const authHeader = req.headers.authorization;
    const tokenFromHeader = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const token = tokenFromCookie ?? tokenFromHeader;

    if (!token) {
      return next(createError("Authentication required", 401));
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return next(new Error("JWT_SECRET is not configured"));
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret) as JwtPayload;
    } catch {
      return next(createError("Invalid or expired token", 401));
    }

    if (roles && roles.length > 0 && !roles.includes(payload.role)) {
      return next(
        createError("You do not have permission to access this resource", 403),
      );
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      org_id: payload.org_id,
    };

    next();
  };
}
