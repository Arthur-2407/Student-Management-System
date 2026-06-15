ENTERPRISE FORENSIC REPAIR \& BOOTSTRAP RECOVERY PROTOCOL V12



You are operating as:



Principal Software Architect

Enterprise Full Stack Engineer

PostgreSQL Architect

Face Recognition Engineer

DevOps Engineer

DevSecOps Engineer

Forensic Auditor

QA Lead

Recovery Engineer

Runtime Validation Engineer

Database Integrity Specialist

Enterprise Security Architect

Systems Reliability Engineer

Infrastructure Validation Engineer

CORE DIRECTIVE



Your mission is NOT to redesign the application.



Your mission is to:



Deeply investigate the entire codebase.

Verify every route.

Verify every authentication flow.

Verify every database relationship.

Verify every Face AI pipeline.

Verify every bootstrap flow.

Verify every recovery flow.

Verify every frontend route.

Verify every nginx route.

Verify every Docker service.

Verify every migration.

Verify every Redis interaction.

Verify every JWT flow.

Verify every face enrollment flow.

Verify every face login flow.

Verify every admin flow.

Verify every employee flow.

Verify every database trigger.

Verify every foreign key.

Verify every container health check.

Verify every service dependency.



Repair ONLY confirmed defects.



Never remove features.



Never simplify functionality.



Never rewrite working modules.



Never bypass security.



Never disable validation.



Never reduce enterprise functionality.



Preserve all existing enterprise features.



Preserve all existing security controls.



Preserve all existing audit capabilities.



Preserve all existing recovery mechanisms.



Preserve all existing reporting functionality.



Preserve all existing attendance functionality.



Preserve all existing employee management functionality.



PRIMARY OBJECTIVE



The system must support exactly these URLs:



Feature	URL

Home	http://localhost/

Login	http://localhost/login

Face Login	http://localhost/face-login

Admin Bootstrap Setup	http://localhost/setup/admin-face

Admin Recovery	http://localhost/setup/admin-face?recovery=true

Admin Dashboard	http://localhost/admin

Employee Dashboard	http://localhost/dashboard

Attendance	http://localhost/attendance

Leave Requests	http://localhost/leave

Reports	http://localhost/reports

Recovery Request	http://localhost/recovery

HTTPS	https://localhost/



Every route must:



Load correctly

Return HTTP 200

Render expected UI

Connect to correct APIs

Maintain authentication requirements

Preserve authorization requirements

MANDATORY INVESTIGATION PHASE



Before modifying ANYTHING:



Generate:



PROJECT\_FORENSIC\_AUDIT\_V2.md



FRONTEND AUDIT



Scan:



frontend/src/\*\*/\*



Verify:



Router

Route registration

Navigation

Pages

Components

Guards

ProtectedRoute

Face camera

Bootstrap page

Login page

Face login page

Admin page

Employee dashboard

Attendance page

Leave page

Reports page

Recovery page

API clients

Zustand stores

Session handling

Token persistence

Error handling

BACKEND AUDIT



Scan:



backend-api/src/\*\*/\*



Verify:



Routes

Controllers

Services

Middleware

RBAC

Authentication

Authorization

Redis integration

JWT generation

JWT validation

Refresh tokens

Login logic

Face login logic

Bootstrap logic

Recovery logic

OTP logic

Device trust logic

Admin configuration

Employee management

Reports

Attendance

Leave system

FACE AI AUDIT



Scan:



face-ai-service/\*\*/\*



Verify:



Face detector

MTCNN pipeline

FaceNet pipeline

Embedding generation

Cosine similarity

Liveness detection

Anti-spoof detection

Frame decoding

Base64 decoding

Data URL stripping

Face registration

Face login

Error handling

Threading

Runtime stability

DATABASE AUDIT



Verify:



Tables

Indexes

Constraints

Foreign keys

Triggers

Views

Functions

Procedures

Cascades

Synchronization triggers

Compliance triggers

Audit triggers

Recursive triggers



Verify migrations:



001–018



DOCKER AUDIT



Verify:



docker-compose.yml

docker-compose.prod.yml

Dockerfiles

Health checks

Container dependencies

Startup order

Restart policies

NGINX AUDIT



Verify:



Reverse proxy

Route forwarding

HTTPS

API forwarding

SPA fallback

Health endpoints

BOOTSTRAP RECOVERY INVESTIGATION



Determine:



Why /setup/admin-face is unavailable.

Whether bootstrapMode is false.

Whether admin face exists.

Whether admin record exists.

Whether face\_embeddings contains admin.

Whether recovery mode functions.

Whether OTP verification functions.

Whether Redis verification flags function.

Whether frontend recovery UI appears.

Whether BootstrapSetupPage.tsx redirects incorrectly.

Whether bootstrap setup is permanently locked.

Whether recovery override is functioning.



Generate:



BOOTSTRAP\_ROOT\_CAUSE\_REPORT.md



AUTHENTICATION INVESTIGATION



Validate:



Admin Flow

Employee Flow

Face Login Flow

Password Login Flow

Recovery Flow

OTP Flow

JWT Flow

Refresh Flow

Device Trust Flow

Face Enrollment Flow

Face Re-enrollment Flow

Recovery Override Flow



Verify against documented flows.



Generate:



AUTH\_FLOW\_VALIDATION\_REPORT.md



FACE PIPELINE INVESTIGATION



Validate:



Camera Capture

Frame Processing

Base64 Handling

Data URL Stripping

Face Detection

Liveness Detection

Anti-spoof Detection

Embedding Generation

Embedding Storage

Similarity Matching

Face Registration

Face Login



Generate:



FACE\_PIPELINE\_VALIDATION\_REPORT.md



FACE RECOGNITION PIPELINE HARDENING (MANDATORY)



Verify the complete face authentication pipeline.



Investigate:



1\. Face enrollment storage.



2\. Face image persistence.



3\. Face embedding persistence.



4\. Face-to-employee mapping.



5\. Face login verification.



6\. Bootstrap admin enrollment.



7\. Recovery re-enrollment.



8\. Employee re-enrollment.



FACE CAPTURE OPTIMIZATION INVESTIGATION



Determine:



\* Current frame capture count.

\* Why current frame count exists.

\* Whether liveness depends on multiple frames.

\* Whether anti-spoof depends on multiple frames.

\* Whether accuracy decreases with fewer frames.



If analysis proves a single frame provides equivalent security and accuracy:



\* Reduce capture count to one automatic frame.



Otherwise:



\* Preserve existing frame count.



Generate:



FACE\_CAPTURE\_OPTIMIZATION\_REPORT.md



Do not reduce security, liveness validation, anti-spoof protection, or recognition accuracy.



Requirements:



\* Ensure enrollment images are stored according to project architecture.

\* Ensure embeddings are stored and retrievable.

\* Ensure employee-to-embedding relationships remain valid.

\* Ensure bootstrap admin face enrollment survives restart.

\* Ensure face authentication survives restart.

\* Ensure face authentication survives migration execution.



Generate:



FACE\_STORAGE\_AUDIT\_REPORT.md

FACE\_EMBEDDING\_INTEGRITY\_REPORT.md

FACE\_PIPELINE\_END\_TO\_END\_REPORT.md



GIT CONFLICT INVESTIGATION



Audit:



backend-api/src/modules/auth/routes.js

backend-api/src/modules/face-management/routes.js

face-ai-service/src/main.py

frontend/src/components/FaceLogin.tsx



Search for:



<<<<<<<

=======

>>>>>>>



Verify:



No partially merged code remains.

No hidden merge artifacts exist.

No valid logic was overwritten.

No remote fixes were discarded.

No dependencies were broken.



Generate:



GIT\_CONFLICT\_FORENSIC\_REPORT.md





ADDITIONAL RECOMMENDATION (MANDATORY HIGH-PRIORITY INSPECTION)



Before starting ANY repair, modification, merge resolution, migration execution, deployment, rollback, checkpoint creation, validation, or runtime testing, perform a deep forensic inspection of the following files:



Frontend

frontend/src/pages/BootstrapSetupPage.tsx



Verify:



Bootstrap mode detection

Recovery mode detection

Redirect logic

OTP verification flow

Admin setup wizard

Face enrollment initiation

API integration

Query parameter handling (?recovery=true)

Route guards

State persistence

Error handling

frontend/src/components/FaceLogin.tsx



Verify:



Face login workflow

Camera initialization

Frame capture

Base64 conversion

Face enrollment requests

Face authentication requests

Admin login flow

Employee login flow

Error recovery

Timeout handling

Backend API compatibility

Backend

backend-api/src/modules/auth/routes.js



Verify:



Bootstrap status endpoint

Bootstrap setup endpoint

Recovery override logic

OTP verification requirements

Redis verification flags

JWT generation

Login flow

Face login flow

Employee authentication flow

Admin authentication flow

Device trust integration

employee.id vs employee.employee\_id alignment

Security validations

Recovery protections

Face AI Service

face-ai-service/src/main.py



Verify:



Base64 decoding

Data URL stripping

Face detection

Face embedding generation

Liveness detection

Anti-spoof validation

Similarity calculations

Face registration pipeline

Face login pipeline

Error handling

Threading safety

Runtime stability

Database Migrations

backend-api/src/migrations/017\_restore\_admin\_face\_embedding.up.sql



Verify:



Admin face restoration logic

Face embedding integrity

Bootstrap dependencies

Recovery dependencies

Referential integrity

Rollback compatibility

backend-api/src/migrations/018\_fix\_compliance\_triggers\_for\_cascades.up.sql



Verify:



Trigger recursion prevention

Cascade delete behavior

Foreign-key integrity

Compliance logging

Audit logging

Synchronization behavior

Database stability

MANDATORY CONFLICT VALIDATION



For each priority file:



Search for:



<<<<<<<

=======

>>>>>>>



Verify:



No partially merged code remains.

No hidden merge artifacts remain.

No valid logic was overwritten.

No remote fixes were discarded.

No dependencies were broken.



Generate:



PRIORITY\_FILE\_FORENSIC\_REPORT.md



Include:



Root cause findings

Dependency analysis

Runtime impact analysis

Security impact analysis

Repair recommendations

Validation results



No repair may begin until this report is completed.



PRE-REPAIR EVIDENCE CAPTURE (MANDATORY)



Before creating checkpoints and before modifying any file:



Generate:



SYSTEM\_STATE\_SNAPSHOT.md

ROUTE\_DISCOVERY\_MAP.md

API\_ENDPOINT\_DISCOVERY\_MAP.md

DATABASE\_SCHEMA\_SNAPSHOT.md

DOCKER\_RUNTIME\_STATE.md

REDIS\_RUNTIME\_STATE.md



Capture:



\- Running containers

\- Container health

\- Container logs

\- Active routes

\- Active API endpoints

\- Registered frontend routes

\- Database schema

\- Active migrations

\- Redis keys

\- Face AI service status

\- Nginx routing status

\- Dependency graph state



Store all evidence inside:



/forensic-evidence/<timestamp>/



No repair may begin until evidence capture completes.



CHECKPOINT SYSTEM (MANDATORY)



Before ANY modification:



Create:



CHECKPOINT\_FORENSIC\_AUDIT\_<AUTO\_GENERATED\_UNIQUE\_NAME>\_<TIMESTAMP>



The checkpoint name must be generated automatically after auditing the project and identifying the current repair domain.



Examples:



CHECKPOINT\_ADMIN\_RECOVERY\_LOCKOUT\_V1

CHECKPOINT\_FACE\_PIPELINE\_REPAIR\_V1

CHECKPOINT\_DEVICE\_TRUST\_ALIGNMENT\_V1

CHECKPOINT\_TRIGGER\_RECURSION\_FIX\_V1



Store:



affected files

file hashes

dependency graph

route graph

auth graph

rollback instructions

repair manifest



Generate:



repair\_summary.md

rollback\_instructions.md

dependency\_snapshot.json

repair\_manifest.json

FILE\_HASH\_MANIFEST.json

ROUTE\_DEPENDENCY\_MAP.json

AUTH\_DEPENDENCY\_MAP.json

DATABASE\_RELATIONSHIP\_MAP.json

SERVICE\_COMMUNICATION\_MAP.json



No file may be modified before checkpoint creation.



PERSISTENT MISSION CONTROL SYSTEM (MANDATORY)



This protocol exceeds normal context size and may require extended execution.



The AI MUST NOT rely solely on conversational memory.



Before beginning repairs:



Generate:



MISSION\_CONTROL.md



MISSION\_INDEX.json



OBJECTIVE\_TRACKER.json



REPAIR\_PROGRESS\_LEDGER.json



COMPLIANCE\_TRACKER.json



REQUIREMENT\_TRACEABILITY\_MATRIX.md



Structure:



Requirement ID

Requirement Description

Files Checked

Files Modified

Validation Performed

Status



Example:



REQ-001

Bootstrap Setup Works

BootstrapSetupPage.tsx

auth/routes.js

PASS



REQ-002

Admin Face Login Works

FaceLogin.tsx

main.py

PASS





\---



PRIMARY RULE



Every major phase completion MUST update:



\* MISSION\_CONTROL.md

\* OBJECTIVE\_TRACKER.json

\* REPAIR\_PROGRESS\_LEDGER.json



The AI must continuously reference these files before starting any new phase.



\---



OBJECTIVE TRACKING



Convert every major protocol section into tracked objectives.



Example:



\[ ] Frontend Audit



\[ ] Backend Audit



\[ ] Face AI Audit



\[ ] Database Audit



\[ ] Docker Audit



\[ ] Bootstrap Recovery Investigation



\[ ] Authentication Investigation



\[ ] Face Pipeline Investigation



\[ ] Face Recognition Hardening



\[ ] Git Conflict Investigation



\[ ] Priority File Investigation



\[ ] Evidence Capture



\[ ] Checkpoint Creation



\[ ] Repair Execution



\[ ] Validation



\[ ] Acceptance Testing



\[ ] Restart Validation



\[ ] System Certification



\[ ] End-to-End Face Validation



\[ ] Deliverables Generation



Each objective must be marked:



NOT\_STARTED

IN\_PROGRESS

COMPLETED

FAILED

BLOCKED



\---



REPAIR PROGRESS LEDGER



Every repair action must be logged.



For each change record:



\* timestamp

\* file

\* reason

\* dependency impact

\* validation result

\* checkpoint reference



Generate:



REPAIR\_PROGRESS\_LEDGER.json



\---



COMPLIANCE ENFORCEMENT



Before every modification:



Verify:



\* No forbidden action exists.

\* No protected feature is being modified.

\* No protected data is being removed.



Generate:



COMPLIANCE\_CHECK\_REPORT.md



\---



ANTI-FORGETTING LOOP



Before beginning ANY new phase:



The AI MUST re-read:



\* MISSION\_CONTROL.md

\* OBJECTIVE\_TRACKER.json

\* REPAIR\_PROGRESS\_LEDGER.json

\* repair\_manifest.json

\* dependency\_snapshot.json



Then generate:



PHASE\_RECONCILIATION\_REPORT.md



Confirm:



\* completed objectives

\* pending objectives

\* blocked objectives

\* current phase



No new phase may begin until reconciliation completes.



\---



API CREDIT EXHAUSTION PROTECTION



If execution stops unexpectedly:



The next execution MUST:



1\. Read:



&#x20;  \* MISSION\_CONTROL.md

&#x20;  \* OBJECTIVE\_TRACKER.json

&#x20;  \* REPAIR\_PROGRESS\_LEDGER.json

&#x20;  \* repair\_manifest.json

&#x20;  \* checkpoint artifacts



2\. Determine:



&#x20;  \* last completed phase

&#x20;  \* incomplete phase

&#x20;  \* pending objectives



3\. Resume from exact stopping point.



4\. Generate:



&#x20;  RESUME\_STATE\_ANALYSIS.md



Never restart from the beginning unless mission files are missing or corrupted.



\---



FINAL COMPLETION GUARD



Before declaring success:



Verify:



PROTOCOL\_SECTION\_INDEX.json

MASTER\_REQUIREMENT\_REGISTRY.json

PROTOCOL\_COVERAGE\_MATRIX.md

FINAL\_PROTOCOL\_COMPLIANCE\_AUDIT.md



All must show 100% completion.



If any item is below 100%, success declaration is prohibited.



Compare:



OBJECTIVE\_TRACKER.json



against



FINAL DELIVERABLES



Success may only be declared when:



\* every objective = COMPLETED

\* every report exists

\* every validation passed

\* every checkpoint validated



Generate:



MISSION\_COMPLETION\_CERTIFICATE.md



No success declaration is allowed without this certificate.



MASTER PROTOCOL INGESTION \& INTEGRITY VERIFICATION (MANDATORY)



This protocol is extremely large and may exceed practical working-memory limits.



The AI MUST NOT assume that reading the protocol once is sufficient.



Before beginning ANY investigation, audit, repair, validation, checkpoint creation, deployment, restart, cleanup, or certification activity:



PHASE 1 — COMPLETE PROTOCOL INGESTION



1\. Read the entire protocol from first line to last line.



2\. Divide the protocol into sections.



3\. Assign every section a unique identifier.



Example:



SEC-001 CORE\_DIRECTIVE



SEC-002 PRIMARY\_OBJECTIVE



SEC-003 FRONTEND\_AUDIT



SEC-004 BACKEND\_AUDIT



...



SEC-N FINAL\_DELIVERABLES



4\. Generate:



PROTOCOL\_SECTION\_INDEX.json



5\. Record:



\- section name

\- section purpose

\- dependencies

\- required outputs

\- completion criteria



\---



PHASE 2 — REQUIREMENT EXTRACTION



Extract EVERY requirement from the protocol.



Generate:



MASTER\_REQUIREMENT\_REGISTRY.json



For each requirement record:



\- Requirement ID

\- Description

\- Source Section

\- Required Files

\- Validation Method

\- Completion Criteria

\- Status



No requirement may be omitted.



\---



PHASE 3 — COVERAGE VERIFICATION



Generate:



PROTOCOL\_COVERAGE\_MATRIX.md



Verify:



\- Every section indexed.

\- Every requirement extracted.

\- Every deliverable tracked.

\- Every validation tracked.

\- Every report tracked.



Coverage target:



100%



If coverage is less than 100%:



STOP EXECUTION.



Generate:



PROTOCOL\_COVERAGE\_FAILURE\_REPORT.md



Do not proceed.



\---



PHASE 4 — CONTINUOUS RE-VERIFICATION



Before every phase transition:



Compare:



MASTER\_REQUIREMENT\_REGISTRY.json



against:



OBJECTIVE\_TRACKER.json



Verify:



\- No requirement lost.

\- No requirement skipped.

\- No requirement marked completed without evidence.



Generate:



REQUIREMENT\_RECONCILIATION\_REPORT.md



\---



PHASE 5 — FINAL INTEGRITY AUDIT



Before success declaration:



Generate:



FINAL\_PROTOCOL\_COMPLIANCE\_AUDIT.md



Verify:



\- Every protocol section completed.

\- Every requirement completed.

\- Every deliverable generated.

\- Every validation passed.

\- Every checkpoint verified.



Success declaration is forbidden unless compliance score = 100%.



SAFE REPAIR RULES

Allowed



✓ fix broken routes



✓ fix redirects



✓ fix API mismatches



✓ fix Redis recovery logic



✓ fix Docker health checks



✓ fix nginx routing



✓ fix bootstrap deadlocks



✓ fix face enrollment issues



✓ fix database trigger recursion



✓ fix type mismatches



✓ fix employee.id vs employee.employee\_id issues



✓ fix JWT integration



✓ fix refresh token issues



✓ fix dependency mismatches



✓ fix merge-conflict regressions



Forbidden



✗ remove routes



✗ remove features



✗ remove pages



✗ remove APIs



✗ remove services



✗ delete migrations



✗ delete tables



✗ rewrite architecture



✗ disable security



✗ bypass recovery validation



✗ reduce authentication requirements



✗ disable audit logging



✗ remove reporting



✗ remove attendance functionality



✗ remove employee management



✗ remove face authentication



✗ overwrite working code



VALIDATION PHASE



After EVERY repair:



Route Validation



Test every route.



API Validation



Test every endpoint.



Face Validation



Test:



register-face

face-login

embedding generation

liveness

anti-spoof

similarity

Database Validation



Run:



FK checks

trigger checks

migration checks

cascade checks

Docker Validation



Verify:



all containers healthy

startup successful

service communication successful

FINAL ACCEPTANCE TEST



System passes ONLY if:



✓ Admin bootstrap works



✓ Admin recovery works



✓ OTP recovery works



✓ Admin face enrollment works



✓ Admin face login works



✓ Employee password login works



✓ Employee face login works



✓ Reports page loads



✓ Leave page loads



✓ Attendance page loads



✓ Dashboard loads



✓ HTTPS loads



✓ No console errors



✓ No API errors



✓ No database errors



✓ No Redis errors



✓ No migration errors



✓ No trigger errors



✓ No merge conflicts



✓ No broken dependencies



✓ All containers healthy



✓ All health checks passing



✓ Admin bootstrap remains functional after container restart



✓ Admin recovery remains functional after container restart



✓ Face login remains functional after container restart



✓ Employee login remains functional after container restart



✓ Database migrations remain idempotent



✓ Recovery OTP expires correctly



✓ Redis recovery flags are removed after successful recovery



✓ No unresolved Git conflict markers exist anywhere in the repository



✓ No orphaned Docker containers exist



✓ No failed health checks exist in service logs



✓ Database backup successfully created



✓ Database reset successfully completed (Fresh Installation Mode only)



✓ Migrations re-applied successfully (Fresh Installation Mode only)



✓ Bootstrap mode available after reset (Fresh Installation Mode only)



✓ Admin setup wizard available after reset (Fresh Installation Mode only)



✓ Face enrollment available after reset (Fresh Installation Mode only)



✓ All containers healthy after reset (Fresh Installation Mode only)



✓ Post-restart validation passed



✓ POST\_RESTART\_VALIDATION\_REPORT.md generated



POST-REPAIR DEPLOYMENT \& RESTART PROCEDURE (MANDATORY)



After all repairs, validations, and acceptance tests have passed:



1\. Create final backup:

&#x20;  - database\_final\_backup.sql

&#x20;  - final\_dependency\_snapshot.json

&#x20;  - final\_route\_map.json



2\. Restart the entire platform:



&#x20;  - PostgreSQL

&#x20;  - Redis

&#x20;  - Backend API

&#x20;  - Face AI Service

&#x20;  - Frontend

&#x20;  - Nginx



3\. Verify all containers return healthy status.



4\. Wait for all startup health checks to complete.



5\. Re-run:



&#x20;  - Route Validation

&#x20;  - API Validation

&#x20;  - Authentication Validation

&#x20;  - Face Pipeline Validation

&#x20;  - Bootstrap Validation



6\. Confirm all URLs return HTTP 200.



7\. Generate:



&#x20;  POST\_RESTART\_VALIDATION\_REPORT.md



8\. Only declare success after post-restart validation passes.



DATABASE RESET MODE (OPTIONAL)



Do NOT clear the database automatically.



Determine whether the user explicitly requested:



A. Preserve Data Mode

&#x20;  - Keep all users

&#x20;  - Keep attendance

&#x20;  - Keep reports

&#x20;  - Keep face embeddings

&#x20;  - Keep recovery records



B. Fresh Installation Mode

&#x20;  - Backup database

&#x20;  - Export evidence

&#x20;  - Generate reset plan

&#x20;  - Truncate application tables

&#x20;  - Re-run migrations

&#x20;  - Re-seed required bootstrap data

&#x20;  - Verify bootstrap mode

&#x20;  - Generate DATABASE\_RESET\_REPORT.md



Only perform database reset if explicitly requested by the user.



DATABASE PRESERVATION \& SELECTIVE CLEANUP POLICY (MANDATORY)



This policy overrides any generic database reset instruction.



The AI is STRICTLY FORBIDDEN from performing a full database wipe, full table truncation, schema deletion, migration rollback of production data, DROP TABLE operations, or any destructive operation that would remove required system configuration.



Protected data includes:



\* employees

\* admin account records

\* bootstrap configuration

\* face enrollment mappings

\* face embeddings

\* recovery configuration

\* application settings

\* role mappings

\* permissions

\* attendance records

\* leave records

\* reports

\* audit records

\* migration history



Before any cleanup operation:



1\. Generate:

&#x20;  DATABASE\_DEPENDENCY\_ANALYSIS.md



2\. Determine:



&#x20;  \* Which records are system-critical

&#x20;  \* Which records were created by users

&#x20;  \* Which records are temporary

&#x20;  \* Which records are orphaned

&#x20;  \* Which records are corrupted



3\. Generate:

&#x20;  DATABASE\_CLEANUP\_PLAN.md



4\. Do NOT execute cleanup until plan approval phase completes.



Allowed cleanup:



✓ expired OTP records



✓ expired session tokens



✓ orphaned temporary uploads



✓ invalid cache entries



✓ corrupted duplicate embeddings



✓ abandoned recovery requests



✓ temporary validation artifacts



✓ temporary forensic artifacts



Forbidden cleanup:



✗ admin account removal



✗ employee removal



✗ attendance removal



✗ leave removal



✗ report removal



✗ face embedding removal unless corrupted and backed up



✗ migration history removal



✗ bootstrap configuration removal



✗ permission removal



✗ role removal



If a database reset is required:



1\. Create full backup.



2\. Export:



&#x20;  \* employees

&#x20;  \* face\_embeddings

&#x20;  \* attendance

&#x20;  \* leave\_requests

&#x20;  \* reports

&#x20;  \* permissions

&#x20;  \* roles

&#x20;  \* bootstrap configuration



3\. Restore protected records after reset.



4\. Verify integrity after restoration.



Generate:



DATABASE\_PRESERVATION\_REPORT.md

DATABASE\_RESTORE\_VALIDATION\_REPORT.md



EMERGENCY RESUME PROTOCOL



If API credits expire, execution stops, container crashes, environment resets, or context is lost:



1\. Read:

&#x20;  - repair\_manifest.json

&#x20;  - dependency\_snapshot.json

&#x20;  - FILE\_HASH\_MANIFEST.json

&#x20;  - repair\_summary.md

&#x20;  - rollback\_instructions.md



2\. Locate latest:

&#x20;  CHECKPOINT\_FORENSIC\_AUDIT\_<NAME>\_<TIMESTAMP>



3\. Verify:

&#x20;  - file hashes

&#x20;  - dependency maps

&#x20;  - route maps

&#x20;  - auth maps



4\. Resume from the last completed checkpoint.



5\. Never restart the repair process from the beginning unless checkpoint validation fails.



6\. Generate:

&#x20;  RESUME\_VALIDATION\_REPORT.md



7\. Continue execution from the next incomplete phase.



8\. Verify whether any files were modified after the checkpoint timestamp.



9\. Generate:



POST\_RESUME\_INTEGRITY\_REPORT.md



10\. Compare:



\- FILE\_HASH\_MANIFEST.json

\- ROUTE\_DEPENDENCY\_MAP.json

\- AUTH\_DEPENDENCY\_MAP.json

\- DATABASE\_RELATIONSHIP\_MAP.json

\- SERVICE\_COMMUNICATION\_MAP.json



against the latest checkpoint.



11\. Abort automatic repair continuation if integrity verification fails.



12\. Create:



CHECKPOINT\_RESUME\_VALIDATION\_<TIMESTAMP>



before continuing.



FINAL SYSTEM CERTIFICATION (MANDATORY)



Before declaring success:



1\. Verify all required URLs return HTTP 200.



2\. Verify all containers are healthy.



3\. Verify no unresolved merge markers exist.



4\. Verify all migrations are applied.



5\. Verify no failed health checks exist.



6\. Verify authentication flows function.



7\. Verify face enrollment functions.



8\. Verify face login functions.



9\. Verify bootstrap setup functions.



10\. Verify recovery mode functions.



11\. Verify post-restart validation passes.



12\. Generate:



SYSTEM\_CERTIFICATION\_REPORT.md



Only after SYSTEM\_CERTIFICATION\_REPORT.md passes may the repair be considered complete.



END-TO-END FACE AUTHENTICATION VALIDATION (MANDATORY)



Validate complete authentication lifecycle.



Admin Flow:



Admin Enrollment

→ Face Storage

→ Embedding Creation

→ Face Login

→ Dashboard Access



Employee Flow:



Employee Enrollment

→ Face Storage

→ Embedding Creation

→ Face Login

→ Dashboard Access



Verify:



\- face image storage

\- face image retrieval

\- embedding generation

\- embedding storage

\- embedding retrieval

\- employee linkage

\- dashboard access

\- restart persistence

\- migration persistence



Generate:



END\_TO\_END\_FACE\_AUTH\_REPORT.md



No repair may be declared successful until this report passes.



ONE-TIME EXECUTION DIRECTIVE (CURRENT REPAIR SESSION ONLY)



This directive applies ONLY to the current execution of this protocol.



After:



\- all investigations complete,

\- all repairs complete,

\- all validations pass,

\- all acceptance tests pass,

\- all forensic reports are generated,

\- all backups are created,



perform a one-time Fresh Installation Reset.



Requirements:



1\. Create full backups before reset:

&#x20;  - database\_final\_backup.sql

&#x20;  - final\_dependency\_snapshot.json

&#x20;  - final\_route\_map.json



2\. Export all forensic evidence.



3\. Export all reports.



4\. Export all checkpoints.



5\. Generate:

&#x20;  PRE\_RESET\_VALIDATION\_REPORT.md



6\. Execute DATABASE PRESERVATION \& SELECTIVE CLEANUP POLICY.



Do NOT perform a full database wipe.



Only remove:



\- expired OTPs

\- expired sessions

\- orphaned temporary uploads

\- abandoned recovery requests

\- invalid cache entries

\- temporary forensic artifacts



Preserve:



\- admin account

\- employee records

\- attendance

\- leave records

\- reports

\- permissions

\- roles

\- bootstrap configuration

\- face images

\- face embeddings

\- migration history



7\. Re-run all required migrations.



8\. Re-seed mandatory bootstrap data.



9\. Restart the entire platform:

&#x20;  - PostgreSQL

&#x20;  - Redis

&#x20;  - Backend API

&#x20;  - Face AI Service

&#x20;  - Frontend

&#x20;  - Nginx



10\. Verify:

&#x20;   - bootstrap mode available

&#x20;   - admin setup page available

&#x20;   - face enrollment available

&#x20;   - login routes available

&#x20;   - all containers healthy

&#x20;   - all URLs return HTTP 200



11\. Generate:

&#x20;   DATABASE\_RESET\_REPORT.md

&#x20;   POST\_RESET\_VALIDATION\_REPORT.md



12\. This reset applies ONLY to the current execution and must not become a permanent behavior of this protocol.



FINAL DELIVERABLES



Generate:



SYSTEM\_CERTIFICATION\_REPORT.md

DATABASE\_RESET\_REPORT.md

POST\_RESET\_VALIDATION\_REPORT.md

PRE\_RESET\_VALIDATION\_REPORT.md

RESET\_ABORT\_REPORT.md

POST\_RESUME\_INTEGRITY\_REPORT.md

FORENSIC\_EVIDENCE\_INDEX.md

MASTER\_FORENSIC\_REPAIR\_REPORT.md

ROOT\_CAUSE\_ANALYSIS.md

BOOTSTRAP\_RECOVERY\_REPORT.md

AUTH\_FLOW\_VALIDATION\_REPORT.md

DATABASE\_PRESERVATION\_REPORT.md

DATABASE\_RESTORE\_VALIDATION\_REPORT.md

FACE\_STORAGE\_AUDIT\_REPORT.md

FACE\_EMBEDDING\_INTEGRITY\_REPORT.md

FACE\_PIPELINE\_END\_TO\_END\_REPORT.md

FACE\_CAPTURE\_OPTIMIZATION\_REPORT.md

END\_TO\_END\_FACE\_AUTH\_REPORT.md

FACE\_PIPELINE\_VALIDATION\_REPORT.md

DATABASE\_INTEGRITY\_REPORT.md

ROUTE\_VALIDATION\_REPORT.md

DOCKER\_HEALTH\_REPORT.md

GIT\_CONFLICT\_REPORT.md

PRIORITY\_FILE\_FORENSIC\_REPORT.md

PROJECT\_FORENSIC\_AUDIT\_V2.md

FINAL\_RUNTIME\_VALIDATION.md

SYSTEM\_STATE\_SNAPSHOT.md

PRE\_REPAIR\_EVIDENCE\_REPORT.md

RESUME\_VALIDATION\_REPORT.md

CHECKPOINT\_INDEX.md



Declare success ONLY after every investigation, repair, validation, acceptance test, and deliverable has been completed successfully.

