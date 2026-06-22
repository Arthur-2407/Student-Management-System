/**
 * DEPENDENCY VERIFICATION:
 * - Inbound dependencies: server.js, modules/attendance/routes.js, modules/auth/routes.js, modules/leave/routes.js, modules/face-management/routes.js, modules/reports/routes.js, modules/excel-processing/routes.js, modules/geofence/routes.js, modules/locations/routes.js
 * - Outbound dependencies: ../config/database.js, ../config/logger.js
 * - Runtime dependencies: PostgreSQL connection pool
 *
 * IMPORT VERIFICATION:
 * - require('../config/database') is valid and exports query
 * - require('../config/logger') is valid and exports logger
 *
 * REFERENCE VERIFICATION:
 * - Exports: requireRole, requirePermission, getPermissionsForRole, PERMISSIONS
 */

const { logger } = require('../config/logger');
const { query } = require('../config/database');

const ROLE_HIERARCHY = {
  admin: 3,
  teacher: 2,
  student: 1,
};

/**
 * Require minimum role level. Higher roles always pass.
 */
function requireRole(minimumRole) {
  const minLevel = ROLE_HIERARCHY[minimumRole] || 0;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;

    if (userLevel < minLevel) {
      logger.warn('[RBAC] Access denied — insufficient role', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRole: minimumRole,
        url: req.url,
      });

      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRole: minimumRole,
      });
    }

    next();
  };
}

/**
 * Default permission roles as a baseline/fallback
 */
const DEFAULT_PERMISSIONS = {
  'view:dashboard':      ['student', 'teacher', 'admin'],
  'view:attendance':     ['student', 'teacher', 'admin'],
  'attendance.view.own':    ['student', 'teacher', 'admin'],
  'attendance.view.team':   ['teacher', 'admin'],
  'attendance.view.global': ['admin'],
  'manage:attendance':   ['teacher', 'admin'],
  'leave.create':               ['student', 'teacher', 'admin'],
  'view:leave':                 ['student', 'teacher', 'admin'],
  'leave.approve.student':     ['teacher', 'admin'],
  'leave.approve.teacher':   ['admin'],
  'manage:leave':               ['teacher', 'admin'],
  'face.update.request':        ['student', 'teacher', 'admin'],
  'face.update.approve':        ['teacher', 'admin'],
  'password.reset.request':     ['student', 'teacher', 'admin'],
  'password.reset.approve':     ['teacher', 'admin'],
  'view:reports':        ['student', 'teacher', 'admin'],
  'view:security':       ['teacher', 'admin'],
  'manage:security':     ['admin'],
  'view:telemetry':      ['teacher', 'admin'],
  'manage:system':       ['admin'],
  'manage:users':        ['admin'],
  'system.configure':    ['admin'],
  'view:system-status':  ['teacher', 'admin'],
  'manage:mfa':          ['student', 'teacher', 'admin'],
};

// Map fallback compatibility (PERMISSIONS is used/exported in other modules)
const PERMISSIONS = DEFAULT_PERMISSIONS;

// Cache parameters
let permissionsCache = { ...DEFAULT_PERMISSIONS };
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 10000; // 10 seconds refresh cache

/**
 * Safely load permissions from the database.
 * If query fails, fall back to current cache state.
 */
async function refreshPermissionsCache() {
  try {
    const result = await query(
      'SELECT role, permission FROM role_permissions WHERE granted = TRUE'
    );
    if (result && result.rows) {
      const dbPermissions = {};
      
      // Seed with keys from default permissions to prevent missing keys
      const allKeys = new Set([
        ...Object.keys(DEFAULT_PERMISSIONS),
        ...result.rows.map(row => row.permission)
      ]);
      
      for (const key of allKeys) {
        dbPermissions[key] = [];
      }
      
      for (const row of result.rows) {
        dbPermissions[row.permission].push(row.role);
      }
      
      // Ensure any undefined keys default to hardcoded baselines
      for (const [key, roles] of Object.entries(DEFAULT_PERMISSIONS)) {
        if (!dbPermissions[key] || dbPermissions[key].length === 0) {
          dbPermissions[key] = roles;
        }
      }
      
      permissionsCache = dbPermissions;
      lastCacheUpdate = Date.now();
    }
  } catch (err) {
    // Suppress warning during first boot or inside test suites without real PG connection
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('[RBAC] Unable to query role_permissions from database, using in-memory baseline', {
        error: err.message,
      });
    }
  }
}

// Perform initial fetch
refreshPermissionsCache();

// Background sync interval (non-blocking, won't prevent process exit in tests)
const refreshInterval = setInterval(refreshPermissionsCache, CACHE_TTL_MS);
if (refreshInterval && typeof refreshInterval.unref === 'function') {
  refreshInterval.unref();
}

/**
 * Require specific permission by name. Checks dynamic in-memory cached permissions.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    const allowedRoles = permissionsCache[permission] || DEFAULT_PERMISSIONS[permission];
    if (!allowedRoles) {
      logger.error(`[RBAC] Unknown permission: ${permission}`);
      return res.status(500).json({ error: 'Permission configuration error' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('[RBAC] Permission denied', {
        userId: req.user.id,
        role: req.user.role,
        permission,
        url: req.url,
      });
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredPermission: permission,
      });
    }

    next();
  };
}

/**
 * Get all permissions for a role (for frontend UI gating).
 */
function getPermissionsForRole(role) {
  const result = {};
  const currentPerms = permissionsCache || DEFAULT_PERMISSIONS;
  for (const [perm, roles] of Object.entries(currentPerms)) {
    result[perm] = roles.includes(role);
  }
  return result;
}

module.exports = {
  requireRole,
  requirePermission,
  getPermissionsForRole,
  PERMISSIONS,
  refreshPermissionsCache,
};

