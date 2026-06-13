/**
 * V7 — REDIS PUB/SUB ADAPTER FOR SOCKET.IO
 *
 * Enables horizontal scaling of WebSocket connections across
 * multiple backend-api instances via Redis pub/sub.
 *
 * When Redis is available, Socket.IO events are broadcast across
 * all instances. When Redis is unavailable, falls back to
 * single-instance in-memory mode (degraded).
 *
 * Usage:
 *   const { attachRedisAdapter } = require('./config/redisAdapter');
 *   await attachRedisAdapter(io);
 */
const { logger } = require('./logger');
const { degradedMode } = require('./degradedMode');

async function attachRedisAdapter(io) {
  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      logger.info('[RedisAdapter] No REDIS_URL — running single-instance WebSocket mode');
      return false;
    }

    // Dynamic import — only load if Redis is configured
    let createAdapter, createClient;
    try {
      ({ createAdapter } = require('@socket.io/redis-adapter'));
      ({ createClient } = require('redis'));
    } catch {
      logger.info('[RedisAdapter] @socket.io/redis-adapter not installed — single-instance mode');
      return false;
    }

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => {
      logger.warn('[RedisAdapter] Pub client error', { error: err.message });
      degradedMode.setDegraded('websocket', 'Redis adapter pub client error');
    });
    subClient.on('error', (err) => {
      logger.warn('[RedisAdapter] Sub client error', { error: err.message });
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));

    degradedMode.setHealthy('websocket');
    logger.info('[RedisAdapter] Socket.IO Redis adapter attached — multi-instance WebSocket enabled');
    return true;
  } catch (error) {
    logger.warn('[RedisAdapter] Failed to attach — falling back to single-instance', {
      error: error.message,
    });
    return false;
  }
}

module.exports = { attachRedisAdapter };
