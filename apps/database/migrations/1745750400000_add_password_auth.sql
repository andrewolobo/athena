-- ============================================================
-- Migration: Add native username/password authentication
--
-- Adds three columns to public.users:
--   password_hash         — bcrypt hash; NULL for OAuth-only accounts
--   failed_login_attempts — incremented on each wrong password; reset on success
--   locked_until          — set to NOW()+15min after 5 consecutive failures;
--                           NULL means the account is not locked
--
-- OAuth users are unaffected: both columns default to NULL / 0.
-- A user may have both an OAuth identity and a password (dual sign-in).
-- ============================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS password_hash          TEXT,
    ADD COLUMN IF NOT EXISTS failed_login_attempts  INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMPTZ;
