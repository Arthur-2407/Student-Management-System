# DATABASE CLEANUP PLAN

This document outlines the execution plan for the selective database cleanup as part of the Phase 9 One-Time Fresh Installation Reset.

## 1. Selective Reset Queries

The following queries will be executed directly on the database to remove transient, expired, and temporary records while keeping all core employees, credentials, face embeddings, attendance, and leave records.

### 1.1. Prune Recovery Audit Logs
Since `account_recovery_audit_log` has a foreign key constraint pointing to `account_recovery_requests` with `ON DELETE RESTRICT`, we must delete child audit logs first:
```sql
DELETE FROM account_recovery_audit_log 
WHERE recovery_id IN (
    SELECT id FROM account_recovery_requests 
    WHERE expires_at < NOW() OR status IN ('rejected', 'completed', 'expired')
);
```

### 1.2. Prune Recovery Requests (Expired/Completed)
```sql
DELETE FROM account_recovery_requests 
WHERE expires_at < NOW() OR status IN ('rejected', 'completed', 'expired');
```

### 1.3. Prune Password Reset Requests
```sql
DELETE FROM password_reset_requests 
WHERE status IN ('completed', 'rejected', 'expired') 
   OR created_at < NOW() - INTERVAL '48 hours';
```

### 1.4. Prune Expired Refresh Tokens (Sessions)
```sql
DELETE FROM refresh_tokens 
WHERE expires_at < NOW() OR revoked_at IS NOT NULL;
```

---

## 2. Redis and Disk Artifact Cleanup

1. **Redis Cache Clearance**: Flush all cached values to reset locks and invalid sessions:
   ```bash
   docker exec attendance-redis redis-cli -a redispassword123 flushall
   ```
2. **Temporary Forensic Artifacts**: Remove any old or redundant test files from the disk (e.g., `runtime_validation.md` from the previous E2E runs, but keep all deliverables).
