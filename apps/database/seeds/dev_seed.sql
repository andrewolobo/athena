-- ============================================================
-- ATHENA — Dev Seed Data
-- Run after all migrations: npm run seed:dev
-- Creates one of each role, four entities, two forms,
-- sample submissions covering all statuses, one quarantine
-- entry, and one conflict entry.
-- ============================================================

BEGIN;

-- ── Organisation ─────────────────────────────────────────────
INSERT INTO public.organizations (id, name, slug, country)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Kenya Country Office',
    'kenya-office',
    'Kenya'
);

-- ── Users ────────────────────────────────────────────────────
INSERT INTO public.users (id, org_id, email, display_name, role, oauth_provider, oauth_subject)
VALUES
    (
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'admin@example.com',
        'Alice Admin',
        'admin',
        'google',
        'google-sub-admin-001'
    ),
    (
        'b0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001',
        'supervisor@example.com',
        'Bob Supervisor',
        'supervisor',
        'google',
        'google-sub-supervisor-001'
    ),
    (
        'b0000000-0000-0000-0000-000000000003',
        'a0000000-0000-0000-0000-000000000001',
        'enumerator@example.com',
        'Carol Enumerator',
        'enumerator',
        'google',
        'google-sub-enumerator-001'
    );

-- ── Device ───────────────────────────────────────────────────
INSERT INTO public.devices (id, user_id, device_id, phone_number)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000003',
    'android:device-001',
    '+254700000001'
);

-- ── Entities ─────────────────────────────────────────────────
INSERT INTO public.entities (id, org_id, entity_type, external_id, registered_by, metadata)
VALUES
    (
        'd0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'beneficiary',
        'BEN-001',
        'b0000000-0000-0000-0000-000000000003',
        '{"name": "Jane Doe", "village": "Kisumu North", "gender": "female"}'
    ),
    (
        'd0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001',
        'beneficiary',
        'BEN-002',
        'b0000000-0000-0000-0000-000000000003',
        '{"name": "John Kamau", "village": "Kisumu South", "gender": "male"}'
    ),
    (
        'd0000000-0000-0000-0000-000000000003',
        'a0000000-0000-0000-0000-000000000001',
        'household',
        'HH-001',
        'b0000000-0000-0000-0000-000000000003',
        '{"name": "Kamau Household", "village": "Kisumu South", "members": 5}'
    ),
    (
        'd0000000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000001',
        'water_point',
        'WP-001',
        'b0000000-0000-0000-0000-000000000003',
        '{"name": "Borehole Alpha", "village": "Kisumu North"}'
    );

-- ── Forms ────────────────────────────────────────────────────
INSERT INTO public.forms (id, org_id, folder_schema, form_key, display_name, created_by)
VALUES
    (
        'e0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'wash_sector',
        'water_point_baseline',
        'Water Point Baseline Survey',
        'b0000000-0000-0000-0000-000000000001'
    ),
    (
        'e0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001',
        'health_sector',
        'clinic_visit',
        'Clinic Visit Record',
        'b0000000-0000-0000-0000-000000000001'
    );

INSERT INTO public.form_versions (id, form_id, version, xlsform_json, published_by)
VALUES
    (
        'f0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000001',
        1,
        '{
            "survey": [
                {"type": "geopoint", "name": "location", "label": "GPS Coordinates"},
                {"type": "select_one", "name": "water_source_type", "label": "Water Source Type",
                 "choices": ["borehole", "spring", "river", "rainwater"]},
                {"type": "select_one", "name": "functional_status", "label": "Is the water point functional?",
                 "choices": ["yes", "no"]},
                {"type": "integer", "name": "estimated_users", "label": "Estimated number of users"},
                {"type": "select_one", "name": "water_quality_result", "label": "Water Quality Test Result",
                 "choices": ["pass", "fail", "not_tested"]},
                {"type": "text", "name": "gps_accuracy", "label": "GPS Accuracy (metres)"}
            ]
        }',
        'b0000000-0000-0000-0000-000000000001'
    ),
    (
        'f0000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000000002',
        1,
        '{
            "survey": [
                {"type": "text", "name": "patient_age", "label": "Patient Age"},
                {"type": "text", "name": "diagnosis_code", "label": "Diagnosis Code (ICD-10)"},
                {"type": "select_one", "name": "referred_to_hospital", "label": "Referred to Hospital?",
                 "choices": ["yes", "no"]},
                {"type": "select_one", "name": "visit_type", "label": "Visit Type",
                 "choices": ["new", "follow_up", "emergency"]}
            ]
        }',
        'b0000000-0000-0000-0000-000000000001'
    );

-- ── Submissions ───────────────────────────────────────────────
-- status = 'pending'
INSERT INTO wash_sector.submissions_water_point_baseline
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, location, payload, status)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000001',
    1,
    'b0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour 50 minutes',
    ST_GeogFromText('POINT(34.7519 -0.0917)'),
    '{"water_source_type": "borehole", "functional_status": "true",
      "estimated_users": 150, "water_quality_result": "pass", "gps_accuracy": "3.2"}',
    'pending'
);

-- status = 'approved'
INSERT INTO wash_sector.submissions_water_point_baseline
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, location, payload, status)
VALUES (
    '10000000-0000-0000-0000-000000000002',
    'd0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000001',
    1,
    'b0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '4 days 23 hours',
    ST_GeogFromText('POINT(34.7519 -0.0917)'),
    '{"water_source_type": "spring", "functional_status": "true",
      "estimated_users": 80, "water_quality_result": "pass", "gps_accuracy": "4.1"}',
    'approved'
);

-- status = 'quarantined'
INSERT INTO wash_sector.submissions_water_point_baseline
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, location, payload, status)
VALUES (
    '10000000-0000-0000-0000-000000000003',
    'd0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000001',
    1,
    'b0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '9 days 23 hours',
    ST_GeogFromText('POINT(34.7519 -0.0917)'),
    '{"water_source_type": "river", "functional_status": "false",
      "estimated_users": 200, "water_quality_result": "fail", "gps_accuracy": "12.5"}',
    'quarantined'
);

-- status = 'flagged'
INSERT INTO wash_sector.submissions_water_point_baseline
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, location, payload, status)
VALUES (
    '10000000-0000-0000-0000-000000000004',
    'd0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000001',
    1,
    'b0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '14 days 23 hours',
    ST_GeogFromText('POINT(34.7519 -0.0917)'),
    '{"water_source_type": "borehole", "functional_status": "true",
      "estimated_users": 50, "water_quality_result": "not_tested", "gps_accuracy": "8.0"}',
    'flagged'
);

-- Health sector submission
INSERT INTO health_sector.submissions_clinic_visit
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, location, payload, status)
VALUES (
    '10000000-0000-0000-0000-000000000005',
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    1,
    'b0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '2 hours 45 minutes',
    ST_GeogFromText('POINT(34.7510 -0.0920)'),
    '{"patient_age": "34", "diagnosis_code": "J06.9",
      "referred_to_hospital": "false", "visit_type": "new"}',
    'pending'
);

-- ── Quarantine Queue Entry ─────────────────────────────────────
INSERT INTO public.quarantine_queue
    (id, org_id, raw_payload, entity_id, form_id, enumerator_id, device_id,
     failure_reason, failure_detail)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    '{
        "entity_id": "d0000000-0000-0000-0000-000000000004",
        "form_id": "e0000000-0000-0000-0000-000000000001",
        "form_version": 1,
        "enumerator_id": "b0000000-0000-0000-0000-000000000003",
        "start_time": "2026-01-10T08:00:00Z",
        "end_time": "2026-01-10T08:30:00Z",
        "payload": {"water_source_type": "borehole", "functional_status": "true",
                    "estimated_users": 120, "water_quality_result": "pass"}
    }',
    'd0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    'freshness_violation',
    '{"hours_delayed": 2160, "threshold_hours": 72,
      "end_time": "2026-01-10T08:30:00Z", "received_at": "2026-04-20T10:00:00Z"}'
);

-- ── Conflict Entry ────────────────────────────────────────────
INSERT INTO public.submission_conflicts
    (id, org_id, entity_id, form_id,
     canonical_submission_id, canonical_table,
     branch_payload, branch_enumerator_id, branch_device_id, branch_submitted_at)
VALUES (
    '30000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'wash_sector.submissions_water_point_baseline',
    '{"water_source_type": "borehole", "functional_status": "false",
      "estimated_users": 160, "water_quality_result": "fail", "gps_accuracy": "5.0"}',
    'b0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '1 hour 30 minutes'
);

-- ── Sample indicator ──────────────────────────────────────────
INSERT INTO public.indicators
    (id, org_id, code, name, unit_of_measure, baseline_value, annual_target,
     reporting_period_start, reporting_period_end,
     source_form_id, source_field_path, aggregation_fn, created_by)
VALUES (
    '40000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'WASH-01',
    'Number of functional water points surveyed',
    'water points',
    0,
    50,
    '2026-01-01',
    '2026-12-31',
    'e0000000-0000-0000-0000-000000000001',
    'payload.functional_status',
    'count',
    'b0000000-0000-0000-0000-000000000001'
);

-- ── Weekly activity sample submissions ────────────────────────
-- Spread across last 7 days so the dashboard chart has varied bar heights.
-- 6 days ago: 3 submissions
INSERT INTO wash_sector.submissions_water_point_baseline
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, server_received_at, location, payload, status)
VALUES
    ('10000000-0000-0000-0000-000000000010',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '6 days 9 hours', NOW() - INTERVAL '6 days 8 hours 50 minutes',
     NOW() - INTERVAL '6 days 8 hours',
     ST_GeogFromText('POINT(34.7520 -0.0910)'),
     '{"water_source_type":"borehole","functional_status":"true","estimated_users":90,"water_quality_result":"pass","gps_accuracy":"2.1"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000011',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '6 days 7 hours', NOW() - INTERVAL '6 days 6 hours 45 minutes',
     NOW() - INTERVAL '6 days 6 hours',
     ST_GeogFromText('POINT(34.7522 -0.0912)'),
     '{"water_source_type":"spring","functional_status":"true","estimated_users":60,"water_quality_result":"pass","gps_accuracy":"3.5"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000012',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '6 days 4 hours', NOW() - INTERVAL '6 days 3 hours 50 minutes',
     NOW() - INTERVAL '6 days 3 hours',
     ST_GeogFromText('POINT(34.7518 -0.0915)'),
     '{"water_source_type":"river","functional_status":"false","estimated_users":40,"water_quality_result":"fail","gps_accuracy":"8.0"}',
     'flagged');

-- 5 days ago: 5 submissions (already 1 from original seed = 6 total that day; 
-- the original has server_received_at = NOW()-5days, so these add variety)
INSERT INTO wash_sector.submissions_water_point_baseline
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, server_received_at, location, payload, status)
VALUES
    ('10000000-0000-0000-0000-000000000020',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '5 days 11 hours', NOW() - INTERVAL '5 days 10 hours 50 minutes',
     NOW() - INTERVAL '5 days 10 hours',
     ST_GeogFromText('POINT(34.7530 -0.0900)'),
     '{"water_source_type":"borehole","functional_status":"true","estimated_users":110,"water_quality_result":"pass","gps_accuracy":"2.8"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000021',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '5 days 8 hours', NOW() - INTERVAL '5 days 7 hours 50 minutes',
     NOW() - INTERVAL '5 days 7 hours',
     ST_GeogFromText('POINT(34.7532 -0.0902)'),
     '{"water_source_type":"rainwater","functional_status":"true","estimated_users":25,"water_quality_result":"not_tested","gps_accuracy":"5.0"}',
     'pending'),
    ('10000000-0000-0000-0000-000000000022',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '5 days 5 hours', NOW() - INTERVAL '5 days 4 hours 50 minutes',
     NOW() - INTERVAL '5 days 4 hours',
     ST_GeogFromText('POINT(34.7534 -0.0904)'),
     '{"water_source_type":"spring","functional_status":"true","estimated_users":75,"water_quality_result":"pass","gps_accuracy":"3.1"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000023',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '5 days 3 hours', NOW() - INTERVAL '5 days 2 hours 50 minutes',
     NOW() - INTERVAL '5 days 2 hours',
     ST_GeogFromText('POINT(34.7536 -0.0906)'),
     '{"water_source_type":"borehole","functional_status":"false","estimated_users":200,"water_quality_result":"fail","gps_accuracy":"11.0"}',
     'quarantined');

-- 4 days ago: 2 submissions
INSERT INTO health_sector.submissions_clinic_visit
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, server_received_at, location, payload, status)
VALUES
    ('10000000-0000-0000-0000-000000000030',
     'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '4 days 10 hours', NOW() - INTERVAL '4 days 9 hours 45 minutes',
     NOW() - INTERVAL '4 days 9 hours',
     ST_GeogFromText('POINT(34.7510 -0.0920)'),
     '{"patient_age":"28","diagnosis_code":"A09","referred_to_hospital":"false","visit_type":"new"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000031',
     'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '4 days 6 hours', NOW() - INTERVAL '4 days 5 hours 45 minutes',
     NOW() - INTERVAL '4 days 5 hours',
     ST_GeogFromText('POINT(34.7512 -0.0922)'),
     '{"patient_age":"45","diagnosis_code":"J18.9","referred_to_hospital":"true","visit_type":"emergency"}',
     'approved');

-- 3 days ago: 4 submissions
INSERT INTO wash_sector.submissions_water_point_baseline
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, server_received_at, location, payload, status)
VALUES
    ('10000000-0000-0000-0000-000000000040',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '3 days 12 hours', NOW() - INTERVAL '3 days 11 hours 50 minutes',
     NOW() - INTERVAL '3 days 11 hours',
     ST_GeogFromText('POINT(34.7540 -0.0895)'),
     '{"water_source_type":"borehole","functional_status":"true","estimated_users":130,"water_quality_result":"pass","gps_accuracy":"2.0"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000041',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '3 days 9 hours', NOW() - INTERVAL '3 days 8 hours 50 minutes',
     NOW() - INTERVAL '3 days 8 hours',
     ST_GeogFromText('POINT(34.7542 -0.0897)'),
     '{"water_source_type":"spring","functional_status":"true","estimated_users":55,"water_quality_result":"pass","gps_accuracy":"4.2"}',
     'approved');

INSERT INTO health_sector.submissions_clinic_visit
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, server_received_at, location, payload, status)
VALUES
    ('10000000-0000-0000-0000-000000000042',
     'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '3 days 5 hours', NOW() - INTERVAL '3 days 4 hours 45 minutes',
     NOW() - INTERVAL '3 days 4 hours',
     ST_GeogFromText('POINT(34.7514 -0.0924)'),
     '{"patient_age":"12","diagnosis_code":"J06.9","referred_to_hospital":"false","visit_type":"follow_up"}',
     'pending'),
    ('10000000-0000-0000-0000-000000000043',
     'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '3 days 2 hours', NOW() - INTERVAL '3 days 1 hour 45 minutes',
     NOW() - INTERVAL '3 days 1 hour',
     ST_GeogFromText('POINT(34.7516 -0.0926)'),
     '{"patient_age":"60","diagnosis_code":"I10","referred_to_hospital":"true","visit_type":"new"}',
     'approved');

-- 2 days ago: 3 submissions
INSERT INTO wash_sector.submissions_water_point_baseline
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, server_received_at, location, payload, status)
VALUES
    ('10000000-0000-0000-0000-000000000050',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '2 days 11 hours', NOW() - INTERVAL '2 days 10 hours 50 minutes',
     NOW() - INTERVAL '2 days 10 hours',
     ST_GeogFromText('POINT(34.7525 -0.0908)'),
     '{"water_source_type":"borehole","functional_status":"true","estimated_users":170,"water_quality_result":"pass","gps_accuracy":"1.9"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000051',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '2 days 7 hours', NOW() - INTERVAL '2 days 6 hours 50 minutes',
     NOW() - INTERVAL '2 days 6 hours',
     ST_GeogFromText('POINT(34.7527 -0.0910)'),
     '{"water_source_type":"spring","functional_status":"false","estimated_users":30,"water_quality_result":"fail","gps_accuracy":"9.5"}',
     'flagged');

INSERT INTO health_sector.submissions_clinic_visit
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, server_received_at, location, payload, status)
VALUES
    ('10000000-0000-0000-0000-000000000052',
     'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '2 days 3 hours', NOW() - INTERVAL '2 days 2 hours 45 minutes',
     NOW() - INTERVAL '2 days 2 hours',
     ST_GeogFromText('POINT(34.7518 -0.0928)'),
     '{"patient_age":"37","diagnosis_code":"K29","referred_to_hospital":"false","visit_type":"new"}',
     'pending');

-- 1 day ago: 6 submissions (peak day for the chart)
INSERT INTO wash_sector.submissions_water_point_baseline
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, server_received_at, location, payload, status)
VALUES
    ('10000000-0000-0000-0000-000000000060',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '1 day 11 hours', NOW() - INTERVAL '1 day 10 hours 50 minutes',
     NOW() - INTERVAL '1 day 10 hours',
     ST_GeogFromText('POINT(34.7545 -0.0890)'),
     '{"water_source_type":"borehole","functional_status":"true","estimated_users":140,"water_quality_result":"pass","gps_accuracy":"2.2"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000061',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '1 day 9 hours', NOW() - INTERVAL '1 day 8 hours 50 minutes',
     NOW() - INTERVAL '1 day 8 hours',
     ST_GeogFromText('POINT(34.7547 -0.0892)'),
     '{"water_source_type":"spring","functional_status":"true","estimated_users":85,"water_quality_result":"pass","gps_accuracy":"3.3"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000062',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '1 day 7 hours', NOW() - INTERVAL '1 day 6 hours 50 minutes',
     NOW() - INTERVAL '1 day 6 hours',
     ST_GeogFromText('POINT(34.7549 -0.0894)'),
     '{"water_source_type":"borehole","functional_status":"false","estimated_users":50,"water_quality_result":"not_tested","gps_accuracy":"6.1"}',
     'pending'),
    ('10000000-0000-0000-0000-000000000063',
     'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '1 day 5 hours', NOW() - INTERVAL '1 day 4 hours 50 minutes',
     NOW() - INTERVAL '1 day 4 hours',
     ST_GeogFromText('POINT(34.7551 -0.0896)'),
     '{"water_source_type":"river","functional_status":"true","estimated_users":95,"water_quality_result":"pass","gps_accuracy":"4.0"}',
     'approved');

INSERT INTO health_sector.submissions_clinic_visit
    (id, entity_id, form_id, form_version, enumerator_id, device_id,
     start_time, end_time, server_received_at, location, payload, status)
VALUES
    ('10000000-0000-0000-0000-000000000064',
     'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '1 day 3 hours', NOW() - INTERVAL '1 day 2 hours 45 minutes',
     NOW() - INTERVAL '1 day 2 hours',
     ST_GeogFromText('POINT(34.7520 -0.0930)'),
     '{"patient_age":"22","diagnosis_code":"A01.0","referred_to_hospital":"false","visit_type":"new"}',
     'approved'),
    ('10000000-0000-0000-0000-000000000065',
     'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 1,
     'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
     NOW() - INTERVAL '1 day 1 hour', NOW() - INTERVAL '1 day 45 minutes',
     NOW() - INTERVAL '1 day',
     ST_GeogFromText('POINT(34.7522 -0.0932)'),
     '{"patient_age":"55","diagnosis_code":"E11","referred_to_hospital":"true","visit_type":"follow_up"}',
     'approved');

COMMIT;
