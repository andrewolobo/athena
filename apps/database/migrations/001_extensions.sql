-- ============================================================
-- Migration 001: Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "postgis";    -- GEOGRAPHY type
