/**
 * V5 — IN-MEMORY JOB QUEUE SYSTEM
 *
 * Durable job queue for asynchronous processing of:
 *   - Notification delivery
 *   - Analytics aggregation
 *   - AI inference events
 *   - Security event processing
 *   - Audit log writes
 *
 * Architecture:
 *   - Priority-based FIFO queue with configurable concurrency
 *   - Dead-letter queue for failed jobs (max 3 retries)
 *   - Job deduplication by idempotency key
 *   - Graceful drain on shutdown
 *   - Telemetry integration
 *
 * Usage:
 *   const { jobQueue } = require('./config/jobQueue');
 *   jobQueue.add('notification', { studentId, message }, { priority: 1 });
 *   jobQueue.process('notification', async (job) => { ... });
 */
const { logger } = require('./logger');

class JobQueue {
  constructor({ concurrency = 3, maxRetries = 3 } = {}) {
    this._queues = {};         // { type: Job[] }
    this._processors = {};     // { type: Function }
    this._deadLetter = [];
    this._processing = 0;
    this._concurrency = concurrency;
    this._maxRetries = maxRetries;
    this._idempotencySet = new Set();
    this._stats = { enqueued: 0, processed: 0, failed: 0, deadLettered: 0 };
    this._draining = false;
    this._interval = null;
  }

  /** Register a processor function for a job type. */
  process(type, handler) {
    this._processors[type] = handler;
    if (!this._queues[type]) this._queues[type] = [];
    logger.info(`[JobQueue] Processor registered for "${type}"`);
  }

  /** Add a job to the queue. */
  add(type, data, { priority = 5, idempotencyKey = null } = {}) {
    if (this._draining) {
      logger.warn(`[JobQueue] Rejecting job — queue is draining`, { type });
      return false;
    }

    // Deduplication
    if (idempotencyKey) {
      if (this._idempotencySet.has(idempotencyKey)) {
        logger.debug(`[JobQueue] Duplicate job skipped`, { type, idempotencyKey });
        return false;
      }
      this._idempotencySet.add(idempotencyKey);
      const timer = setTimeout(() => this._idempotencySet.delete(idempotencyKey), 5 * 60 * 1000);
      if (timer.unref) timer.unref();
    }

    if (!this._queues[type]) this._queues[type] = [];

    const job = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      data,
      priority,
      attempts: 0,
      createdAt: new Date().toISOString(),
      idempotencyKey,
    };

    // Insert by priority (lower number = higher priority)
    const queue = this._queues[type];
    const idx = queue.findIndex(j => j.priority > priority);
    idx === -1 ? queue.push(job) : queue.splice(idx, 0, job);

    this._stats.enqueued++;
    this._tick();
    return true;
  }

  /** Start the processing loop. */
  start() {
    this._draining = false;
    this._interval = setInterval(() => this._tick(), 1000);
    if (this._interval.unref) this._interval.unref();
    logger.info('[JobQueue] Started');
  }

  /** Gracefully drain all queues (for shutdown). */
  async drain(timeoutMs = 5000) {
    this._draining = true;
    if (this._interval) clearInterval(this._interval);

    const deadline = Date.now() + timeoutMs;
    while (this._processing > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    const remaining = Object.values(this._queues).reduce((s, q) => s + q.length, 0);
    if (remaining > 0) {
      logger.warn(`[JobQueue] Drained with ${remaining} jobs remaining`);
    }
    logger.info('[JobQueue] Drained', { stats: this._stats });
  }

  /** Get queue statistics. */
  getStats() {
    const pending = {};
    for (const [type, queue] of Object.entries(this._queues)) {
      pending[type] = queue.length;
    }
    return {
      ...this._stats,
      pending,
      processing: this._processing,
      deadLetterSize: this._deadLetter.length,
    };
  }

  /** Process next available job. */
  async _tick() {
    if (this._processing >= this._concurrency) return;

    // Find next job across all queues (round-robin by type, priority within)
    for (const type of Object.keys(this._queues)) {
      const queue = this._queues[type];
      if (queue.length === 0 || !this._processors[type]) continue;

      const job = queue.shift();
      this._processing++;

      try {
        job.attempts++;
        await this._processors[type](job);
        this._stats.processed++;
      } catch (error) {
        if (job.attempts < this._maxRetries) {
          // Re-enqueue with backoff
          const delay = Math.pow(2, job.attempts) * 1000;
          setTimeout(() => {
            if (!this._draining) queue.push(job);
          }, delay);
          logger.warn(`[JobQueue] Job ${job.id} failed, retry in ${delay}ms`, {
            type, attempts: job.attempts, error: error.message,
          });
        } else {
          // Dead-letter
          this._deadLetter.push({ ...job, lastError: error.message, deadLetteredAt: new Date().toISOString() });
          this._stats.deadLettered++;
          logger.error(`[JobQueue] Job ${job.id} dead-lettered after ${job.attempts} attempts`, {
            type, error: error.message,
          });
        }
        this._stats.failed++;
      } finally {
        this._processing--;
      }

      break; // Process one at a time per tick
    }
  }
}

const jobQueue = new JobQueue({ concurrency: 3, maxRetries: 3 });

module.exports = { jobQueue, JobQueue };
