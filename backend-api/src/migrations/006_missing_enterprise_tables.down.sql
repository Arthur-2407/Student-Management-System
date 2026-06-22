-- Migration 006: Rollback – Drop all tables and columns added by up migration
-- WARNING: This will remove data from face_embeddings, face_enrollment_logs,
--          device_fingerprints, impossible_travel_events, leave_approval_history,
--          and student_login_locations tables.

DROP TABLE IF EXISTS leave_approval_history;
DROP TABLE IF EXISTS student_login_locations;
DROP TABLE IF EXISTS impossible_travel_events;
DROP TABLE IF EXISTS device_fingerprints;
DROP TABLE IF EXISTS face_enrollment_logs;
DROP TABLE IF EXISTS face_embeddings;

-- Remove soft-delete columns (cannot undo if data was soft-deleted, but structure is preserved)
ALTER TABLE student_attendance DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE leave_requests DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE security_events DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE login_logs DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE student_reports DROP COLUMN IF EXISTS deleted_at;

-- Remove teacher assignment columns
ALTER TABLE teacher_assignments DROP COLUMN IF EXISTS unassigned_at;
ALTER TABLE teacher_assignments DROP COLUMN IF EXISTS assigned_by;
ALTER TABLE teacher_assignments DROP COLUMN IF EXISTS unassigned_by;

-- Remove office location columns
ALTER TABLE office_locations DROP COLUMN IF EXISTS address;
ALTER TABLE office_locations DROP COLUMN IF EXISTS timezone;
ALTER TABLE office_locations DROP COLUMN IF EXISTS created_by;

-- Remove work timing columns
ALTER TABLE work_timings DROP COLUMN IF EXISTS overtime_start_time;
ALTER TABLE work_timings DROP COLUMN IF EXISTS overtime_end_time;
ALTER TABLE work_timings DROP COLUMN IF EXISTS timezone;
ALTER TABLE work_timings DROP COLUMN IF EXISTS created_at;
ALTER TABLE work_timings DROP COLUMN IF EXISTS updated_at;

-- Remove student columns
ALTER TABLE students DROP COLUMN IF EXISTS face_enrolled;
ALTER TABLE students DROP COLUMN IF EXISTS face_enrolled_at;
ALTER TABLE students DROP COLUMN IF EXISTS face_enrolled_by;
ALTER TABLE students DROP COLUMN IF EXISTS password_must_change;
