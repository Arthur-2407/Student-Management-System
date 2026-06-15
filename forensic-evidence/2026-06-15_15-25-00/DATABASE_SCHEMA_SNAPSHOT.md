# DATABASE SCHEMA SNAPSHOT
Captured: 2026-06-15T15:25:00Z
Database Engine: PostgreSQL 15 (container: `attendance-db-prod`)
Database Name: `attendance_system`

---

## 1. Applied Migrations (schema_migrations)
The migration history ledger confirms 19 migration files applied in sequence:

| Migration ID | File Name | Applied Timestamp |
|---|---|---|
| `001_enterprise_schema_alignment` | `001_enterprise_schema_alignment.up.sql` | 2026-06-13 16:55:48.189Z |
| `002_v5_mfa_audit_notifications` | `002_v5_mfa_audit_notifications.up.sql` | 2026-06-13 16:55:48.313Z |
| `003_add_impossible_travel_event` | `003_add_impossible_travel_event.up.sql` | 2026-06-13 16:55:48.358Z |
| `004_ensure_geofence_functions` | `004_ensure_geofence_functions.up.sql` | 2026-06-13 16:55:48.376Z |
| `005_seed_default_admin` | `005_seed_default_admin.up.sql` | 2026-06-13 16:55:48.398Z |
| `006_missing_enterprise_tables` | `006_missing_enterprise_tables.up.sql` | 2026-06-14 09:25:47.985Z |
| `007_secure_admin_init` | `007_secure_admin_init.up.sql` | 2026-06-14 09:29:57.114Z |
| `008_align_leave_requests_columns` | `008_align_leave_requests_columns.up.sql` | 2026-06-14 09:36:27.010Z |
| `009_face_approval_workflow` | `009_face_approval_workflow.up.sql` | 2026-06-14 10:11:44.328Z |
| `010_clear_seeded_face_embeddings` | `010_clear_seeded_face_embeddings.up.sql` | 2026-06-14 11:48:19.259Z |
| `010_expand_security_event_types` | `010_expand_security_event_types.up.sql` | 2026-06-14 19:56:57.166Z |
| `011_account_recovery` | `011_account_recovery.up.sql` | 2026-06-14 19:56:57.214Z |
| `012_attendance_concurrency` | `012_attendance_concurrency.up.sql` | 2026-06-14 19:56:57.226Z |
| `013_admin_config_and_rbac` | `013_admin_config_and_rbac.up.sql` | 2026-06-15 06:34:54.534Z |
| `014_enterprise_compliance_schema` | `014_enterprise_compliance_schema.up.sql` | 2026-06-15 06:53:39.090Z |
| `015_audit_and_notification_compliance`| `015_audit_and_notification_compliance.up.sql` | 2026-06-15 06:53:57.691Z |
| `016_fix_trigger_recursion` | `016_fix_trigger_recursion.up.sql` | 2026-06-15 08:28:18.001Z |
| `017_restore_admin_face_embedding` | `017_restore_admin_face_embedding.up.sql` | 2026-06-15 11:17:15.570Z |
| `018_fix_compliance_triggers_for_cascades`| `018_fix_compliance_triggers_for_cascades.up.sql` | 2026-06-15 13:03:37.144Z |

---

## 2. Table Catalog
The database currently tracks 39 active relations:
- `employees` (core employee data and credentials)
- `face_embeddings` (face AI vectors)
- `administrators` (legacy/override credentials)
- `admin_configuration` (active administrator profiles)
- `attendance_records` (clockings)
- `leave_requests`, `leave_balance`, `leave_policy` (leave systems)
- `audit_logs`, `security_events`, `login_logs` (monitoring and logging)
- `refresh_tokens`, `device_fingerprints` (session security)
- `role_assignments`, `role_permissions` (RBAC controls)
- `account_recovery_requests`, `account_recovery_audit_log` (recovery systems)
- `face_approval_requests`, `face_approval_history` (face admin verification workflow)
- (and additional enterprise configuration tables)

---

## 3. Core Table Definitions & Constraints

### 3.1. `employees` Table
Holds core identities, passwords, and references:
- `id` (integer, Primary Key)
- `employee_id` (varchar, UNIQUE)
- `first_name`, `last_name`, `email` (varchar, NOT NULL)
- `role` (varchar, default 'employee')
- `face_embedding` (text, legacy fallback)
- `password_hash` (varchar)
- `mfa_enabled` (boolean, default false)
- `face_enrolled` (boolean, default false)
- `face_enrolled_by` (integer, FK -> `employees.id`)
- **Triggers:**
  - `trg_sync_employees_to_relationship` (syncs supervisors after insert/update)
  - `update_employees_updated_at` (updates timestamp before update)

### 3.2. `face_embeddings` Table
Primary storage for face AI representation vectors:
- `id` (bigint, Primary Key)
- `employee_id` (integer, NOT NULL, FK -> `employees.id` ON DELETE RESTRICT)
- `embedding_vector` (text, NOT NULL)
- `embedding_version` (varchar, default '1.0')
- `confidence_score` (double precision)
- `enrolled_by` (integer, FK -> `employees.id` ON DELETE SET NULL)
- `is_active` (boolean, default true)
- **Indexes:**
  - `idx_face_embeddings_unique_active` UNIQUE (`employee_id`) WHERE is_active = true
- **Check Constraints:**
  - `chk_embedding_not_empty`: `CHECK (is_active = false OR embedding_vector IS NOT NULL AND length(embedding_vector) > 100 AND embedding_vector <> '[]'::text AND embedding_vector !~~ '[0.5,%'::text)` - *Note: This prevents embeddings that start with 0.5 (preventing seeded mock vectors).*

### 3.3. `admin_configuration` Table
Holds metadata for administrative contacts:
- `id` (bigint, Primary Key)
- `admin_employee_id` (integer, NOT NULL, UNIQUE, FK -> `employees.id` ON DELETE RESTRICT)
- `admin_name`, `admin_email`, `admin_phone`, `admin_designation` (varchar)
- **Triggers:**
  - `trg_sync_admin_config_to_administrators` (cascades settings changes to administrators table)

### 3.4. `administrators` Table
Fallback lookup for administrator recovery modes:
- `id` (bigint, Primary Key)
- `admin_id` (varchar, UNIQUE)
- `face_embedding`, `password_hash` (text)
- **Triggers:**
  - `trg_sync_administrators_to_legacy` (updates employees table for role synchronicity)
