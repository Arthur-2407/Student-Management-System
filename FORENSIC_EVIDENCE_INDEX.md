# FORENSIC EVIDENCE INDEX

**Timestamp**: 2026-06-15T22:25:00.000Z
**Audit Status**: INDEXED / 100% COMPLETE

This document indexes all forensic reports, logs, checkpoints, and schemas gathered during the audit and repair process of the Enterprise Attendance System.

## 1. Audits and Investigations
- [PROJECT_FORENSIC_AUDIT_V2.md](file:///d:/Website/PROJECT_FORENSIC_AUDIT_V2.md): Comprehensive system audit.
- [BOOTSTRAP_ROOT_CAUSE_REPORT.md](file:///d:/Website/BOOTSTRAP_ROOT_CAUSE_REPORT.md): Analysis of setup page unavailability.
- [AUTH_FLOW_VALIDATION_REPORT.md](file:///d:/Website/AUTH_FLOW_VALIDATION_REPORT.md): Validation details for the 11 auth flows.
- [FACE_PIPELINE_VALIDATION_REPORT.md](file:///d:/Website/FACE_PIPELINE_VALIDATION_REPORT.md): Video-capture and face matching pipeline audit.
- [PRIORITY_FILE_FORENSIC_REPORT.md](file:///d:/Website/PRIORITY_FILE_FORENSIC_REPORT.md): File inspections on routes and setup pages.
- [GIT_CONFLICT_FORENSIC_REPORT.md](file:///d:/Website/GIT_CONFLICT_FORENSIC_REPORT.md): Marker audits for unresolved conflicts.

## 2. Pre-Repair Evidence Snapshots
Located under `d:\Website\forensic-evidence\2026-06-15_15-25-00\`:
- `SYSTEM_STATE_SNAPSHOT.md`: System variables and paths.
- `ROUTE_DISCOVERY_MAP.md`: Frontend route definitions.
- `API_ENDPOINT_DISCOVERY_MAP.md`: Express API endpoints.
- `DATABASE_SCHEMA_SNAPSHOT.md`: DB tables and constraints.
- `DOCKER_RUNTIME_STATE.md`: Running services stats.
- `REDIS_RUNTIME_STATE.md`: Keys list.

## 3. Checkpoints and Manifests
- [CHECKPOINT_INDEX.md](file:///d:/Website/CHECKPOINT_INDEX.md)
- Named Checkpoint Folder: `checkpoints/CHECKPOINT_FORENSIC_AUDIT_FACE_PIPELINE_AND_INFRA_HARDENING_20260615_205755/`
  - `repair_manifest.json`
  - `FILE_HASH_MANIFEST.json`
  - `dependency_snapshot.json`
  - `ROUTE_DEPENDENCY_MAP.json`

## 4. Reset and Validation Reports
- [PRE_RESET_VALIDATION_REPORT.md](file:///d:/Website/PRE_RESET_VALIDATION_REPORT.md)
- [DATABASE_PRESERVATION_REPORT.md](file:///d:/Website/DATABASE_PRESERVATION_REPORT.md)
- [DATABASE_RESTORE_VALIDATION_REPORT.md](file:///d:/Website/DATABASE_RESTORE_VALIDATION_REPORT.md)
- [DATABASE_RESET_REPORT.md](file:///d:/Website/DATABASE_RESET_REPORT.md)
- [POST_RESET_VALIDATION_REPORT.md](file:///d:/Website/POST_RESET_VALIDATION_REPORT.md)
- [POST_RESTART_VALIDATION_REPORT.md](file:///d:/Website/POST_RESTART_VALIDATION_REPORT.md)
- [END_TO_END_FACE_AUTH_REPORT.md](file:///d:/Website/END_TO_END_FACE_AUTH_REPORT.md)
