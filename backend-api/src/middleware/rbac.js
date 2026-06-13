/**
 * V6 — RBAC PERMISSION MIDDLEWARE
 *
 * Enterprise role-based access control with hierarchical permissions.
 *
 * Roles hierarchy: admin > supervisor > employee
 *
 * Usage:
 *   router.get('/admin-only', requireRole('admin'), handler);
 *   router.get('/supervisor-up', requireRole('supervisor'), handler); // supervisor + admin
 *   router.get('/any-auth', requireRole('employee'), handler);       // all roles
 */
const { logger } = require('../config/logger');

const ROLE_HIERARCHY = {
  admin: 3,
  supervisor: 2,
  employee: 1,
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
 * Require specific permission by name (extensible for fine-grained control).
 */
const PERMISSIONS = {
  'view:dashboard':      ['employee', 'supervisor', 'admin'],
  'view:attendance':     ['employee', 'supervisor', 'admin'],
  'manage:attendance':   ['supervisor', 'admin'],
  'view:leave':          ['employee', 'supervisor', 'admin'],
  'manage:leave':        ['supervisor', 'admin'],
  'view:reports':        ['employee', 'supervisor', 'admin'],
  'view:security':       ['supervisor', 'admin'],
  'manage:security':     ['admin'],
  'view:telemetry':      ['supervisor', 'admin'],
  'manage:system':       ['admin'],
  'manage:users':        ['admin'],
  'view:system-status':  ['supervisor', 'admin'],
  'manage:mfa':          ['employee', 'supervisor', 'admin'],
};

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    const allowedRoles = PERMISSIONS[permission];
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
  for (const [perm, roles] of Object.entries(PERMISSIONS)) {
    result[perm] = roles.includes(role);
  }
  return result;
}

module.exports = { requireRole, requirePermission, getPermissionsForRole, PERMISSIONS };
