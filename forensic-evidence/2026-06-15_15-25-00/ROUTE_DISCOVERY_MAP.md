# ROUTE DISCOVERY MAP
Captured: 2026-06-15T15:25:00Z
Scope: Frontend Single-Page Application (SPA)

---

## 1. Registered Routes & Page Mappings
The following routes are registered in [router.tsx](file:///d:/Website/frontend/src/router.tsx):

| Path | Component | Layout / Wrapper | Access Guard | Purpose |
|---|---|---|---|---|
| `/login` | `LoginPage` | Direct | Public | Standard password-based authentication |
| `/face-login` | `FaceLogin` | Direct | Public | Face recognition authentication |
| `/setup/admin-face` | `BootstrapSetupPage` | Direct | Public (Bootstrap / Override) | Seed initial administrator profile / face |
| `/bootstrap` | `BootstrapSetupPage` | Direct | Public (Alias) | Alias to system administrator setup |
| `/admin-setup` | `BootstrapSetupPage` | Direct | Public (Alias) | Alias to system administrator setup |
| `/system-bootstrap` | `BootstrapSetupPage` | Direct | Public (Alias) | Alias to system administrator setup |
| `/recover-admin` | `BootstrapSetupPage` | Direct | Public (Alias) | Alias to administrator recovery flow |
| `/recovery-request` | `RecoveryRequestPage` | Direct | Public | Submit credentials/face reset requests |
| `/` | `MainLayout` | Protected | Authenticated Only | Primary layout redirecting to `/dashboard` |
| `/dashboard` | `DashboardPage` | `MainLayout` | Authenticated Only | Employee dashboard home |
| `/attendance` | `AttendancePage` | `MainLayout` | Authenticated Only | Check-in / Check-out interface |
| `/leave` | `LeavePage` | `MainLayout` | Authenticated Only | Manage and request leave time |
| `/reports` | `ReportsPage` | `MainLayout` | Authenticated Only | Display enterprise work / attendance logs |
| `/supervisor` | `SupervisorDashboard`| `MainLayout` | Required Role: `supervisor` | Supervisor dashboard page |
| `/admin` | `AdminPage` | `MainLayout` | Required Role: `admin` | Administrator employee & device settings |
| `/security` | `SecurityDashboard` | `MainLayout` | Required Role: `admin` | Core security analytics & logs |
| `/system-status` | `SystemStatusDashboard`| `MainLayout`| Required Role: `admin` | Enterprise platform health monitor |
| `*` | Redirect to `/login` | Direct | Public | Catch-all fallback route |

---

## 2. Router Configurations
- **Router Implementation:** React Router v6 `createBrowserRouter`
- **Asset Loading Strategy:** Lazy loading via `React.lazy()` wrapped in `Suspense` fallback to prevent high initial load latency.
- **Root Layout Wrapper:** `MainLayout` provides navigation header, side drawer, footer, and holds WebSocket state for system-wide toast notifications.
- **Route Guard Mechanism:** `<ProtectedRoute>` checks JWT store presence and validates user roles before mounting elements. Unauthenticated users are redirected to `/login` or `/setup/admin-face` depending on system bootstrap mode.
