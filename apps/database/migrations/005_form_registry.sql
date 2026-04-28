-- ============================================================
-- Migration 005: Form registry
-- forms — one row per survey instrument (stable identity).
-- form_versions — XLSForm definition at each revision.
-- ============================================================

CREATE TABLE public.forms (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID    NOT NULL REFERENCES public.organizations(id),
    folder_schema   TEXT    NOT NULL,
    form_key        TEXT    NOT NULL,
    display_name    TEXT    NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID    REFERENCES public.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, folder_schema, form_key)
);

CREATE TABLE public.form_versions (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id      UUID    NOT NULL REFERENCES public.forms(id),
    version      INTEGER NOT NULL,
    xlsform_json JSONB   NOT NULL,
    published_by UUID    REFERENCES public.users(id),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (form_id, version)
);
