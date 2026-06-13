/**
 * V7 — DISTRIBUTED LOCK MANAGER
 *
 * Provides advisory locks for preventing duplicate processing
 * across multiple backend instances. Uses Redis SETNX when
 * available, falls back to in-memory Map for single-instance.
 *
 * Usage:
 *   const { distributedLock } = require('./config/distributedLock');
 *   const release = await distributedLock.acquire('migration-lock', 30000);
 *   if (release) { try { ... } finally { release(); } }
 */
const { logger } = require('./logger');

class DistributedLock {
  constructor() {
    this._locks = new Map();
    this._redisClient = null;
  }

  /** Optionally attach a Redis client for distributed locking. */
  setRedisClient(client) {
    this._redisClient = client;
    logger.info('[DistributedLock] Redis-backed locking enabled');
  }

  /**
   * Acquire a named lock.
   * @param {string} key - Lock name
   * @param {number} ttlMs - Auto-expire TTL in milliseconds
   * @returns {Function|null} Release function, or null if lock is held
   */
  async acquire(key, ttlMs = 30000) {
    // Try Redis first
    if (this._redisClient) {
      try {
        const lockKey = `lock:${key}`;
        const result = await this._redisClient.set(lockKey, process.pid.toString(), {
          NX: true,
          PX: ttlMs,
        });
        if (result === 'OK') {
          logger.debug(`[DistributedLock] Acquired (Redis): ${key}`);
          return async () => {
            try { await this._redisClient.del(lockKey); } catch { /* ignore */ }
            logger.debug(`[DistributedLock] Released (Redis): ${key}`);
          };
        }
        return null; // Lock held by another instance
      } catch (err) {
        logger.warn(`[DistributedLock] Redis lock failed, falling back to in-memory`, {
          key, error: err.message,
        });
      }
    }

    // In-memory fallback
    if (this._locks.has(key)) {
      const entry = this._locks.get(key);
      if (Date.now() < entry.expiresAt) return null; // Still held
      this._locks.delete(key); // Expired — clean up
    }

    this._locks.set(key, { expiresAt: Date.now() + ttlMs });
    logger.debug(`[DistributedLock] Acquired (in-memory): ${key}`);

    return () => {
      this._locks.delete(key);
      logger.debug(`[DistributedLock] Released (in-memory): ${key}`);
    };
  }

  /** Check if a lock is currently held. */
  async isLocked(key) {
    if (this._redisClient) {
      try {
        const val = await this._redisClient.get(`lock:${key}`);
        return val !== null;
      } catch { /* fall through */ }
    }
    const entry = this._locks.get(key);
    return entry ? Date.now() < entry.expiresAt : false;
  }

  getStats() {
    return {
      backend: this._redisClient ? 'redis' : 'in-memory',
      activeLocks: this._locks.size,
    };
  }
}

const distributedLock = new DistributedLock();

module.exports = { distributedLock, DistributedLock };
