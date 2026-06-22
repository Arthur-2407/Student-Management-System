-- Migration 012 DOWN: Remove attendance concurrency controls

BEGIN;

DROP INDEX IF EXISTS uix_attendance_one_open_per_student_per_day;
DROP INDEX IF EXISTS idx_attendance_student_date;
DROP INDEX IF EXISTS uix_attendance_idempotency;

ALTER TABLE student_attendance
  DROP COLUMN IF EXISTS idempotency_key;

COMMIT;
