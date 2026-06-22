-- Migration 007: Secure default admin password using environment variable
-- Updates default admin password hash if INITIAL_ADMIN_PASSWORD_HASH is set.

UPDATE students
SET password_hash = CASE 
  WHEN '${INITIAL_ADMIN_PASSWORD_HASH}' = '' OR '${INITIAL_ADMIN_PASSWORD_HASH}' = '$' || '{INITIAL_ADMIN_PASSWORD_HASH}' THEN password_hash
  ELSE '${INITIAL_ADMIN_PASSWORD_HASH}'
END,
updated_at = NOW()
WHERE student_id = 'admin';
