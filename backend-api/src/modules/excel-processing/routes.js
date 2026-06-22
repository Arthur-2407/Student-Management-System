const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { logger } = require('../../config/logger');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { requireRole } = require('../../middleware/rbac');
const ExcelJS = require('exceljs');

/**
 * V9 — EXCEL PROCESSING MODULE (Real .xlsx Generation)
 *
 * All endpoints now generate actual Excel .xlsx binary files using ExcelJS.
 * All routes are authenticated and RBAC-enforced.
 * Teacher scope filtering applied for non-admin users.
 */

// Helper to apply common styling to header rows
function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  row.height = 28;
}

// Helper to style data rows with alternating colors
function styleDataRow(row, rowIndex) {
  const bgColor = rowIndex % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF';
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgColor },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    cell.border = {
      top: { style: 'hair' },
      left: { style: 'hair' },
      bottom: { style: 'hair' },
      right: { style: 'hair' },
    };
  });
  row.height = 22;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

// GET /api/excel/attendance - Download attendance data as a real .xlsx file
// Requires: student, teacher or admin role
router.get('/attendance', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { start_date, end_date, department, student_id } = req.query;

    let queryText = `
      SELECT 
        e.student_id,
        e.first_name,
        e.last_name,
        e.department,
        a.check_in_time,
        a.check_out_time,
        CASE WHEN a.check_out_time IS NULL THEN 'Active' ELSE 'Completed' END AS status,
        a.geo_fence_status,
        ROUND(a.distance_from_office::numeric, 0) AS distance_meters,
        DATE(a.check_in_time) as date
      FROM student_attendance a
      JOIN students e ON a.student_id = e.id
      WHERE a.deleted_at IS NULL
    `;

    const params = [];
    let paramCount = 0;

    // Role-based scope filtering
    if (req.user.role === 'student') {
      paramCount++;
      queryText += ` AND a.student_id = $${paramCount}`;
      params.push(req.user.id);
    } else if (req.user.role === 'teacher') {
      paramCount++;
      queryText += `
        AND (a.student_id = $${paramCount} OR a.student_id IN (
          SELECT student_id FROM teacher_assignments
          WHERE teacher_id = $${paramCount} AND is_active = TRUE
        ))`;
      params.push(req.user.id);
    }

    if (start_date) {
      paramCount++;
      queryText += ` AND DATE(a.check_in_time) >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      queryText += ` AND DATE(a.check_in_time) <= $${paramCount}`;
      params.push(end_date);
    }

    if (department) {
      paramCount++;
      queryText += ` AND e.department = $${paramCount}`;
      params.push(department);
    }

    // Optional per-student filter for admin/teacher drill-down
    if (student_id && req.user.role !== 'student') {
      paramCount++;
      queryText += ` AND e.student_id = $${paramCount}`;
      params.push(student_id);
    }

    queryText += ' ORDER BY e.student_id, a.check_in_time DESC';

    const result = await query(queryText, params);

    // If client wants JSON (for programmatic use)
    if (req.headers.accept === 'application/json') {
      return res.json({ success: true, data: result.rows, count: result.rows.length });
    }

    // Build Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Student Management System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('Attendance Report', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    });

    // Set column widths
    sheet.columns = [
      { header: 'Student ID',      key: 'student_id',         width: 16 },
      { header: 'First Name',       key: 'first_name',          width: 18 },
      { header: 'Last Name',        key: 'last_name',           width: 18 },
      { header: 'Department',       key: 'department',          width: 20 },
      { header: 'Date',             key: 'date',                width: 14 },
      { header: 'Check-in Time',    key: 'check_in_time',       width: 22 },
      { header: 'Check-out Time',   key: 'check_out_time',      width: 22 },
      { header: 'Status',           key: 'status',              width: 14 },
      { header: 'Geo-fence',        key: 'geo_fence_status',    width: 14 },
      { header: 'Distance (m)',     key: 'distance_meters',     width: 16 },
    ];

    // Style header row
    styleHeaderRow(sheet.getRow(1));

    // Add data rows
    result.rows.forEach((row, idx) => {
      const dataRow = sheet.addRow({
        student_id: row.student_id,
        first_name: row.first_name,
        last_name: row.last_name,
        department: row.department,
        date: row.date ? String(row.date).split('T')[0] : '',
        check_in_time: row.check_in_time ? new Date(row.check_in_time).toLocaleString() : '',
        check_out_time: row.check_out_time ? new Date(row.check_out_time).toLocaleString() : 'Still checked in',
        status: row.status,
        geo_fence_status: row.geo_fence_status ? 'Within fence' : 'Outside fence',
        distance_meters: row.distance_meters !== null ? Number(row.distance_meters) : 'N/A',
      });
      styleDataRow(dataRow, idx + 1);
    });

    // Add summary footer
    const summaryRow = sheet.addRow({
      student_id: `Total Records: ${result.rows.length}`,
    });
    summaryRow.font = { bold: true, italic: true, color: { argb: 'FF555555' } };

    // Stream response
    const filename = `attendance-report-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    await workbook.xlsx.write(res);
    res.end();

    logger.info('Attendance Excel export generated', {
      userId: req.user.id,
      rowCount: result.rows.length,
      filters: { start_date, end_date, department },
    });
  } catch (error) {
    logger.error('Excel attendance export error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to generate attendance report' });
  }
});

// GET /api/excel/leave - Download leave data as a real .xlsx file
// Requires: student, teacher or admin role
router.get('/leave', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { start_date, end_date, student_id } = req.query;

    let queryText = `
      SELECT 
        e.student_id,
        e.first_name,
        e.last_name,
        e.department,
        l.leave_type,
        l.start_date,
        l.end_date,
        l.total_days,
        l.status,
        l.reason,
        l.rejection_reason,
        l.created_at
      FROM leave_requests l
      JOIN students e ON l.student_id = e.id
      WHERE l.deleted_at IS NULL
    `;

    const params = [];
    let paramCount = 0;

    // Role-based scope filtering
    if (req.user.role === 'student') {
      paramCount++;
      queryText += ` AND l.student_id = $${paramCount}`;
      params.push(req.user.id);
    } else if (req.user.role === 'teacher') {
      paramCount++;
      queryText += `
        AND (l.student_id = $${paramCount} OR l.student_id IN (
          SELECT student_id FROM teacher_assignments
          WHERE teacher_id = $${paramCount} AND is_active = TRUE
        ))`;
      params.push(req.user.id);
    }

    if (start_date) {
      paramCount++;
      queryText += ` AND l.start_date >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      queryText += ` AND l.end_date <= $${paramCount}`;
      params.push(end_date);
    }

    // Optional per-student filter for admin/teacher drill-down
    if (student_id && req.user.role !== 'student') {
      paramCount++;
      queryText += ` AND e.student_id = $${paramCount}`;
      params.push(student_id);
    }

    queryText += ' ORDER BY l.created_at DESC';

    const result = await query(queryText, params);

    // If client wants JSON
    if (req.headers.accept === 'application/json') {
      return res.json({ success: true, data: result.rows, count: result.rows.length });
    }

    // Build Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Student Management System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Leave Report', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    });

    sheet.columns = [
      { header: 'Student ID',     key: 'student_id',       width: 16 },
      { header: 'First Name',      key: 'first_name',        width: 18 },
      { header: 'Last Name',       key: 'last_name',         width: 18 },
      { header: 'Department',      key: 'department',        width: 20 },
      { header: 'Leave Type',      key: 'leave_type',        width: 16 },
      { header: 'Start Date',      key: 'start_date',        width: 14 },
      { header: 'End Date',        key: 'end_date',          width: 14 },
      { header: 'Total Days',      key: 'total_days',        width: 12 },
      { header: 'Status',          key: 'status',            width: 14 },
      { header: 'Reason',          key: 'reason',            width: 40 },
      { header: 'Rejection Reason', key: 'rejection_reason', width: 40 },
      { header: 'Submitted At',    key: 'created_at',        width: 22 },
    ];

    styleHeaderRow(sheet.getRow(1));

    result.rows.forEach((row, idx) => {
      const dataRow = sheet.addRow({
        student_id: row.student_id,
        first_name: row.first_name,
        last_name: row.last_name,
        department: row.department,
        leave_type: row.leave_type,
        start_date: String(row.start_date).split('T')[0],
        end_date: String(row.end_date).split('T')[0],
        total_days: row.total_days,
        status: row.status,
        reason: row.reason,
        rejection_reason: row.rejection_reason || '',
        created_at: new Date(row.created_at).toLocaleString(),
      });
      styleDataRow(dataRow, idx + 1);
    });

    const summaryRow = sheet.addRow({ student_id: `Total Records: ${result.rows.length}` });
    summaryRow.font = { bold: true, italic: true, color: { argb: 'FF555555' } };

    const filename = `leave-report-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    await workbook.xlsx.write(res);
    res.end();

    logger.info('Leave Excel export generated', {
      userId: req.user.id,
      rowCount: result.rows.length,
    });
  } catch (error) {
    logger.error('Excel leave export error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to generate leave report' });
  }
});

// POST /api/excel/upload - Upload student data via JSON (admin only)
// Requires: admin role
router.post('/upload', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { students } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid student data' });
    }

    if (students.length > 500) {
      return res.status(400).json({ success: false, message: 'Maximum 500 students per upload' });
    }

    const results = { inserted: 0, skipped: 0, errors: [] };

    for (const emp of students) {
      try {
        await query(
          `INSERT INTO students
           (student_id, first_name, last_name, department, position, email, role, hire_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE))
           ON CONFLICT (student_id) DO UPDATE
           SET first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               department = EXCLUDED.department,
               position = EXCLUDED.position,
               email = EXCLUDED.email,
               role = EXCLUDED.role,
               updated_at = NOW()`,
          [
            emp.student_id,
            emp.first_name,
            emp.last_name,
            emp.department,
            emp.position || 'Student',
            emp.email,
            emp.role || 'student',
            emp.hire_date || null,
          ]
        );
        results.inserted++;
      } catch (err) {
        results.skipped++;
        results.errors.push({ student_id: emp.student_id, error: err.message });
      }
    }

    logger.info('Excel upload processed', { userId: req.user.id, results });
    res.json({ success: true, results });
  } catch (error) {
    logger.error('Excel upload error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to process upload' });
  }
});

// GET /api/excel/students - Download student roster as .xlsx
// Requires: student, teacher or admin role
router.get('/students', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { department, role: filterRole } = req.query;
    let queryText = `
      SELECT
        e.student_id,
        e.first_name,
        e.last_name,
        e.email,
        e.role,
        e.department,
        e.position,
        e.phone_number,
        e.hire_date,
        e.is_active,
        e.face_enrolled,
        e.face_enrolled_at,
        e.created_at,
        sup.student_id AS teacher_student_id,
        sup.first_name AS teacher_first_name,
        sup.last_name AS teacher_last_name
      FROM students e
      LEFT JOIN students sup ON e.teacher_id = sup.id
      WHERE e.deleted_at IS NULL
    `;

    const params = [];
    let paramCount = 0;

    if (req.user.role === 'student') {
      paramCount++;
      queryText += ` AND e.id = $${paramCount}`;
      params.push(req.user.id);
    } else if (req.user.role === 'teacher') {
      paramCount++;
      queryText += `
        AND (e.id = $${paramCount} OR e.id IN (
          SELECT student_id FROM teacher_assignments
          WHERE teacher_id = $${paramCount} AND is_active = TRUE
        ))`;
      params.push(req.user.id);
    }

    if (department) {
      paramCount++;
      queryText += ` AND e.department = $${paramCount}`;
      params.push(department);
    }

    if (filterRole) {
      paramCount++;
      queryText += ` AND e.role = $${paramCount}`;
      params.push(filterRole);
    }

    queryText += ' ORDER BY e.department, e.student_id';

    const result = await query(queryText, params);

    if (req.headers.accept === 'application/json') {
      return res.json({ success: true, data: result.rows, count: result.rows.length });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Student Management System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Student Roster', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    });

    sheet.columns = [
      { header: 'Student ID',      key: 'student_id',              width: 16 },
      { header: 'First Name',       key: 'first_name',               width: 18 },
      { header: 'Last Name',        key: 'last_name',                width: 18 },
      { header: 'Email',            key: 'email',                    width: 30 },
      { header: 'Role',             key: 'role',                     width: 14 },
      { header: 'Department',       key: 'department',               width: 22 },
      { header: 'Position',         key: 'position',                 width: 22 },
      { header: 'Phone',            key: 'phone_number',             width: 16 },
      { header: 'Hire Date',        key: 'hire_date',                width: 14 },
      { header: 'Active',           key: 'is_active',                width: 10 },
      { header: 'Face Enrolled',    key: 'face_enrolled',            width: 14 },
      { header: 'Face Enrolled At', key: 'face_enrolled_at',         width: 22 },
      { header: 'Teacher ID',    key: 'teacher_student_id',   width: 16 },
      { header: 'Teacher',       key: 'teacher_name',          width: 26 },
      { header: 'Created At',       key: 'created_at',               width: 22 },
    ];

    styleHeaderRow(sheet.getRow(1));

    result.rows.forEach((row, idx) => {
      const dataRow = sheet.addRow({
        student_id: row.student_id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        role: row.role,
        department: row.department,
        position: row.position,
        phone_number: row.phone_number || '',
        hire_date: row.hire_date ? String(row.hire_date).split('T')[0] : '',
        is_active: row.is_active ? 'Yes' : 'No',
        face_enrolled: row.face_enrolled ? 'Yes' : 'No',
        face_enrolled_at: row.face_enrolled_at ? new Date(row.face_enrolled_at).toLocaleString() : 'Not enrolled',
        teacher_student_id: row.teacher_student_id || '',
        teacher_name: row.teacher_first_name
          ? `${row.teacher_first_name} ${row.teacher_last_name}`
          : 'No teacher',
        created_at: new Date(row.created_at).toLocaleString(),
      });
      styleDataRow(dataRow, idx + 1);
    });

    const summaryRow = sheet.addRow({ student_id: `Total: ${result.rows.length} students` });
    summaryRow.font = { bold: true, italic: true, color: { argb: 'FF555555' } };

    const filename = `students-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    await workbook.xlsx.write(res);
    res.end();

    logger.info('Student Excel export generated', {
      userId: req.user.id,
      rowCount: result.rows.length,
    });
  } catch (error) {
    logger.error('Excel students export error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to generate student report' });
  }
});

// GET /api/excel/audit-logs - Download audit log as .xlsx (admin only)
router.get('/audit-logs', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { start_date, end_date, action_type } = req.query;

    let queryText = `
      SELECT
        al.id,
        al.action,
        al.resource_type,
        al.resource_id,
        al.ip_address,
        al.user_agent,
        al.created_at,
        al.details,
        e.student_id AS actor_student_id,
        e.first_name  AS actor_first_name,
        e.last_name   AS actor_last_name
      FROM audit_logs al
      LEFT JOIN students e ON al.actor_student_id = e.student_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      queryText += ` AND al.created_at >= $${paramCount}`;
      params.push(new Date(start_date));
    }

    if (end_date) {
      paramCount++;
      queryText += ` AND al.created_at <= $${paramCount}`;
      params.push(new Date(end_date));
    }

    if (action_type) {
      paramCount++;
      queryText += ` AND al.action ILIKE $${paramCount}`;
      params.push(`%${action_type}%`);
    }

    queryText += ' ORDER BY al.created_at DESC LIMIT 5000';

    const result = await query(queryText, params);

    if (req.headers.accept === 'application/json') {
      return res.json({ success: true, data: result.rows, count: result.rows.length });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Student Management System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Audit Log', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    });

    sheet.columns = [
      { header: 'ID',            key: 'id',                   width: 10 },
      { header: 'Actor ID',      key: 'actor_student_id',    width: 14 },
      { header: 'Actor Name',    key: 'actor_name',           width: 26 },
      { header: 'Action',        key: 'action',               width: 30 },
      { header: 'Resource Type', key: 'resource_type',        width: 20 },
      { header: 'Resource ID',   key: 'resource_id',          width: 16 },
      { header: 'IP Address',    key: 'ip_address',           width: 18 },
      { header: 'Details',       key: 'details',              width: 50 },
      { header: 'Timestamp',     key: 'created_at',           width: 22 },
    ];

    styleHeaderRow(sheet.getRow(1));

    result.rows.forEach((row, idx) => {
      const dataRow = sheet.addRow({
        id: row.id,
        actor_student_id: row.actor_student_id || 'system',
        actor_name: row.actor_first_name ? `${row.actor_first_name} ${row.actor_last_name}` : 'System',
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id || '',
        ip_address: row.ip_address || '',
        details: typeof row.details === 'object' ? JSON.stringify(row.details) : String(row.details || ''),
        created_at: new Date(row.created_at).toLocaleString(),
      });
      styleDataRow(dataRow, idx + 1);
    });

    const filename = `audit-log-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    await workbook.xlsx.write(res);
    res.end();

    logger.info('Audit log Excel export generated', { userId: req.user.id, rowCount: result.rows.length });
  } catch (error) {
    logger.error('Excel audit log export error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to generate audit log export' });
  }
});

// GET /api/excel/security-events - Download security events as .xlsx (admin or teacher or student)
router.get('/security-events', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { start_date, end_date, event_type, severity } = req.query;

    let queryText = `
      SELECT
        se.id,
        se.event_type,
        se.severity,
        se.ip_address,
        se.device_info,
        se.details,
        se.timestamp AS created_at,
        e.student_id,
        e.first_name,
        e.last_name,
        e.role AS student_role
      FROM security_events se
      LEFT JOIN students e ON se.student_id = e.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (req.user.role === 'student') {
      paramCount++;
      queryText += ` AND se.student_id = $${paramCount}`;
      params.push(req.user.id);
    } else if (req.user.role === 'teacher') {
      paramCount++;
      queryText += `
        AND (se.student_id = $${paramCount} OR se.student_id IN (
          SELECT student_id FROM teacher_assignments
          WHERE teacher_id = $${paramCount} AND is_active = TRUE
        ))`;
      params.push(req.user.id);
    }

    if (start_date) {
      paramCount++;
      queryText += ` AND se.timestamp >= $${paramCount}`;
      params.push(new Date(start_date));
    }

    if (end_date) {
      paramCount++;
      queryText += ` AND se.timestamp <= $${paramCount}`;
      params.push(new Date(end_date));
    }

    if (event_type) {
      paramCount++;
      queryText += ` AND se.event_type = $${paramCount}`;
      params.push(event_type);
    }

    if (severity) {
      paramCount++;
      queryText += ` AND se.severity = $${paramCount}`;
      params.push(severity);
    }

    queryText += ' ORDER BY se.timestamp DESC LIMIT 10000';

    const result = await query(queryText, params);

    if (req.headers.accept === 'application/json') {
      return res.json({ success: true, data: result.rows, count: result.rows.length });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Student Management System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Security Events', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    });

    sheet.columns = [
      { header: 'ID',           key: 'id',             width: 10 },
      { header: 'Event Type',   key: 'event_type',     width: 30 },
      { header: 'Severity',     key: 'severity',       width: 12 },
      { header: 'Student ID',  key: 'student_id',    width: 14 },
      { header: 'Student',     key: 'student_name',  width: 26 },
      { header: 'Role',         key: 'student_role',  width: 14 },
      { header: 'IP Address',   key: 'ip_address',     width: 18 },
      { header: 'Device Info',  key: 'device_info',    width: 40 },
      { header: 'Details',      key: 'details',        width: 50 },
      { header: 'Timestamp',    key: 'created_at',     width: 22 },
    ];

    styleHeaderRow(sheet.getRow(1));

    result.rows.forEach((row, idx) => {
      const dataRow = sheet.addRow({
        id: row.id,
        event_type: row.event_type,
        severity: row.severity || 'info',
        student_id: row.student_id || '',
        student_name: row.first_name ? `${row.first_name} ${row.last_name}` : 'Unknown',
        student_role: row.student_role || '',
        ip_address: row.ip_address || '',
        device_info: row.device_info || '',
        details: typeof row.details === 'object' ? JSON.stringify(row.details) : String(row.details || ''),
        created_at: new Date(row.created_at).toLocaleString(),
      });

      // Colour-code by severity
      const severityColor = {
        critical: 'FFFF0000',
        high:     'FFFF6600',
        medium:   'FFFFFF00',
        low:      'FF00FF00',
        info:     'FFFFFFFF',
      }[row.severity] || 'FFFFFFFF';

      dataRow.getCell('severity').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: severityColor } };
      styleDataRow(dataRow, idx + 1);
    });

    const filename = `security-events-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    await workbook.xlsx.write(res);
    res.end();

    logger.info('Security events Excel export generated', { userId: req.user.id, rowCount: result.rows.length });
  } catch (error) {
    logger.error('Excel security events export error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to generate security events export' });
  }
});

// GET /api/excel/performance - Download performance metrics as .xlsx
// Requires: student, teacher or admin role
router.get('/performance', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { start_date, end_date, department } = req.query;

    const start = start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = end_date ? new Date(end_date) : new Date();

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

    if (req.user.role === 'student') {
      filterSql += ` AND e.id = $${paramIndex}`;
      params.push(req.user.id);
      paramIndex++;
    } else if (req.user.role === 'teacher') {
      filterSql += ` AND (e.id = $${paramIndex} OR e.id IN (
        SELECT student_id FROM teacher_assignments
        WHERE teacher_id = $${paramIndex} AND is_active = TRUE
      ))`;
      params.push(req.user.id);
      paramIndex++;
    }

    if (department) {
      filterSql += ` AND e.department = $${paramIndex}`;
      params.push(department);
      paramIndex++;
    }

    const queryText = `
      SELECT e.student_id, e.first_name, e.last_name, e.department, e.position,
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
    `;

    const result = await query(queryText, params);

    if (req.headers.accept === 'application/json') {
      return res.json({ success: true, data: result.rows, count: result.rows.length });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Student Management System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Performance Report', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    });

    sheet.columns = [
      { header: 'Student ID',    key: 'student_id',    width: 16 },
      { header: 'First Name',     key: 'first_name',     width: 18 },
      { header: 'Last Name',      key: 'last_name',      width: 18 },
      { header: 'Department',     key: 'department',     width: 20 },
      { header: 'Position',       key: 'position',       width: 20 },
      { header: 'Total Check-ins', key: 'total_checkins', width: 16 },
      { header: 'Avg. Hours/Day', key: 'avg_hours',      width: 18 },
      { header: 'Late Arrivals',  key: 'late_count',     width: 16 },
    ];

    styleHeaderRow(sheet.getRow(1));

    result.rows.forEach((row, idx) => {
      const dataRow = sheet.addRow({
        student_id: row.student_id,
        first_name: row.first_name,
        last_name: row.last_name,
        department: row.department || 'Unassigned',
        position: row.position || '',
        total_checkins: row.total_checkins,
        avg_hours: row.avg_hours !== null ? Number(row.avg_hours) : 0,
        late_count: row.late_count,
      });
      styleDataRow(dataRow, idx + 1);
    });

    const summaryRow = sheet.addRow({
      student_id: `Total Records: ${result.rows.length}`,
    });
    summaryRow.font = { bold: true, italic: true, color: { argb: 'FF555555' } };

    const filename = `performance-report-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    await workbook.xlsx.write(res);
    res.end();

    logger.info('Performance Excel export generated', { userId: req.user.id, rowCount: result.rows.length });
  } catch (error) {
    logger.error('Excel performance export error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to generate performance export' });
  }
});

module.exports = router;
