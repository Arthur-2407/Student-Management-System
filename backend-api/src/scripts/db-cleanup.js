const { pool, facePool } = require('../config/database');

async function runCleanup() {
  console.log('=== STARTING DATABASE CLEANUP ===');
  
  const dbClient = await pool.connect();
  const faceClient = await facePool.connect();
  
  try {
    // 1. Clean Main Database (attendance_system)
    console.log('Starting main database transaction...');
    await dbClient.query('BEGIN');
    
    // Ensure system-retained users exist (seed if missing)
    console.log('Ensuring system-retained users (teacher and EMP001) exist...');
    await dbClient.query(`
      INSERT INTO students (
        student_id, first_name, last_name, email, phone_number, department, position, role, hire_date, is_active, password_hash, password_changed_at, failed_login_count, locked_until, metadata, created_at, updated_at
      ) VALUES (
        'teacher', 'Teacher', 'User', 'teacher@attendance-system.local', '+1-555-0200', 'Management', 'Team Teacher', 'teacher', CURRENT_DATE, TRUE, '$2a$10$7GfM9N7hE293W8P0fT4PLuB5zflrh3N7Y2MOiGGr4VooKPkjRyGOa', CURRENT_TIMESTAMP, 0, NULL, '{"default_teacher": true}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) ON CONFLICT (student_id) DO UPDATE SET is_active = TRUE
    `);

    await dbClient.query(`
      INSERT INTO students (
        student_id, first_name, last_name, email, phone_number, department, position, role, is_active, password_hash, hire_date, created_at, updated_at
      ) VALUES (
        'EMP001', 'Lip', 'Bal', 'li25@go.in', '8989898563', 'Computer Science Engineering (CSE)', 'Teacher', 'student', TRUE, '$2a$10$dwChwHNlo2FYCkD.6SnhTOauQEpFwOXbMtk.FfPlAf2ewpQSURzHy', '2026-06-23', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) ON CONFLICT (student_id) DO UPDATE SET is_active = TRUE
    `);

    // Fetch database IDs of retained students
    const retainedRes = await dbClient.query(`
      SELECT id, student_id FROM students WHERE student_id IN ('admin', 'teacher', 'EMP001')
    `);
    const retainedMap = {};
    retainedRes.rows.forEach(row => {
      retainedMap[row.student_id] = row.id;
    });
    
    const adminId = retainedMap['admin'];
    const teacherId = retainedMap['teacher'];
    const emp001Id = retainedMap['EMP001'];
    
    if (!adminId || !teacherId || !emp001Id) {
      throw new Error(`Failed to find database IDs for all retained students: admin=${adminId}, teacher=${teacherId}, EMP001=${emp001Id}`);
    }

    const retainedIdsCsv = [adminId, teacherId, emp001Id].join(',');

    // Update self-referential foreign keys to NULL first for records that will be deleted
    console.log('Updating self-referential foreign keys in students table...');
    await dbClient.query(`
      UPDATE students 
      SET teacher_id = NULL, deleted_by = NULL, face_enrolled_by = NULL 
      WHERE id NOT IN (${retainedIdsCsv})
    `);
    
    const tablesToClean = [
      { name: 'student_attendance', query: `DELETE FROM student_attendance WHERE student_id NOT IN (${retainedIdsCsv})` },
      { name: 'leave_approval_history', query: `
        DELETE FROM leave_approval_history 
        WHERE actor_student_id NOT IN (${retainedIdsCsv}) 
           OR leave_request_id IN (SELECT id FROM leave_requests WHERE student_id NOT IN (${retainedIdsCsv}))
      ` },
      { name: 'leave_requests', query: `
        DELETE FROM leave_requests 
        WHERE student_id NOT IN (${retainedIdsCsv}) 
           OR teacher_id NOT IN (${retainedIdsCsv}) 
           OR approved_by NOT IN (${retainedIdsCsv}) 
           OR approver_id NOT IN (${retainedIdsCsv})
      ` },
      { name: 'leave_balance', query: `DELETE FROM leave_balance WHERE student_id NOT IN (${retainedIdsCsv})` },
      { name: 'student_reports', query: `
        DELETE FROM student_reports 
        WHERE student_id NOT IN (${retainedIdsCsv}) 
           OR teacher_id NOT IN (${retainedIdsCsv}) 
           OR approved_by NOT IN (${retainedIdsCsv})
      ` },
      { name: 'login_logs', query: `DELETE FROM login_logs WHERE student_id NOT IN (${retainedIdsCsv})` },
      { name: 'security_events', query: `DELETE FROM security_events WHERE student_id NOT IN (${retainedIdsCsv})` },
      { name: 'refresh_tokens', query: `DELETE FROM refresh_tokens WHERE student_id NOT IN (${retainedIdsCsv})` },
      { name: 'notifications', query: `
        DELETE FROM notifications 
        WHERE student_id NOT IN (${retainedIdsCsv}) 
           OR recipient_id NOT IN (${retainedIdsCsv}) 
           OR sender_id NOT IN (${retainedIdsCsv})
      ` },
      { name: 'audit_logs', query: `DELETE FROM audit_logs WHERE actor_student_id NOT IN (${retainedIdsCsv}) OR user_id NOT IN (${retainedIdsCsv})` },
      { name: 'work_timings', query: `DELETE FROM work_timings WHERE student_id NOT IN (${retainedIdsCsv})` },
      { name: 'device_fingerprints', query: `DELETE FROM device_fingerprints WHERE student_id NOT IN (${retainedIdsCsv})` },
      { name: 'impossible_travel_events', query: `DELETE FROM impossible_travel_events WHERE student_id NOT IN (${retainedIdsCsv}) OR resolved_by NOT IN (${retainedIdsCsv})` },
      { name: 'student_login_locations', query: `DELETE FROM student_login_locations WHERE student_id NOT IN (${retainedIdsCsv})` },
      { name: 'face_approval_history', query: `DELETE FROM face_approval_history WHERE actioned_by NOT IN (${retainedIdsCsv})` },
      { name: 'face_approval_requests', query: `DELETE FROM face_approval_requests WHERE request_id IN (SELECT id FROM face_change_requests WHERE student_id NOT IN (${retainedIdsCsv}) OR requested_by NOT IN (${retainedIdsCsv}))` },
      { name: 'face_change_requests', query: `DELETE FROM face_change_requests WHERE student_id NOT IN (${retainedIdsCsv}) OR requested_by NOT IN (${retainedIdsCsv})` },
      { name: 'face_update_requests', query: `DELETE FROM face_update_requests WHERE requester_id NOT IN (${retainedIdsCsv}) OR approver_id NOT IN (${retainedIdsCsv})` },
      { name: 'face_audit_logs', query: `DELETE FROM face_audit_logs WHERE student_id NOT IN (${retainedIdsCsv}) OR performed_by NOT IN (${retainedIdsCsv})` },
      { name: 'face_enrollment_logs', query: `DELETE FROM face_enrollment_logs WHERE student_id NOT IN (${retainedIdsCsv}) OR target_student_id NOT IN (${retainedIdsCsv})` },
      { name: 'face_embeddings', query: `DELETE FROM face_embeddings WHERE student_id NOT IN (${retainedIdsCsv}) OR enrolled_by NOT IN (${retainedIdsCsv})` },
      { name: 'team_members', query: `DELETE FROM team_members WHERE student_id NOT IN (${retainedIdsCsv})` },
      { name: 'team_config', query: `DELETE FROM team_config WHERE team_lead_id NOT IN (${retainedIdsCsv})` },
      { name: 'role_assignments', query: `DELETE FROM role_assignments WHERE student_id NOT IN (${retainedIdsCsv}) OR assigned_by NOT IN (${retainedIdsCsv})` },
      { name: 'account_recovery_audit_log', query: `
        DELETE FROM account_recovery_audit_log 
        WHERE actor_id NOT IN (${retainedIdsCsv}) 
           OR recovery_id IN (
             SELECT id FROM account_recovery_requests 
             WHERE student_id NOT IN (${retainedIdsCsv}) 
                OR requested_by NOT IN (${retainedIdsCsv}) 
                OR reviewed_by NOT IN (${retainedIdsCsv}) 
                OR completed_by NOT IN (${retainedIdsCsv})
           )
      ` },
      { name: 'account_recovery_requests', query: `
        DELETE FROM account_recovery_requests 
        WHERE student_id NOT IN (${retainedIdsCsv}) 
           OR requested_by NOT IN (${retainedIdsCsv}) 
           OR reviewed_by NOT IN (${retainedIdsCsv}) 
           OR completed_by NOT IN (${retainedIdsCsv})
      ` },
      { name: 'admin_configuration', query: `DELETE FROM admin_configuration WHERE admin_student_id NOT IN (${retainedIdsCsv})` },
      { name: 'student_relationships', query: `DELETE FROM student_relationships WHERE student_id NOT IN (${retainedIdsCsv}) OR teacher_id NOT IN (${retainedIdsCsv})` },
      { name: 'password_reset_requests', query: `DELETE FROM password_reset_requests WHERE requester_id NOT IN (${retainedIdsCsv}) OR approver_id NOT IN (${retainedIdsCsv})` },
      { name: 'teacher_assignments', query: `
        DELETE FROM teacher_assignments 
        WHERE teacher_id NOT IN (${retainedIdsCsv}) 
           OR student_id NOT IN (${retainedIdsCsv}) 
           OR assigned_by NOT IN (${retainedIdsCsv}) 
           OR unassigned_by NOT IN (${retainedIdsCsv})
      ` },
      { name: 'students', query: `DELETE FROM students WHERE id NOT IN (${retainedIdsCsv})` }
    ];

    for (const tbl of tablesToClean) {
      console.log(`Cleaning table ${tbl.name}...`);
      const res = await dbClient.query(tbl.query);
      console.log(`Deleted ${res.rowCount} rows from ${tbl.name}.`);
    }

    // Link EMP001 to teacher (trigger will sync student_relationships and teacher_assignments)
    console.log('Restoring student-teacher connection for EMP001...');
    await dbClient.query(`
      UPDATE students 
      SET teacher_id = $1
      WHERE student_id = 'EMP001'
    `, [teacherId]);

    await dbClient.query('COMMIT');
    console.log('✅ Main database transaction committed successfully.');

    // 2. Clean Face Database (attendance_face_system)
    console.log('Starting face database transaction...');
    await faceClient.query('BEGIN');

    const faceTablesToClean = [
      { name: 'user_images', query: `DELETE FROM user_images WHERE user_id NOT IN (${retainedIdsCsv})` },
      { name: 'users', query: `DELETE FROM users WHERE user_id NOT IN (${retainedIdsCsv})` },
      { name: 'face_embeddings', query: `DELETE FROM face_embeddings WHERE student_id NOT IN (${retainedIdsCsv}) OR enrolled_by NOT IN (${retainedIdsCsv})` },
      { name: 'face_enrollment_logs', query: `DELETE FROM face_enrollment_logs WHERE student_id NOT IN (${retainedIdsCsv}) OR target_student_id NOT IN (${retainedIdsCsv})` },
      { name: 'face_approval_history', query: `
        DELETE FROM face_approval_history 
        WHERE request_id IN (SELECT id FROM face_change_requests WHERE student_id NOT IN (${retainedIdsCsv}) OR requested_by NOT IN (${retainedIdsCsv}))
      ` },
      { name: 'face_approval_requests', query: `
        DELETE FROM face_approval_requests 
        WHERE request_id IN (SELECT id FROM face_change_requests WHERE student_id NOT IN (${retainedIdsCsv}) OR requested_by NOT IN (${retainedIdsCsv}))
      ` },
      { name: 'face_change_requests', query: `DELETE FROM face_change_requests WHERE student_id NOT IN (${retainedIdsCsv}) OR requested_by NOT IN (${retainedIdsCsv})` },
      { name: 'face_audit_logs', query: `DELETE FROM face_audit_logs WHERE student_id NOT IN (${retainedIdsCsv}) OR performed_by NOT IN (${retainedIdsCsv})` }
    ];

    for (const tbl of faceTablesToClean) {
      console.log(`Cleaning table ${tbl.name} in face DB...`);
      const res = await faceClient.query(tbl.query);
      console.log(`Deleted ${res.rowCount} rows from ${tbl.name} in face DB.`);
    }

    await faceClient.query('COMMIT');
    console.log('✅ Face database transaction committed successfully.');
    console.log('=== DATABASE CLEANUP COMPLETED SUCCESSFULLY ===');
    
  } catch (error) {
    console.error('❌ Error executing database cleanup. Rolling back...', error);
    await dbClient.query('ROLLBACK').catch(e => console.error('Failed to rollback main DB:', e));
    await faceClient.query('ROLLBACK').catch(e => console.error('Failed to rollback face DB:', e));
    process.exit(1);
  } finally {
    dbClient.release();
    faceClient.release();
    await pool.end();
    await facePool.end();
  }
}

runCleanup();
