# API ENDPOINT DISCOVERY MAP
Captured: 2026-06-15T15:25:00Z
Scope: Backend Express API & Python Face-AI Service

---

## 1. Public API Endpoints (No Auth Required)
These endpoints are exposed directly to the browser / client without JWT checking:

| Service | Method | Route Path | Rate Limited | Description |
|---|---|---|---|---|
| Backend | `POST` | `/api/auth/login` | Yes (20/min) | Standard username/password login |
| Backend | `POST` | `/api/auth/face-login` | Yes (20/min) | Autologin via camera face recognition |
| Backend | `GET` | `/api/auth/bootstrap/status` | No | Verifies if admin face enrollment is complete |
| Backend | `POST` | `/api/auth/bootstrap/setup` | Yes | First-time setup of admin account & face vector |
| Backend | `POST` | `/api/auth/recovery/request` | Yes | Request account credential/face reset |
| Backend | `POST` | `/api/auth/recovery/verify` | Yes | Verify OTP code and recovery action flags |
| Backend | `GET` | `/api/admin/contact-info` | No | Public admin contact info for lockout help |
| Backend | `GET` | `/health` | No | Base system health check (DB/Redis status) |
| Backend | `GET` | `/metrics` | No | Raw Prometheus metrics for scraping |
| Face-AI | `GET` | `/health` | No | Internal python service validation |

---

## 2. Protected API Endpoints (JWT Required)
Requires a valid `Authorization: Bearer <JWT>` token in the header:

| Module | Method | Base Path | Required Role / Guard | Purpose |
|---|---|---|---|---|
| Attendance | `POST / GET` | `/api/attendance/*` | Authenticated | Clock-in, clock-out, history logs |
| Leave | `POST / GET` | `/api/leave/*` | Authenticated | Leave applications, status tracking |
| Reports | `GET` | `/api/reports/*` | Authenticated | Retrieval of attendance reports |
| Work-Report | `POST / GET` | `/api/work-report/*`| Authenticated | Daily work log entry & submittals |
| Excel | `POST / GET` | `/api/excel/*` | Authenticated | Import/Export bulk employee data |
| Geofence | `GET` | `/api/geofence/*` | Authenticated | Office locations boundary coordinates |
| Notifications | `GET / PUT` | `/api/notifications/*`| Authenticated | Read/unread notification listings |
| Security | `GET` | `/api/security/*` | Authenticated | Security event audits, travel configs |
| Admin | `POST / GET / PUT`| `/api/admin/*` | `admin` | Full employee CRUD, system configurations |
| Locations | `POST / PUT` | `/api/locations/*` | `admin` | Office geofence radius & center configs |
| MFA | `POST / GET` | `/api/auth/mfa/*` | Authenticated | Multi-factor setup & verification code |
| System Status | `GET` | `/api/system/status` | Authenticated | Degradation state & breaker indicators |
| System Features| `GET` | `/api/system/features`| Authenticated | Enabled feature flags listing |
| System Queue | `GET` | `/api/system/queue` | `supervisor` | Background queue performance graphs |
| System Permissions| `GET` | `/api/system/permissions`| Authenticated | Returns permissions array for role |
| Telemetry | `GET` | `/api/telemetry/*` | `supervisor` | Ingestion statistics, trace logs |
| Telemetry Prom | `GET` | `/api/telemetry/prometheus`| `supervisor`| JSON metrics for monitoring charts |

---

## 3. Proxy Route Mapping via Nginx
Nginx acts as an ingress gateway, mapping routes from port `80` / `443` into separate backend containers:

- **Frontend App:** `/` maps to `http://frontend:80`
- **Backend Express API:** `/api/` maps to `http://backend-api:3001`
- **Face AI Core:** `/face-ai/` maps to `http://face-ai-service:8000`
- **Face AI Alias (Verify):** `/face-ai/verify` maps directly to the detector endpoint `http://face-ai-service:8000/face/verify`
- **Face AI Alias (Recognize):** `/face-ai/recognize` maps directly to the detector endpoint `http://face-ai-service:8000/face/detect`
- **WebSocket Gateway:** `/socket.io/` maps to `http://backend-api:3001/socket.io/`
- **Ingress Health checks:** `/health` is proxied directly to the backend health endpoint.
