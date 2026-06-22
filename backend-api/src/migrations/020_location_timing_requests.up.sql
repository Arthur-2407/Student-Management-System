-- Database Migration 020: Location and Timing Requests

CREATE TABLE IF NOT EXISTS location_timing_requests (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('location', 'timing', 'both')),
    requested_location_name VARCHAR(150),
    requested_latitude DOUBLE PRECISION,
    requested_longitude DOUBLE PRECISION,
    requested_radius_meters INTEGER,
    requested_work_start_time TIME,
    requested_work_end_time TIME,
    requested_is_temporary BOOLEAN DEFAULT FALSE,
    requested_start_date DATE,
    requested_end_date DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loc_time_req_student ON location_timing_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_loc_time_req_status ON location_timing_requests(status);
