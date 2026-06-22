const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { logSecurityEvent, getSecurityEvents, getSecurityStats } = require('./securityLogger');
const { authorizeRole } = require('../../middleware/authMiddleware');
const { logger } = require('../../config/logger');

function boundedLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

// GET /api/security/events - Get security events (teacher only)
router.get('/events', authorizeRole('admin', 'teacher'), async (req, res) => {
  try {
    const { studentId, eventType, startDate, endDate, severity, limit = 50 } = req.query;

    const events = await getSecurityEvents({
      studentId,
      eventType,
      startDate,
      endDate,
      severity,
      limit: parseInt(limit)
    });

    res.json({ success: true, data: events });
  } catch (error) {
    logger.error('Security events fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to fetch security events' });
  }
});

// GET /api/security/stats - Get security statistics
router.get('/stats', authorizeRole('admin', 'teacher'), async (req, res) => {
  try {
    const { range = '24h' } = req.query;
    const stats = await getSecurityStats(range);
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Security stats fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to fetch security stats' });
  }
});

// POST /api/security/log - Log a security event
router.post('/log', authorizeRole('admin', 'teacher'), async (req, res) => {
  try {
    const { studentId, eventType, ipAddress, deviceInfo, details, severity } = req.body;

    if (!eventType) {
      return res.status(400).json({ success: false, message: 'eventType is required' });
    }

    await logSecurityEvent({
      studentId,
      eventType,
      ipAddress: ipAddress || req.ip,
      deviceInfo: deviceInfo || req.headers['user-agent'],
      details,
      severity: severity || 'medium'
    });

    res.json({ success: true, message: 'Security event logged' });
  } catch (error) {
    logger.error('Security log error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to log security event' });
  }
});

router.get('/login-logs', authorizeRole('admin', 'teacher'), async (req, res) => {
  try {
    const limit = boundedLimit(req.query.limit);
    const result = await query(
      `SELECT ll.*,
              json_build_object(
                'student_id', e.student_id,
                'first_name', e.first_name,
                'last_name', e.last_name
              ) AS student
       FROM login_logs ll
       JOIN students e ON e.id = ll.student_id
       ORDER BY ll.timestamp DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Login logs fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to fetch login logs' });
  }
});

router.get('/system-logs', authorizeRole('admin'), async (req, res) => {
  try {
    const limit = boundedLimit(req.query.limit);
    const result = await query(
      `SELECT *
       FROM system_logs
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('System logs fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to fetch system logs' });
  }
});

router.get('/spoof-attempts', authorizeRole('admin', 'teacher'), async (req, res) => {
  try {
    const limit = boundedLimit(req.query.limit);
    const result = await query(
      `SELECT ll.id,
              ll.student_id,
              ll.spoof_confidence,
              'FACE_AUTH' AS detection_type,
              ll.timestamp,
              json_build_object(
                'student_id', e.student_id,
                'first_name', e.first_name,
                'last_name', e.last_name
              ) AS student
       FROM login_logs ll
       JOIN students e ON e.id = ll.student_id
       WHERE ll.spoof_detected = TRUE
       ORDER BY ll.timestamp DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Spoof attempts fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to fetch spoof attempts' });
  }
});

router.get('/geofence-violations', authorizeRole('admin', 'teacher'), async (req, res) => {
  try {
    const limit = boundedLimit(req.query.limit);
    const result = await query(
      `SELECT se.*, e.student_id AS student_code, e.first_name, e.last_name
       FROM security_events se
       LEFT JOIN students e ON e.id = se.student_id
       WHERE se.event_type = 'GEOFENCE_VIOLATION'
       ORDER BY se.timestamp DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Geofence violations fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to fetch geofence violations' });
  }
});

// GET /api/security/health - Security system health check
router.get('/health', async (req, res) => {
  res.json({ success: true, status: 'Security monitoring active', timestamp: new Date().toISOString() });
});

module.exports = router;
