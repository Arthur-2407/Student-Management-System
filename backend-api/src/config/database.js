const { Pool } = require('pg');
const { logger } = require('./logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'attendance_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 3000),
});

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT']);
const RETRYABLE_MESSAGES = ['connection terminated', 'timeout exceeded', 'Client was closed'];

function isRetryable(error) {
  if (RETRYABLE_CODES.has(error.code)) return true;
  return RETRYABLE_MESSAGES.some((message) => error.message && error.message.includes(message));
}

async function withRetry(fn, maxAttempts = 3, baseDelayMs = 200, label = 'DB operation') {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isRetryable(error)) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn('[DB] transient operation failure; retrying', {
          label,
          attempt,
          maxAttempts,
          delay,
          error: error.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError;
}

async function connectDB(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let client;

    try {
      client = await pool.connect();
      logger.info('PostgreSQL connected successfully');

      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
        logger.info('pgvector extension is available');
      } catch (extensionError) {
        logger.warn('pgvector extension is unavailable; continuing without vector indexes', {
          error: extensionError.message,
        });
      }

      return true;
    } catch (error) {
      logger.error(`Database connection attempt ${attempt}/${maxAttempts} failed`, {
        error: error.message,
      });

      if (attempt >= maxAttempts) {
        throw error;
      }

      const delay = 1000 * attempt;
      logger.info(`Retrying database connection in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      if (client) client.release();
    }
  }

  return false;
}

async function query(text, params) {
  return withRetry(async () => {
    const start = Date.now();

    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;

      if (process.env.NODE_ENV === 'development') {
        logger.debug('Executed query', {
          text,
          duration,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      logger.error('Database query error', {
        code: error.code,
        error: error.message,
      });
      throw error;
    }
  }, 3, 200, `query: ${String(text).substring(0, 80)}`);
}

async function getClient() {
  return withRetry(() => pool.connect(), 3, 200, 'pool.connect');
}

async function isDatabaseHealthy() {
  let client;

  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  pool,
  connectDB,
  query,
  getClient,
  isDatabaseHealthy,
  withRetry,
};
