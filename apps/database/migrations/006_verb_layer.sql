-- ============================================================
-- Migration 006: Verb layer — Sector submission tables
-- Each table represents one survey instrument.
-- All share the same mandatory column set.
-- ============================================================

-- ── WASH SECTOR ──────────────────────────────────────────────

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


-- ── HEALTH SECTOR ────────────────────────────────────────────

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
