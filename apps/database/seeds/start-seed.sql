-- ============================================================
-- ATHENA — Bootstrap Seed
-- Creates the minimum data required to operate the application:
--   · One organisation
--   · One admin user with a native password (no OAuth required)
--
-- Run after all migrations:
--   psql $DATABASE_URL -f seeds/bootstrap.sql
--
-- Change the password immediately after first login via:
--   POST /auth/change-password
-- ============================================================

BEGIN;

-- ── Organisation ─────────────────────────────────────────────
INSERT INTO public.organizations (id, name, slug, country)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Save the Children',
    'save-the-children',
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- ── Admin user (native password login) ───────────────────────
-- Replace the password_hash value with the output of:
--   node -e "require('bcryptjs').hash('YourChosenPassword', 12).then(console.log)"
INSERT INTO public.users (
    id,
    org_id,
    email,
    display_name,
    role,
    is_active,
    password_hash,
    failed_login_attempts
)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'admin@athena.local',
    'System Admin',
    'admin',
    TRUE,
    '$2b$12$QLFMsBgJgckyGM4LzjWs7.RnpzgXFi6WBm61O4f0sPSadkAptD8qK',
    0
)
ON CONFLICT (email) DO NOTHING;

COMMIT;