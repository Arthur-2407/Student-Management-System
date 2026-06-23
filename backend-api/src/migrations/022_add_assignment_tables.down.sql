-- Migration 022 down migration: Remove assignment tables

DROP TABLE IF EXISTS submission_files CASCADE;
DROP TABLE IF EXISTS assignment_submissions CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
