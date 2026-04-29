-- ============================================================
-- ATHENA M&E PLATFORM — DATABASE SCHEMA
-- PostgreSQL 15+ with PostGIS
-- ============================================================
--
-- Core Design Principles
-- ──────────────────────
-- NOUN LAYER  → public.entities
--   Every subject (participant, facility, household) receives
--   one immutable UUID at baseline.  This record never changes;
--   it is the anchor for all longitudinal data.
--
-- VERB LAYER  → sector_*.submissions_*
--   Each survey event is a "verb" — something that happened
--   to a noun.  Submissions reference entities via entity_id,
--   enabling cross-form, cross-time joins without duplication.
--
-- FOLDER MODEL → PostgreSQL schemas as sector namespaces
--   wash_sector, health_sector, etc. isolate forms (tables)
--   by programmatic area while sharing the same entity registry.
--
-- HYBRID STORAGE → relational metadata + JSONB payload
--   Core tracking columns are rigid relational; survey answers
--   are stored as JSONB so XLSForm definitions can evolve
--   without schema migrations.
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "postgis";    -- GEOGRAPHY type


-- ============================================================
-- FOLDER (SECTOR) SCHEMAS
-- Add one CREATE SCHEMA per programmatic sector.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS wash_sector;
CREATE SCHEMA IF NOT EXISTS health_sector;


-- ============================================================
-- SECTION 1: ADMINISTRATIVE LAYER  (public schema)
-- Organizations, users, and device registry.
-- ============================================================

CREATE TABLE public.organizations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    slug        TEXT        UNIQUE NOT NULL,   -- e.g. 'kenya-office'
    country     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- OAuth-only authentication (Google / Microsoft via OIDC).
-- No local password column; oauth_provider + oauth_subject
-- are the stable identity claims returned after SSO.
CREATE TABLE public.users (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID    NOT NULL REFERENCES public.organizations(id),
    email           TEXT    UNIQUE NOT NULL,
    display_name    TEXT,
    role            TEXT    NOT NULL CHECK (role IN ('admin', 'supervisor', 'enumerator')),
    oauth_provider  TEXT,           -- 'google' | 'microsoft'
    oauth_subject   TEXT,           -- provider-issued sub claim
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (oauth_provider, oauth_subject)
);


-- Tracks Android devices used for field data collection.
-- device_id fingerprint is auto-captured by the XLSForm engine
-- and used in freshness / uniqueness DQA checks.
CREATE TABLE public.devices (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES public.users(id),
    device_id    TEXT NOT NULL UNIQUE,
    sim_serial   TEXT,
    phone_number TEXT,
    last_seen_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 2: THE NOUN LAYER — Identity Registry
-- ============================================================
-- Entities are the persistent subjects of all data collection.
-- Created once at baseline enrolment; never deleted or merged.
-- Every submission in every sector schema links back here.
-- ============================================================

CREATE TABLE public.entities (
    id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID    NOT NULL REFERENCES public.organizations(id),
    -- Broad category that governs which forms can target this entity.
    entity_type   TEXT    NOT NULL,  -- 'beneficiary' | 'household' | 'water_point' | 'clinic' | 'facility'
    -- Identifier from a paper register or legacy system, if any.
    external_id   TEXT,
    registered_by UUID    REFERENCES public.users(id),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Stable baseline attributes (name, GPS, registration details).
    -- Immutable after enrolment; changes go through a follow-up form.
    metadata      JSONB   NOT NULL DEFAULT '{}',
    UNIQUE (org_id, entity_type, external_id)
);

CREATE INDEX idx_entities_org      ON public.entities (org_id);
CREATE INDEX idx_entities_type     ON public.entities (entity_type);
CREATE INDEX idx_entities_metadata ON public.entities USING GIN (metadata);


-- ============================================================
-- SECTION 3: FORM REGISTRY
-- ============================================================
-- forms holds one row per survey instrument (stable identity).
-- form_versions holds the XLSForm definition at each revision,
-- so historical submissions always resolve against the exact
-- field list / skip logic that was active when collected.
-- ============================================================

CREATE TABLE public.forms (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID    NOT NULL REFERENCES public.organizations(id),
    folder_schema   TEXT    NOT NULL,   -- target PostgreSQL schema, e.g. 'wash_sector'
    form_key        TEXT    NOT NULL,   -- stable machine id, e.g. 'water_point_baseline'
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
    xlsform_json JSONB   NOT NULL,   -- parsed field definitions, skip logic, calculations
    published_by UUID    REFERENCES public.users(id),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (form_id, version)
);


-- ============================================================
-- SECTION 4: THE VERB LAYER — Sector Submission Tables
-- ============================================================
-- Each submission table represents one survey instrument.
-- The mandatory columns below are the same for every form:
--   entity_id   → Noun/Verb link back to public.entities
--   form_id     → which instrument was used
--   form_version → which field definition was active
--   enumerator / device → who collected it and from where
--   start/end times → freshness DQA inputs
--   location    → PostGIS point for geospatial queries
--   payload     → JSONB survey answers (schema-on-read)
--   status      → DQA lifecycle state
--
-- WASH SECTOR
-- ============================================================

CREATE TABLE wash_sector.submissions_water_point_baseline (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id          UUID        NOT NULL REFERENCES public.entities(id),
    form_id            UUID        NOT NULL REFERENCES public.forms(id),
    form_version       INTEGER     NOT NULL,
    enumerator_id      UUID        NOT NULL REFERENCES public.users(id),
    device_id          UUID        REFERENCES public.devices(id),
    start_time         TIMESTAMPTZ NOT NULL,
    end_time           TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    location           GEOGRAPHY(POINT, 4326),
    payload            JSONB       NOT NULL,
    status             TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'quarantined', 'flagged')),
    dqa_notes          TEXT
);

CREATE INDEX idx_wpb_entity   ON wash_sector.submissions_water_point_baseline (entity_id);
CREATE INDEX idx_wpb_form     ON wash_sector.submissions_water_point_baseline (form_id);
CREATE INDEX idx_wpb_status   ON wash_sector.submissions_water_point_baseline (status);
CREATE INDEX idx_wpb_payload  ON wash_sector.submissions_water_point_baseline USING GIN (payload);
CREATE INDEX idx_wpb_location ON wash_sector.submissions_water_point_baseline USING GIST (location);


CREATE TABLE wash_sector.submissions_latrine_inspection (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id          UUID        NOT NULL REFERENCES public.entities(id),
    form_id            UUID        NOT NULL REFERENCES public.forms(id),
    form_version       INTEGER     NOT NULL,
    enumerator_id      UUID        NOT NULL REFERENCES public.users(id),
    device_id          UUID        REFERENCES public.devices(id),
    start_time         TIMESTAMPTZ NOT NULL,
    end_time           TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    location           GEOGRAPHY(POINT, 4326),
    payload            JSONB       NOT NULL,
    status             TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'quarantined', 'flagged')),
    dqa_notes          TEXT
);

CREATE INDEX idx_li_entity   ON wash_sector.submissions_latrine_inspection (entity_id);
CREATE INDEX idx_li_payload  ON wash_sector.submissions_latrine_inspection USING GIN (payload);
CREATE INDEX idx_li_location ON wash_sector.submissions_latrine_inspection USING GIST (location);


-- HEALTH SECTOR
-- ────────────────────────────────────────────────────────────

CREATE TABLE health_sector.submissions_vaccination_tracker (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id          UUID        NOT NULL REFERENCES public.entities(id),
    form_id            UUID        NOT NULL REFERENCES public.forms(id),
    form_version       INTEGER     NOT NULL,
    enumerator_id      UUID        NOT NULL REFERENCES public.users(id),
    device_id          UUID        REFERENCES public.devices(id),
    start_time         TIMESTAMPTZ NOT NULL,
    end_time           TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    location           GEOGRAPHY(POINT, 4326),
    payload            JSONB       NOT NULL,
    status             TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'quarantined', 'flagged')),
    dqa_notes          TEXT
);

CREATE INDEX idx_vt_entity   ON health_sector.submissions_vaccination_tracker (entity_id);
CREATE INDEX idx_vt_payload  ON health_sector.submissions_vaccination_tracker USING GIN (payload);
CREATE INDEX idx_vt_location ON health_sector.submissions_vaccination_tracker USING GIST (location);


CREATE TABLE health_sector.submissions_clinic_visit (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id          UUID        NOT NULL REFERENCES public.entities(id),
    form_id            UUID        NOT NULL REFERENCES public.forms(id),
    form_version       INTEGER     NOT NULL,
    enumerator_id      UUID        NOT NULL REFERENCES public.users(id),
    device_id          UUID        REFERENCES public.devices(id),
    start_time         TIMESTAMPTZ NOT NULL,
    end_time           TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    location           GEOGRAPHY(POINT, 4326),
    payload            JSONB       NOT NULL,
    status             TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'quarantined', 'flagged')),
    dqa_notes          TEXT
);

CREATE INDEX idx_cv_entity   ON health_sector.submissions_clinic_visit (entity_id);
CREATE INDEX idx_cv_payload  ON health_sector.submissions_clinic_visit USING GIN (payload);
CREATE INDEX idx_cv_location ON health_sector.submissions_clinic_visit USING GIST (location);


-- ============================================================
-- SECTION 5: DATA QUALITY ASSURANCE (DQA)
-- ============================================================
-- Two tables handle post-ingestion quality failures:
--
--   quarantine_queue     — submissions that failed a DQA rule
--                          (freshness or uniqueness).  Stored as
--                          raw payloads; never written to sector
--                          tables until a supervisor resolves them.
--
--   submission_conflicts — offline sync collisions.  When two
--                          devices submit for the same entity+form
--                          within an overlapping time window, the
--                          first write wins (canonical); the second
--                          is parked here as a branch for manual merge.
-- ============================================================

CREATE TABLE public.quarantine_queue (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID    NOT NULL REFERENCES public.organizations(id),
    -- Raw payload exactly as received — not yet written to any sector table.
    raw_payload     JSONB   NOT NULL,
    -- Best-effort parsed references (may be NULL if parsing failed).
    entity_id       UUID    REFERENCES public.entities(id),
    form_id         UUID    REFERENCES public.forms(id),
    enumerator_id   UUID    REFERENCES public.users(id),
    device_id       UUID    REFERENCES public.devices(id),
    -- Why it was quarantined.
    failure_reason  TEXT    NOT NULL,  -- 'freshness_violation' | 'duplicate_entity' | 'invalid_gps' | 'schema_error'
    failure_detail  JSONB,             -- structured detail rendered in dashboard
    -- Resolution.
    resolved        BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by     UUID    REFERENCES public.users(id),
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quarantine_org      ON public.quarantine_queue (org_id, resolved);
CREATE INDEX idx_quarantine_entity   ON public.quarantine_queue (entity_id);
CREATE INDEX idx_quarantine_queued   ON public.quarantine_queue (queued_at DESC);


CREATE TABLE public.submission_conflicts (
    id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID    NOT NULL REFERENCES public.organizations(id),
    entity_id               UUID    NOT NULL REFERENCES public.entities(id),
    form_id                 UUID    NOT NULL REFERENCES public.forms(id),
    -- The submission already written to the sector table.
    canonical_submission_id UUID,
    canonical_table         TEXT,   -- fully-qualified, e.g. 'wash_sector.submissions_water_point_baseline'
    -- The divergent submission that arrived later and could not be auto-merged.
    branch_payload          JSONB   NOT NULL,
    branch_enumerator_id    UUID    REFERENCES public.users(id),
    branch_device_id        UUID    REFERENCES public.devices(id),
    branch_submitted_at     TIMESTAMPTZ,
    -- Resolution.
    resolved                BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by             UUID    REFERENCES public.users(id),
    resolved_at             TIMESTAMPTZ,
    merge_strategy          TEXT    CHECK (merge_strategy IN ('accept_branch', 'keep_canonical', 'manual_merge')),
    merged_payload          JSONB,  -- written back to the canonical row after merge
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conflicts_entity   ON public.submission_conflicts (entity_id);
CREATE INDEX idx_conflicts_form     ON public.submission_conflicts (form_id);
CREATE INDEX idx_conflicts_resolved ON public.submission_conflicts (resolved);


-- ============================================================
-- SECTION 6: RESULTS FRAMEWORK & INDICATOR TRACKING (ITT)
-- ============================================================
-- indicators         — SMART indicator definitions set by admins.
-- indicator_actuals  — computed actual values per reporting period,
--                      populated on-demand by the IndicatorsModule
--                      (not via live triggers — Alpha scope).
-- ============================================================

CREATE TABLE public.indicators (
    id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                 UUID    NOT NULL REFERENCES public.organizations(id),
    code                   TEXT    NOT NULL,  -- short code, e.g. 'WASH-01'
    name                   TEXT    NOT NULL,
    description            TEXT,
    unit_of_measure        TEXT,              -- 'persons' | 'facilities' | 'percentage'
    disaggregations        TEXT[],            -- e.g. ARRAY['gender', 'age_group']
    baseline_value         NUMERIC,
    baseline_date          DATE,
    annual_target          NUMERIC,
    reporting_period_start DATE,
    reporting_period_end   DATE,
    -- Points to the specific form field that feeds this indicator.
    source_form_id         UUID    REFERENCES public.forms(id),
    source_field_path      TEXT,              -- JSONB path, e.g. 'payload.functional_status'
    aggregation_fn         TEXT    CHECK (aggregation_fn IN ('count', 'sum', 'avg', 'count_distinct')),
    filter_expression      TEXT,              -- optional WHERE fragment applied during aggregation
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
    computed_by  UUID    REFERENCES public.users(id),  -- NULL = system-computed
    notes        TEXT,
    UNIQUE (indicator_id, period_start, period_end)
);


-- ============================================================
-- SECTION 7: NOTIFICATIONS
-- ============================================================
-- Persists in-app alerts so the dashboard can show badge counts
-- and a notification feed.  Real-time delivery is via SSE/WebSocket;
-- this table is the durable store behind that channel.
-- ============================================================

CREATE TABLE public.notifications (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID    NOT NULL REFERENCES public.organizations(id),
    user_id         UUID    REFERENCES public.users(id),  -- NULL = org-wide broadcast
    type            TEXT    NOT NULL,  -- 'quarantine_alert' | 'conflict_detected' | 'submission_approved'
    title           TEXT    NOT NULL,
    body            TEXT,
    reference_id    UUID,              -- PK of the related quarantine / conflict / submission row
    reference_table TEXT,              -- table the reference_id belongs to
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications (user_id, is_read);
CREATE INDEX idx_notifications_org  ON public.notifications (org_id, created_at DESC);


-- ============================================================
-- SECTION 8: AUDIT LOG
-- ============================================================
-- Append-only record of sensitive mutations: DQA resolutions,
-- conflict merges, role changes.  BIGSERIAL PK keeps inserts
-- cheap; no FKs so rows are never blocked by cascading deletes.
-- ============================================================

CREATE TABLE public.audit_log (
    id           BIGSERIAL   PRIMARY KEY,
    org_id       UUID        NOT NULL,
    actor_id     UUID,                    -- NULL = system action
    action       TEXT        NOT NULL,    -- 'quarantine.resolve' | 'conflict.merge' | 'user.role_changed'
    target_table TEXT,
    target_id    UUID,
    before_state JSONB,
    after_state  JSONB,
    metadata     JSONB,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org   ON public.audit_log (org_id, occurred_at DESC);
CREATE INDEX idx_audit_actor ON public.audit_log (actor_id);


-- ============================================================
-- SECTION 9: REPORTING VIEWS
-- ============================================================
-- Flatten JSONB payloads into virtual relational columns so
-- the Svelte dashboard and any BI tool can query them as plain
-- tables without knowing the JSON structure.
--
-- GIN indexes on the underlying tables (created above) keep
-- these views performant at scale.
-- ============================================================

-- WASH: flat view of water point submissions
CREATE VIEW wash_sector.vw_water_point_summary AS
SELECT
    s.id                                            AS submission_id,
    s.entity_id,
    s.enumerator_id,
    s.start_time,
    s.end_time,
    s.server_received_at,
    s.status,
    s.location,
    payload->>'water_source_type'                   AS water_source_type,
    (payload->>'functional_status')::boolean        AS is_functional,
    (payload->>'estimated_users')::integer          AS estimated_users,
    payload->>'water_quality_result'                AS water_quality_result,
    payload->>'gps_accuracy'                        AS gps_accuracy
FROM wash_sector.submissions_water_point_baseline s;


-- WASH: longitudinal timeline — one row per submission per entity.
-- This view makes the Noun/Verb model queryable: an analyst can
-- filter by entity_id to see every survey event for a given subject
-- across all WASH forms in chronological order.
CREATE VIEW wash_sector.vw_entity_wash_timeline AS
SELECT
    e.id                        AS entity_id,
    e.entity_type,
    e.metadata->>'name'         AS entity_name,
    e.registered_at,
    'water_point_baseline'      AS form_key,
    s.id                        AS submission_id,
    s.start_time,
    s.status,
    s.payload
FROM public.entities e
JOIN wash_sector.submissions_water_point_baseline s ON s.entity_id = e.id
UNION ALL
SELECT
    e.id,
    e.entity_type,
    e.metadata->>'name',
    e.registered_at,
    'latrine_inspection',
    s.id,
    s.start_time,
    s.status,
    s.payload
FROM public.entities e
JOIN wash_sector.submissions_latrine_inspection s ON s.entity_id = e.id;


-- HEALTH: flat view of clinic visit submissions
CREATE VIEW health_sector.vw_clinic_visit_summary AS
SELECT
    s.id                                        AS submission_id,
    s.entity_id,
    s.enumerator_id,
    s.start_time,
    s.end_time,
    s.server_received_at,
    s.status,
    s.location,
    payload->>'patient_age'                     AS patient_age,
    payload->>'diagnosis_code'                  AS diagnosis_code,
    (payload->>'referred_to_hospital')::boolean AS referred_to_hospital,
    payload->>'visit_type'                      AS visit_type
FROM health_sector.submissions_clinic_visit s;


-- Cross-sector entity summary: how many submissions per entity
-- across WASH and Health — useful for supervisor dashboards and
-- detecting entities with suspiciously high submission counts.
CREATE VIEW public.vw_entity_submission_summary AS
SELECT
    e.id            AS entity_id,
    e.org_id,
    e.entity_type,
    e.metadata->>'name' AS entity_name,
    e.registered_at,
    COUNT(wpb.id)   AS wash_baseline_count,
    COUNT(li.id)    AS wash_latrine_count,
    COUNT(vt.id)    AS health_vaccination_count,
    COUNT(cv.id)    AS health_clinic_count
FROM public.entities e
LEFT JOIN wash_sector.submissions_water_point_baseline wpb ON wpb.entity_id = e.id
LEFT JOIN wash_sector.submissions_latrine_inspection   li  ON li.entity_id  = e.id
LEFT JOIN health_sector.submissions_vaccination_tracker vt ON vt.entity_id  = e.id
LEFT JOIN health_sector.submissions_clinic_visit        cv ON cv.entity_id  = e.id
GROUP BY e.id, e.org_id, e.entity_type, e.metadata->>'name', e.registered_at;
