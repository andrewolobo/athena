-- ============================================================
-- Migration 004: Noun layer — Identity Registry
-- Entities are the persistent subjects of all data collection.
-- Created once at baseline enrolment; never deleted or merged.
-- ============================================================

CREATE TABLE public.entities (
    id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID    NOT NULL REFERENCES public.organizations(id),
    entity_type   TEXT    NOT NULL,  -- 'beneficiary' | 'household' | 'water_point' | 'clinic' | 'facility'
    external_id   TEXT,
    registered_by UUID    REFERENCES public.users(id),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata      JSONB   NOT NULL DEFAULT '{}',
    UNIQUE (org_id, entity_type, external_id)
);

CREATE INDEX idx_entities_org      ON public.entities (org_id);
CREATE INDEX idx_entities_type     ON public.entities (entity_type);
CREATE INDEX idx_entities_metadata ON public.entities USING GIN (metadata);
