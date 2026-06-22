-- Migration 012: Attendance Concurrency Protection
-- Prevents double check-in race conditions using a partial unique index.
-- The index ensures only ONE open attendance record (NULL check_out_time) exists per student per day.

BEGIN;

-- Partial unique index: only one open check-in per student per day
-- If check_out_time IS NULL, the record is "open" (currently checked in)
-- This prevents concurrent duplicate check-ins even with parallel requests
CREATE UNIQUE INDEX IF NOT EXISTS uix_attendance_one_open_per_student_per_day
  ON student_attendance (student_id, (check_in_time::date))
  WHERE check_out_time IS NULL;

-- Additional index for faster today-state queries
CREATE INDEX IF NOT EXISTS idx_attendance_student_date
  ON student_attendance (student_id, check_in_time);

-- Add idempotency_key column for client-side deduplication
ALTER TABLE student_attendance
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS uix_attendance_idempotency
  ON student_attendance (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
