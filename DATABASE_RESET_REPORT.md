# DATABASE RESET REPORT

**Timestamp**: 2026-06-15T16:53:25.000Z
**Execution Status**: SUCCESS
**Reset Mode**: Selective Fresh Installation Reset

This report documents the selective database cleanup execution and the exact deletion counts of temporary and transient tables.

## 1. Cleanup Execution Log

| Target | Operation | Command/Query | Status | Deleted Count |
|--------|-----------|---------------|--------|---------------|
| `account_recovery_audit_log` | Delete child audit trails | `DELETE FROM account_recovery_audit_log WHERE recovery_id IN ...` | SUCCESS | 0 |
| `account_recovery_requests` | Delete expired recovery requests | `DELETE FROM account_recovery_requests WHERE expires_at < NOW() ...` | SUCCESS | 0 |
| `password_reset_requests` | Delete completed/expired requests | `DELETE FROM password_reset_requests WHERE status IN ...` | SUCCESS | 0 |
| `refresh_tokens` | Delete expired/revoked session tokens | `DELETE FROM refresh_tokens WHERE expires_at < NOW() ...` | SUCCESS | 14 |
| Redis Cache | Flush all active sessions & flags | `redis-cli -a <password> flushall` | SUCCESS | All keys |

---

## 2. Integrity Summary
- All core tables (`employees`, `face_embeddings`, `attendance_records`, `leave_requests`, `migration_history`) were protected from destructive operations.
- The default administrator credentials and face profiles were preserved.
- No schema tables or migrations were rollbacked or dropped.
