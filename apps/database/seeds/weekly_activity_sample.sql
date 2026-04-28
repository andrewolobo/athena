-- ============================================================
-- Weekly Activity Sample Data
-- Run this against a DB that already has the dev_seed applied.
-- Adds submissions spread across the last 7 days so the
-- dashboard Weekly Activity chart shows varied bar heights.
--
-- Run with:
--   docker exec athena_postgres psql -U athena_app -d athena_db \
--     -f /path/to/weekly_activity_sample.sql
-- Or via the compose network:
--   docker compose -f docker-compose.dev.yml exec postgres \
--     psql -U athena_app -d athena_db -f seeds/weekly_activity_sample.sql
-- ============================================================

BEGIN;

-- ── 6 days ago: 3 submissions ─────────────────────────────────
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
     'flagged')
ON CONFLICT (id) DO NOTHING;

-- ── 5 days ago: 4 additional submissions ─────────────────────
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
     'quarantined')
ON CONFLICT (id) DO NOTHING;

-- ── 4 days ago: 2 submissions ─────────────────────────────────
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
     'approved')
ON CONFLICT (id) DO NOTHING;

-- ── 3 days ago: 4 submissions ─────────────────────────────────
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
     'approved')
ON CONFLICT (id) DO NOTHING;

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
     'approved')
ON CONFLICT (id) DO NOTHING;

-- ── 2 days ago: 3 submissions ─────────────────────────────────
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
     'flagged')
ON CONFLICT (id) DO NOTHING;

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
     'pending')
ON CONFLICT (id) DO NOTHING;

-- ── 1 day ago: 6 submissions (peak day) ──────────────────────
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
     'approved')
ON CONFLICT (id) DO NOTHING;

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
     'approved')
ON CONFLICT (id) DO NOTHING;

COMMIT;
