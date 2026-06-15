# REDIS RUNTIME STATE
Captured: 2026-06-15T15:25:00Z
Redis Server: `attendance-redis-prod` on port 6379

---

## 1. Connection Parameters
- **Hostname:** `redis` (resolves internally to container `attendance-redis-prod` in docker bridge network)
- **Port:** `6379`
- **Authentication:** Password protected using `REDIS_PASSWORD` from environmental config.
- **Client Library:** `ioredis` / `redis` (Node.js backend-api integration)

---

## 2. Active Keys Scan
A scan using `KEYS "*"` command returned:
- **Keys Found:** `(empty array)`
- **Observation:** Zero active keys. No recovery processes are currently in progress, and no rate-limiting lockouts or active sessions exist in the cache database.

---

## 3. Redis Integration Design Mappings

### 3.1. Rate Limiting (authLimiter & apiLimiter)
- **Key Prefix:** `rate_limit:<type>:<identifier>`
- **Strategy:** Redis-based window counters (increment keys with a TTL set to window duration).
- **Uses:**
  - Standard user login attempts rate-limiting (e.g. `login_attempts:<employeeId>:<ip>`).
  - General API endpoint protection against DDoS.

### 3.2. Account Recovery Flow Verification Flags
- **Uses:** Secure temporary state flags.
- **OTP Verification Storage:**
  - **Key Structure:** `otp:<employeeId>` or `recovery_otp:<employeeId>`
  - **Value:** Hashed or raw OTP value for admin / employee lockout recovery overrides.
  - **Expiry:** Strict TTL (e.g. 5 to 15 minutes) after which OTP is removed automatically.
- **Admin Recovery Verification Status:**
  - **Key Structure:** `recovery_override_auth:<uuid>`
  - **Value:** Flag value indicating the admin recovery wizard has been authorized.
  - **Expiry:** TTL representing user wizard session lifetime.
