# CHECKPOINT INDEX
## ENTERPRISE FORENSIC REPAIR & BOOTSTRAP RECOVERY PROTOCOL V12

---

## Registered Checkpoints

The following checkpoints are registered under [checkpoints/](file:///d:/Website/checkpoints/):

| Checkpoint Name | Creation Time | Target Focus / Domain | Affected / Backed Up Files |
|---|---|---|---|
| **[CHECKPOINT_ADMIN_RECOVERY](file:///d:/Website/checkpoints/CHECKPOINT_ADMIN_RECOVERY/)** | Historical | Administrative lockout recovery flow | `BootstrapSetupPage.tsx`, `routes.js` |
| **[CHECKPOINT_FACEAI_TEST_BYPASS](file:///d:/Website/checkpoints/CHECKPOINT_FACEAI_TEST_BYPASS/)** | Historical | Mock face login bypass configuration | `main.py` |
| **[CHECKPOINT_FACEAI_THREADING_ALIGN](file:///d:/Website/checkpoints/CHECKPOINT_FACEAI_THREADING_ALIGN/)** | Historical | Threading and process safety alignment | `main.py` |
| **[CHECKPOINT_GATEWAY_TIMEOUT_ROBUSTNESS](file:///d:/Website/checkpoints/CHECKPOINT_GATEWAY_TIMEOUT_ROBUSTNESS/)** | Historical | Proxy gateway timeouts | `nginx.conf`, `server.js` |
| **[CHECKPOINT_TRIGGER_CASCADE_FIX](file:///d:/Website/checkpoints/CHECKPOINT_TRIGGER_CASCADE_FIX/)** | Historical | DB trigger recursions and delete cascades | `018_fix_compliance_triggers_for_cascades.up.sql` |
| **[CHECKPOINT_FORENSIC_AUDIT_FACE_PIPELINE_AND_INFRA_HARDENING_20260615_205755](file:///d:/Website/checkpoints/CHECKPOINT_FORENSIC_AUDIT_FACE_PIPELINE_AND_INFRA_HARDENING_20260615_205755/)** | 2026-06-15 | Anti-spoof bypass, frontend healthcheck, nginx SPA fallback, backend credential reset | `main.py`, `docker-compose.yml`, `nginx.conf`, `routes.js` |

---

## Verification Status
All 6 checkpoints are fully active and validated on disk. Restore/rollback scripts are bundled inside their respective directories.
