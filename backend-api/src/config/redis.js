const redis = require('redis');
const { logger } = require('./logger');

let isRedisAvailable = false;

class MemoryRateLimiter {
  constructor() {
    this.store = new Map();
    this.pruneInterval = setInterval(() => this.prune(), 5 * 60 * 1000);
    if (this.pruneInterval.unref) this.pruneInterval.unref();
  }

  check(key, limit, windowMs) {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    entry.count += 1;
    return entry.count > limit;
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetAt) this.store.delete(key);
    }
  }
}

const memoryLimiter = new MemoryRateLimiter();

function buildRedisOptions() {
  let url = process.env.REDIS_URL || 'redis://localhost:6379';
  if (process.env.REDIS_PASSWORD && !url.includes('@')) {
    url = url.replace('redis://', `redis://:${process.env.REDIS_PASSWORD}@`);
  }
  const options = {
    url,
    socket: {
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 10000),
      reconnectStrategy: (retries) => {
        if (retries > Number(process.env.REDIS_MAX_RETRIES || 10)) {
          isRedisAvailable = false;
          logger.warn('[Redis] Max reconnect attempts reached. Operating in degraded mode.');
          return new Error('Redis reconnect attempts exhausted');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  };

  return options;
}

const client = redis.createClient(buildRedisOptions());

client.on('error', (err) => {
  logger.error('Redis client error', { error: err.message });
  isRedisAvailable = false;
});

client.on('connect', () => {
  logger.info('Redis client connected');
});

client.on('ready', () => {
  logger.info('Redis client ready');
  isRedisAvailable = true;
});

client.on('end', () => {
  logger.warn('Redis client disconnected');
  isRedisAvailable = false;
});

async function connectRedis(maxAttempts = 5) {
  if (client.isOpen) {
    isRedisAvailable = true;
    return true;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.connect();
      isRedisAvailable = true;
      logger.info('Redis connected successfully');
      return true;
    } catch (error) {
      logger.error(`Redis connection attempt ${attempt}/${maxAttempts} failed`, {
        error: error.message,
      });

      if (attempt < maxAttempts) {
        const delay = 1000 * attempt;
        logger.info(`Retrying Redis connection in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.warn('[Redis] Starting in degraded mode; using in-memory rate limiting.');
        isRedisAvailable = false;
        return false;
      }
    }
  }

  return false;
}

async function checkRateLimit(key, limit, windowMs) {
  if (!isRedisAvailable) {
    const limited = memoryLimiter.check(key, limit, windowMs);
    if (limited) logger.warn('[RateLimit] In-memory limit exceeded', { key, limit });
    return limited;
  }

  try {
    const current = await client.incr(key);
    if (current === 1) {
      await client.expire(key, Math.ceil(windowMs / 1000));
    }
    return current > limit;
  } catch (error) {
    logger.error('Rate limit check failed; falling back to memory limiter', {
      error: error.message,
    });
    isRedisAvailable = false;
    return memoryLimiter.check(key, limit, windowMs);
  }
}

async function setWithExpiry(key, value, expirySeconds) {
  if (!isRedisAvailable) return false;

  try {
    await client.set(key, value, { EX: expirySeconds });
    return true;
  } catch (error) {
    logger.error('Redis set with expiry failed', { key, error: error.message });
    return false;
  }
}

async function get(key) {
  if (!isRedisAvailable) return null;

  try {
    return await client.get(key);
  } catch (error) {
    logger.error('Redis get failed', { key, error: error.message });
    return null;
  }
}

async function del(key) {
  if (!isRedisAvailable) return false;

  try {
    await client.del(key);
    return true;
  } catch (error) {
    logger.error('Redis delete failed', { key, error: error.message });
    return false;
  }
}

async function addToBlacklist(token, expirySeconds) {
  return setWithExpiry(`blacklist:${token}`, '1', expirySeconds);
}

async function isBlacklisted(token) {
  if (!isRedisAvailable) {
    logger.warn('[Redis] Token blacklist check skipped; Redis unavailable.');
    return false;
  }

  const result = await get(`blacklist:${token}`);
  return result !== null;
}

async function isRedisHealthy() {
  if (!isRedisAvailable || !client.isOpen) return false;

  try {
    await client.ping();
    return true;
  } catch {
    isRedisAvailable = false;
    return false;
  }
}

async function disconnectRedis() {
  if (!client.isOpen) return;
  await client.quit();
}

module.exports = {
  client,
  connectRedis,
  disconnectRedis,
  checkRateLimit,
  setWithExpiry,
  get,
  del,
  addToBlacklist,
  isBlacklisted,
  isRedisHealthy,
};
