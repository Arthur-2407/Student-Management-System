# BOOTSTRAP ROOT CAUSE REPORT
## ENTERPRISE FORENSIC REPAIR & BOOTSTRAP RECOVERY PROTOCOL V12
**Generated:** 2026-06-15T15:20:00Z  
**Protocol Section:** SEC-011  
**Requirement:** REQ-054 through REQ-059  

---

## 1. BOOTSTRAP UNAVAILABILITY ROOT CAUSE ANALYSIS

### 1.1 How bootstrapMode is Determined (Backend)

**Source:** `backend-api/src/modules/auth/routes.js`, lines 1054–1081

```javascript
router.get('/bootstrap/status', async (req, res) => {
  const result = await query(`
    SELECT fe.id 
    FROM face_embeddings fe 
    JOIN employees e ON fe.employee_id = e.id 
    WHERE e.employee_id = 'admin' AND fe.is_active = TRUE AND e.is_active = TRUE 
    LIMIT 1`
  );
  const hasAdminFace = result.rows.length > 0;
  const isRecoveryEnv = process.env.RECOVERY_MODE === 'true';
  const isRecoveryParam = req.query.recovery === 'true' || req.headers['x-recovery-mode'] === 'true';
  const bootstrapMode = !hasAdminFace || isRecoveryEnv || isRecoveryParam;
  
  return res.json({ success: true, bootstrapMode });
});
```

**Bootstrap activates when ANY of these conditions are true:**
1. `face_embeddings` has NO active embedding for the `admin` employee
2. Environment variable `RECOVERY_MODE=true`
3. Query param `?recovery=true` OR header `x-recovery-mode: true`

---

### 1.2 Root Cause Tree — Why /setup/admin-face Would Be Unavailable

**Cause A: Admin face embedding EXISTS and is ACTIVE → bootstrapMode = false → Page redirects to /login**

This is the most likely cause. When BootstrapSetupPage mounts:
```typescript
// BootstrapSetupPage.tsx lines 133-149
const res = await authApi.checkBootstrapStatus(recoveryParam);
if (res.data.success && !res.data.bootstrapMode) {
  navigate('/login', { replace: true });
}
```

If the admin face embedding is active in the database, `bootstrapMode` is `false`, and the page **immediately redirects to /login** before rendering.

**Cause B: Admin face embedding EXISTS but is INACTIVE (is_active = FALSE)**
- `bootstrapMode` = `true` (no active embedding found)
- Bootstrap page renders
- User completes setup
- New embedding is inserted, old ones deactivated
- **Resolution:** Migration 017 was specifically created to resolve this

**Cause C: Admin employee record doesn't exist (employee_id = 'admin' not in DB)**
- Bootstrap page renders (no face found = bootstrap mode)
- Setup fails at step: `WHERE employee_id = 'admin' AND is_active = TRUE` returns 0 rows
- Backend returns 404: "System administrator account not found"

**Cause D: Face-AI Service is not running**
- Bootstrap page renders and user progresses to Step 4
- Submit calls `/api/auth/bootstrap/setup`
- Backend calls Face-AI service `/api/register-face`
- Face-AI is unreachable → 503 returned
- Backend returns: `{ code: 'FACE_AI_UNAVAILABLE' }`
- Frontend shows: "Face-AI Service Unavailable: Please start the face-recognition service..."

---

### 1.3 Bootstrap State Flags Assessment

| Flag | Source | Current State |
|------|--------|---------------|
| `bootstrapMode` | Computed server-side from DB | Depends on `face_embeddings` table |
| `hasAdminFace` | DB query on `face_embeddings.is_active` | Unknown (runtime state) |
| `RECOVERY_MODE` env | docker-compose.yml | **NOT SET** in docker-compose.yml |
| `admin_recovery_otp:{id}` | Redis (5-min TTL) | Set during recovery initiation |
| `admin_recovery_verified:{id}` | Redis (10-min TTL) | Set after OTP verification |

**Finding:** `RECOVERY_MODE` environment variable is NOT defined in `docker-compose.yml`. Recovery mode can only be triggered via `?recovery=true` URL param or `x-recovery-mode` header.

---

### 1.4 Bootstrap Redirect Logic in BootstrapSetupPage

```
Page Loads
    ↓
checkBootstrapStatus(recoveryParam)
    ↓
    ├── [success && !bootstrapMode] → navigate('/login')   ← Redirect case
    ├── [success && bootstrapMode]  → Show setup wizard    ← Normal case
    └── [error]                    → Show setup wizard (defensive)
                                       setIsCheckingStatus(false)
```

**Recovery Mode Gate:**
```
if (isRecovery && !isOtpVerified) {
  → Show OTP verification screen (blocks steps 1-4)
}
if (!isRecovery || isOtpVerified) {
  → Show setup steps 1-4
}
```

**⚠️ POTENTIAL DEADLOCK SCENARIO:**
If `?recovery=true` is in the URL but the backend's `bootstrap/status?recovery=true` returns `bootstrapMode = false`, the page would redirect to `/login` — even though recovery mode was requested. This can happen if:
- `hasAdminFace = true` AND `RECOVERY_MODE` env is not set AND recovery param IS set

Wait — re-reading the backend logic:
```js
const bootstrapMode = !hasAdminFace || isRecoveryEnv || isRecoveryParam;
```
If `isRecoveryParam = true`, then `bootstrapMode = true` REGARDLESS of `hasAdminFace`. This means the recovery redirect will NOT happen — `bootstrapMode` will always be true when `?recovery=true` is passed.

**Correction:** No redirect deadlock in recovery mode — the backend correctly forces `bootstrapMode = true` when `?recovery=true` is present.

---

### 1.5 Bootstrap Root Cause for Current System State

Based on code analysis, the most likely reason `/setup/admin-face` would appear "unavailable" is:

**PRIMARY CAUSE:** Admin face embedding is ACTIVE in the database → `bootstrapMode = false` → page redirects to `/login` upon loading.

**SECONDARY CAUSE (Historical):** A previous session completed bootstrap setup successfully, but a subsequent operation (migration rollback, database reset, deactivation of embedding) left the system in an inconsistent state.

**TERTIARY CAUSE:** Face-AI service was down during a previous bootstrap attempt, leaving the admin account with a password hash but NO face embedding — but this would cause `bootstrapMode = true` (no active face), not redirect.

---

### 1.6 Recovery Flow Validation

**Admin Recovery Flow (when face embedding exists but is lost/wrong):**
1. Navigate to `/setup/admin-face?recovery=true`
2. Page detects `?recovery=true` → `isRecovery = true`
3. Bootstrap status check: `?recovery=true` forces `bootstrapMode = true` → page renders
4. OTP screen displayed (isRecovery && !isOtpVerified)
5. Click "Send Verification OTP" → POST `/api/auth/recovery/admin/initiate`
6. Backend finds admin, finds recovery_email from `admin_configuration` table (or fallback to `employees.email`)
7. Generates 6-digit OTP, stores in Redis `admin_recovery_otp:{admin.id}` for 5 minutes
8. OTP logged to server log (mock email delivery — no SMTP configured)
9. User enters OTP → POST `/api/auth/recovery/admin/verify-otp`
10. Redis validates OTP → sets `admin_recovery_verified:{admin.id}` for 10 minutes
11. `isOtpVerified = true` → setup steps unlock
12. User completes 4-step setup → POST `/api/auth/bootstrap/setup?recovery=true`
13. Backend checks `admin_recovery_verified:{admin.id}` = 'true' → grants access
14. New password + embedding saved → Redis cleanup → success

**⚠️ DEFECT FOUND (MEDIUM — OTP Delivery):**
OTP is only logged to server stdout (`logger.info(...)`). There is no SMTP/email service configured. User must access server logs to retrieve OTP. This is expected for development but is a recovery blocker in production.

**Recovery Flow Status:** ✅ LOGICALLY SOUND — pending OTP delivery mechanism

---

### 1.7 Face Embedding Verification

**Query used to check admin face:**
```sql
SELECT fe.id 
FROM face_embeddings fe 
JOIN employees e ON fe.employee_id = e.id 
WHERE e.employee_id = 'admin' 
  AND fe.is_active = TRUE 
  AND e.is_active = TRUE 
LIMIT 1
```

**Potential Issue:** If admin `is_active = FALSE` (deactivated employee), this query returns 0 rows → `bootstrapMode = true`. However, admin cannot be deactivated through normal flows (RBAC prevents it).

---

## 2. SUMMARY FINDINGS

| Finding | Status |
|---------|--------|
| Bootstrap mode flag determination | ✅ CORRECT LOGIC |
| Bootstrap redirect when admin face exists | ✅ CORRECT BEHAVIOR (not a bug) |
| Recovery mode URL param handling | ✅ CORRECT — forces bootstrapMode = true |
| OTP generation and Redis storage | ✅ CORRECT |
| OTP verification and cleanup | ✅ CORRECT |
| Recovery verified flag used in bootstrap/setup | ✅ CORRECT |
| Face-AI unavailability handling | ✅ HANDLED — returns 503 with FACE_AI_UNAVAILABLE code |
| RECOVERY_MODE env not set in docker-compose | ⚠️ INFORMATIONAL — recovery only via URL param |
| OTP email delivery | ⚠️ LOG ONLY — no SMTP configured |
| Duplicate migration 010 prefix | ⚠️ FRAGILE — sort order must be verified |

---

## 3. RECOMMENDATIONS (FOR REPAIR PHASE)

> **⚠️ NO REPAIRS EXECUTED — Investigation only per protocol**

1. **REP-001 (HIGH):** Verify at runtime whether admin face embedding is active in DB
2. **REP-002 (HIGH):** If admin has no face embedding (bootstrap truly needed), ensure Face-AI service is healthy before attempting bootstrap
3. **REP-003 (MEDIUM):** Add `RECOVERY_MODE=false` explicitly to docker-compose.yml for clarity
4. **REP-004 (LOW):** Add a console/UI display of OTP for development mode (since SMTP is not configured)
5. **REP-005 (CRITICAL):** Verify the DEF-001 dummy frame bypass is not exploitable in production (gate it behind an environment check)

---

**Report Status:** COMPLETE  
**Requirements Satisfied:** REQ-054, REQ-055, REQ-056, REQ-057, REQ-058, REQ-059
