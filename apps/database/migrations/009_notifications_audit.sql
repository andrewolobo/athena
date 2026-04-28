-- ============================================================
-- Migration 009: Notifications & Audit Log
-- notifications — durable store for in-app SSE alerts.
-- audit_log     — append-only record of sensitive mutations.
-- ============================================================

CREATE TABLE public.notifications (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID    NOT NULL REFERENCES public.organizations(id),
    user_id         UUID    REFERENCES public.users(id),
    type            TEXT    NOT NULL,  -- 'quarantine_alert' | 'conflict_detected' | 'submission_approved'
    title           TEXT    NOT NULL,
    body            TEXT,
    reference_id    UUID,
    reference_table TEXT,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications (user_id, is_read);
CREATE INDEX idx_notifications_org  ON public.notifications (org_id, created_at DESC);


-- Append-only; no FKs so rows are never blocked by cascading deletes.
CREATE TABLE public.audit_log (
    id           BIGSERIAL   PRIMARY KEY,
    org_id       UUID        NOT NULL,
    actor_id     UUID,
    action       TEXT        NOT NULL,  -- 'quarantine.resolve' | 'conflict.merge' | 'user.role_changed'
    target_table TEXT,
    target_id    UUID,
    before_state JSONB,
    after_state  JSONB,
    metadata     JSONB,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org   ON public.audit_log (org_id, occurred_at DESC);
CREATE INDEX idx_audit_actor ON public.audit_log (actor_id);
