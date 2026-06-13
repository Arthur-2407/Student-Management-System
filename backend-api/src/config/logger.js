/**
 * OBSERVABILITY: Structured Logger (zero-dependency)
 *
 * Replaces all console.log/error/warn calls with structured output.
 * - JSON format in production  (machine-parseable, log-aggregator ready)
 * - Colorized human-readable in development
 * - Every line includes: timestamp, level, service, env, requestId (when provided)
 *
 * Usage:
 *   const { logger } = require('./config/logger');
 *   logger.info('Server started', { port: 3001 });
 *   logger.error('Query failed', { requestId, error: err.message });
 *   logger.apiError({ requestId, method, url, statusCode, responseTimeMs, errorMessage });
 */

const SERVICE_NAME = process.env.SERVICE_NAME || 'backend-api';
const LOG_LEVEL    = process.env.LOG_LEVEL    || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const IS_PROD      = process.env.NODE_ENV === 'production';

const fs = require('fs');
const path = require('path');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
const RESET  = '\x1b[0m';

// V8: Ensure log directories exist
const logsRoot = path.join(process.cwd(), 'logs');
const logDirs = {
  errors: path.join(logsRoot, 'errors'),
  performance: path.join(logsRoot, 'performance'),
  security: path.join(logsRoot, 'security'),
  runtime: path.join(logsRoot, 'runtime'),
};

try {
  Object.values(logDirs).forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
} catch (err) {
  process.stderr.write(`[Logger] Failed to create log directories: ${err.message}\n`);
}

function shouldLog(level) {
  return (LEVELS[level] ?? 2) <= (LEVELS[LOG_LEVEL] ?? 2);
}

function buildEntry(level, message, meta = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    env: process.env.NODE_ENV || 'development',
    message,
    ...meta,
  };
}

function writeLog(level, message, meta = {}) {
  if (!shouldLog(level)) return;
  const entry = buildEntry(level, message, meta);
  const out   = level === 'error' ? process.stderr : process.stdout;

  // Print to console
  if (IS_PROD) {
    out.write(JSON.stringify(entry) + '\n');
  } else {
    const color   = COLORS[level] || '';
    const ts      = entry.timestamp.slice(11, 19); // HH:mm:ss
    const metaCopy = { ...meta };
    delete metaCopy.stack;
    const metaStr = Object.keys(metaCopy).length ? ' ' + JSON.stringify(metaCopy) : '';
    const stack   = meta.stack ? '\n' + meta.stack : '';
    out.write(`${color}[${ts}] ${level.toUpperCase()}: ${message}${metaStr}${stack}${RESET}\n`);
  }

  // V8: Write to log files
  try {
    const jsonStr = JSON.stringify(entry) + '\n';
    
    // 1. Runtime log (everything)
    fs.appendFile(path.join(logDirs.runtime, 'runtime.log'), jsonStr, (err) => {
      if (err) process.stderr.write(`[Logger] Runtime log write error: ${err.message}\n`);
    });

    // 2. Error log (error and warn)
    if (level === 'error' || level === 'warn') {
      fs.appendFile(path.join(logDirs.errors, 'error.log'), jsonStr, () => {});
    }

    // 3. Performance log (if responseTimeMs is present)
    if (meta && typeof meta.responseTimeMs === 'number') {
      fs.appendFile(path.join(logDirs.performance, 'performance.log'), jsonStr, () => {});
    }

    // 4. Security log (if message, eventType, or meta indicates security)
    const isSecurity = meta && (
      meta.eventType || 
      meta.security === true || 
      (message && message.toLowerCase().includes('security')) || 
      (message && message.toLowerCase().includes('spoof')) ||
      (message && message.toLowerCase().includes('mfa')) ||
      (message && message.toLowerCase().includes('auth'))
    );
    if (isSecurity) {
      fs.appendFile(path.join(logDirs.security, 'security.log'), jsonStr, () => {});
    }
  } catch (err) {
    // Ignore file write errors
  }
}

const logger = {
  error(message, meta = {}) { writeLog('error', message, meta); },
  warn(message,  meta = {}) { writeLog('warn',  message, meta); },
  info(message,  meta = {}) { writeLog('info',  message, meta); },
  debug(message, meta = {}) { writeLog('debug', message, meta); },

  /** Log a failed API request with full observability context. */
  apiError(context) {
    const {
      requestId, method, url, statusCode,
      responseTimeMs, userId, errorMessage, errorCode,
    } = context;
    writeLog('error', 'API request failed', {
      requestId, method, url, statusCode,
      responseTimeMs, userId, errorMessage, errorCode,
    });
  },
};

module.exports = { logger };

