const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'attendance_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function main() {
  try {
    // Deactivate mock face embedding for admin so bootstrap mode is enabled again
    const deactivateResult = await pool.query(`
      UPDATE face_embeddings SET is_active = FALSE, updated_at = NOW()
      WHERE employee_id = (SELECT id FROM employees WHERE employee_id = 'admin')
    `);
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

    const embeddingCheck = await pool.query(`
      SELECT COUNT(*) as count, fe.is_active
      FROM face_embeddings fe
      JOIN employees e ON fe.employee_id = e.id
      WHERE e.employee_id = 'admin'
      GROUP BY fe.is_active
    `);
    console.log('Embedding counts by is_active:', JSON.stringify(embeddingCheck.rows));

    console.log('\n✅ Admin face enrollment reset complete - Bootstrap mode is now ACTIVE');
    console.log('The admin can now go to /setup/admin-face to complete setup with their real face');

  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

main();
