const express = require('express');
const { query } = require('../../config/database');
const { logger } = require('../../config/logger');

const router = express.Router();

const PERIOD_DAYS = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function getDateRange({ startDate, endDate, period }) {
  const end = endDate ? new Date(endDate) : new Date();
  const days = PERIOD_DAYS[period] || PERIOD_DAYS.month;
  const start = startDate
    ? new Date(startDate)
    : new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
}

function asInt(value) {
  return Number.parseInt(value, 10) || 0;
}

function asNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hoursString(value) {
  return asNumber(value).toFixed(2);
}

function scopedParams(role, startDate, endDate, studentId) {
  if (role === 'student' || role === 'teacher') {
    return [startDate, endDate, studentId];
  }
  return [startDate, endDate];
}

function studentScope(role, column = 'student_id') {
  if (role === 'student') {
    return `AND ${column} = $3`;
  }
  if (role === 'teacher') {
    return `AND (${column} = $3 OR ${column} IN (SELECT student_id FROM teacher_assignments WHERE teacher_id = $3 AND is_active = TRUE))`;
  }
  return '';
}

// GET /api/reports - aggregated reports data for dashboard charts and cards.
router.get('/', async (req, res) => {
  const studentId = req.user?.id;
  const role = req.user?.role;
  const { startDate, endDate } = getDateRange(req.query);
  const params = scopedParams(role, startDate, endDate, studentId);

  try {
    // Fetch configurable work start time from office locations (or use default)
    let workStartTime = '09:00:00';
    try {
      const workTimingResult = await query(
        `SELECT work_start_time FROM office_locations 
         WHERE is_active = TRUE ORDER BY id LIMIT 1`
      );
      if (workTimingResult.rows[0]?.work_start_time) {
        workStartTime = workTimingResult.rows[0].work_start_time;
      }
    } catch (e) {
      // Use default if query fails
      console.warn('Could not fetch work_start_time from office_locations', e.message);
    }

    const attendanceStats = await query(
      `SELECT
         COUNT(*) AS total_checkins,
         COUNT(DISTINCT student_id) AS students_checked_in,
         AVG(EXTRACT(EPOCH FROM work_hours) / 3600) AS avg_hours_per_day,
         COUNT(*) FILTER (WHERE geo_fence_status IS TRUE) AS geo_compliant,
         COUNT(*) AS total_records
       FROM student_attendance
       WHERE check_in_time::DATE BETWEEN $1::DATE AND $2::DATE
       ${studentScope(role)}`,
      params
    );

    const leaveStats = await query(
      `SELECT
         COUNT(*) AS total_requests,
         COUNT(*) FILTER (WHERE status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
         COALESCE(SUM(total_days) FILTER (WHERE status = 'approved'), 0) AS total_approved_days,
         COALESCE(SUM(total_days) FILTER (WHERE status = 'approved' AND leave_type = 'vacation'), 0) AS vacation_days_used,
         COALESCE(SUM(total_days) FILTER (WHERE status = 'approved' AND leave_type = 'sick'), 0) AS sick_days_used
       FROM leave_requests
       WHERE start_date >= $1::DATE AND end_date <= $2::DATE
       ${studentScope(role)}`,
      params
    );

    const reportStats = await query(
      `SELECT
         COUNT(*) AS total_reports,
         COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
         COUNT(*) FILTER (WHERE status = 'reviewed') AS reviewed,
         COUNT(*) FILTER (WHERE status = 'approved') AS approved
       FROM student_reports
       WHERE report_date >= $1::DATE AND report_date <= $2::DATE
       ${studentScope(role)}`,
      params
    );

    // Use configurable work start time instead of hardcoded 09:00:00
    const lateParams = [startDate, endDate, workStartTime];
    let lateScope = '';
    if (role === 'student') {
      lateScope = `AND ar.student_id = $4`;
      lateParams.push(studentId);
    } else if (role === 'teacher') {
      lateScope = `AND (ar.student_id = $4 OR ar.student_id IN (SELECT student_id FROM teacher_assignments WHERE teacher_id = $4 AND is_active = TRUE))`;
      lateParams.push(studentId);
    }

    const lateArrivals = await query(
      `SELECT COUNT(*) AS late_count
       FROM student_attendance ar
       WHERE ar.check_in_time::DATE BETWEEN $1::DATE AND $2::DATE
         AND ar.check_in_time::TIME > $3::TIME
       ${lateScope}`,
      lateParams
    );

    // Use configurable work start time in weekly data query
    const weeklyParams = [startDate, endDate, workStartTime];
    let weeklyScope = '';
    if (role === 'student') {
      weeklyScope = `AND ar.student_id = $4`;
      weeklyParams.push(studentId);
    } else if (role === 'teacher') {
      weeklyScope = `AND (ar.student_id = $4 OR ar.student_id IN (SELECT student_id FROM teacher_assignments WHERE teacher_id = $4 AND is_active = TRUE))`;
      weeklyParams.push(studentId);
    }

    const weeklyData = await query(
      `SELECT
         date_trunc('week', ar.check_in_time)::DATE AS week_start,
         to_char(date_trunc('week', ar.check_in_time)::DATE, 'Mon DD') AS week,
         ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM ar.work_hours) / 3600), 0)::NUMERIC, 2) AS hours,
         COUNT(*) FILTER (WHERE ar.check_in_time::TIME > $3::TIME) AS late_arrivals
       FROM student_attendance ar
       WHERE ar.check_in_time::DATE BETWEEN $1::DATE AND $2::DATE
       ${weeklyScope}
       GROUP BY week_start
       ORDER BY week_start`,
      weeklyParams
    );

    let departmentRows = [];
    if (req.user?.role === 'admin') {
      const departmentStats = await query(
        `SELECT
           COALESCE(e.department, 'Unassigned') AS department,
           COUNT(DISTINCT e.id) AS students,
           COUNT(ar.id) AS total_checkins,
           ROUND(
             COUNT(DISTINCT ar.student_id)::NUMERIC
             / NULLIF(COUNT(DISTINCT e.id), 0) * 100,
             2
           ) AS attendance_rate
         FROM students e
         LEFT JOIN student_attendance ar
           ON e.id = ar.student_id
          AND ar.check_in_time::DATE BETWEEN $1::DATE AND $2::DATE
         WHERE e.is_active = TRUE
         GROUP BY COALESCE(e.department, 'Unassigned')
         ORDER BY department`,
        [startDate, endDate]
      );
      departmentRows = departmentStats.rows;
    }

    const attendance = attendanceStats.rows[0] || {};
    const leaves = leaveStats.rows[0] || {};
    const workReports = reportStats.rows[0] || {};
    const totalRecords = asInt(attendance.total_records);
    const geoCompliant = asInt(attendance.geo_compliant);
    const geoCompliance = totalRecords > 0 ? Math.round((geoCompliant / totalRecords) * 100) : 0;

    const stats = {
      totalCheckins: asInt(attendance.total_checkins),
      averageHours: hoursString(attendance.avg_hours_per_day),
      geoFenceCompliance: String(geoCompliance),
      lateArrivals: asInt(lateArrivals.rows[0]?.late_count),
    };

    const leave = {
      totalRequests: asInt(leaves.total_requests),
      approved: asInt(leaves.approved),
      pending: asInt(leaves.pending),
      rejected: asInt(leaves.rejected),
      vacationDaysUsed: asInt(leaves.vacation_days_used),
      sickDaysUsed: asInt(leaves.sick_days_used),
      totalApprovedDays: asInt(leaves.total_approved_days),
    };

    const departments = departmentRows.map((dept) => {
      const attendanceRate = asNumber(dept.attendance_rate);
      return {
        department: dept.department,
        name: dept.department,
        students: asInt(dept.students),
        checkins: asInt(dept.total_checkins),
        attendanceRate,
        compliance: attendanceRate,
      };
    });

    res.json({
      success: true,
      period: { startDate, endDate },
      stats,
      summary: {
        totalCheckins: stats.totalCheckins,
        avgHoursPerDay: stats.averageHours,
        geoCompliance,
        lateArrivals: stats.lateArrivals,
        totalStudents: asInt(attendance.students_checked_in),
      },
      attendance: {
        total: stats.totalCheckins,
        avgHours: stats.averageHours,
        geoCompliant,
      },
      leave,
      reports: {
        total: asInt(workReports.total_reports),
        submitted: asInt(workReports.submitted),
        reviewed: asInt(workReports.reviewed),
        approved: asInt(workReports.approved),
      },
      weekly: weeklyData.rows.map((row) => ({
        week: row.week,
        hours: asNumber(row.hours),
        lateArrivals: asInt(row.late_arrivals),
      })),
      departments,
    });
  } catch (error) {
    logger.error('Reports endpoint error', {
      error: error.message,
      studentId,
      role,
      startDate,
      endDate,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports data',
    });
  }
});

// GET /api/reports/attendance - detailed attendance list
router.get('/attendance', async (req, res) => {
  const role = req.user?.role;
  const userDbId = req.user?.id;
  const { studentId, department, startDate, endDate, limit = 50, offset = 0 } = req.query;

  try {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const params = [toDateString(start), toDateString(end)];
    let filterSql = '';
    let paramIndex = 3;

    if (role === 'student') {
      filterSql += ` AND ar.student_id = $${paramIndex}`;
      params.push(userDbId);
      paramIndex++;
    } else {
      if (role === 'teacher') {
        filterSql += ` AND (ar.student_id = $${paramIndex} OR ar.student_id IN (SELECT student_id FROM teacher_assignments WHERE teacher_id = $${paramIndex} AND is_active = TRUE))`;
        params.push(userDbId);
        paramIndex++;
      }
      if (studentId) {
        filterSql += ` AND e.student_id = $${paramIndex}`;
        params.push(studentId);
        paramIndex++;
      }
      if (department) {
        filterSql += ` AND e.department = $${paramIndex}`;
        params.push(department);
        paramIndex++;
      }
    }

    params.push(Math.min(asInt(limit), 200));
    const limitIdx = paramIndex++;
    params.push(asInt(offset));
    const offsetIdx = paramIndex++;

    const result = await query(
      `SELECT ar.*, e.student_id, e.first_name, e.last_name, e.department,
              COALESCE(wt_temp.work_start_time, wt_perm.work_start_time, '09:00:00') AS work_start_time,
              COALESCE(wt_temp.work_end_time, wt_perm.work_end_time, '18:00:00') AS work_end_time
       FROM student_attendance ar
       JOIN students e ON ar.student_id = e.id
       LEFT JOIN work_timings wt_temp ON wt_temp.student_id = ar.student_id
         AND wt_temp.is_temporary = TRUE
         AND wt_temp.is_active = TRUE
         AND ar.check_in_time::DATE >= wt_temp.start_date
         AND ar.check_in_time::DATE <= wt_temp.end_date
       LEFT JOIN work_timings wt_perm ON wt_perm.student_id = ar.student_id
         AND wt_perm.is_temporary = FALSE
         AND wt_perm.is_active = TRUE
       WHERE ar.check_in_time::DATE BETWEEN $1::DATE AND $2::DATE
       ${filterSql}
       ORDER BY ar.check_in_time DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logger.error('Detailed attendance report error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch attendance report' });
  }
});

// GET /api/reports/leave - detailed leave list
router.get('/leave', async (req, res) => {
  const role = req.user?.role;
  const userDbId = req.user?.id;
  const { studentId, department, status, startDate, endDate, limit = 50, offset = 0 } = req.query;

  try {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const params = [toDateString(start), toDateString(end)];
    let filterSql = '';
    let paramIndex = 3;

    if (role === 'student') {
      filterSql += ` AND lr.student_id = $${paramIndex}`;
      params.push(userDbId);
      paramIndex++;
    } else {
      if (role === 'teacher') {
        filterSql += ` AND (lr.student_id = $${paramIndex} OR lr.student_id IN (SELECT student_id FROM teacher_assignments WHERE teacher_id = $${paramIndex} AND is_active = TRUE))`;
        params.push(userDbId);
        paramIndex++;
      }
      if (studentId) {
        filterSql += ` AND e.student_id = $${paramIndex}`;
        params.push(studentId);
        paramIndex++;
      }
      if (department) {
        filterSql += ` AND e.department = $${paramIndex}`;
        params.push(department);
        paramIndex++;
      }
    }

    if (status) {
      filterSql += ` AND lr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    params.push(Math.min(asInt(limit), 200));
    const limitIdx = paramIndex++;
    params.push(asInt(offset));
    const offsetIdx = paramIndex++;

    const result = await query(
      `SELECT lr.*, e.student_id, e.first_name, e.last_name, e.department
       FROM leave_requests lr
       JOIN students e ON lr.student_id = e.id
       WHERE lr.start_date >= $1::DATE AND lr.end_date <= $2::DATE
       ${filterSql}
       ORDER BY lr.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logger.error('Detailed leave report error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch leave report' });
  }
});

// GET /api/reports/security - detailed security audit log
router.get('/security', async (req, res) => {
  const role = req.user?.role;
  const userDbId = req.user?.id;
  if (role !== 'admin' && role !== 'teacher' && role !== 'student') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  const { severity, eventType, studentId, startDate, endDate, limit = 50, offset = 0 } = req.query;

  try {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const params = [toDateString(start), toDateString(end)];
    let filterSql = '';
    let paramIndex = 3;

    if (role === 'student') {
      filterSql += ` AND se.student_id = $${paramIndex}`;
      params.push(userDbId);
      paramIndex++;
    } else if (role === 'teacher') {
      filterSql += ` AND (se.student_id = $${paramIndex} OR se.student_id IN (SELECT student_id FROM teacher_assignments WHERE teacher_id = $${paramIndex} AND is_active = TRUE))`;
      params.push(userDbId);
      paramIndex++;
    }

    if (severity) {
      filterSql += ` AND se.severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }
    if (eventType) {
      filterSql += ` AND se.event_type = $${paramIndex}`;
      params.push(eventType);
      paramIndex++;
    }
    if (studentId) {
      filterSql += ` AND e.student_id = $${paramIndex}`;
      params.push(studentId);
      paramIndex++;
    }

    params.push(Math.min(asInt(limit), 200));
    const limitIdx = paramIndex++;
    params.push(asInt(offset));
    const offsetIdx = paramIndex++;

    const result = await query(
      `SELECT se.*, e.student_id, e.first_name, e.last_name, e.department
       FROM security_events se
       LEFT JOIN students e ON se.student_id = e.id
       WHERE se.timestamp::DATE BETWEEN $1::DATE AND $2::DATE
       ${filterSql}
       ORDER BY se.timestamp DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logger.error('Detailed security report error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch security report' });
  }
});

// GET /api/reports/performance - student performance stats
router.get('/performance', async (req, res) => {
  const role = req.user?.role;
  const userDbId = req.user?.id;
  if (role !== 'admin' && role !== 'teacher' && role !== 'student') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  const { department, startDate, endDate, limit = 50, offset = 0 } = req.query;

  try {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    let workStartTime = '09:00:00';
    try {
      const workTimingResult = await query(
        `SELECT work_start_time FROM office_locations 
         WHERE is_active = TRUE ORDER BY id LIMIT 1`
      );
      if (workTimingResult.rows[0]?.work_start_time) {
        workStartTime = workTimingResult.rows[0].work_start_time;
      }
    } catch (e) {}

    const params = [toDateString(start), toDateString(end), workStartTime];
    let filterSql = '';
    let paramIndex = 4;

    if (role === 'student') {
      filterSql += ` AND e.id = $${paramIndex}`;
      params.push(userDbId);
      paramIndex++;
    } else if (role === 'teacher') {
      filterSql += ` AND (e.id = $${paramIndex} OR e.id IN (SELECT student_id FROM teacher_assignments WHERE teacher_id = $${paramIndex} AND is_active = TRUE))`;
      params.push(userDbId);
      paramIndex++;
    }

    if (department) {
      filterSql += ` AND e.department = $${paramIndex}`;
      params.push(department);
      paramIndex++;
    }

    params.push(Math.min(asInt(limit), 200));
    const limitIdx = paramIndex++;
    params.push(asInt(offset));
    const offsetIdx = paramIndex++;

    const result = await query(
      `SELECT e.id, e.student_id, e.first_name, e.last_name, e.department, e.position,
              COUNT(ar.id)::int AS total_checkins,
              ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM ar.work_hours) / 3600), 0)::numeric, 2)::float AS avg_hours,
              COUNT(ar.id) FILTER (WHERE ar.check_in_time::TIME > $3::TIME)::int AS late_count
       FROM students e
       LEFT JOIN student_attendance ar ON e.id = ar.student_id 
         AND ar.check_in_time::DATE BETWEEN $1::DATE AND $2::DATE
       WHERE e.is_active = TRUE
       ${filterSql}
       GROUP BY e.id, e.student_id, e.first_name, e.last_name, e.department, e.position
       ORDER BY total_checkins DESC, avg_hours DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logger.error('Detailed performance report error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch performance report' });
  }
});

// GET /api/reports/managed-students - returns the list of students the logged-in user can view
router.get('/managed-students', async (req, res) => {
  const role = req.user?.role;
  const userDbId = req.user?.id;

  try {
    let result;

    if (role === 'admin') {
      // Admin sees all active students (all roles)
      result = await query(
        `SELECT id, student_id, first_name, last_name, department, role
         FROM students
         WHERE is_active = TRUE
         ORDER BY role, first_name, last_name`
      );
    } else if (role === 'teacher') {
      // Teacher sees only the students assigned to them
      result = await query(
        `SELECT e.id, e.student_id, e.first_name, e.last_name, e.department, e.role
         FROM students e
         WHERE e.id IN (
           SELECT student_id FROM teacher_assignments
           WHERE teacher_id = $1 AND is_active = TRUE
         ) AND e.is_active = TRUE
         ORDER BY e.first_name, e.last_name`,
        [userDbId]
      );
    } else {
      // Students see only themselves
      result = await query(
        `SELECT id, student_id, first_name, last_name, department, role
         FROM students WHERE id = $1 AND is_active = TRUE`,
        [userDbId]
      );
    }

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Managed students fetch error', { error: error.message, role, userDbId });
    res.status(500).json({ success: false, message: 'Failed to fetch managed students' });
  }
});

// GET /api/reports/departments - department metrics
router.get('/departments', async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  const { startDate, endDate } = req.query;

  try {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const result = await query(
      `SELECT
         COALESCE(e.department, 'Unassigned') AS department,
         COUNT(DISTINCT e.id)::int AS students,
         COUNT(ar.id)::int AS total_checkins,
         ROUND(
           (COUNT(DISTINCT ar.student_id)::NUMERIC / NULLIF(COUNT(DISTINCT e.id), 0) * 100),
           2
         )::float AS attendance_rate
       FROM students e
       LEFT JOIN student_attendance ar
         ON e.id = ar.student_id
        AND ar.check_in_time::DATE BETWEEN $1::DATE AND $2::DATE
       WHERE e.is_active = TRUE
       GROUP BY COALESCE(e.department, 'Unassigned')
       ORDER BY department`,
      [toDateString(start), toDateString(end)]
    );

    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logger.error('Detailed departments report error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch departments report' });
  }
});

module.exports = router;
