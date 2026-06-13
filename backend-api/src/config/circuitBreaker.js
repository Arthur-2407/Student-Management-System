/**
 * OBSERVABILITY: Circuit Breaker
 *
 * Protects downstream services (DB, Redis, AI) from cascade failures.
 *
 * State machine:
 *   CLOSED     → Normal operation. Failures increment counter.
 *   OPEN       → Requests short-circuit immediately (no downstream call).
 *                After cooldownMs, transitions to HALF-OPEN.
 *   HALF-OPEN  → One test request allowed. Success → CLOSED. Failure → OPEN.
 *
 * Usage:
 *   const result = await dbBreaker.call(() => pool.query(sql, params));
 *
 * Exports:
 *   CircuitBreaker  — class (for custom instances)
 *   dbBreaker       — pre-configured for PostgreSQL
 *   redisBreaker    — pre-configured for Redis
 *   aiBreaker       — pre-configured for Face-AI service
 *   getAllStatus()  — returns { db, redis, ai } status snapshot for /health
 */

const { logger } = require('./logger');

const STATE = {
  CLOSED:    'CLOSED',
  OPEN:      'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreaker {
  /**
   * @param {string} name               - Human-readable name (logged with every state change)
   * @param {number} failureThreshold   - Consecutive failures before opening (default 5)
   * @param {number} cooldownMs         - Time to stay OPEN before trying HALF-OPEN (default 30s)
   * @param {number} successThreshold   - Successes in HALF-OPEN before closing (default 2)
   */
  constructor({ name, failureThreshold = 5, cooldownMs = 30_000, successThreshold = 2 } = {}) {
    this.name             = name || 'unknown';
    this.failureThreshold = failureThreshold;
    this.cooldownMs       = cooldownMs;
    this.successThreshold = successThreshold;

    this._state          = STATE.CLOSED;
    this._failures       = 0;
    this._halfOpenWins   = 0;
    this._openedAt       = null;
    this._totalCalls     = 0;
    this._totalFailures  = 0;
    this._totalShortCircuits = 0;
  }

  get state() { return this._state; }

  /** Execute fn through the breaker. Throws if circuit is OPEN. */
  async call(fn) {
    this._totalCalls++;

    if (this._state === STATE.OPEN) {
      // Check if cooldown has elapsed → try HALF-OPEN
      if (Date.now() - this._openedAt >= this.cooldownMs) {
        this._transitionTo(STATE.HALF_OPEN);
      } else {
        this._totalShortCircuits++;
        const err = new Error(`[CircuitBreaker:${this.name}] Circuit is OPEN — request short-circuited`);
        err.code = 'CIRCUIT_OPEN';
        throw err;
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      // Re-throw CIRCUIT_OPEN errors without recording as a failure
      if (error.code === 'CIRCUIT_OPEN') throw error;
      this._onFailure(error);
      throw error;
    }
  }

  _onSuccess() {
    if (this._state === STATE.HALF_OPEN) {
      this._halfOpenWins++;
      if (this._halfOpenWins >= this.successThreshold) {
        this._transitionTo(STATE.CLOSED);
      }
    } else {
      this._failures = 0; // reset consecutive counter on success
    }
  }

  _onFailure(error) {
    this._totalFailures++;
    this._failures++;
    logger.warn(`[CircuitBreaker:${this.name}] Failure recorded`, {
      failures: this._failures,
      threshold: this.failureThreshold,
      error: error.message,
    });

    if (this._state === STATE.HALF_OPEN || this._failures >= this.failureThreshold) {
      this._transitionTo(STATE.OPEN);
    }
  }

  _transitionTo(newState) {
    const prev = this._state;
    this._state = newState;

    if (newState === STATE.OPEN) {
      this._openedAt = Date.now();
      this._halfOpenWins = 0;
      logger.error(`[CircuitBreaker:${this.name}] ⚡ OPENED — blocking requests for ${this.cooldownMs / 1000}s`, {
        failures: this._failures,
      });
    } else if (newState === STATE.HALF_OPEN) {
      this._halfOpenWins = 0;
      logger.warn(`[CircuitBreaker:${this.name}] 🔶 HALF-OPEN — testing recovery...`);
    } else if (newState === STATE.CLOSED) {
      this._failures = 0;
      this._halfOpenWins = 0;
      logger.info(`[CircuitBreaker:${this.name}] ✅ CLOSED — circuit recovered`);
    }
  }

  /** Returns a plain object snapshot for /health and logging. */
  getStatus() {
    return {
      state:            this._state,
      failures:         this._failures,
      failureThreshold: this.failureThreshold,
      totalCalls:       this._totalCalls,
      totalFailures:    this._totalFailures,
      shortCircuits:    this._totalShortCircuits,
      openedAt:         this._openedAt ? new Date(this._openedAt).toISOString() : null,
      cooldownMs:       this.cooldownMs,
    };
  }
}

// ── Pre-configured instances ───────────────────────────────────────────────

const dbBreaker = new CircuitBreaker({
  name: 'database',
  failureThreshold: 5,
  cooldownMs: 30_000,   // 30s cooldown
  successThreshold: 2,
});

const redisBreaker = new CircuitBreaker({
  name: 'redis',
  failureThreshold: 3,
  cooldownMs: 15_000,   // 15s cooldown (Redis usually recovers faster)
  successThreshold: 1,
});

const aiBreaker = new CircuitBreaker({
  name: 'ai-service',
  failureThreshold: 3,
  cooldownMs: 60_000,   // 60s cooldown (AI model reload takes time)
  successThreshold: 1,
});

/** Returns a combined status object for the /health endpoint. */
function getAllStatus() {
  return {
    database:   dbBreaker.getStatus(),
    redis:      redisBreaker.getStatus(),
    'ai-service': aiBreaker.getStatus(),
  };
}

module.exports = {
  CircuitBreaker,
  dbBreaker,
  redisBreaker,
  aiBreaker,
  getAllStatus,
};
