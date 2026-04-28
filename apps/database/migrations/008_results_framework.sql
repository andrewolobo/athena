-- ============================================================
-- Migration 008: Results framework & Indicator Tracking Table (ITT)
-- indicators        — SMART indicator definitions set by admins.
-- indicator_actuals — computed actual values per reporting period.
-- ============================================================

CREATE TABLE public.indicators (
    id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                 UUID    NOT NULL REFERENCES public.organizations(id),
    code                   TEXT    NOT NULL,
    name                   TEXT    NOT NULL,
    description            TEXT,
    unit_of_measure        TEXT,
    disaggregations        TEXT[],
    baseline_value         NUMERIC,
    baseline_date          DATE,
    annual_target          NUMERIC,
    reporting_period_start DATE,
    reporting_period_end   DATE,
    source_form_id         UUID    REFERENCES public.forms(id),
    source_field_path      TEXT,
    aggregation_fn         TEXT    CHECK (aggregation_fn IN ('count', 'sum', 'avg', 'count_distinct')),
    filter_expression      TEXT,
    created_by             UUID    REFERENCES public.users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, code)
);

CREATE INDEX idx_indicators_org ON public.indicators (org_id);


CREATE TABLE public.indicator_actuals (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    indicator_id UUID    NOT NULL REFERENCES public.indicators(id),
    period_start DATE    NOT NULL,
    period_end   DATE    NOT NULL,
    actual_value NUMERIC NOT NULL,
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    computed_by  UUID    REFERENCES public.users(id),
    notes        TEXT,
    UNIQUE (indicator_id, period_start, period_end)
);
