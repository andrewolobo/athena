-- ============================================================
-- Migration: User dashboards (Custom Dashboards)
--
-- Introduces named, navigable dashboard containers for pinned
-- insights. Each user can own up to 20 dashboards; one may be
-- designated as the default (shown on the home /dashboard page).
--
-- Extends user_insights with a dashboard_id FK so each pinned
-- chart belongs to a specific dashboard. dashboard_id is nullable
-- so pre-existing insights are not broken (backward compatible).
-- Deleting a dashboard cascades to its insights.
--
-- Partial unique index (WHERE is_default = TRUE) is the idiomatic
-- PostgreSQL approach for enforcing a single default per user
-- without application-level boolean workarounds.
-- ============================================================

CREATE TABLE public.user_dashboards (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID        NOT NULL REFERENCES public.organizations(id),
    user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    description   TEXT        CHECK (char_length(description) <= 300),
    is_default    BOOLEAN     NOT NULL DEFAULT FALSE,
    display_order INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce exactly one default dashboard per user.
-- Partial index: only rows where is_default = TRUE participate,
-- so non-default rows are unconstrained.
CREATE UNIQUE INDEX idx_user_dashboards_one_default
    ON public.user_dashboards (user_id) WHERE (is_default = TRUE);

-- Primary access pattern: load all dashboards for a user ordered by position.
CREATE INDEX idx_user_dashboards_user
    ON public.user_dashboards (user_id, display_order);

-- Org-scoped cleanup / reporting.
CREATE INDEX idx_user_dashboards_org
    ON public.user_dashboards (org_id);

-- Bind existing user_insights rows to a dashboard.
-- NULL = legacy insight created before this migration (home dashboard renders these as-is).
-- ON DELETE CASCADE: removing a dashboard removes all of its pinned charts.
ALTER TABLE public.user_insights
    ADD COLUMN dashboard_id UUID REFERENCES public.user_dashboards(id) ON DELETE CASCADE;

-- Loading a single dashboard's insight grid, ordered by pin_order.
CREATE INDEX idx_user_insights_dashboard
    ON public.user_insights (dashboard_id, pin_order);
