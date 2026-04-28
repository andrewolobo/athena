-- ============================================================
-- Migration 003: Administrative layer
-- Organizations, users, devices.
-- ============================================================

CREATE TABLE public.organizations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    slug        TEXT        UNIQUE NOT NULL,
    country     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OAuth-only authentication (Google / Microsoft via OIDC).
-- No local password column.
CREATE TABLE public.users (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID    NOT NULL REFERENCES public.organizations(id),
    email           TEXT    UNIQUE NOT NULL,
    display_name    TEXT,
    role            TEXT    NOT NULL CHECK (role IN ('admin', 'supervisor', 'enumerator')),
    oauth_provider  TEXT,
    oauth_subject   TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (oauth_provider, oauth_subject)
);

CREATE TABLE public.devices (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES public.users(id),
    device_id     TEXT        NOT NULL UNIQUE,
    sim_serial    TEXT,
    phone_number  TEXT,
    last_seen_at  TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
