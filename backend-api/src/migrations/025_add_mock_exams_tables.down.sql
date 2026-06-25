-- Migration 025: Drop mock exams tables

DROP TABLE IF EXISTS mock_exam_student_answers CASCADE;
DROP TABLE IF EXISTS mock_exam_attempts CASCADE;
DROP TABLE IF EXISTS mock_exam_questions CASCADE;
DROP TABLE IF EXISTS mock_exams CASCADE;
