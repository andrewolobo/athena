# Plan: Add Native Username/Password Auth

## Current State (discovered)

- `users` table: has `oauth_provider`, `oauth_subject` columns — NO `password_hash` column
- Auth is 100% OAuth OIDC (Google + Microsoft via `openid-client`) with PKCE
- JWT issued after OAuth callback → `athena_session` HttpOnly cookie
- `requireAuth` middleware validates JWT — auth-method agnostic, no changes needed
- `POST /org/users` creates users but only sets email + role (no password field)
- No password hashing library in dependencies
- `UNIQUE (oauth_provider, oauth_subject)`: PostgreSQL treats `NULL ≠ NULL` so multiple local users can both have NULL oauth values — safe

## Phase A — Migration

- New file: `apps/database/migrations/1745750400000_add_password_auth.sql`
- `ALTER TABLE public.users ADD COLUMN password_hash TEXT`
- `ALTER TABLE public.users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0`
- `ALTER TABLE public.users ADD COLUMN locked_until TIMESTAMPTZ`

## Phase B — Dependencies

- `bcryptjs` + `@types/bcryptjs` (pure JS, no native build tools needed)
- `express-rate-limit` (rate limit `/auth/login`)

## Phase C — New routes in `auth.ts`

- `POST /auth/login` — email + password, issues same JWT + cookie as OAuth flow
- `POST /auth/change-password` — `requireAuth()`, validates `current_password` + sets new

## Phase D — Admin password management in `org.ts`

- `POST /org/users` — add optional `password` field (admin creates local-auth users)
- `POST /org/users/:id/set-password` — admin resets any user's password (no `current_password` required)

## Phase E — Rate limiting

- Apply to `POST /auth/login`: 10 requests / 15 min per IP

## Key security decisions

- bcrypt cost factor: 12
- Lockout: 5 failed attempts → `locked_until = NOW() + 15 min`; reset on successful login
- Same error message for wrong email and wrong password (no user enumeration)
- Password min length: 12 chars (zod validation)
- No email-based password reset in Alpha — admin uses `set-password` endpoint

## Files to modify/create

- `apps/database/migrations/1745750400000_add_password_auth.sql` (NEW)
- `apps/api/src/routes/auth.ts` (add `POST /login`, `POST /change-password`)
- `apps/api/src/routes/org.ts` (add optional `password` to `POST /users`, add `POST /users/:id/set-password`)
- `apps/api/package.json` (add `bcryptjs`, `express-rate-limit` + their `@types/*`)

## Further considerations

1. **Email-based password reset** — not in Alpha scope. Admin uses `set-password`. A proper reset flow (generate token → email link → one-time use) is straightforward to add later using the existing `nodemailer` dependency.
2. **Users who have both OAuth and password** — the schema allows it (both `oauth_subject` and `password_hash` set). For Alpha, treat it as fine — a user can sign in either way.
3. **Account lockout granularity** — lockout is per-account (tracked in DB), not per-IP. The rate limiter covers IP-level abuse; DB lockout covers credential stuffing against a known email. Both layers together satisfy OWASP A07.
