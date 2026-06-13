const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { isBlacklisted } = require('../config/redis');
const { logger } = require('../config/logger');

const JWT_ISSUER = process.env.JWT_ISSUER || 'attendance-platform';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'attendance-web';

function getSecret(name, devFallback) {
  const value = process.env[name] || devFallback;

  if (process.env.NODE_ENV === 'production' && (!value || value.length < 32)) {
    throw new Error(`${name} must be configured with at least 32 characters in production`);
  }

  return value;
}

function accessSecret() {
  return getSecret('JWT_ACCESS_SECRET', 'development-access-secret-change-me-32');
}

function refreshSecret() {
  return getSecret('JWT_REFRESH_SECRET', 'development-refresh-secret-change-me-32');
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
      code: 'TOKEN_REQUIRED',
    });
  }

  try {
    const blacklisted = await isBlacklisted(token);
    if (blacklisted) {
      return res.status(401).json({
        error: 'Token has been revoked',
        code: 'TOKEN_REVOKED',
      });
    }

    req.user = verifyAccessToken(token);

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }

    logger.error('Token verification error', { error: error.message });
    return res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_FAILED',
    });
  }
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, accessSecret(), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  if (decoded.type !== 'access') {
    const error = new Error('Invalid token type');
    error.name = 'JsonWebTokenError';
    throw error;
  }

  return {
    id: decoded.id,
    employeeId: decoded.employeeId,
    email: decoded.email,
    role: decoded.role,
    department: decoded.department,
    tokenId: decoded.jti,
  };
}

function generateTokens(user, options = {}) {
  const accessJti = options.accessJti || randomUUID();
  const refreshJti = options.refreshJti || randomUUID();
  const tokenFamily = options.tokenFamily || randomUUID();

  const commonClaims = {
    id: user.id,
    employeeId: user.employee_id || user.employeeId,
  };

  const accessToken = jwt.sign(
    {
      ...commonClaims,
      email: user.email,
      role: user.role,
      department: user.department,
      type: 'access',
    },
    accessSecret(),
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: accessJti,
    }
  );

  const refreshToken = jwt.sign(
    {
      ...commonClaims,
      type: 'refresh',
      tokenFamily,
    },
    refreshSecret(),
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: refreshJti,
    }
  );

  return {
    accessToken,
    refreshToken,
    accessJti,
    refreshJti,
    tokenFamily,
  };
}

function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, refreshSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (decoded.type !== 'refresh') return null;
    return decoded;
  } catch {
    return null;
  }
}

function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
    }

    next();
  };
}

function authorizeSupervisor() {
  return async (req, res, next) => {
    try {
      const { query } = require('../config/database');
      const requestedEmployee = req.params.employeeId || req.body.employeeId;

      const result = await query(
        `SELECT supervisor_id FROM employees WHERE id = $1 OR employee_id = $2`,
        [Number(requestedEmployee) || null, requestedEmployee || null]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Employee not found',
          code: 'EMPLOYEE_NOT_FOUND',
        });
      }

      const supervisorId = result.rows[0].supervisor_id;

      if (supervisorId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Not authorized to manage this employee',
          code: 'NOT_SUPERVISOR',
        });
      }

      next();
    } catch (error) {
      logger.error('Supervisor authorization error', { error: error.message });
      return res.status(500).json({
        error: 'Authorization failed',
        code: 'AUTH_FAILED',
      });
    }
  };
}

module.exports = {
  authenticateToken,
  verifyAccessToken,
  generateTokens,
  verifyRefreshToken,
  authorizeRole,
  authorizeSupervisor,
};
