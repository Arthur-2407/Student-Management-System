const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'attendance_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const facePool = new Pool({
  host: process.env.FACE_DB_HOST || 'postgres-face',
  port: parseInt(process.env.FACE_DB_PORT || '5432'),
  database: process.env.FACE_DB_NAME || 'attendance_face_system',
  user: process.env.FACE_DB_USER || 'face_admin',
  password: process.env.FACE_DB_PASSWORD || 'securefacepassword123',
});

async function main() {
  try {
    // Get database ID of the admin from employees table
    const adminRes = await pool.query("SELECT id FROM employees WHERE employee_id = 'admin'");
    if (adminRes.rows.length === 0) {
      console.log('Admin employee record not found.');
      return;
    }
    const adminId = adminRes.rows[0].id;

    // Deactivate mock face embedding for admin so bootstrap mode is enabled again
    const deactivateResult = await facePool.query(`
      UPDATE face_embeddings SET is_active = FALSE, updated_at = NOW()
      WHERE employee_id = $1
    `, [adminId]);
    console.log('Deactivated face embeddings:', deactivateResult.rowCount);

    // Mark admin as face_enrolled = FALSE to trigger bootstrap mode
    const enrollResult = await pool.query(`
      UPDATE employees 
      SET face_enrolled = FALSE, face_enrolled_at = NULL, face_enrolled_by = NULL, updated_at = NOW()
      WHERE employee_id = 'admin'
    `);
    console.log('Reset face_enrolled flag:', enrollResult.rowCount);

    // Verify final state
    const verify = await pool.query(`
      SELECT employee_id, face_enrolled, failed_login_count, locked_until, is_active
      FROM employees WHERE employee_id = 'admin'
    `);
    console.log('Admin state:', JSON.stringify(verify.rows[0]));

    const embeddingCheck = await facePool.query(`
      SELECT COUNT(*) as count, is_active
      FROM face_embeddings
      WHERE employee_id = $1
      GROUP BY is_active
    `, [adminId]);
    console.log('Embedding counts by is_active:', JSON.stringify(embeddingCheck.rows));

    console.log('\n✅ Admin face enrollment reset complete - Bootstrap mode is now ACTIVE');
    console.log('The admin can now go to /setup/admin-face to complete setup with their real face');

  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
    await facePool.end();
  }
}

main();
