import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '@services/api';

// Routes that are part of the bootstrap/setup flow — skip the guard on these
// to prevent redirect loops.
const BOOTSTRAP_EXEMPT_PATHS = [
  '/setup/admin-face',
  '/bootstrap',
  '/admin-setup',
  '/system-bootstrap',
  '/recover-admin',
  '/recovery-request',
];

/**
 * BootstrapGuard
 *
 * Mounted at the root of the application (inside RouterProvider via a layout route).
 * On every navigation it checks /api/auth/bootstrap/status. If the system is in
 * bootstrap mode AND we are NOT already on a bootstrap/setup page, it redirects
 * to /setup/admin-face so the administrator can complete first-time setup.
 *
 * This handles the scenario where the admin JWT is still valid but the face
 * embedding has been cleared, which would otherwise let the authenticated admin
 * bypass LoginPage (which is the only other place the check runs).
 *
 * Rules:
 * - No feature removal, no connection breaks.
 * - Only runs the check once per page-load cycle (guarded with a ref).
 * - If the API call fails for any reason, the guard is silently skipped.
 */
const BootstrapGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    // Skip the check when already on a bootstrap-related route
    const isExempt = BOOTSTRAP_EXEMPT_PATHS.some(p =>
      location.pathname === p || location.pathname.startsWith(p + '/')
    );
    if (isExempt) return;

    const runCheck = async () => {
      const now = Date.now();
      const lastCheck = sessionStorage.getItem('last_bootstrap_check_time');
      const isFirstMount = isFirstMountRef.current;
      isFirstMountRef.current = false;

      // Throttle checks on SPA navigation, but always perform a fresh network check on first mount / page reload
      if (!isFirstMount && lastCheck && now - parseInt(lastCheck, 10) < 10000) {
        return;
      }

      try {
        const res = await api.get<{ success: boolean; bootstrapMode: boolean }>(
          `/auth/bootstrap/status?t=${now}`
        );
        sessionStorage.setItem('last_bootstrap_check_time', String(now));
        if (res.data.success && res.data.bootstrapMode) {
          navigate('/setup/admin-face', { replace: true });
        }
      } catch {
        // Non-fatal — if the check fails (network, backend down), do not block the app.
      }
    };

    void runCheck();
  }, [location.pathname, navigate]);

  return <>{children}</>;
};

export default BootstrapGuard;
