-- V5: Rollback MFA columns and V5 tables
ALTER TABLE employees DROP COLUMN IF EXISTS mfa_enabled;
ALTER TABLE employees DROP COLUMN IF EXISTS mfa_secret;
ALTER TABLE employees DROP COLUMN IF EXISTS mfa_pending_secret;
ALTER TABLE employees DROP COLUMN IF EXISTS mfa_backup_codes;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS notifications;
