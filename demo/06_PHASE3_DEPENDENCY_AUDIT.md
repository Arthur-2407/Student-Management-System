# PHASE 3: DEPENDENCY AUDIT

**Phase**: 3/12
**Status**: ✓ COMPLETE
**Duration**: 2 hours
**Output**: Data flow and dependency analysis

---

## CRITICAL DATA FLOWS

### Flow 1: User Registration
```
Browser → POST /auth/register
→ Backend Auth Module
  ├─ Validate input
  ├─ Hash password (bcryptjs)
  ├─ PostgreSQL Main DB (INSERT employees)
  ├─ Generate tokens (JWT)
  ├─ Redis (store refresh token)
  └─ Return tokens
→ Browser (store JWT)
```
**Dependencies**: PostgreSQL Main, Redis, bcryptjs
**Points of Failure**: DB connection, hashing service

---

### Flow 2: User Login
```
Browser → POST /auth/login
→ Backend Auth Module
  ├─ Validate credentials
  ├─ Query PostgreSQL Main DB (SELECT employee)
  ├─ Compare passwords (bcryptjs)
  ├─ Generate tokens (JWT)
  ├─ Redis (store refresh token)
  ├─ Possible: Face verification required
  └─ Return tokens
→ Browser (store JWT)
```
**Dependencies**: PostgreSQL Main, Redis, bcryptjs
**Critical Gap**: No mandatory face verification at login

---

### Flow 3: Face Enrollment
```
Browser → POST /face/enroll
→ Backend Face-Management Module
  ├─ Validate JWT
  ├─ Send to Flask Face AI Service (Port 8000)
  │  ├─ /face/detect (returns 501 MOCK)
  │  ├─ /face/register (returns 501 MOCK)
  │  └─ Get embedding (MOCK returns dummy vector)
  ├─ Store in PostgreSQL Face DB
  │  ├─ face_embeddings (PLAINTEXT JSON)
  │  ├─ user_images (raw image)
  │  └─ face_audit_logs (enrollment log)
  └─ Return status
→ Browser
```
**Dependencies**: Flask Face AI (MOCK), PostgreSQL Face DB, JWT
**Critical Issues**: Face AI mock (501), plaintext storage

---

### Flow 4: Face Verification
```
Browser → POST /face/verify
→ Backend Face-Management Module
  ├─ Validate JWT
  ├─ Send to Flask Face AI Service (Port 8000)
  │  └─ /face/verify (returns 501 MOCK)
  ├─ Get stored embedding from PostgreSQL Face DB
  ├─ Compare embeddings (MOCK always returns match)
  ├─ Optional: Liveness check (NOT IMPLEMENTED)
  └─ Return match/no-match
→ Browser
```
**Dependencies**: Flask Face AI (MOCK), PostgreSQL Face DB, JWT
**Critical Issues**: Face AI mock (501), no liveness

---

### Flow 5: Token Refresh
```
Browser → POST /auth/refresh
→ Backend Auth Module
  ├─ Validate refresh token
  ├─ Query Redis (token blacklist check)
  ├─ Query PostgreSQL Main DB (token family validation)
  ├─ Generate new token pair
  ├─ Update Redis (old token blacklist, new token store)
  └─ Return new tokens
→ Browser (update JWT)
```
**Dependencies**: Redis, PostgreSQL Main, JWT library
**Status**: Working, implements replay prevention

---

### Flow 6: User Logout
```
Browser → POST /auth/logout
→ Backend Auth Module
  ├─ Invalidate JWT
  ├─ Add to Redis blacklist
  ├─ Mark refresh token as used
  └─ Return success
→ Browser (clear tokens)
```
**Dependencies**: Redis, JWT
**Status**: Basic logout working

---

## SERVICE DEPENDENCIES

### PostgreSQL Main DB (Port 5432)
- Required by: Auth module, User management, Attendance
- Tables: employees, refresh_tokens, audit_logs, roles, etc.
- Criticality: HIGH (if down, no login/registration)
- Backup: Standard PostgreSQL backups
- Failover: No replication configured

### PostgreSQL Face DB (Port 5433)
- Required by: Face-management module, Verification
- Tables: face_embeddings, users, user_images, audit_logs
- Criticality: CRITICAL (if down, no face operations)
- Issues: Plaintext embeddings, separate instance
- Failover: No replication configured

### Redis (Port 6379)
- Required by: Rate limiting, Token blacklist, Session storage
- Data: Rate limit counters, token blacklist, temp data
- Criticality: MEDIUM (graceful degradation possible)
- Persistence: Default configuration (check if RDB/AOF enabled)
- Failover: No clustering configured

### Flask Face AI Service (Port 8000)
- Required by: Face verification, Face enrollment
- Criticality: CRITICAL (if down, all face ops fail)
- Current Status: Mock mode (501 responses)
- Failover: No backup service
- Scaling: Single instance

---

## SINGLE POINTS OF FAILURE (SPoF)

### 🔴 CRITICAL SPOFs (3)
1. **Flask Face AI Service** - Only instance, mock mode
   - Impact: All face operations fail
   - Mitigation: Implement real service, add failover

2. **PostgreSQL Face DB** - Only instance, separate
   - Impact: All enrollment/verification fail
   - Mitigation: Add replication, backup strategy

3. **Redis** - Only instance, session state
   - Impact: Session validation may fail
   - Mitigation: Add clustering, persistence checks

### 🟡 HIGH SPOFs (2)
4. **PostgreSQL Main DB** - Only instance
   - Impact: Auth operations fail
   - Mitigation: Add replication

5. **Express.js Backend** - Only instance
   - Impact: API unavailable
   - Mitigation: Load balancing, multiple instances

---

## DEPENDENCY GRAPH

```
Browser (Frontend)
  ├─→ Express.js Backend (required)
  │   ├─→ PostgreSQL Main (required)
  │   ├─→ PostgreSQL Face (required)
  │   ├─→ Redis (optional - rate limiting only)
  │   └─→ Flask Face AI (required for face ops)
  │       └─→ ML Models (currently mock)
  └─→ JWT Token (from backend)
```

---

## CRITICAL DEPENDENCIES DETAILS

### JWT Library Dependencies
- Token generation/validation
- Expiration checks
- Signature verification
- Currently working correctly

### bcryptjs Dependencies
- Password hashing for auth
- 10 salt rounds configured
- Version 2.4.3 installed
- Status: WORKING

### Express.js Dependencies
- Core web framework
- Middleware stack (auth, error, logging)
- Route handling
- Status: WORKING

### Database Drivers
- PostgreSQL: pg library
- Connection pooling
- Query execution
- Status: WORKING

---

## FAILURE MODE ANALYSIS

| Component | Failure | Impact | Recovery |
|-----------|---------|--------|----------|
| PostgreSQL Main | Down | No login | Manual failover |
| PostgreSQL Face | Down | No face ops | Manual failover |
| Redis | Down | No rate limiting | Service continues |
| Flask Face AI | Down | No face ops | Manual restart |
| Express Backend | Down | Complete outage | Manual restart |
| Frontend | Network | Can't reach API | Check connectivity |

---

## DEPENDENCY RISKS

**HIGH RISK**: Flask Face AI Service
- Currently mock mode (501 responses)
- No real ML deployed
- Critical path for face verification
- Must implement real service for production

**HIGH RISK**: PostgreSQL Face DB
- Plaintext embeddings (encryption needed)
- Single instance (add replication)
- No backup strategy documented

**HIGH RISK**: Redis
- Single instance (add clustering)
- Persistence configuration unknown

---

## RECOMMENDATION

1. **Implement Real Face AI Service** (CRITICAL)
   - Replace mock endpoints
   - Deploy ML models

2. **Add Database Replication** (HIGH)
   - PostgreSQL Main replication
   - PostgreSQL Face replication

3. **Add Redis Clustering** (MEDIUM)
   - Reduce single point of failure
   - Improve scalability

4. **Implement Service Monitoring** (HIGH)
   - Alert on service failures
   - Auto-failover if possible

5. **Document Failover Procedures** (MEDIUM)
   - Manual recovery steps
   - Recovery time targets

