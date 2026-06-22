-- Migration 013: Admin Configuration Table + Dynamic Admin Contact
-- Purpose: Create admin_configuration table to store dynamic admin profile
--          for Contact Administrator links, routing, and recovery workflows.
-- Safety: CREATE TABLE IF NOT EXISTS. Zero data loss.
-- Checkpoint: WEBSITECHK_BOOTSTRAP_EXPANSION_20260615

-- ============================================================================
-- ADMIN_CONFIGURATION TABLE
-- Stores dynamic admin profile — eliminates all hardcoded admin identity.
-- Source of truth for:
--   - Contact Administrator email/phone links
--   - Password reset routing
--   - Face update routing
--   - Leave approval routing (teacher requests)
--   - Notification delivery
--   - Recovery workflow (OTP to recovery_email)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_configuration (
  id                  BIGSERIAL PRIMARY KEY,
  admin_student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  admin_name          VARCHAR(100),
  admin_email         VARCHAR(200),
  admin_phone         VARCHAR(50),
  admin_address       TEXT,
  admin_designation   VARCHAR(100),
  -- Recovery credentials (used for admin reset OTP workflow)
  recovery_email      VARCHAR(200),
  recovery_phone      VARCHAR(50),
  -- Metadata
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Only one active admin configuration row
  UNIQUE (admin_student_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_configuration_student ON admin_configuration(admin_student_id);

-- ============================================================================
-- UPSERT DEFAULT ADMIN CONFIGURATION
-- If admin student exists but no admin_configuration row, create one.
-- Uses current admin email from students table as baseline.
-- ============================================================================
DO $$
DECLARE
  v_admin_emp_id INT;
  v_admin_email  TEXT;
  v_admin_name   TEXT;
BEGIN
  SELECT id, email, CONCAT(first_name, ' ', last_name)
    INTO v_admin_emp_id, v_admin_email, v_admin_name
    FROM students
   WHERE student_id = 'admin' AND is_active = TRUE
   LIMIT 1;

  IF v_admin_emp_id IS NOT NULL THEN
    INSERT INTO admin_configuration
      (admin_student_id, admin_name, admin_email, admin_designation, created_at, updated_at)
    VALUES
      (v_admin_emp_id, v_admin_name, v_admin_email, 'System Administrator', NOW(), NOW())
    ON CONFLICT (admin_student_id) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- ROLE_PERMISSIONS TABLE — Database-Driven RBAC
-- Checkpoint: WEBSITECHK_RBAC_LOCKDOWN
-- ============================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  id          BIGSERIAL PRIMARY KEY,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  permission  VARCHAR(100) NOT NULL,
  granted     BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role, permission)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);

-- ============================================================================
-- SEED DEFAULT ROLE PERMISSIONS
-- Migrating in-memory rbac.js PERMISSIONS to database.
-- These can be updated via admin UI without code changes.
-- ============================================================================
INSERT INTO role_permissions (role, permission, description) VALUES
  -- Dashboard
  ('student',   'view:dashboard',      'View own dashboard'),
  ('teacher', 'view:dashboard',      'View teacher dashboard'),
  ('admin',      'view:dashboard',      'View admin dashboard'),
  -- Attendance
  ('student',   'attendance.view.own',    'View own attendance records'),
  ('teacher', 'attendance.view.own',    'View own attendance records'),
  ('admin',      'attendance.view.own',    'View own attendance records'),
  ('teacher', 'attendance.view.team',   'View team attendance records'),
  ('admin',      'attendance.view.team',   'View team attendance records'),
  ('admin',      'attendance.view.global', 'View all attendance records'),
  ('teacher', 'manage:attendance',   'Manage team attendance'),
  ('admin',      'manage:attendance',   'Manage all attendance'),
  -- Leave
  ('student',   'leave.create',               'Submit leave requests'),
  ('teacher', 'leave.create',               'Submit leave requests'),
  ('admin',      'leave.create',               'Submit leave requests'),
  ('student',   'view:leave',                 'View own leave requests'),
  ('teacher', 'view:leave',                 'View leave requests'),
  ('admin',      'view:leave',                 'View all leave requests'),
  ('teacher', 'leave.approve.student',     'Approve student leave requests'),
  ('admin',      'leave.approve.student',     'Approve student leave requests'),
  ('admin',      'leave.approve.teacher',   'Approve teacher leave requests'),
  ('teacher', 'manage:leave',               'Manage team leave'),
  ('admin',      'manage:leave',               'Manage all leave'),
  -- Face management
  ('student',   'face.update.request',        'Request face update'),
  ('teacher', 'face.update.request',        'Request face update for team'),
  ('admin',      'face.update.request',        'Request/manage face updates'),
  ('teacher', 'face.update.approve',        'Approve student face update requests'),
  ('admin',      'face.update.approve',        'Approve all face update requests'),
  -- Password reset
  ('student',   'password.reset.request',     'Request password reset'),
  ('teacher', 'password.reset.request',     'Request password reset'),
  ('admin',      'password.reset.request',     'Request password reset'),
  ('teacher', 'password.reset.approve',     'Approve student password reset requests'),
  ('admin',      'password.reset.approve',     'Approve all password reset requests'),
  -- Reports
  ('student',   'view:reports',        'View own reports'),
  ('teacher', 'view:reports',        'View team reports'),
  ('admin',      'view:reports',        'View all reports'),
  -- Security & System
  ('teacher', 'view:security',       'View security events'),
  ('admin',      'view:security',       'View all security events'),
  ('admin',      'manage:security',     'Manage security settings'),
  ('teacher', 'view:telemetry',      'View telemetry data'),
  ('admin',      'view:telemetry',      'View all telemetry data'),
  ('admin',      'manage:system',       'Configure system settings'),
  ('admin',      'manage:users',        'Manage all users'),
  ('admin',      'system.configure',    'System configuration access'),
  ('teacher', 'view:system-status',  'View system status'),
  ('admin',      'view:system-status',  'View system status'),
  -- MFA
  ('student',   'manage:mfa',          'Manage own MFA settings'),
  ('teacher', 'manage:mfa',          'Manage own MFA settings'),
  ('admin',      'manage:mfa',          'Manage all MFA settings')
ON CONFLICT (role, permission) DO NOTHING;
