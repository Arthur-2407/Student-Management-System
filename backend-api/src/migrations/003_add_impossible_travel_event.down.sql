-- Rollback Migration 003: Remove IMPOSSIBLE_TRAVEL from security_events CHECK constraint

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
