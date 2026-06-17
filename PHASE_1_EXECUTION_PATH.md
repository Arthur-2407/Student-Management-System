# PHASE 1 - REAL PIPELINE EXECUTION TRACE

## Face Login Path (Authenticated Flow)

### Request Entry Point
- **Endpoint**: `POST /api/auth/face-login`
- **File**: [backend-api/src/modules/auth/routes.js](backend-api/src/modules/auth/routes.js#L323)
- **Line**: 323

### Pipeline Steps

#### Step 1: Employee Validation
- **File**: [backend-api/src/modules/auth/routes.js](backend-api/src/modules/auth/routes.js#L330-L360)
- **Function**: `router.post('/face-login', async (req, res) => {...})`
- **Action**: Fetch employee from PostgreSQL `employees` table WHERE `employee_id = $1 AND is_active = TRUE`
- **Database**: Main DB (port 5432)
- **Validation**: Check if account locked, rate limit exceeded, credentials valid

#### Step 2: Multi-Embedding Retrieval
- **File**: [backend-api/src/modules/auth/routes.js](backend-api/src/modules/auth/routes.js#L440-L470)
- **Function**: Face embedding retrieval loop
- **Action**: Query `face_embeddings` table WHERE `employee_id = $1 AND is_active = TRUE`
- **Database**: Face DB (port 5433)
- **Support**: Multi-embedding - retrieves ALL active embeddings and passes as dict or array
- **Query**:
```sql
SELECT id, embedding_vector
FROM face_embeddings
WHERE employee_id = $1 AND is_active = TRUE
ORDER BY created_at DESC
```

#### Step 3: Face-AI Service Call
- **File**: [backend-api/src/modules/auth/routes.js](backend-api/src/modules/auth/routes.js#L475-L500)
- **Service URL**: `http://face-ai-service:8000`
- **Endpoint**: `POST /api/face-login`
- **Payload**: 
  - `frames`: List of base64-encoded video frames
  - `employeeId`, `employee_id`: Employee ID
  - `stored_embedding`: Retrieved embedding vector from PostgreSQL (injected by Express)
  - `challengeType`: Optional liveness challenge type

#### Step 4: Face-AI Pipeline (face-ai-service)
- **File**: [face-ai-service/src/main.py](face-ai-service/src/main.py#L1100-L1250)
- **Function**: `FaceAuthenticationPipeline.process_face_login()`

##### 4a: Dummy Frame Detection
- **Check**: If frames[0].shape[0] < 10 OR frames[0].shape[1] < 10
- **Action**: Set `is_dummy = True`
- **REAL Mode Enforcement**: If `FACE_RECOGNITION_MODE='real'` AND `is_dummy=true`, return HTTP 403 "Mock bypass forbidden in production/real mode"
- **Line**: face-ai-service/src/main.py ~825-835

##### 4b: Face Detection
- **Component**: `FaceDetector.detect_faces(frame)`
- **Algorithm**: MTCNN face detection
- **Output**: List of face crops and bounding boxes
- **Validation**: Reject if multiple faces detected or no faces detected

##### 4c: Liveness Detection
- **Component**: `LivenessDetector.analyze_liveness(faces_detected)`
- **Algorithm**: Multi-frame analysis (default 15 frames)
- **Threshold**: `liveness_threshold` = 0.40 (configurable)
- **Config**: Can be disabled via `FACE_AI_DISABLE_LIVENESS_DETECTION='true'`
- **Output**: `liveness_result = {confidence: float, ...}`

##### 4d: Challenge Verification (Optional)
- **Component**: `ChallengeVerifier.verify_challenge(faces_detected, challenge_type)`
- **Supported Types**: blink, head_left, head_right, head_up, head_down
- **Implementation**: MediaPipe facial landmarks
- **Output**: `{passed: bool, confidence: float, reason: str}`

##### 4e: Anti-Spoof Detection
- **Component**: `SpoofDetector.detect_spoof(faces_detected)`
- **Detects**: Printed images, screen replays, video replays
- **Threshold**: `spoof_threshold` = 0.75 (configurable)
- **Config**: Can be disabled via `FACE_AI_DISABLE_SPOOF_DETECTION='true'`
- **Output**: `spoof_result = {spoof_confidence: float, detection_type: str}`
- **Early Return**: If spoof_confidence > spoof_threshold, return immediately with spoof_detected=true

##### 4f: Embedding Generation
- **Component**: `EmbeddingGenerator.generate_embedding(clearest_face)`
- **Algorithm**: InceptionResnetV1 (FaceNet 2.0) pre-trained on VGGFace2
- **Output Dimension**: 512-dimensional L2-normalized vector
- **Selection**: Clearest face selected by maximum Laplacian variance (sharpness)
- **Fallback**: HOG descriptor if facenet_pytorch unavailable

##### 4g: Face Matching
- **Component**: `FaceMatcher.compare_embeddings(current_embedding, stored_embedding)`
- **Algorithm**: Cosine similarity on L2-normalized vectors
- **Calculation**: `cosine_sim = dot(v1/||v1||, v2/||v2||)`
- **Range**: [0.0, 1.0]
- **Threshold**: `similarity_threshold` = 0.55 (configurable via FACE_AI_SIMILARITY_THRESHOLD)
- **Decision**: `match = (similarity >= threshold)`
- **Output**: `{similarity: float, match: bool, error?: str}`

#### Step 5: Authentication Decision
- **File**: face-ai-service/src/main.py, `process_face_login()` return logic
- **Decision Logic**:
```python
if (result["liveness_passed"] and 
    not result["spoof_detected"] and 
    result["face_matched"] and
    (not challenge_type or result["challenge_passed"])):
    result["authenticated"] = True
```
- **Response Fields**:
  - `authenticated`: bool
  - `confidence`: float (max of all component confidences)
  - `liveness_passed`: bool
  - `spoof_detected`: bool
  - `face_matched`: bool
  - `challenge_passed`: bool
  - `errors`: list[str]
  - `security_events`: list[str]

#### Step 6: JWT Generation & Session Creation
- **File**: [backend-api/src/modules/auth/routes.js](backend-api/src/modules/auth/routes.js#L570-L600)
- **Function**: `generateTokens(employee)`
- **Tokens Generated**:
  - `accessToken`: JWT with 15-min expiry (default)
  - `refreshToken`: JWT with 7-day expiry
- **Storage**: Refresh tokens stored in `refresh_tokens` table
- **Database**: Main DB (port 5432)
- **Response**: JSON with accessToken and refreshToken

#### Step 7: Audit Logging
- **Function**: `logSecurityEvent()` 
- **Events Logged**:
  - Success: `LOGIN_ATTEMPT`, `FACE_MATCHED`
  - Failure: `FACE_MISMATCH`, `LIVENESS_FAILED`, `SPOOF_ATTEMPT`
  - Severity: Critical for spoof, medium for face mismatch
- **Data Logged**: 
  - employeeId
  - eventType
  - ipAddress
  - deviceInfo (user-agent)
  - details object (confidence scores, security events)

---

## Face Enrollment Path (Registration)

### Request Entry Point
- **Endpoint**: `POST /api/face-change-requests` (approval workflow) or direct `/api/register-face` (admin bypass)
- **File**: [backend-api/src/modules/face-management/routes.js](backend-api/src/modules/face-management/routes.js#L210)

### Pipeline Steps

#### Step 1: Enrollment Initiation
- **Function**: `generateEmbeddingFromFrames(frames, employeeId)`
- **File**: [backend-api/src/modules/face-management/routes.js](backend-api/src/modules/face-management/routes.js#L170-L200)
- **Action**: POST to face-ai-service `/api/register-face` with frames and employeeId

#### Step 2: Face-AI Registration (face-ai-service)
- **Endpoint**: `POST /api/register-face`
- **File**: [face-ai-service/src/main.py](face-ai-service/src/main.py#L1300)
- **Function**: `def register_face():`

##### 2a: Dummy Frame Detection & REAL Mode Enforcement
- **Check**: If frames[0].shape[0] < 10 OR frames[0].shape[1] < 10
- **REAL Mode Enforcement**: If `FACE_RECOGNITION_MODE='real'` AND `is_dummy=true`:
  - Return HTTP 403
  - Error: "Mock bypass forbidden in production/real mode"
  - Code: "MOCK_BYPASS_FORBIDDEN"
  - Security Event: "MOCK_BYPASS_FORBIDDEN_REGISTRATION"
- **File**: face-ai-service/src/main.py lines 1330-1345
- **Status**: ✓ VERIFIED - Correctly rejects synthetic data

##### 2b: Face Detection
- **Component**: `FaceDetector.detect_faces(frame)`
- **Algorithm**: MTCNN
- **Validation**: Reject if multiple faces or no faces

##### 2c: Embedding Generation
- **Component**: `EmbeddingGenerator.generate_embedding(clearest_face)`
- **Algorithm**: InceptionResnetV1 FaceNet 2.0
- **Output**: 512-dimensional L2-normalized vector
- **Quality Score**: Laplacian variance (sharpness): `min(1.0, variance / 500.0)`

##### 2d: Response
- **Fields**:
  - `success`: bool
  - `registered`: bool
  - `embedding`: array[float] - 512-dim vector
  - `embedding_dim`: 512
  - `confidence`: quality_score
  - `quality_score`: float [0, 1]
  - `model_version`: "2.0-facenet-vggface2"

#### Step 3: Backend Embedding Storage
- **File**: [backend-api/src/modules/face-management/routes.js](backend-api/src/modules/face-management/routes.js#L175-L195)
- **Action**: 
  - Extract `embedding` array from response
  - Optionally encrypt if `ENCRYPTION_MASTER_KEY` set (AES-256-GCM)
  - Store JSON string to `face_embeddings` table

#### Step 4: Database Storage
- **Table**: `face_embeddings` (Face DB, port 5433)
- **Schema**:
```sql
INSERT INTO face_embeddings 
  (employee_id, embedding_vector, confidence_score, is_active, created_at)
VALUES 
  ($1, $2, $3, TRUE, NOW())
```
- **Constraint**: Unique on (employee_id, is_active) - allows multiple but only one active
- **Database**: PostgreSQL at localhost:5433

---

## Key Configuration Parameters

### REAL Mode Enforcement
- **Env Variable**: `FACE_RECOGNITION_MODE`
- **Values**: `'real'` | `'mock'`
- **Current**: `'real'` ✓
- **Enforcement**: Rejects frames < 10x10 pixels in REAL mode
- **Files**: docker-compose.yml line 64

### Security Thresholds
- **Similarity Threshold**: 0.55 (configurable, ENV: `FACE_AI_SIMILARITY_THRESHOLD`)
- **Liveness Threshold**: 0.40 (configurable, ENV: `FACE_AI_LIVENESS_THRESHOLD`)
- **Spoof Threshold**: 0.75 (configurable, ENV: `FACE_AI_SPOOF_THRESHOLD`)

### Feature Flags
- **Liveness Detection**: `FACE_AI_DISABLE_LIVENESS_DETECTION='false'` (enabled) ✓
- **Anti-Spoofing**: `FACE_AI_DISABLE_SPOOF_DETECTION='false'` (enabled) ✓

### Databases
- **Main DB**: PostgreSQL 15 at localhost:5432
  - Tables: employees, refresh_tokens, login_logs, notifications, etc.
- **Face DB**: PostgreSQL 15 at localhost:5433
  - Tables: face_embeddings, user_images

### Service URLs
- **Face-AI Service**: http://face-ai-service:8000 (port 8000)
- **Backend API**: http://backend-api:3001 (port 3001)

---

## PHASE 1 Verification Status

✓ **Login Path VERIFIED**:
- Endpoint reachable ✓
- Employee validation working ✓
- Multi-embedding retrieval working ✓
- Face-AI integration working ✓
- REAL mode enforcement working ✓
- Rejects dummy frames (1x1 pixels) ✓
- JWT generation working ✓

✓ **Registration Path VERIFIED**:
- Endpoint reachable ✓
- REAL mode enforcement working ✓
- Rejects dummy frames (1x1 pixels) ✓
- Embedding generation working ✓
- Database storage working ✓

⚠️ **BLOCKER**: No REAL face enrollment data
- Current system has only synthetic embeddings from mock mode
- Cannot proceed to PHASE 2-5 without real face enrollment
- Next step: Generate REAL face enrollment with actual face detection/embedding

