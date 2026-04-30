-- ============================================================
-- Migration 011: Sector configuration
-- Tracks per-organisation archive state for each sector
-- (folder_schema). Sectors are not stored as rows elsewhere —
-- they are derived from the folder_schema column on forms.
-- This table provides a persistent home for sector-level
-- metadata without changing the core forms schema.
-- ============================================================

CREATE TABLE public.sector_config (
    org_id          UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    folder_schema   TEXT        NOT NULL,
    is_archived     BOOLEAN     NOT NULL DEFAULT false,
    archived_at     TIMESTAMPTZ,
    archived_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,

    PRIMARY KEY (org_id, folder_schema)
);

-- Fast lookup of all archived sectors for a given org
CREATE INDEX idx_sector_config_org_id ON public.sector_config (org_id);
