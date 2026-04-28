import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { hash } from "bcryptjs";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";

const BCRYPT_COST = 12;

const router = Router();

// All org routes require authentication
router.use(requireAuth());

// ── GET /org ──────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      "SELECT id, name, slug, country, created_at FROM organizations WHERE id = $1",
      [req.user!.org_id],
    );
    if (!result.rows[0]) {
      return next(createError("Organisation not found", 404));
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── PUT /org ──────────────────────────────────────────────────
const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  country: z.string().min(1).max(100).optional(),
});

router.put(
  "/",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateOrgSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const { name, slug, country } = parsed.data;
      const result = await pool.query(
        `UPDATE organizations
            SET name    = COALESCE($1, name),
                slug    = COALESCE($2, slug),
                country = COALESCE($3, country)
          WHERE id = $4
          RETURNING id, name, slug, country, created_at`,
        [name ?? null, slug ?? null, country ?? null, req.user!.org_id],
      );
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /org/users ────────────────────────────────────────────
router.get(
  "/users",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT id, org_id, email, display_name, role, is_active, created_at
           FROM users
          WHERE org_id = $1
          ORDER BY created_at DESC`,
        [req.user!.org_id],
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /org/users (invite / create) ────────────────────────
// Passing `password` creates a local-auth account (active immediately).
// Omitting `password` creates an OAuth-only placeholder (inactive until first OAuth login).
const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "supervisor", "enumerator"]),
  display_name: z.string().max(255).optional(),
  password: z
    .string()
    .min(12, "password must be at least 12 characters")
    .optional(),
});

router.post(
  "/users",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = InviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const { email, role, display_name, password } = parsed.data;

      const passwordHash = password ? await hash(password, BCRYPT_COST) : null;
      // Local-password accounts are active immediately;
      // OAuth-only placeholders are inactive until first OAuth login.
      const isActive = passwordHash !== null;

      const result = await pool.query(
        `INSERT INTO public.users (email, display_name, role, org_id, is_active, password_hash)
              VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, org_id, email, display_name, role, is_active, created_at`,
        [
          email,
          display_name ?? null,
          role,
          req.user!.org_id,
          isActive,
          passwordHash,
        ],
      );

      if (!result.rows[0]) {
        return next(createError("A user with that email already exists", 409));
      }

      // Audit log
      await pool.query(
        `INSERT INTO audit_log (org_id, actor_id, action, target_table, target_id, after_state)
              VALUES ($1, $2, 'invite_user', 'users', $3, $4)`,
        [
          req.user!.org_id,
          req.user!.id,
          result.rows[0].id,
          JSON.stringify({ email, role, has_password: passwordHash !== null }),
        ],
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /org/users/:id/set-password ─────────────────────────
// Admin-only: set or reset any user's password without knowing the current one.
// Also activates and unlocks the account.
const SetPasswordSchema = z.object({
  new_password: z
    .string()
    .min(12, "new_password must be at least 12 characters"),
});

router.post(
  "/users/:id/set-password",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const newHash = await hash(parsed.data.new_password, BCRYPT_COST);

      const result = await pool.query(
        `UPDATE public.users
            SET password_hash         = $1,
                failed_login_attempts = 0,
                locked_until          = NULL,
                is_active             = TRUE
          WHERE id = $2 AND org_id = $3
         RETURNING id`,
        [newHash, req.params.id, req.user!.org_id],
      );

      if (!result.rows[0]) {
        return next(createError("User not found", 404));
      }

      await pool.query(
        `INSERT INTO audit_log (org_id, actor_id, action, target_table, target_id, after_state)
              VALUES ($1, $2, 'user.password_reset', 'users', $3, $4)`,
        [
          req.user!.org_id,
          req.user!.id,
          req.params.id,
          JSON.stringify({ reset_by_admin: true }),
        ],
      );

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /org/users/:id/role ─────────────────────────────────
const UpdateRoleSchema = z.object({
  role: z.enum(["admin", "supervisor", "enumerator"]),
});

router.patch(
  "/users/:id/role",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const result = await pool.query(
        `UPDATE users
            SET role = $1
          WHERE id = $2 AND org_id = $3
         RETURNING id, org_id, email, display_name, role, is_active, created_at`,
        [parsed.data.role, req.params.id, req.user!.org_id],
      );

      if (!result.rows[0]) {
        return next(createError("User not found", 404));
      }

      await pool.query(
        `INSERT INTO audit_log (org_id, actor_id, action, target_table, target_id, after_state)
              VALUES ($1, $2, 'update_role', 'users', $3, $4)`,
        [
          req.user!.org_id,
          req.user!.id,
          req.params.id,
          JSON.stringify({ role: parsed.data.role }),
        ],
      );

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /org/users/:id ─────────────────────────────────────
router.delete(
  "/users/:id",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.params.id === req.user!.id) {
        return next(createError("Cannot deactivate your own account", 400));
      }

      const result = await pool.query(
        `UPDATE users
            SET is_active = false
          WHERE id = $1 AND org_id = $2
         RETURNING id`,
        [req.params.id, req.user!.org_id],
      );

      if (!result.rows[0]) {
        return next(createError("User not found", 404));
      }

      await pool.query(
        `INSERT INTO audit_log (org_id, actor_id, action, target_table, target_id, after_state)
              VALUES ($1, $2, 'deactivate_user', 'users', $3, $4)`,
        [
          req.user!.org_id,
          req.user!.id,
          req.params.id,
          JSON.stringify({ is_active: false }),
        ],
      );

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
