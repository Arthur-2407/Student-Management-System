# DOCKER RUNTIME STATE
Captured: 2026-06-15T15:25:00Z
Docker Compose Configuration Source: `docker-compose.yml`

---

## 1. Network Topology
All services operate within a single custom bridge network:
- **Network Name:** `attendance-network`
- **Network Driver:** `bridge`

---

## 2. Container Catalog & Health Configurations

### 2.1. `postgres` (attendance-db-prod)
- **Container Name:** `attendance-db-prod` (configured in production compose)
- **Base Image:** `postgres:15-alpine`
- **Restart Policy:** Default
- **Host Ports:** `5432:5432`
- **Volume Mounts:**
  - `postgres_data` -> `/var/lib/postgresql/data`
  - `./database/init.sql` -> `/docker-entrypoint-initdb.d/init.sql` (first boot seed schema)
- **Healthcheck:**
  - Test command: `pg_isready -U postgres`
  - Probe: Interval `10s`, Timeout `5s`, Retries `5`

### 2.2. `redis` (attendance-redis-prod)
- **Container Name:** `attendance-redis-prod`
- **Base Image:** `redis:7-alpine`
- **Command:** `redis-server --requirepass <password>`
- **Host Ports:** `6379:6379`
- **Volume Mounts:**
  - `redis_data` -> `/data`
- **Healthcheck:**
  - Test command: `redis-cli -a <password> ping`
  - Probe: Interval `10s`, Timeout `5s`, Retries `5`

### 2.3. `face-ai-service` (face-ai-service-prod)
- **Container Name:** `face-ai-service-prod`
- **Build Directory:** `./face-ai-service`
- **Host Ports:** `8000:8000`
- **Volume Mounts:**
  - `./face-ai-service` -> `/app`
  - `face_ai_models` -> `/app/models`
- **Dependencies:** `redis` (must be healthy)
- **Healthcheck:**
  - Test command: `curl -f http://localhost:8000/health`
  - Probe: Interval `30s`, Timeout `10s`, Retries `3`
  - Start Period: `900s` (for downloading/initializing AI weight models on first run)

### 2.4. `backend-api` (backend-api-prod)
- **Container Name:** `backend-api-prod`
- **Build Directory:** `./backend-api`
- **Host Ports:** `3001:3001`
- **Volume Mounts:**
  - `./backend-api` -> `/app`
  - `/app/node_modules` (anonymous override volume)
- **Dependencies:** `postgres` (healthy), `redis` (healthy), `face-ai-service` (healthy)
- **Healthcheck:**
  - Test command: `node -e "const http=require('http'); const req=http.get('http://localhost:3001/health', res => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.setTimeout(5000, () => { req.destroy(); process.exit(1); });"`
  - Probe: Interval `30s`, Timeout `10s`, Retries `3`

### 2.5. `frontend` (attendance-frontend-prod)
- **Container Name:** `attendance-frontend-prod`
- **Build Directory:** `./frontend`
- **Host Ports:** `3000:80` (internally mapped in production proxy)
- **Volume Mounts:**
  - `./frontend` -> `/app`
  - `/app/node_modules`
- **Dependencies:** `backend-api` (must start first)
- **TTY/Interactive:** Enabled

### 2.6. `nginx` (attendance-nginx-prod)
- **Container Name:** `attendance-nginx-prod`
- **Base Image:** `nginx:alpine`
- **Host Ports:** `80:80`, `443:443`
- **Volume Mounts:**
  - `./nginx/nginx.conf` -> `/etc/nginx/nginx.conf`
  - `./nginx/ssl` -> `/etc/nginx/ssl`
- **Dependencies:** `frontend` (starts first), `backend-api` (starts first)
- **Healthcheck:**
  - Test command: `wget -q -O /dev/null http://localhost/health && wget -q -O /dev/null http://localhost/frontend-status`
  - Probe: Interval `10s`, Timeout `5s`, Retries `3`, Start Period `10s`
