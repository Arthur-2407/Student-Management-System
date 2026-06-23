-- Migration 022: Add assignment tables for Student Management System

CREATE TABLE assignments (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructions TEXT,
    teacher_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    due_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    total_marks INTEGER NOT NULL,
    allowed_file_types TEXT, -- comma-separated extensions: e.g. "pdf,doc,docx,jpg,jpeg,png,zip,ppt,pptx,xls,xlsx,txt"
    max_file_size_mb INTEGER DEFAULT 25,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assignment_submissions (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    comments TEXT,
    submitted_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'submitted', -- 'submitted', 'reviewed'
    marks INTEGER,
    feedback TEXT,
    graded_at TIMESTAMP WITHOUT TIME ZONE,
    graded_by INTEGER REFERENCES students(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_assignment_student UNIQUE (assignment_id, student_id)
);

CREATE TABLE submission_files (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size BIGINT,
    uploaded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
