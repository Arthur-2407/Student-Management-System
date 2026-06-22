ALTER TABLE students
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE student_reports
  ADD COLUMN IF NOT EXISTS location JSONB,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_family UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID,
  ip_address INET,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'system',
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id TEXT,
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_event_type_check;
ALTER TABLE security_events
  ADD CONSTRAINT security_events_event_type_check
  CHECK (event_type IN (
    'SPOOF_ATTEMPT',
    'FACE_MISMATCH',
    'GEOFENCE_VIOLATION',
    'MULTIPLE_LOGIN_ATTEMPTS',
    'FACE_REGISTERED',
    'FACE_REGISTRATION_ERROR',
    'LOGIN_ERROR',
    'SECURITY_ALERT',
    'LOGIN_ATTEMPT',
    'LOGIN_FAILED',
    'LOGIN_SUCCESS',
    'TOKEN_REFRESH',
    'TOKEN_REVOKED',
    'MFA_CHALLENGE',
    'PASSWORD_CHANGE',
    'SUSPICIOUS_LOGIN',
    'DEVICE_FINGERPRINT_MISMATCH',
    'ACCOUNT_LOCKED',
    'SESSION_REVOKED'
  ));

CREATE INDEX IF NOT EXISTS idx_students_active_role ON students(is_active, role);
CREATE INDEX IF NOT EXISTS idx_students_locked_until ON students(locked_until);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_student ON refresh_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(token_family);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(student_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_student_created ON notifications(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(student_id) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_student_time ON student_attendance(student_id, check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_leave_student_status ON leave_requests(student_id, status);
CREATE INDEX IF NOT EXISTS idx_security_events_type_time ON security_events(event_type, timestamp DESC);
