const express = require('express');
const { query } = require('../../config/database');
const { authorizeTeacher } = require('../../middleware/authMiddleware');
const { logSecurityEvent } = require('../security-monitoring/securityLogger');
const { logger } = require('../../config/logger');

const router = express.Router();

function formatInterval(interval) {
  if (!interval) return null;
  if (typeof interval === 'string') return interval;
  const hours = interval.hours || 0;
  const minutes = interval.minutes || 0;
  const seconds = interval.seconds || 0;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Haversine distance in METERS between two lat/lng points.
 * Mirrors the PostgreSQL calculate_distance() function.
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Resolves geo-fence result for a given student and coordinates.
 * Checks student_locations first; falls back to global check_geo_fence().
 * Returns { within_fence, distance, office_name }
 */
async function resolveGeoFence(studentId, latitude, longitude) {
  // 1. Check for per-student location assignment
  const empLocResult = await query(
    `SELECT name, latitude, longitude, radius_meters
     FROM student_locations
     WHERE student_id = $1 AND is_active = TRUE
     LIMIT 1`,
    [studentId]
  );

  if (empLocResult.rows.length > 0) {
    const loc = empLocResult.rows[0];
    const distance = haversineDistanceMeters(latitude, longitude, loc.latitude, loc.longitude);
    const within_fence = distance <= loc.radius_meters;
    return { within_fence, distance, office_name: loc.name };
  }

  // 2. Fall back to global office check_geo_fence()
  const geoFenceResult = await query(
    `SELECT * FROM check_geo_fence($1, $2)`,
    [latitude, longitude]
  );

  if (geoFenceResult.rows.length === 0) {
    return null; // No office configured at all
  }

  return geoFenceResult.rows[0];
}

// Check-in endpoint
router.post('/check-in', async (req, res) => {
  try {
    const { location, imageData, idempotencyKey } = req.body;
    const studentId = req.user.id;

    if (
      !location
      || typeof location.latitude !== 'number'
      || typeof location.longitude !== 'number'
    ) {
      return res.status(400).json({
        error: 'Location data required',
        code: 'LOCATION_REQUIRED'
      });
    }

    // Resolve geo-fence: per-student location first, then global fallback
    const geoFenceData = await resolveGeoFence(studentId, location.latitude, location.longitude);

    if (!geoFenceData) {
      return res.status(400).json({
        error: 'No active office location configured',
        code: 'NO_OFFICE_CONFIG'
      });
    }

    const { within_fence, distance, office_name } = geoFenceData;

    // Security check: Reject check-in if user is outside the assigned location radius, EXCEPT if studentId is 'admin'
    if (req.user?.studentId !== 'admin' && !within_fence) {
      try {
        await logSecurityEvent({
          studentId: req.user.studentId,
          eventType: 'GEOFENCE_VIOLATION',
          ipAddress: req.ip,
          deviceInfo: req.headers['user-agent'],
          details: JSON.stringify({
            distance: distance,
            office: office_name,
            location: location,
            action: 'check-in-rejected'
          }),
          severity: 'high'
        });
      } catch (logErr) {
        logger.warn('Failed to log geofence violation event', { error: logErr.message });
      }

      return res.status(400).json({
        error: 'You are outside the geofence radius. Check-in is rejected.',
        code: 'OUTSIDE_GEOFENCE'
      });
    }

    // Atomic INSERT ... ON CONFLICT DO NOTHING using the unique partial index
    // (uix_attendance_one_open_per_student_per_day).
    // This prevents double-check-in even with concurrent requests — the DB
    // enforces uniqueness atomically, so the SELECT+INSERT race condition is eliminated.
    const result = await query(
      `INSERT INTO student_attendance
         (student_id, check_in_time, location, geo_fence_status, distance_from_office, check_in_image_url, idempotency_key)
       VALUES ($1, NOW(), POINT($2, $3), $4, $5, $6, $7)
       ON CONFLICT DO NOTHING
       RETURNING id, check_in_time`,
      [
        studentId,
        location.latitude,
        location.longitude,
        within_fence,
        distance,
        imageData || null,
        idempotencyKey || null,
      ]
    );

    if (result.rows.length === 0) {
      // ON CONFLICT — already checked in
      return res.status(409).json({
        error: 'Already checked in today',
        code: 'ALREADY_CHECKED_IN'
      });
    }

    // Log geo-fence violation if applicable
    if (!within_fence) {
      await logSecurityEvent({
        studentId: req.user.studentId,
        eventType: 'GEOFENCE_VIOLATION',
        ipAddress: req.ip,
        deviceInfo: req.headers['user-agent'],
        details: JSON.stringify({
          distance: distance,
          office: office_name,
          location: location
        }),
        severity: 'medium'
      });
    }

    const record = result.rows[0];

    // STABILIZATION: Emit WebSocket events for realtime attendance sync
    const io = req.app.get('io');
    if (io) {
      io.notifyStudent(req.user.studentId, 'attendance_update', {
        type: 'check-in',
        status: 'checked-in',
        record,
        lastCheckIn: record.check_in_time,
        studentId: req.user.studentId,
      });
      io.notifyTeachers('attendance_update', {
        type: 'check-in',
        studentId: req.user.studentId,
        record,
      });
    }

    res.json({
      success: true,
      message: 'Check-in successful',
      record,
      geoFence: {
        withinFence: within_fence,
        distance: distance,
        officeName: office_name
      }
    });

  } catch (error) {
    logger.error('Check-in error', { error: error.message, stack: error.stack, userId: req.user?.id });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});


// Check-out endpoint
router.post('/check-out', async (req, res) => {
  try {
    const { location, imageData } = req.body;
    const studentId = req.user.id;

    // Get today's check-in record (timezone-safe using PostgreSQL CURRENT_DATE)
    const checkinResult = await query(
      `SELECT id, check_in_time FROM student_attendance 
       WHERE student_id = $1 AND check_in_time >= CURRENT_DATE AND check_in_time < CURRENT_DATE + INTERVAL '1 day'
       AND check_out_time IS NULL`,
      [studentId]
    );

    if (checkinResult.rows.length === 0) {
      return res.status(400).json({
        error: 'No active check-in found for today',
        code: 'NO_ACTIVE_CHECKIN'
      });
    }

    const checkinRecord = checkinResult.rows[0];
    const checkOutTime = new Date();

    // Query active temporary timing for the checking-out student on the check-in date
    const checkInDate = new Date(checkinRecord.check_in_time);
    const year = checkInDate.getFullYear();
    const month = String(checkInDate.getMonth() + 1).padStart(2, '0');
    const day = String(checkInDate.getDate()).padStart(2, '0');
    const checkInDateStr = `${year}-${month}-${day}`;

    const tempShiftResult = await query(
      `SELECT work_start_time, work_end_time 
       FROM work_timings
       WHERE student_id = $1 
         AND is_temporary = TRUE 
         AND is_active = TRUE
         AND $2::date >= start_date 
         AND $2::date <= end_date
       LIMIT 1`,
      [studentId, checkInDateStr]
    );

    let shift = null;
    if (tempShiftResult.rows.length > 0) {
      shift = tempShiftResult.rows[0];
    } else {
      // Query active permanent timing
      const permShiftResult = await query(
        `SELECT work_start_time, work_end_time 
         FROM work_timings
         WHERE student_id = $1 
           AND is_temporary = FALSE 
           AND is_active = TRUE
         LIMIT 1`,
        [studentId]
      );
      if (permShiftResult.rows.length > 0) {
        shift = permShiftResult.rows[0];
      }
    }

    const workStartTime = shift ? shift.work_start_time : '09:00:00';
    const workEndTime = shift ? shift.work_end_time : '18:00:00';

    // Helper function to calculate overlapping milliseconds between shift and actual check-in/out
    function calculateOverlapMs(checkIn, checkOut, startStr, endStr) {
      const parseTime = (timeStr) => {
        const [h, m, s] = timeStr.split(':').map(Number);
        return { hours: h, minutes: m || 0, seconds: s || 0 };
      };

      const startT = parseTime(startStr);
      const endT = parseTime(endStr);

      const getShiftInterval = (baseDate, startT, endT) => {
        const start = new Date(baseDate);
        start.setHours(startT.hours, startT.minutes, startT.seconds, 0);

        const end = new Date(baseDate);
        if (endT.hours < startT.hours || (endT.hours === startT.hours && endT.minutes < startT.minutes)) {
          // Crosses midnight
          end.setDate(end.getDate() + 1);
        }
        end.setHours(endT.hours, endT.minutes, endT.seconds, 0);
        return { start, end };
      };

      const getOverlapMs = (interval1, interval2) => {
        const start = Math.max(interval1.start.getTime(), interval2.start.getTime());
        const end = Math.min(interval1.end.getTime(), interval2.end.getTime());
        return Math.max(0, end - start);
      };

      let maxOverlapMs = 0;

      // Check shift starting on previous day, same day, and next day to handle cross-midnight shifts robustly
      for (let offset = -1; offset <= 1; offset++) {
        const baseDate = new Date(checkIn);
        baseDate.setDate(baseDate.getDate() + offset);
        const shiftInterval = getShiftInterval(baseDate, startT, endT);
        const overlapMs = getOverlapMs(shiftInterval, { start: checkIn, end: checkOut });
        if (overlapMs > maxOverlapMs) {
          maxOverlapMs = overlapMs;
        }
      }

      return maxOverlapMs;
    }

    const workHoursMs = calculateOverlapMs(checkinRecord.check_in_time, checkOutTime, workStartTime, workEndTime);
    
    // Calculate work hours from millisecond difference (safe for any duration)
    const totalSeconds = Math.max(0, Math.floor(workHoursMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const workHours = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Resolve geo-fence for check-out location (per-student or global fallback)
    let checkOutWithinFence = null;
    let checkOutDistance = null;
    if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
      try {
        const checkOutGeo = await resolveGeoFence(studentId, location.latitude, location.longitude);
        if (checkOutGeo) {
          checkOutWithinFence = checkOutGeo.within_fence;
          checkOutDistance = checkOutGeo.distance;
        }
      } catch (geoErr) {
        logger.warn('Check-out geo-fence resolution failed', { error: geoErr.message });
      }
    }

    // Update record with check-out data including geo-fence result
    const result = await query(
      `UPDATE student_attendance 
       SET check_out_time = NOW(), 
           work_hours = $1,
           check_out_image_url = $2,
           location = CASE WHEN $3::boolean IS NOT NULL THEN POINT($4::double precision, $5::double precision) ELSE location END,
           checkout_geo_fence_status = $7,
           checkout_distance_from_office = $8
       WHERE id = $6
       RETURNING *`,
      [
        workHours,
        imageData || null,
        location ? true : null,
        location ? location.latitude : null,
        location ? location.longitude : null,
        checkinRecord.id,
        checkOutWithinFence,
        checkOutDistance
      ]
    );

    const record = result.rows[0];
    if (record) {
      record.work_hours = workHours;
    }

    // STABILIZATION: Emit WebSocket events for realtime attendance sync
    const io = req.app.get('io');
    if (io) {
      io.notifyStudent(req.user.studentId, 'attendance_update', {
        type: 'check-out',
        status: 'checked-out',
        record,
        studentId: req.user.studentId,
      });
      io.notifyTeachers('attendance_update', {
        type: 'check-out',
        studentId: req.user.studentId,
        record,
      });
    }

    res.json({
      success: true,
      message: 'Check-out successful',
      record,
    });

  } catch (error) {
    logger.error('Check-out error', { error: error.message, stack: error.stack, userId: req.user?.id });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Get today's attendance state
router.get('/today', async (req, res) => {
  try {
    const studentId = req.user.id;

    const result = await query(
      `SELECT *
       FROM student_attendance
       WHERE student_id = $1
         AND check_in_time >= CURRENT_DATE
         AND check_in_time < CURRENT_DATE + INTERVAL '1 day'
       ORDER BY check_in_time DESC
       LIMIT 1`,
      [studentId]
    );

    const currentRecord = result.rows[0] || null;
    if (currentRecord && currentRecord.work_hours) {
      currentRecord.work_hours = formatInterval(currentRecord.work_hours);
    }
    const status = currentRecord && !currentRecord.check_out_time
      ? 'checked-in'
      : 'checked-out';

    res.json({
      success: true,
      status,
      currentRecord,
      lastCheckIn: currentRecord?.check_in_time || null,
    });
  } catch (error) {
    logger.error('Today attendance fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

// Get current student's work timings & location
router.get('/my-timing', async (req, res) => {
  try {
    const studentId = req.user.id;

    // Check temporary timings first
    const tempShiftResult = await query(
      `SELECT work_start_time, work_end_time, is_temporary, start_date, end_date
       FROM work_timings
       WHERE student_id = $1 
         AND is_temporary = TRUE 
         AND is_active = TRUE
         AND NOW()::date >= start_date 
         AND NOW()::date <= end_date
       LIMIT 1`,
      [studentId]
    );

    let shift = null;
    if (tempShiftResult.rows.length > 0) {
      shift = tempShiftResult.rows[0];
    } else {
      // Query active permanent timing
      const permShiftResult = await query(
        `SELECT work_start_time, work_end_time, is_temporary, start_date, end_date
         FROM work_timings
         WHERE student_id = $1 
           AND is_temporary = FALSE 
           AND is_active = TRUE
         LIMIT 1`,
         [studentId]
      );
      if (permShiftResult.rows.length > 0) {
        shift = permShiftResult.rows[0];
      }
    }

    // Query active custom location
    const locResult = await query(
      `SELECT name, latitude, longitude, radius_meters 
       FROM student_locations 
       WHERE student_id = $1 AND is_active = TRUE
       LIMIT 1`,
      [studentId]
    );

    const workStartTime = shift ? shift.work_start_time : '09:00:00';
    const workEndTime = shift ? shift.work_end_time : '18:00:00';
    const assignedLocation = locResult.rows.length > 0 ? locResult.rows[0] : null;

    res.json({
      success: true,
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      has_assigned_timing: shift !== null,
      is_temporary: shift ? shift.is_temporary : false,
      start_date: shift ? shift.start_date : null,
      end_date: shift ? shift.end_date : null,
      location_name: assignedLocation ? assignedLocation.name : null,
      latitude: assignedLocation ? assignedLocation.latitude : null,
      longitude: assignedLocation ? assignedLocation.longitude : null,
      radius_meters: assignedLocation ? assignedLocation.radius_meters : null,
      has_assigned_location: assignedLocation !== null
    });
  } catch (error) {
    logger.error('Failed to get student work timings', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch work timings' });
  }
});

// Submit location or timing request to admin
router.post('/request-location-timing', async (req, res) => {
  try {
    const studentId = req.user.id;
    const {
      requestType,
      requestedLocationName,
      requestedLatitude,
      requestedLongitude,
      requestedRadiusMeters,
      requestedWorkStartTime,
      requestedWorkEndTime,
      requestedIsTemporary,
      requestedStartDate,
      requestedEndDate
    } = req.body;

    // Validate request type
    if (!requestType || !['location', 'timing', 'both'].includes(requestType)) {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    // ID = admin cannot send location/timing requests
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Administrators cannot submit location or timing requests' });
    }

    const empResult = await query(
      'SELECT first_name, last_name, student_id, department FROM students WHERE id = $1',
      [studentId]
    );
    
    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const emp = empResult.rows[0];

    // Insert request
    const result = await query(
      `INSERT INTO location_timing_requests (
         student_id, request_type, 
         requested_location_name, requested_latitude, requested_longitude, requested_radius_meters,
         requested_work_start_time, requested_work_end_time, requested_is_temporary, 
         requested_start_date, requested_end_date, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
       RETURNING *`,
      [
        studentId,
        requestType,
        requestType !== 'timing' ? requestedLocationName || 'Home/Custom Office' : null,
        requestType !== 'timing' ? (requestedLatitude ? parseFloat(requestedLatitude) : null) : null,
        requestType !== 'timing' ? (requestedLongitude ? parseFloat(requestedLongitude) : null) : null,
        requestType !== 'timing' ? (requestedRadiusMeters ? parseInt(requestedRadiusMeters, 10) : 500) : null,
        requestType !== 'location' ? requestedWorkStartTime || null : null,
        requestType !== 'location' ? requestedWorkEndTime || null : null,
        requestType !== 'location' ? requestedIsTemporary || false : false,
        requestType !== 'location' && requestedIsTemporary ? requestedStartDate || null : null,
        requestType !== 'location' && requestedIsTemporary ? requestedEndDate || null : null
      ]
    );

    const newRequest = result.rows[0];

    // Emit live WebSocket update to teachers and admins
    try {
      const io = req.app.get('io');
      if (io) {
        // Broadcast new request in real time
        io.to('admin').emit('location_timing_request_new', {
          ...newRequest,
          first_name: emp.first_name,
          last_name: emp.last_name,
          student_id_code: emp.student_id,
          department: emp.department
        });
      }
    } catch (wsErr) {
      logger.warn('Failed to broadcast location timing request WS alert', { error: wsErr.message });
    }

    res.status(201).json({
      success: true,
      message: 'Request submitted successfully',
      data: newRequest
    });
  } catch (error) {
    logger.error('Failed to submit location timing request', { error: error.message });
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// Get attendance history
router.get('/history', async (req, res) => {
  try {
    const { startDate, endDate, studentId: targetStudentId, scope } = req.query;
    const requestingStudentId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isTeacher = req.user.role === 'teacher';
    const isStudent = req.user.role === 'student';

    // SCOPE VALIDATION: Teachers can only see their assigned students
    // If targetStudentId is specified, verify teacher assignment
    if (targetStudentId && isTeacher) {
      const empResult = await query(
        `SELECT id FROM teacher_assignments 
         WHERE teacher_id = $1 AND student_id IN (
           SELECT id FROM students WHERE student_id = $2
         ) AND is_active = TRUE`,
        [req.user.id, targetStudentId]
      );

      if (empResult.rows.length === 0) {
        return res.status(403).json({
          error: 'You are not assigned to supervise this student',
          code: 'FORBIDDEN'
        });
      }
    }

    let queryText = `
      SELECT ar.*, e.student_id, e.first_name, e.last_name, e.department, e.role
      FROM student_attendance ar
      JOIN students e ON ar.student_id = e.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    // Date filter
    if (startDate) {
      paramCount++;
      queryText += ` AND ar.check_in_time >= $${paramCount}`;
      params.push(new Date(startDate));
    }

    if (endDate) {
      paramCount++;
      queryText += ` AND ar.check_in_time <= $${paramCount}`;
      const end = new Date(endDate);
      if (typeof endDate === 'string' && !endDate.includes('T')) {
        end.setUTCHours(23, 59, 59, 999);
      }
      params.push(end);
    }

    // ROLE-BASED SCOPE
    if (scope === 'self') {
      paramCount++;
      queryText += ` AND ar.student_id = $${paramCount}`;
      params.push(requestingStudentId);
    } else if (scope === 'team') {
      paramCount++;
      queryText += ` AND ar.student_id IN (
        SELECT id FROM students WHERE teacher_id = $${paramCount} AND is_active = TRUE AND role = $${paramCount + 1}
        UNION
        SELECT sa.student_id FROM teacher_assignments sa
        JOIN students emp ON sa.student_id = emp.id
        WHERE sa.teacher_id = $${paramCount} AND sa.is_active = TRUE AND emp.role = $${paramCount + 1}
      )`;
      params.push(requestingStudentId);
      params.push(req.user.role === 'admin' ? 'teacher' : 'student');
      paramCount++;
    } else {
      if (isAdmin) {
        if (scope === 'all') {
          // Admins see all records (no additional filter)
        } else {
          paramCount++;
          queryText += ` AND ar.student_id = $${paramCount}`;
          params.push(requestingStudentId);
        }
      } else if (isTeacher) {
        if (targetStudentId) {
          // Already validated above - teacher is assigned to this student
          paramCount++;
          queryText += ` AND e.student_id = $${paramCount}`;
          params.push(targetStudentId);
        } else {
          // Show only their assigned students
          paramCount++;
          queryText += ` AND ar.student_id IN (
            SELECT student_id FROM teacher_assignments
            WHERE teacher_id = $${paramCount} AND is_active = TRUE
          )`;
          params.push(req.user.id);
        }
      } else if (isStudent) {
        // Regular students only see their own records
        paramCount++;
        queryText += ` AND ar.student_id = $${paramCount}`;
        params.push(requestingStudentId);
      }
    }

    queryText += ' ORDER BY ar.check_in_time DESC';

    // Pagination
    const limit = parseInt(req.query.limit, 10) || 50;
    const page = parseInt(req.query.page, 10) || 1;
    const offset = (page - 1) * limit;

    paramCount++;
    queryText += ` LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    queryText += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await query(queryText, params);

    // Format interval work_hours to HH:MM:SS string
    result.rows.forEach(r => {
      if (r.work_hours) {
        r.work_hours = formatInterval(r.work_hours);
      }
    });

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) FROM student_attendance ar
      JOIN students e ON ar.student_id = e.id
      WHERE 1=1
    `;
    let countParams = [];
    let countParamCount = 0;

    // Apply same filters
    if (startDate) {
      countParamCount++;
      countQuery += ` AND ar.check_in_time >= $${countParamCount}`;
      countParams.push(new Date(startDate));
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND ar.check_in_time <= $${countParamCount}`;
      const end = new Date(endDate);
      if (typeof endDate === 'string' && !endDate.includes('T')) {
        end.setUTCHours(23, 59, 59, 999);
      }
      countParams.push(end);
    }

    // Same scope validation
    if (scope === 'self') {
      countParamCount++;
      countQuery += ` AND ar.student_id = $${countParamCount}`;
      countParams.push(requestingStudentId);
    } else if (scope === 'team') {
      countParamCount++;
      countQuery += ` AND ar.student_id IN (
        SELECT id FROM students WHERE teacher_id = $${countParamCount} AND is_active = TRUE AND role = $${countParamCount + 1}
        UNION
        SELECT sa.student_id FROM teacher_assignments sa
        JOIN students emp ON sa.student_id = emp.id
        WHERE sa.teacher_id = $${countParamCount} AND sa.is_active = TRUE AND emp.role = $${countParamCount + 1}
      )`;
      countParams.push(requestingStudentId);
      countParams.push(req.user.role === 'admin' ? 'teacher' : 'student');
      countParamCount++;
    } else {
      if (isAdmin) {
        if (scope === 'all') {
          // Admins see all
        } else {
          countParamCount++;
          countQuery += ` AND ar.student_id = $${countParamCount}`;
          countParams.push(requestingStudentId);
        }
      } else if (isTeacher) {
        if (targetStudentId) {
          countParamCount++;
          countQuery += ` AND e.student_id = $${countParamCount}`;
          countParams.push(targetStudentId);
        } else {
          countParamCount++;
          countQuery += ` AND ar.student_id IN (
            SELECT student_id FROM teacher_assignments
            WHERE teacher_id = $${countParamCount} AND is_active = TRUE
          )`;
          countParams.push(req.user.id);
        }
      } else if (isStudent) {
        countParamCount++;
        countQuery += ` AND ar.student_id = $${countParamCount}`;
        countParams.push(requestingStudentId);
      }
    }

    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      records: result.rows,
      totalCount: total,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Attendance history error', { error: error.message, userId: req.user?.id });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Get attendance statistics
router.get('/stats', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const studentId = req.user.id;

    let dateFilter = '';
    switch (period) {
      case 'week':
        dateFilter = "check_in_time >= NOW() - INTERVAL '7 days'";
        break;
      case 'month':
        dateFilter = "check_in_time >= NOW() - INTERVAL '30 days'";
        break;
      case 'year':
        dateFilter = "check_in_time >= NOW() - INTERVAL '365 days'";
        break;
      default:
        dateFilter = "check_in_time >= NOW() - INTERVAL '30 days'";
    }

    // Total check-ins
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM student_attendance 
       WHERE student_id = $1 AND ${dateFilter}`,
      [studentId]
    );

    // Average work hours
    const avgHoursResult = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM work_hours)) as avg_seconds 
       FROM student_attendance 
       WHERE student_id = $1 AND work_hours IS NOT NULL AND ${dateFilter}`,
      [studentId]
    );

    // Geo-fence compliance
    const geoFenceResult = await query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN geo_fence_status = TRUE THEN 1 ELSE 0 END) as within_fence
       FROM student_attendance 
       WHERE student_id = $1 AND ${dateFilter}`,
      [studentId]
    );

    // Late arrivals (after 9:30 AM)
    const lateArrivalsResult = await query(
      `SELECT COUNT(*) as late_count
       FROM student_attendance 
       WHERE student_id = $1 AND ${dateFilter}
         AND check_in_time::time >= TIME '09:30'`,
      [studentId]
    );

    const stats = {
      totalCheckins: parseInt(totalResult.rows[0].total),
      averageHours: avgHoursResult.rows[0].avg_seconds 
        ? (avgHoursResult.rows[0].avg_seconds / 3600).toFixed(1) 
        : '0',
      geoFenceCompliance: geoFenceResult.rows[0].total > 0 
        ? ((geoFenceResult.rows[0].within_fence / geoFenceResult.rows[0].total) * 100).toFixed(1)
        : '0',
      lateArrivals: parseInt(lateArrivalsResult.rows[0].late_count)
    };

    // STABILIZATION: Return consistent schema — flat fields + nested stats
    // Frontend reads both paths depending on the component
    res.json({
      success: true,
      totalCheckins: stats.totalCheckins,
      averageHours: stats.averageHours,
      geoFenceCompliance: stats.geoFenceCompliance,
      lateArrivals: stats.lateArrivals,
      stats,
      period
    });

  } catch (error) {
    logger.error('Attendance stats error', { error: error.message, userId: req.user?.id });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
