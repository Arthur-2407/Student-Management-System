const { query } = require('../../config/database');
const { logger } = require('../../config/logger');

const SECURITY_EVENT_TYPES = new Set([
  'SPOOF_ATTEMPT',
  'FACE_MISMATCH',
  'GEOFENCE_VIOLATION',
  'MULTIPLE_LOGIN_ATTEMPTS',
  'FACE_REGISTERED',
  'FACE_REGISTRATION_ERROR',
  'LOGIN_ERROR',
  'SECURITY_ALERT',
  'LOGIN_ATTEMPT',
  'LOGIN_FAILED',
  'LOGIN_SUCCESS',
  'TOKEN_REFRESH',
  'TOKEN_REVOKED',
  'MFA_CHALLENGE',
  'PASSWORD_CHANGE',
  'SUSPICIOUS_LOGIN',
  'DEVICE_FINGERPRINT_MISMATCH',
  'ACCOUNT_LOCKED',
  'SESSION_REVOKED',
  'IMPOSSIBLE_TRAVEL',
]);

const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

async function resolveStudentId(studentId) {
  if (!studentId) return null;
  if (Number.isInteger(studentId)) return studentId;

  const empResult = await query('SELECT id FROM students WHERE student_id = $1', [studentId]);
  return empResult.rows[0]?.id ?? null;
}

function normalizeEventType(eventType) {
  return SECURITY_EVENT_TYPES.has(eventType) ? eventType : 'SECURITY_ALERT';
}

async function logSecurityEvent(eventData) {
  try {
    const {
      studentId,
      eventType,
      ipAddress,
      deviceInfo,
      details,
      severity = 'medium',
    } = eventData;

    const normalizedType = normalizeEventType(eventType);
    const studentIdNum = await resolveStudentId(studentId);
    const normalizedSeverity = SEVERITIES.has(severity) ? severity : 'medium';

    await query(
      `INSERT INTO security_events
       (student_id, event_type, ip_address, device_info, details, severity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        studentIdNum,
        normalizedType,
        ipAddress || null,
        deviceInfo || null,
        typeof details === 'string' ? details : JSON.stringify(details || {}),
        normalizedSeverity,
      ]
    );

    logger.info('Security event logged', {
      studentId,
      eventType: normalizedType,
      severity: normalizedSeverity,
    });
  } catch (error) {
    logger.error('Failed to log security event', { error: error.message });
  }
}

async function logAuditEvent(eventData) {
  try {
    const {
      actorStudentId,
      action,
      resourceType,
      resourceId,
      ipAddress,
      userAgent,
      requestId,
      details = {},
    } = eventData;

    const actorIdNum = await resolveStudentId(actorStudentId);

    await query(
      `INSERT INTO audit_logs
       (actor_student_id, action, resource_type, resource_id, ip_address, user_agent, request_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actorIdNum,
        action,
        resourceType,
        resourceId || null,
        ipAddress || null,
        userAgent || null,
        requestId || null,
        details,
      ]
    );
  } catch (error) {
    logger.error('Failed to log audit event', { error: error.message });
  }
}

async function logSystemEvent(eventData) {
  try {
    const {
      serviceName,
      logLevel,
      message,
      metadata = null,
    } = eventData;

    await query(
      `INSERT INTO system_logs
       (service_name, log_level, message, metadata)
       VALUES ($1, $2, $3, $4)`,
      [serviceName, logLevel, message, metadata]
    );
  } catch (error) {
    logger.error('Failed to log system event', { error: error.message });
  }
}

async function getSecurityEvents(filters = {}) {
  let queryText = `
    SELECT se.*, e.student_id, e.first_name, e.last_name
    FROM security_events se
    LEFT JOIN students e ON se.student_id = e.id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 0;

  if (filters.studentId) {
    paramCount += 1;
    queryText += ` AND e.student_id = $${paramCount}`;
    params.push(filters.studentId);
  }

  if (filters.eventType) {
    paramCount += 1;
    queryText += ` AND se.event_type = $${paramCount}`;
    params.push(filters.eventType);
  }

  if (filters.startDate) {
    paramCount += 1;
    queryText += ` AND se.timestamp >= $${paramCount}`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount += 1;
    queryText += ` AND se.timestamp <= $${paramCount}`;
    params.push(filters.endDate);
  }

  if (filters.severity) {
    paramCount += 1;
    queryText += ` AND se.severity = $${paramCount}`;
    params.push(filters.severity);
  }

  queryText += ' ORDER BY se.timestamp DESC';

  if (filters.limit) {
    paramCount += 1;
    queryText += ` LIMIT $${paramCount}`;
    params.push(Math.min(Number(filters.limit) || 50, 500));
  }

  const result = await query(queryText, params);
  return result.rows;
}

async function getSecurityStats(timeRange = '24h') {
  const allowedRanges = {
    '24h': "timestamp >= NOW() - INTERVAL '24 hours'",
    '7d': "timestamp >= NOW() - INTERVAL '7 days'",
    '30d': "timestamp >= NOW() - INTERVAL '30 days'",
  };
  const timeFilter = allowedRanges[timeRange] || allowedRanges['24h'];

  const totalResult = await query(
    `SELECT COUNT(*) as count FROM security_events WHERE ${timeFilter}`
  );

  const typeResult = await query(
    `SELECT event_type, COUNT(*) as count
     FROM security_events
     WHERE ${timeFilter}
     GROUP BY event_type
     ORDER BY count DESC`
  );

  const severityResult = await query(
    `SELECT severity, COUNT(*) as count
     FROM security_events
     WHERE ${timeFilter}
     GROUP BY severity
     ORDER BY severity`
  );

  const topStudentsResult = await query(
    `SELECT e.student_id, e.first_name, e.last_name, COUNT(*) as count
     FROM security_events se
     JOIN students e ON se.student_id = e.id
     WHERE ${timeFilter}
     GROUP BY e.id, e.student_id, e.first_name, e.last_name
     ORDER BY count DESC
     LIMIT 10`
  );

  return {
    total: parseInt(totalResult.rows[0].count, 10),
    byType: typeResult.rows,
    bySeverity: severityResult.rows,
    topStudents: topStudentsResult.rows,
  };
}

module.exports = {
  SECURITY_EVENT_TYPES,
  logSecurityEvent,
  logAuditEvent,
  logSystemEvent,
  getSecurityEvents,
  getSecurityStats,
};
