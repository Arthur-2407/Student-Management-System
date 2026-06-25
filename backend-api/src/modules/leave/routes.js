/**
 * DEPENDENCY VERIFICATION:
 * - Inbound dependencies: server.js
 * - Outbound dependencies: ../../config/database.js, ../../config/logger.js, ../security-monitoring/securityLogger.js
 * - Runtime dependencies: PostgreSQL connection pool
 *
 * IMPORT VERIFICATION:
 * - require('../../config/database') is valid and exports query
 * - require('../../config/logger') is valid and exports logger
 * - require('../security-monitoring/securityLogger') is valid and exports logAuditEvent
 *
 * REFERENCE VERIFICATION:
 * - Exports: router
 */

const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { logAuditEvent } = require('../security-monitoring/securityLogger');
const { logger } = require('../../config/logger');

const LEAVE_TYPES = new Set(['vacation', 'sick', 'personal', 'maternity', 'paternity']);

function toDateOnly(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function totalLeaveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

function canManageLeave(user) {
  return user.role === 'admin' || user.role === 'teacher';
}

async function createNotification(studentId, title, message, payload = {}) {
  await query(
    `INSERT INTO notifications (student_id, type, title, message, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [studentId, 'leave', title, message, JSON.stringify(payload)]
  );
}

router.post('/request', async (req, res) => {
  try {
    const leaveType = req.body.leaveType || req.body.leave_type;
    const startDate = toDateOnly(req.body.startDate || req.body.start_date);
    const endDate = toDateOnly(req.body.endDate || req.body.end_date);
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

    if (!LEAVE_TYPES.has(leaveType) || !startDate || !endDate || reason.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Valid leave type, start date, end date, and reason are required',
      });
    }

    const days = totalLeaveDays(startDate, endDate);
    if (days <= 0 || days > 365) {
      return res.status(400).json({
        success: false,
        message: 'Leave date range is invalid',
      });
    }

    const studentResult = await query(
      `SELECT teacher_id FROM students WHERE id = $1 AND teacher_id IS NOT NULL
       UNION ALL
       SELECT teacher_id FROM teacher_assignments WHERE student_id = $1 AND is_active = TRUE AND teacher_id IS NOT NULL
       LIMIT 1`,
      [req.user.id]
    );
    let teacherId = studentResult.rows[0]?.teacher_id || null;

    // Fallback to Admin if no teacher is assigned
    if (!teacherId) {
      const adminResult = await query(
        "SELECT id FROM students WHERE (student_id = 'admin' OR role = 'admin') AND is_active = TRUE LIMIT 1"
      );
      if (adminResult.rows.length > 0) {
        teacherId = adminResult.rows[0].id;
      }
    }

    const isAdmin = req.user.role === 'admin';
    const initialStatus = isAdmin ? 'approved' : 'pending';
    const approverId = isAdmin ? req.user.id : null;
    const approvalTimestampSql = isAdmin ? 'NOW()' : 'NULL';
    const attachmentData = typeof req.body.attachmentData === 'string' ? req.body.attachmentData : null;
    const attachmentName = typeof req.body.attachmentName === 'string' ? req.body.attachmentName : null;

    const result = await query(
      `INSERT INTO leave_requests
         (student_id, teacher_id, leave_type, start_date, end_date, total_days, reason, status, approver_id, approval_timestamp, approved_at, attachment_data, attachment_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${approvalTimestampSql}, ${approvalTimestampSql}, $10, $11)
       RETURNING *`,
      [req.user.id, teacherId, leaveType, startDate, endDate, days, reason, initialStatus, approverId, attachmentData, attachmentName]
    );

    // If it's a teacher requesting, notify their teacher (Admin)
    if (teacherId && !isAdmin) {
      await createNotification(
        teacherId,
        'New leave request',
        `${req.user.studentId} submitted a ${leaveType} leave request.`,
        { leaveRequestId: result.rows[0].id }
      );
    }

    await logAuditEvent({
      actorStudentId: req.user.studentId,
      action: 'leave.request.create',
      resourceType: 'leave_request',
      resourceId: String(result.rows[0].id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
      details: { leaveType, startDate, endDate, days },
    });

    // Record in leave_approval_history for full audit chain
    try {
      await query(
        `INSERT INTO leave_approval_history
           (leave_request_id, action, actor_student_id, actor_role,
            previous_status, new_status, reason, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7::inet, $8)`,
        [
          result.rows[0].id,
          isAdmin ? 'approve' : 'submit',
          req.user.id,
          req.user.role,
          initialStatus,
          reason || (isAdmin ? 'Self-authorized admin leave' : ''),
          req.ip,
          req.headers['user-agent'] || null,
        ]
      );
    } catch (histErr) {
      logger.warn('Leave history submit record failed', { error: histErr.message });
    }

    const io = req.app.get('io');
    if (io) {
      io.notifyTeachers('attendance_update', {
        type: 'leave-request',
        studentId: req.user.studentId,
      });
    }

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Leave request submit error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to submit leave request' });
  }
});

router.get('/my-requests', async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 100);
    const result = await query(
      `SELECT lr.*
       FROM leave_requests lr
       WHERE lr.student_id = $1
       ORDER BY lr.created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    return res.json(result.rows);
  } catch (error) {
    logger.error('Leave requests fetch error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to fetch leave requests' });
  }
});

router.get('/team-requests', async (req, res) => {
  try {
    if (!canManageLeave(req.user)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
    const roleToFilter = req.user.role === 'admin' ? 'teacher' : 'student';
    const params = [limit, req.user.id, roleToFilter];

    const result = await query(
      `SELECT lr.*,
              json_build_object(
                'student_id', e.student_id,
                'first_name', e.first_name,
                'last_name', e.last_name,
                'department', e.department,
                'role', e.role
              ) AS student
       FROM leave_requests lr
       JOIN students e ON e.id = lr.student_id
       WHERE 1=1 AND lr.teacher_id = $2 AND e.role = $3
       ORDER BY lr.created_at DESC
       LIMIT $1`,
      params
    );

    return res.json(result.rows);
  } catch (error) {
    logger.error('Team leave requests fetch error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to fetch team leave requests' });
  }
});

router.get('/request/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const result = await query(
      `SELECT lr.*,
              json_build_object(
                'student_id', e.student_id,
                'first_name', e.first_name,
                'last_name', e.last_name,
                'department', e.department
              ) AS student
       FROM leave_requests lr
       JOIN students e ON e.id = lr.student_id
       WHERE lr.id = $1
         AND (
           lr.student_id = $2
           OR lr.teacher_id = $2
         )`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    logger.error('Leave request fetch error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to fetch leave request' });
  }
});

router.put('/request/:id/cancel', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const result = await query(
      `UPDATE leave_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND student_id = $2 AND status = 'pending'
       RETURNING *`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pending leave request not found' });
    }

    // Log cancellation in leave_approval_history
    try {
      await query(
        `INSERT INTO leave_approval_history
           (leave_request_id, action, actor_student_id, actor_role,
            previous_status, new_status, reason, ip_address, user_agent)
         VALUES ($1, 'cancel', $2, $3, 'pending', 'cancelled', 'Cancelled by student', $4::inet, $5)`,
        [
          id, req.user.id, req.user.role,
          req.ip, req.headers['user-agent'] || null,
        ]
      );
    } catch (histErr) {
      logger.warn('Leave cancellation history record failed', { error: histErr.message });
    }

    await logAuditEvent({
      actorStudentId: req.user.studentId,
      action: 'leave.request.cancel',
      resourceType: 'leave_request',
      resourceId: String(id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
    });

    return res.json(result.rows[0]);
  } catch (error) {
    logger.error('Leave cancel error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to cancel leave request' });
  }
});

router.put('/request/:id/approve', async (req, res) => {
  try {
    if (!canManageLeave(req.user)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const id = Number.parseInt(req.params.id, 10);
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

    // Update leave request
    const result = await query(
      `UPDATE leave_requests lr
       SET status = 'approved',
           approver_id = $2,
           approval_timestamp = NOW(),
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE lr.id = $1
         AND lr.status = 'pending'
         AND lr.teacher_id = $2
       RETURNING *`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pending leave request not found' });
    }

    const leaveRecord = result.rows[0];

    // Log approval in leave_approval_history
    try {
      await query(
        `INSERT INTO leave_approval_history
           (leave_request_id, action, actor_student_id, actor_role,
            previous_status, new_status, reason, ip_address, user_agent)
         VALUES ($1, 'approve', $2, $3, 'pending', 'approved', $4, $5::inet, $6)`,
        [
          id, req.user.id, req.user.role, reason || null,
          req.ip, req.headers['user-agent'] || null,
        ]
      );
    } catch (histErr) {
      logger.warn('Leave approval history record failed', { error: histErr.message });
    }

    await createNotification(
      leaveRecord.student_id,
      'Leave approved',
      'Your leave request has been approved.',
      { leaveRequestId: id }
    );

    try {
      const empResult = await query(
        'SELECT student_id FROM students WHERE id = $1',
        [leaveRecord.student_id]
      );
      const empStrId = empResult.rows[0]?.student_id;
      const io = req.app.get('io');
      if (io) {
        io.notifyTeachers('attendance_update', {
          type: 'leave-update',
          requestId: id,
        });
        if (empStrId) {
          io.notifyStudent(empStrId, 'attendance_update', {
            type: 'leave-update',
            status: 'approved',
          });
        }
      }
    } catch (wsErr) {
      logger.warn('WebSocket notification failed for leave approval', { error: wsErr.message });
    }

    await logAuditEvent({
      actorStudentId: req.user.studentId,
      action: 'leave.request.approve',
      resourceType: 'leave_request',
      resourceId: String(id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
      details: {
        leaveType: leaveRecord.leave_type,
        studentId: leaveRecord.student_id,
        startDate: leaveRecord.start_date,
        endDate: leaveRecord.end_date,
        approvedByRole: req.user.role
      }
    });

    return res.json(leaveRecord);
  } catch (error) {
    logger.error('Leave approve error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to approve leave request' });
  }
});

router.put('/request/:id/reject', async (req, res) => {
  try {
    if (!canManageLeave(req.user)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const id = Number.parseInt(req.params.id, 10);
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

    if (reason.length < 3) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    // Update leave request
    const result = await query(
      `UPDATE leave_requests lr
       SET status = 'rejected',
           approver_id = $2,
           approval_timestamp = NOW(),
           rejection_reason = $3,
           updated_at = NOW()
       WHERE lr.id = $1
         AND lr.status = 'pending'
         AND lr.teacher_id = $2
       RETURNING *`,
      [id, req.user.id, reason]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pending leave request not found' });
    }

    const leaveRecord = result.rows[0];

    // Log rejection in leave_approval_history
    try {
      await query(
        `INSERT INTO leave_approval_history
           (leave_request_id, action, actor_student_id, actor_role,
            previous_status, new_status, reason, ip_address, user_agent)
         VALUES ($1, 'reject', $2, $3, 'pending', 'rejected', $4, $5::inet, $6)`,
        [
          id, req.user.id, req.user.role, reason,
          req.ip, req.headers['user-agent'] || null,
        ]
      );
    } catch (histErr) {
      logger.warn('Leave rejection history record failed', { error: histErr.message });
    }

    await createNotification(
      leaveRecord.student_id,
      'Leave rejected',
      'Your leave request has been rejected.',
      { leaveRequestId: id, reason }
    );

    try {
      const empResult = await query(
        'SELECT student_id FROM students WHERE id = $1',
        [leaveRecord.student_id]
      );
      const empStrId = empResult.rows[0]?.student_id;
      const io = req.app.get('io');
      if (io) {
        io.notifyTeachers('attendance_update', {
          type: 'leave-update',
          requestId: id,
        });
        if (empStrId) {
          io.notifyStudent(empStrId, 'attendance_update', {
            type: 'leave-update',
            status: 'rejected',
          });
        }
      }
    } catch (wsErr) {
      logger.warn('WebSocket notification failed for leave rejection', { error: wsErr.message });
    }

    await logAuditEvent({
      actorStudentId: req.user.studentId,
      action: 'leave.request.reject',
      resourceType: 'leave_request',
      resourceId: String(id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
      details: {
        leaveType: leaveRecord.leave_type,
        studentId: leaveRecord.student_id,
        startDate: leaveRecord.start_date,
        endDate: leaveRecord.end_date,
        rejectionReason: reason,
        rejectedByRole: req.user.role
      }
    });

    return res.json(leaveRecord);
  } catch (error) {
    logger.error('Leave reject error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to reject leave request' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*)::int AS total_requests,
         COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
         COALESCE(SUM(total_days) FILTER (WHERE status = 'approved' AND leave_type = 'vacation'), 0)::int AS vacation_days_used,
         COALESCE(SUM(total_days) FILTER (WHERE status = 'approved' AND leave_type = 'sick'), 0)::int AS sick_days_used,
         COALESCE(SUM(total_days) FILTER (WHERE status = 'approved' AND leave_type = 'personal'), 0)::int AS personal_days_used,
         COALESCE(SUM(total_days) FILTER (WHERE status = 'approved' AND leave_type = 'maternity'), 0)::int AS maternity_days_used,
         COALESCE(SUM(total_days) FILTER (WHERE status = 'approved' AND leave_type = 'paternity'), 0)::int AS paternity_days_used
       FROM leave_requests
       WHERE student_id = $1`,
      [req.user.id]
    );

    const row = result.rows[0];
    return res.json({
      totalRequests: row.total_requests,
      approved: row.approved,
      pending: row.pending,
      rejected: row.rejected,
      vacationDaysUsed: row.vacation_days_used,
      sickDaysUsed: row.sick_days_used,
      personalDaysUsed: row.personal_days_used,
      maternityDaysUsed: row.maternity_days_used,
      paternityDaysUsed: row.paternity_days_used,
    });
  } catch (error) {
    logger.error('Leave stats error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to fetch leave stats' });
  }
});

module.exports = router;
