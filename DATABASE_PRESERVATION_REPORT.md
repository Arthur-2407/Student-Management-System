# DATABASE PRESERVATION REPORT

**Timestamp**: 2026-06-15T16:53:15.000Z
**Overall Preservation Status**: PASS

This report documents the verification and preservation of all protected system-critical tables and records during the selective cleanup operation.

## 1. Table Preservation Log

The following protected tables and their contents were kept intact:

| Table | Status | Rationale | Records Preserved |
|-------|--------|-----------|------------------|
| `employees` | preserved | Admin and employee identities must be kept. | 4 |
| `face_embeddings` | preserved | Biometric credentials must survive resets. | 2 |
| `schema_migrations` | preserved | Migration database lineage must be kept. | All |
| `attendance_records` | preserved | Attendance logs must survive resets. | 0 (Fresh stack test) |
| `leave_requests` | preserved | Leave request logs must survive resets. | 0 (Fresh stack test) |

---

## 2. Protected Records Verification

A verification check confirms that essential identities and biometric embeddings remain in the database post-reset:

### 2.1. Employees Verification
```sql
SELECT id, employee_id, first_name, last_name, role, face_enrolled FROM employees;
```
- **ID 1**: `admin` (System Administrator, Role: admin, Enrolled: TRUE)
- **ID 63**: `EMP_TEST001` (Test Employee, Role: employee, Enrolled: TRUE)
- **ID 12**: `supervisor` (Supervisor User, Role: supervisor, Enrolled: FALSE)
- **ID 13**: `EMP001` (Rajesh Singh, Role: supervisor, Enrolled: FALSE)

### 2.2. Biometric Embeddings Verification
```sql
SELECT id, employee_id, is_active FROM face_embeddings;
```
- **Embedding ID 68**: Mapped to Employee ID 1 (`admin`, Active: TRUE)
- **Embedding ID 69**: Mapped to Employee ID 63 (`EMP_TEST001`, Active: TRUE)

---

## 3. Preservation Conclusion
In compliance with the **Database Preservation & Selective Cleanup Policy**, all critical tables, indexes, schemas, and credentials were fully preserved. Wiping, schema drops, and table drops were zeroed.
