/**
 * V5 — JOB QUEUE WORKER PROCESSORS
 *
 * Registers background workers for all async operations:
 *   - notification: deliver notifications via WebSocket/push
 *   - analytics: aggregate attendance/security analytics
 *   - audit: write audit log entries
 *   - security-event: process security events
 *   - ai-inference: queue AI inference requests
 */
const { jobQueue } = require('../../config/jobQueue');
const { logger } = require('../../config/logger');
const { query } = require('../../config/database');

function registerWorkers(io) {
  // ── Notification Worker ──────────────────────────────────────────────────
  jobQueue.process('notification', async (job) => {
    const { studentId, type, title, message, data } = job.data;
    logger.debug('[Worker:notification] Processing', { studentId, type });

    // Persist to DB
    try {
      await query(
        `INSERT INTO notifications (student_id, type, title, message, payload, is_read)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [studentId, type || 'system', title || 'Notification', message, JSON.stringify(data || {})]
      );
    } catch (err) {
      logger.warn('[Worker:notification] DB insert failed — delivering via WebSocket only', {
        error: err.message,
      });
    }

    // Push via WebSocket
    if (io) {
      io.to(`student:${studentId}`).emit('system_notification', {
        type, title, message, data, timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Audit Log Worker ─────────────────────────────────────────────────────
  jobQueue.process('audit', async (job) => {
    const { actorStudentId, action, resource, details } = job.data;
    logger.debug('[Worker:audit] Processing', { action, resource });

    await query(
      `INSERT INTO audit_logs (actor_student_id, action, resource, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [actorStudentId, action, resource, JSON.stringify(details || {})]
    );
  });

  // ── Security Event Worker ────────────────────────────────────────────────
  jobQueue.process('security-event', async (job) => {
    const { studentId, eventType, severity, details, ipAddress } = job.data;
    logger.debug('[Worker:security-event] Processing', { eventType, severity });

    await query(
      `INSERT INTO security_events (student_id, event_type, severity, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [studentId, eventType, severity || 'medium', details, ipAddress]
    );

    // Broadcast critical security events to teachers
    if (severity === 'critical' && io) {
      io.to('teachers').emit('security_alert', {
        eventType, severity, details, timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Analytics Worker ─────────────────────────────────────────────────────
  jobQueue.process('analytics', async (job) => {
    const { metric, value, tags } = job.data;
    logger.debug('[Worker:analytics] Recording', { metric, value });
    // Analytics aggregation — currently logs; ready for Prometheus/StatsD
  });

  // ── AI Inference Worker ──────────────────────────────────────────────────
  jobQueue.process('ai-inference', async (job) => {
    const { endpoint, payload, callback } = job.data;
    logger.debug('[Worker:ai-inference] Queued inference', { endpoint });
    // AI inference is handled synchronously at the route level for now
    // This worker is for batch/background inference when needed
  });

  // NOTE: jobQueue.start() is called by server.js after startup — not here.
  // Calling it here would create a duplicate processing interval.
  logger.info('[Workers] All job queue processors registered');
}

module.exports = { registerWorkers };
