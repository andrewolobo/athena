-- ============================================================
-- Migration 010: Reporting views
-- Flatten JSONB payloads into virtual relational columns.
-- GIN indexes on underlying tables (created in 006) keep
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


-- WASH: longitudinal timeline per entity across all WASH forms
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


-- Cross-sector: submission counts per entity across WASH and Health
CREATE VIEW public.vw_entity_submission_summary AS
SELECT
    e.id                    AS entity_id,
    e.org_id,
    e.entity_type,
    e.metadata->>'name'     AS entity_name,
    e.registered_at,
    COUNT(wpb.id)           AS wash_baseline_count,
    COUNT(li.id)            AS wash_latrine_count,
    COUNT(vt.id)            AS health_vaccination_count,
    COUNT(cv.id)            AS health_clinic_count
FROM public.entities e
LEFT JOIN wash_sector.submissions_water_point_baseline  wpb ON wpb.entity_id = e.id
LEFT JOIN wash_sector.submissions_latrine_inspection    li  ON li.entity_id  = e.id
LEFT JOIN health_sector.submissions_vaccination_tracker vt  ON vt.entity_id  = e.id
LEFT JOIN health_sector.submissions_clinic_visit        cv  ON cv.entity_id  = e.id
GROUP BY e.id, e.org_id, e.entity_type, e.metadata->>'name', e.registered_at;
