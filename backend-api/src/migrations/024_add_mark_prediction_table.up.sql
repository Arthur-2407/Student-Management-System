-- Migration 024: Add mark prediction table
CREATE TABLE student_mark_predictions (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    attendance_rate NUMERIC NOT NULL,
    previous_semester_marks NUMERIC NOT NULL,
    assignment_completion_rate NUMERIC NOT NULL,
    internal_assessment_marks NUMERIC NOT NULL,
    study_hours NUMERIC NOT NULL,
    mock_test_marks NUMERIC NOT NULL,
    predicted_marks NUMERIC NOT NULL,
    predicted_grade VARCHAR(10) NOT NULL,
    pass_probability NUMERIC NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    predicted_by INTEGER REFERENCES students(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mark_predictions_student ON student_mark_predictions(student_id);
