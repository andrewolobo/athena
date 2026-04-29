-- ============================================================
-- Migration: User insights (Insight Builder)
--
-- Stores per-user pinned chart configurations created from the
-- Data Explorer's Insight Builder side panel. Each row binds a
-- single form field to a chart type and rendering options.
--
-- folder_schema and form_key are denormalised alongside form_id
-- so aggregation queries can validate identifiers without an
-- extra join (the same pattern reporting.ts already uses).
-- ============================================================

CREATE TABLE public.user_insights (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL REFERENCES public.organizations(id),
    user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Source binding
    form_id         UUID        NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    folder_schema   TEXT        NOT NULL,    -- e.g. 'wash_sector'
    form_key        TEXT        NOT NULL,    -- e.g. 'water_point_baseline'
    field_name      TEXT        NOT NULL,    -- payload JSONB key, e.g. 'gender'

    -- Display & rendering
    title           TEXT        NOT NULL,
    description     TEXT,
    chart_type      TEXT        NOT NULL CHECK (
                          chart_type IN ('pie', 'bar_horizontal', 'line')
                       ),
    data_kind       TEXT        NOT NULL CHECK (
                          data_kind IN ('categorical', 'temporal')
                       ),
    -- Temporal-only granularity. NULL for categorical insights.
    time_grain      TEXT        CHECK (time_grain IN ('day', 'week', 'month')),

    -- Snapshot of filters applied at pin time, e.g. {"status":"approved"}.
    -- Open-ended JSONB so new filter dimensions don't require a migration.
    filters         JSONB       NOT NULL DEFAULT '{}',

    -- Dashboard layout
    is_pinned       BOOLEAN     NOT NULL DEFAULT TRUE,
    pin_order       INTEGER     NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Loading the home dashboard's pinned-insights grid.
CREATE INDEX idx_user_insights_user ON public.user_insights (user_id, is_pinned, pin_order);

-- Org-scoped reporting / cleanup.
CREATE INDEX idx_user_insights_org  ON public.user_insights (org_id);

-- Cascade lookups when a form is deleted.
CREATE INDEX idx_user_insights_form ON public.user_insights (form_id);
