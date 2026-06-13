/**
 * V8 — STARTUP CONFIG VALIDATOR
 *
 * Validates ALL required and recommended environment variables at boot.
 * Logs warnings for missing optional vars and throws for missing required ones.
 *
 * Usage (in server.js):
 *   const { validateConfig } = require('./config/configValidator');
 *   validateConfig(); // throws if critical config is missing
 */
const { logger } = require('./logger');

const REQUIRED = [
  { name: 'DB_HOST',     fallback: 'localhost' },
  { name: 'DB_PORT',     fallback: '5432' },
  { name: 'DB_NAME',     fallback: 'attendance_system' },
  { name: 'DB_USER',     fallback: 'postgres' },
  { name: 'DB_PASSWORD', fallback: null }, // required in production
];

const RECOMMENDED = [
  { name: 'JWT_ACCESS_SECRET',   desc: 'JWT signing secret' },
  { name: 'JWT_REFRESH_SECRET',  desc: 'JWT refresh signing secret' },
  { name: 'REDIS_URL',           desc: 'Redis connection URL' },
  { name: 'FACE_AI_SERVICE_URL', desc: 'Face AI service endpoint' },
  { name: 'FRONTEND_URL',        desc: 'Frontend origin for CORS' },
];

const OPTIONAL = [
  'NODE_ENV', 'PORT', 'RUN_MIGRATIONS',
  'LOGIN_RATE_LIMIT', 'LOGIN_RATE_WINDOW_MS',
  'MAX_FAILED_LOGINS', 'LOGIN_LOCKOUT_MINUTES',
  'REDIS_CONNECT_TIMEOUT_MS', 'REDIS_MAX_RETRIES',
  'FACE_AI_TIMEOUT_MS',
];

function validateConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const issues = [];
  const warnings = [];

  for (const { name, fallback } of REQUIRED) {
    if (!process.env[name]) {
      if (isProd && !fallback) {
        issues.push(`Missing REQUIRED env: ${name}`);
      } else if (!fallback) {
        warnings.push(`Missing env: ${name} (using fallback in development)`);
      }
    }
  }

  for (const { name, desc } of RECOMMENDED) {
    if (!process.env[name]) {
      warnings.push(`Missing recommended env: ${name} — ${desc}`);
    }
  }

  // JWT secrets must not be defaults in production
  if (isProd) {
    const jwtAccess = process.env.JWT_ACCESS_SECRET || '';
    const jwtRefresh = process.env.JWT_REFRESH_SECRET || '';
    if (jwtAccess.includes('change') || jwtAccess.length < 32) {
      issues.push('JWT_ACCESS_SECRET is insecure — must be 32+ chars in production');
    }
    if (jwtRefresh.includes('change') || jwtRefresh.length < 32) {
      issues.push('JWT_REFRESH_SECRET is insecure — must be 32+ chars in production');
    }
  }

  // Log warnings
  for (const w of warnings) {
    logger.warn(`[ConfigValidator] ${w}`);
  }

  // Fatal errors in production
  if (issues.length > 0 && isProd) {
    for (const i of issues) {
      logger.error(`[ConfigValidator] FATAL: ${i}`);
    }
    throw new Error(`Configuration validation failed: ${issues.join('; ')}`);
  } else if (issues.length > 0) {
    for (const i of issues) {
      logger.warn(`[ConfigValidator] ${i} (non-fatal in development)`);
    }
  }

  logger.info('[ConfigValidator] Configuration validated', {
    environment: process.env.NODE_ENV || 'development',
    issues: issues.length,
    warnings: warnings.length,
  });

  return { issues, warnings };
}

module.exports = { validateConfig, REQUIRED, RECOMMENDED, OPTIONAL };
