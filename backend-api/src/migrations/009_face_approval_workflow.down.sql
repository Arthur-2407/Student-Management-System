-- Migration 009: Face Approval Workflow and Seeding - Down
-- Purpose: Revert changes added in up migration
-- Date: 2026-06-14

-- Delete seeded face embeddings
DELETE FROM face_embeddings WHERE student_id IN (
  SELECT id FROM students WHERE student_id IN ('admin', 'teacher')
);

-- Reset students face enrolled fields
UPDATE students SET
  face_enrolled = FALSE,
  face_enrolled_at = NULL,
  face_enrolled_by = NULL
WHERE student_id IN ('admin', 'teacher');

-- Delete seeded teacher account
DELETE FROM students WHERE student_id = 'teacher';

-- Drop tables
DROP TABLE IF EXISTS face_audit_logs CASCADE;
DROP TABLE IF EXISTS face_approval_history CASCADE;
DROP TABLE IF EXISTS face_approval_requests CASCADE;
DROP TABLE IF EXISTS face_change_requests CASCADE;
