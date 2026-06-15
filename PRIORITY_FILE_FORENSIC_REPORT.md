# PRIORITY FILE FORENSIC REPORT
## ENTERPRISE FORENSIC REPAIR & BOOTSTRAP RECOVERY PROTOCOL V12
**Generated:** 2026-06-15T15:23:00Z  
**Protocol Section:** SEC-017  
**Requirements:** REQ-082 through REQ-088

---

## FILE 1: BootstrapSetupPage.tsx (frontend/src/pages/)

### Forensic Findings:

| Item | Analysis | Severity |
|------|----------|----------|
| Bootstrap status check on mount | Calls `checkBootstrapStatus()`, redirects to `/login` if `bootstrapMode=false` | CORRECT |
| Recovery mode detection | `isRecovery` is initialized once from URL params — not reactive to URL changes | LOW |
| OTP gate (isRecovery && !isOtpVerified) | Correctly blocks setup steps until OTP verified | CORRECT |
| Frame capture (camera) | 5 frames at 300ms — strips data URL prefix correctly | CORRECT |
| Frame capture (upload) | `split(',')[1]` — correctly strips base64 prefix | CORRECT |
| Submit handler | Validates all steps before submit, handles 503 distinctly | CORRECT |
| Face-AI unavailable error | Shows user-friendly message, does NOT crash | CORRECT |
| **Missing:** Re-check `isRecovery` state if URL changes after mount | State initialized once | INFO |

**Verdict:** FUNCTIONALLY SOUND. No critical defects unique to this file.

---

## FILE 2: FaceLogin.tsx (frontend/src/components/)

### Forensic Findings:

| Item | Analysis | Severity |
|------|----------|----------|
| Pre-login check | Debounced, fetches `required_method` from backend | CORRECT |
| Admin no-face redirect | Redirects to `/setup/admin-face` if admin has no face | CORRECT |
| Frame buffer | Rolling 20-frame buffer, `slice(-19)` | CORRECT |
| Base64 strip | `frame.replace('data:image/jpeg;base64,', '')` | CORRECT |
| Auto-trigger | Fires after MIN_FRAMES_FOR_AUTH=10, 500ms delay | CORRECT |
| Abort controller | Cancels inflight requests on unmount/retry | CORRECT |
| Password requirement | Determined dynamically by backend — no hardcoding | CORRECT |
| Pre-login check skipped for IDs <2 chars | Minor — `employeeId.length < 2` guard | LOW |

**Verdict:** FUNCTIONALLY SOUND. No critical defects.

---

## FILE 3: backend-api/src/modules/auth/routes.js

### Forensic Findings:

| Item | Line | Analysis | Severity |
|------|------|----------|----------|
| RBAC enforcement | L238, L401 | Admin/supervisor must use face+password | CORRECT |
| Employee login | L256-321 | Correct password-only path | CORRECT |
| Face login embedding fetch | L452-467 | Fetches active embedding from DB | CORRECT |
| Face-AI retry logic | L471-507 | 3 attempts, 500ms×attempt, circuit breaker | CORRECT |
| Bootstrap status | L1054-1081 | Recovery param forces bootstrapMode=true | CORRECT |
| Recovery OTP | L1087-1160 | Redis-based, 5-min OTP, 10-min verified flag | CORRECT |
| Bootstrap setup transaction | L1282-1313 | BEGIN/COMMIT with ROLLBACK on error | CORRECT |
| **DEFECT:** `face_enrolled_by = $2 = adminId` in UPDATE | L1286-1297 | Self-referential but logically correct | LOW |
| Recovery credential reset | Not present | No endpoint after approval to reset employee credentials | MEDIUM |
| Employee recovery request | L1470-1553 | Creates record, admin must then manually act | INFO |
| All 16 routes present | — | All auth routes confirmed | CORRECT |

**Verdict:** MOSTLY SOUND. One medium gap (no post-approval credential reset endpoint). Embedding constraint guard present in two places.

---

## FILE 4: face-ai-service/src/main.py

### Forensic Findings:

| Item | Line | Analysis | Severity |
|------|------|----------|----------|
| Duplicate SpoofDetector removed | L321-324 | Comment confirms previous duplicate was fixed | RESOLVED |
| Dummy frame bypass | L400-415 | 1×1 pixel frames → auto-authenticate (no env gate) | CRITICAL |
| Base64 strip in face-login | L629-630 | Strips `data:...base64,` prefix correctly | CORRECT |
| Base64 strip in register-face | L704-705 | Same correct stripping | CORRECT |
| Stored embedding injection | L643-654 | Accepts stored_embedding from Express, correct deserialization | CORRECT |
| Filesystem fallback | L556-580 | Dev-mode filesystem fallback, no synthetic generation | CORRECT |
| Challenge-response verifier | L150-228 | MediaPipe-based blink/head_turn — all 5 types implemented | CORRECT |
| HOG fallback embedding | L257-271 | Deterministic 512-dim via fixed seed RNG | CORRECT |
| FaceMatcher cosine | L296-319 | Correct L2-normalized cosine similarity | CORRECT |

**Verdict:** FUNCTIONALLY SOUND. CRITICAL: dummy frame bypass has no production environment gate.

---

## FILE 5: Migration 017_restore_admin_face_embedding.up.sql

### Forensic Findings:

| Item | Analysis | Severity |
|------|----------|----------|
| Idempotent | Returns early if admin has active embedding | CORRECT |
| Safe | Only reactivates existing inactive embedding | CORRECT |
| No-op if no embeddings | Returns early with NOTICE | CORRECT |
| Syncs face_enrolled flag | Updates `employees.face_enrolled = TRUE` | CORRECT |
| No DROP/DELETE | Safe — only UPDATE/RAISE NOTICE | CORRECT |

**Verdict:** SAFE AND CORRECT. This migration is the prescribed resolution for the primary bootstrap deadlock scenario.

---

## FILE 6: Migration 018_fix_compliance_triggers_for_cascades.up.sql

### Forensic Findings:

| Item | Analysis | Severity |
|------|----------|----------|
| Replaces two trigger functions | `sync_audit_logs_compliance` and `sync_notifications_compliance` | CORRECT |
| FK guard added | `EXISTS (SELECT 1 FROM employees WHERE id = ...)` before FK assignment | CORRECT |
| Prevents cascade trigger recursion | Guards prevent infinite loops on cascade deletes | CORRECT |
| COMMIT at end | Transaction-wrapped | CORRECT |

**Verdict:** SAFE AND CORRECT. Properly fixes the trigger recursion issue from migration 016.

---

## DEFECT CONSOLIDATION TABLE (All Priority Files)

| DEF ID | File | Line(s) | Description | Severity | Repair Required |
|--------|------|---------|-------------|----------|-----------------|
| DEF-001 | main.py | 400-415 | Dummy frame auto-auth with no env gate | CRITICAL | YES |
| DEF-004 | auth/routes.js | 947-949, 1256 | Embedding constraint guard in 2 places | MEDIUM | VERIFY constraint first |
| DEF-010 | auth/routes.js | 1286-1297 | `face_enrolled_by = $2` (self-ref, semantically odd) | LOW | OPTIONAL |
| DEF-011 | auth/routes.js | None | No endpoint to complete credential reset after recovery approval | MEDIUM | PHASE-5 |
| N/A | BootstrapSetupPage | 37-40 | `isRecovery` initialized once from URL | INFO | NOT REQUIRED |
| N/A | FaceLogin.tsx | 86 | Pre-login check skipped for IDs < 2 chars | LOW | OPTIONAL |

---

## SECTION 18 GATE CHECK

**SEC-018 states:** No repair may begin before PRIORITY_FILE_FORENSIC_REPORT.md is complete.

**Status:** ✅ PRIORITY_FILE_FORENSIC_REPORT.md IS NOW COMPLETE

**Authorization:** PHASE-2 priority file inspection is now complete. System is eligible to proceed to PHASE-3 (Pre-Repair Evidence Capture) after this report is acknowledged.

---

**Report Status:** COMPLETE  
**Requirements Satisfied:** REQ-082, REQ-083, REQ-084, REQ-085, REQ-086, REQ-087, REQ-088, REQ-089
