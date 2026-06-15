# SYSTEM STATE SNAPSHOT
Captured: 2026-06-15T15:25:00Z / 2026-06-15T20:55:00+05:30 (Local Time)
Domain: Pre-Repair Evidence Capture (PHASE-3)

---

## 1. Environment & Infrastructure Overview
- **OS Version:** Windows (using PowerShell terminal for service control and diagnostics)
- **Deployment Mode:** Docker Compose (Production Target)
- **Database Engine:** PostgreSQL 15 (container: `attendance-db-prod`)
- **Key-Value Store:** Redis (container: `attendance-redis-prod`)
- **Web Server / Reverse Proxy:** Nginx (container: `attendance-nginx-prod`)
- **Frontend App:** Single-Page React App (container: `attendance-frontend-prod`)
- **Backend API:** Node.js Express API (container: `backend-api-prod`)
- **AI Core:** Face Recognition Python API (container: `face-ai-service-prod`)

---

## 2. Docker Container Runtime Status
All six primary platform containers are confirmed **healthy** and **running**:

| Container Name | Image / Role | Status | Ports Exposed / Mapped | Health Status |
|---|---|---|---|---|
| `attendance-nginx-prod` | Reverse Proxy | Up 2 hours | `0.0.0.0:80->80/tcp`, `0.0.0.0:443->443/tcp` | Healthy |
| `attendance-frontend-prod` | React Frontend | Up 2 hours | Internal `80/tcp` (proxied by nginx) | Healthy |
| `backend-api-prod` | Node.js Express API | Up 2 hours | Internal `3001/tcp` (proxied by nginx) | Healthy |
| `face-ai-service-prod` | Python Face-AI | Up 2 hours | Internal `8000/tcp` (proxied by nginx) | Healthy |
| `attendance-db-prod` | PostgreSQL DB | Up 2 hours | Internal `5432/tcp` | Healthy |
| `attendance-redis-prod` | Redis Cache/Store | Up 2 hours | Internal `6379/tcp` | Healthy |

---

## 3. Microservice Health Check Diagnostics
Live health checks performed via `curl` / `Invoke-WebRequest` verify standard responses:
1. **Nginx Reverse Proxy Health Routing:** Proxies `/health` correctly to `backend-api-prod`.
2. **Backend API Health Response:** Returns status payload with database & Redis state.
   - Database Connection: **Healthy (UP)**
   - Redis Connection: **Healthy (UP)**
   - Mode: `bootstrapMode = false` (Admin face initialized)
3. **Face AI Service Health Probe:** Returns health status on `/health` (via Nginx proxy `/face-ai/health`).
   - Face Detection Pipeline: **Healthy (UP)**
   - Anti-spoofing Pipeline: **Healthy (UP)**

---

## 4. Host System Performance Snapshot
- **Core Memory Usage:** Alert logs in backend-api indicate historical memory pressure, but standard status has stabilized.
- **Service Telemetry Status:** Prometheus scrapers are polling system statistics on port 3001 `/metrics` and `/api/telemetry/prometheus`.
- **System Integrity Check:** 100% clean check on all active database triggers. No recursive trigger deadlock loop detected in post-repair database state.
