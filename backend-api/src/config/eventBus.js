/**
 * V8 — EVENT BUS ABSTRACTION
 *
 * In-process event bus for decoupled inter-module communication.
 * Provides publish/subscribe with async handlers, error isolation,
 * and telemetry integration.
 *
 * When Kafka or Redis Streams are available, this can delegate
 * to external brokers. By default, runs in-process.
 *
 * Usage:
 *   const { eventBus } = require('./config/eventBus');
 *   eventBus.on('auth.login', async (data) => { ... });
 *   eventBus.emit('auth.login', { userId, ip, ... });
 */
const { logger } = require('./logger');

class EventBus {
  constructor() {
    this._handlers = new Map();
    this._stats = { emitted: 0, handled: 0, errors: 0 };
  }

  /**
   * Subscribe to an event.
   * @param {string} event - Event name (e.g. 'auth.login', 'attendance.checkin')
   * @param {Function} handler - Async handler function
   */
  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, []);
    this._handlers.get(event).push(handler);
  }

  /**
   * Unsubscribe from an event.
   */
  off(event, handler) {
    const handlers = this._handlers.get(event);
    if (!handlers) return;
    this._handlers.set(event, handlers.filter(h => h !== handler));
  }

  /**
   * Emit an event. All handlers are invoked asynchronously.
   * Handler errors are isolated — one failure doesn't block others.
   */
  async emit(event, data = {}) {
    this._stats.emitted++;
    const handlers = this._handlers.get(event);
    if (!handlers || handlers.length === 0) return;

    const payload = { event, data, timestamp: Date.now() };

    await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler(payload);
          this._stats.handled++;
        } catch (err) {
          this._stats.errors++;
          logger.error(`[EventBus] Handler error for "${event}"`, {
            error: err.message,
            event,
          });
        }
      })
    );
  }

  /** List all registered events. */
  listEvents() {
    return [...this._handlers.keys()];
  }

  getStats() {
    return {
      ...this._stats,
      registeredEvents: this._handlers.size,
      totalHandlers: [...this._handlers.values()].reduce((sum, h) => sum + h.length, 0),
    };
  }
}

const eventBus = new EventBus();

module.exports = { eventBus, EventBus };
