-- Migration 023: Add assignment resource files table
CREATE TABLE assignment_resources (
    resource_id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_extension VARCHAR(50) NOT NULL,
    mime_type VARCHAR(100),
    file_size BIGINT,
    checksum VARCHAR(64),
    version INTEGER DEFAULT 1,
    uploaded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    download_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES students(id) ON DELETE SET NULL
);

CREATE INDEX idx_assignment_resources_assignment ON assignment_resources(assignment_id);
CREATE INDEX idx_assignment_resources_teacher ON assignment_resources(teacher_id);

CREATE TRIGGER update_assignment_resources_updated_at BEFORE UPDATE ON assignment_resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
