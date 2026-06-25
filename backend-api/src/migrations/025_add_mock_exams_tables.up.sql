-- Migration 025: Add mock exams tables for Student Management System

CREATE TABLE mock_exams (
    id SERIAL PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    total_marks INTEGER NOT NULL,
    passing_marks INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL,
    negative_marking BOOLEAN NOT NULL DEFAULT FALSE,
    teacher_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    due_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mock_exam_questions (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    image_url TEXT,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option CHAR(1) NOT NULL, -- 'A', 'B', 'C', 'D'
    question_marks INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mock_exam_attempts (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score NUMERIC(5,2) NOT NULL, -- Numeric to support negative marking fractions
    percentage DECIMAL(5,2) NOT NULL,
    grade VARCHAR(10) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'PASS', 'FAIL'
    correct_answers_count INTEGER NOT NULL,
    wrong_answers_count INTEGER NOT NULL,
    submitted_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_exam_student UNIQUE (exam_id, student_id)
);

CREATE TABLE mock_exam_student_answers (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES mock_exam_attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES mock_exam_questions(id) ON DELETE CASCADE,
    selected_option CHAR(1), -- 'A', 'B', 'C', 'D' or NULL if unanswered
    is_correct BOOLEAN NOT NULL
);

-- Indexes for performance optimization
CREATE INDEX idx_mock_exams_teacher ON mock_exams(teacher_id);
CREATE INDEX idx_mock_exam_questions_exam ON mock_exam_questions(exam_id);
CREATE INDEX idx_mock_exam_attempts_student ON mock_exam_attempts(student_id);
CREATE INDEX idx_mock_exam_attempts_exam ON mock_exam_attempts(exam_id);
