-- ============================================================
-- Migration 007: Data Quality Assurance (DQA)
-- quarantine_queue     — failed DQA submissions awaiting review.
-- submission_conflicts — offline sync collisions for manual merge.
-- ============================================================

CREATE TABLE public.quarantine_queue (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID    NOT NULL REFERENCES public.organizations(id),
    raw_payload     JSONB   NOT NULL,
    entity_id       UUID    REFERENCES public.entities(id),
    form_id         UUID    REFERENCES public.forms(id),
    enumerator_id   UUID    REFERENCES public.users(id),
    device_id       UUID    REFERENCES public.devices(id),
    failure_reason  TEXT    NOT NULL,  -- 'freshness_violation' | 'duplicate_entity' | 'invalid_gps' | 'schema_error'
    failure_detail  JSONB,
    resolved        BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by     UUID    REFERENCES public.users(id),
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quarantine_org    ON public.quarantine_queue (org_id, resolved);
CREATE INDEX idx_quarantine_entity ON public.quarantine_queue (entity_id);
CREATE INDEX idx_quarantine_queued ON public.quarantine_queue (queued_at DESC);


CREATE TABLE public.submission_conflicts (
    id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID    NOT NULL REFERENCES public.organizations(id),
    entity_id               UUID    NOT NULL REFERENCES public.entities(id),
    form_id                 UUID    NOT NULL REFERENCES public.forms(id),
    canonical_submission_id UUID,
    canonical_table         TEXT,
    branch_payload          JSONB   NOT NULL,
    branch_enumerator_id    UUID    REFERENCES public.users(id),
    branch_device_id        UUID    REFERENCES public.devices(id),
    branch_submitted_at     TIMESTAMPTZ,
    resolved                BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by             UUID    REFERENCES public.users(id),
    resolved_at             TIMESTAMPTZ,
    merge_strategy          TEXT    CHECK (merge_strategy IN ('accept_branch', 'keep_canonical', 'manual_merge')),
    merged_payload          JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conflicts_entity   ON public.submission_conflicts (entity_id);
CREATE INDEX idx_conflicts_form     ON public.submission_conflicts (form_id);
CREATE INDEX idx_conflicts_resolved ON public.submission_conflicts (resolved);
