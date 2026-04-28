import { Router, Request, Response, NextFunction } from "express";
import { CallbackParamsType } from "openid-client";
import { sign } from "jsonwebtoken";
import { compare, hash } from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db";
import logger from "../logger";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";
import {
  buildAuthorizationUrl,
  getClient,
  Provider,
} from "../modules/auth/oidcClient";

const router = Router();

const COOKIE_NAME = "athena_session";
/** Parse JWT_EXPIRY env var into milliseconds for cookie maxAge.
 *  Accepts plain seconds ("900") or shorthand ("15m", "1h", "2d").
 */
function parseExpiryMs(value: string | undefined): number {
  if (!value) return 15 * 60 * 1000;
  const match = value.match(/^(\d+)(s|m|h|d)?$/);
  if (!match) return 15 * 60 * 1000;
  const n = parseInt(match[1], 10);
  const unit = match[2] ?? "s";
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * (multipliers[unit] ?? 1_000);
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: parseExpiryMs(process.env.JWT_EXPIRY),
};

// In-memory PKCE store. Entries expire after 10 minutes to prevent unbounded growth
// from abandoned OAuth flows. Acceptable for single-instance VPS deployment.
const PKCE_TTL_MS = 10 * 60 * 1000;
const pkceStore = new Map<
  string,
  { codeVerifier: string; provider: Provider; expiresAt: number }
>();

function pkceSet(
  state: string,
  value: { codeVerifier: string; provider: Provider },
): void {
  pkceStore.set(state, { ...value, expiresAt: Date.now() + PKCE_TTL_MS });
}

function pkceGet(
  state: string,
): { codeVerifier: string; provider: Provider } | undefined {
  const entry = pkceStore.get(state);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    pkceStore.delete(state);
    return undefined;
  }
  return entry;
}

// ── GET /auth/google ──────────────────────────────────────────
router.get(
  "/google",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, state, codeVerifier } =
        await buildAuthorizationUrl("google");
      pkceSet(state, { codeVerifier, provider: "google" });
      res.redirect(url);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /auth/microsoft ───────────────────────────────────────
router.get(
  "/microsoft",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, state, codeVerifier } =
        await buildAuthorizationUrl("microsoft");
      pkceSet(state, { codeVerifier, provider: "microsoft" });
      res.redirect(url);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /auth/callback/:provider ──────────────────────────────
router.get(
  "/callback/:provider",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = req.params.provider as Provider;
      if (provider !== "google" && provider !== "microsoft") {
        res.status(400).json({ error: "Unknown provider" });
        return;
      }

      const callbackUrl = process.env.OAUTH_CALLBACK_URL;
      if (!callbackUrl) throw new Error("OAUTH_CALLBACK_URL is not set");

      const client = await getClient(provider);
      const params: CallbackParamsType = client.callbackParams(req);

      const state = params.state as string | undefined;
      const pkceEntry = state ? pkceGet(state) : undefined;
      if (!state || !pkceEntry) {
        res.status(401).json({ error: "Invalid or expired OAuth state" });
        return;
      }

      const { codeVerifier } = pkceEntry;
      pkceStore.delete(state);

      const tokenSet = await client.callback(
        `${callbackUrl}/${provider}`,
        params,
        { state, code_verifier: codeVerifier },
      );

      const claims = tokenSet.claims();
      const email = claims.email as string | undefined;
      if (!email) {
        res.status(401).json({ error: "No email in ID token" });
        return;
      }

      // Upsert user — only match on email within the single org.
      // The org must already exist (seeded or created via admin).
      const upsertResult = await pool.query<{
        id: string;
        org_id: string;
        role: string;
        is_active: boolean;
      }>(
        `INSERT INTO users (email, display_name, oauth_provider, oauth_subject, role, org_id)
         VALUES ($1, $2, $3, $4, 'enumerator',
           (SELECT id FROM organizations LIMIT 1))
         ON CONFLICT (email) DO UPDATE
           SET display_name    = EXCLUDED.display_name,
               oauth_subject   = EXCLUDED.oauth_subject
         RETURNING id, org_id, role, is_active`,
        [
          email,
          (claims.name as string | undefined) ?? email,
          provider,
          claims.sub,
        ],
      );

      const user = upsertResult.rows[0];
      if (!user) {
        res.status(401).json({ error: "Could not resolve user record" });
        return;
      }

      if (!user.is_active) {
        res.status(401).json({ error: "Account is deactivated" });
        return;
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error("JWT_SECRET is not set");

      // jsonwebtoken accepts the raw string ("15m", "1h") or plain seconds.
      const expiresIn = process.env.JWT_EXPIRY ?? "15m";

      const token = sign(
        {
          sub: user.id,
          email,
          role: user.role,
          org_id: user.org_id,
        },
        secret,
        { expiresIn: expiresIn as unknown as number },
      );

      res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
      const appBase = process.env.APP_BASE_URL ?? "/";
      res.redirect(appBase);
    } catch (err) {
      logger.error(err, "OAuth callback failed");
      next(err);
    }
  },
);

// ── POST /auth/login ────────────────────────────────────────
// Rate-limited: 10 requests per 15 minutes per IP.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const BCRYPT_COST = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Generic message used for both wrong-email and wrong-password to prevent
// user enumeration (OWASP A07).
const INVALID_CREDENTIALS_MSG = "Invalid email or password";

router.post(
  "/login",
  loginRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(INVALID_CREDENTIALS_MSG, 401));
      }
      const { email, password } = parsed.data;

      const userResult = await pool.query<{
        id: string;
        org_id: string;
        role: string;
        is_active: boolean;
        password_hash: string | null;
        failed_login_attempts: number;
        locked_until: Date | null;
      }>(
        `SELECT id, org_id, role, is_active, password_hash,
                failed_login_attempts, locked_until
           FROM public.users
          WHERE email = $1`,
        [email.toLowerCase().trim()],
      );

      const user = userResult.rows[0];

      // No user found — still do a dummy compare to prevent timing attacks
      if (!user || !user.password_hash) {
        await compare(
          password,
          "$2b$12$invalidhashfortimingconsistency000000000000000000000000",
        );
        return next(createError(INVALID_CREDENTIALS_MSG, 401));
      }

      if (!user.is_active) {
        return next(createError("Account is deactivated", 401));
      }

      // Check account lockout
      if (user.locked_until && user.locked_until > new Date()) {
        return next(
          createError(
            `Account is temporarily locked. Try again after ${user.locked_until.toISOString()}.`,
            423,
          ),
        );
      }

      const passwordValid = await compare(password, user.password_hash);

      if (!passwordValid) {
        const newAttempts = user.failed_login_attempts + 1;
        const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;
        await pool.query(
          `UPDATE public.users
              SET failed_login_attempts = $1,
                  locked_until = $2
            WHERE id = $3`,
          [
            newAttempts,
            shouldLock
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
              : null,
            user.id,
          ],
        );
        return next(createError(INVALID_CREDENTIALS_MSG, 401));
      }

      // Success — reset lockout counters
      await pool.query(
        `UPDATE public.users
            SET failed_login_attempts = 0,
                locked_until = NULL
          WHERE id = $1`,
        [user.id],
      );

      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error("JWT_SECRET is not set");
      const expiresIn = process.env.JWT_EXPIRY ?? "15m";

      const token = sign(
        { sub: user.id, email, role: user.role, org_id: user.org_id },
        secret,
        { expiresIn: expiresIn as unknown as number },
      );

      res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
      res.json({ ok: true });
    } catch (err) {
      logger.error(err, "Login failed");
      next(err);
    }
  },
);

// ── POST /auth/change-password ────────────────────────────────
const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z
    .string()
    .min(12, "new_password must be at least 12 characters"),
});

router.post(
  "/change-password",
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ChangePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }
      const { current_password, new_password } = parsed.data;

      const userResult = await pool.query<{ password_hash: string | null }>(
        `SELECT password_hash FROM public.users WHERE id = $1`,
        [req.user!.id],
      );

      const passwordHash = userResult.rows[0]?.password_hash;
      if (!passwordHash) {
        return next(
          createError(
            "This account does not have a local password. Use OAuth to sign in.",
            400,
          ),
        );
      }

      const valid = await compare(current_password, passwordHash);
      if (!valid) {
        return next(createError("Current password is incorrect", 401));
      }

      const newHash = await hash(new_password, BCRYPT_COST);
      await pool.query(
        `UPDATE public.users SET password_hash = $1 WHERE id = $2`,
        [newHash, req.user!.id],
      );

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /auth/logout ─────────────────────────────────────────
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  res.sendStatus(204);
});

// ── GET /auth/me ──────────────────────────────────────────────
router.get("/me", requireAuth(), (req: Request, res: Response) => {
  res.json(req.user);
});

export default router;
