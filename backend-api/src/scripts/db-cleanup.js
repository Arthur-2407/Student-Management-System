const { pool, facePool } = require('../config/database');

async function runCleanup() {
  console.log('=== STARTING DATABASE CLEANUP ===');
  
  const dbClient = await pool.connect();
  const faceClient = await facePool.connect();
  
  try {
    // 1. Clean Main Database (attendance_system)
    console.log('Starting main database transaction...');
    await dbClient.query('BEGIN');
    
    // Update self-referential foreign keys to NULL first for records that will be deleted
    console.log('Updating self-referential foreign keys in students table...');
    await dbClient.query(`
      UPDATE students 
      SET teacher_id = NULL, deleted_by = NULL, face_enrolled_by = NULL 
      WHERE id != 1
    `);
    
    const tablesToClean = [
      { name: 'student_attendance', query: 'DELETE FROM student_attendance WHERE student_id != 1' },
      { name: 'leave_approval_history', query: `
        DELETE FROM leave_approval_history 
        WHERE actor_student_id != 1 
           OR leave_request_id IN (SELECT id FROM leave_requests WHERE student_id != 1)
      ` },
      { name: 'leave_requests', query: `
        DELETE FROM leave_requests 
        WHERE student_id != 1 
           OR teacher_id != 1 
           OR approved_by != 1 
           OR approver_id != 1
      ` },
      { name: 'leave_balance', query: 'DELETE FROM leave_balance WHERE student_id != 1' },
      { name: 'student_reports', query: `
        DELETE FROM student_reports 
        WHERE student_id != 1 
           OR teacher_id != 1 
           OR approved_by != 1
      ` },
      { name: 'login_logs', query: 'DELETE FROM login_logs WHERE student_id != 1' },
      { name: 'security_events', query: 'DELETE FROM security_events WHERE student_id != 1' },
      { name: 'refresh_tokens', query: 'DELETE FROM refresh_tokens WHERE student_id != 1' },
      { name: 'notifications', query: `
        DELETE FROM notifications 
        WHERE student_id != 1 
           OR recipient_id != 1 
           OR sender_id != 1
      ` },
      { name: 'audit_logs', query: 'DELETE FROM audit_logs WHERE actor_student_id != 1 OR user_id != 1' },
      { name: 'work_timings', query: 'DELETE FROM work_timings WHERE student_id != 1' },
      { name: 'device_fingerprints', query: 'DELETE FROM device_fingerprints WHERE student_id != 1' },
      { name: 'impossible_travel_events', query: 'DELETE FROM impossible_travel_events WHERE student_id != 1 OR resolved_by != 1' },
      { name: 'student_login_locations', query: 'DELETE FROM student_login_locations WHERE student_id != 1' },
      { name: 'face_approval_history', query: 'DELETE FROM face_approval_history WHERE actioned_by != 1' },
      { name: 'face_approval_requests', query: 'DELETE FROM face_approval_requests WHERE request_id IN (SELECT id FROM face_change_requests WHERE student_id != 1 OR requested_by != 1)' },
      { name: 'face_change_requests', query: 'DELETE FROM face_change_requests WHERE student_id != 1 OR requested_by != 1' },
      { name: 'face_update_requests', query: 'DELETE FROM face_update_requests WHERE requester_id != 1 OR approver_id != 1' },
      { name: 'face_audit_logs', query: 'DELETE FROM face_audit_logs WHERE student_id != 1 OR performed_by != 1' },
      { name: 'face_enrollment_logs', query: 'DELETE FROM face_enrollment_logs WHERE student_id != 1 OR target_student_id != 1' },
      { name: 'face_embeddings', query: 'DELETE FROM face_embeddings WHERE student_id != 1 OR enrolled_by != 1' },
      { name: 'team_members', query: 'DELETE FROM team_members WHERE student_id != 1' },
      { name: 'team_config', query: 'DELETE FROM team_config WHERE team_lead_id != 1' },
      { name: 'role_assignments', query: 'DELETE FROM role_assignments WHERE student_id != 1 OR assigned_by != 1' },
      { name: 'account_recovery_audit_log', query: `
        DELETE FROM account_recovery_audit_log 
        WHERE actor_id != 1 
           OR recovery_id IN (
             SELECT id FROM account_recovery_requests 
             WHERE student_id != 1 
                OR requested_by != 1 
                OR reviewed_by != 1 
                OR completed_by != 1
           )
      ` },
      { name: 'account_recovery_requests', query: `
        DELETE FROM account_recovery_requests 
        WHERE student_id != 1 
           OR requested_by != 1 
           OR reviewed_by != 1 
           OR completed_by != 1
      ` },
      { name: 'admin_configuration', query: 'DELETE FROM admin_configuration WHERE admin_student_id != 1' },
      { name: 'student_relationships', query: 'DELETE FROM student_relationships WHERE student_id != 1 OR teacher_id != 1' },
      { name: 'password_reset_requests', query: 'DELETE FROM password_reset_requests WHERE requester_id != 1 OR approver_id != 1' },
      { name: 'teacher_assignments', query: `
        DELETE FROM teacher_assignments 
        WHERE teacher_id != 1 
           OR student_id != 1 
           OR assigned_by != 1 
           OR unassigned_by != 1
      ` },
      { name: 'students', query: 'DELETE FROM students WHERE id != 1' }
    ];

    for (const tbl of tablesToClean) {
      console.log(`Cleaning table ${tbl.name}...`);
      const res = await dbClient.query(tbl.query);
      console.log(`Deleted ${res.rowCount} rows from ${tbl.name}.`);
    }

    await dbClient.query('COMMIT');
    console.log('✅ Main database transaction committed successfully.');

    // 2. Clean Face Database (attendance_face_system)
    console.log('Starting face database transaction...');
    await faceClient.query('BEGIN');

    const faceTablesToClean = [
      { name: 'user_images', query: 'DELETE FROM user_images WHERE user_id != 1' },
      { name: 'users', query: 'DELETE FROM users WHERE user_id != 1' },
      { name: 'face_embeddings', query: 'DELETE FROM face_embeddings WHERE student_id != 1 OR enrolled_by != 1' },
      { name: 'face_enrollment_logs', query: 'DELETE FROM face_enrollment_logs WHERE student_id != 1 OR target_student_id != 1' },
      { name: 'face_approval_history', query: `
        DELETE FROM face_approval_history 
        WHERE request_id IN (SELECT id FROM face_change_requests WHERE student_id != 1 OR requested_by != 1)
      ` },
      { name: 'face_approval_requests', query: `
        DELETE FROM face_approval_requests 
        WHERE request_id IN (SELECT id FROM face_change_requests WHERE student_id != 1 OR requested_by != 1)
      ` },
      { name: 'face_change_requests', query: 'DELETE FROM face_change_requests WHERE student_id != 1 OR requested_by != 1' },
      { name: 'face_audit_logs', query: 'DELETE FROM face_audit_logs WHERE student_id != 1 OR performed_by != 1' }
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
