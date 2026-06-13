DROP INDEX IF EXISTS idx_security_events_type_time;
DROP INDEX IF EXISTS idx_leave_employee_status;
DROP INDEX IF EXISTS idx_attendance_employee_time;
DROP INDEX IF EXISTS idx_audit_logs_action_created;
DROP INDEX IF EXISTS idx_audit_logs_actor_created;
DROP INDEX IF EXISTS idx_notifications_unread;
DROP INDEX IF EXISTS idx_notifications_employee_created;
DROP INDEX IF EXISTS idx_refresh_tokens_active;
DROP INDEX IF EXISTS idx_refresh_tokens_family;
DROP INDEX IF EXISTS idx_refresh_tokens_employee;
DROP INDEX IF EXISTS idx_employees_locked_until;
DROP INDEX IF EXISTS idx_employees_active_role;

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
    'SECURITY_ALERT'
  ));

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS refresh_tokens;

ALTER TABLE work_reports
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS location;

ALTER TABLE employees
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS mfa_enabled,
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS locked_until,
  DROP COLUMN IF EXISTS failed_login_count,
  DROP COLUMN IF EXISTS password_changed_at,
  DROP COLUMN IF EXISTS password_hash;
