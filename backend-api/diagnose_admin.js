const bcrypt = require('bcryptjs');
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
    const result = await pool.query("SELECT employee_id, password_hash, failed_login_count, locked_until, face_enrolled FROM employees WHERE employee_id = 'admin'");
    const row = result.rows[0];
    console.log('Employee row:', JSON.stringify({
      employee_id: row.employee_id,
      hash_length: row.password_hash ? row.password_hash.length : 0,
      hash_prefix: row.password_hash ? row.password_hash.substring(0, 15) : 'NULL',
      failed_login_count: row.failed_login_count,
      locked_until: row.locked_until,
      face_enrolled: row.face_enrolled
    }));
    
    const matchAdmin123 = await bcrypt.compare('Admin@123', row.password_hash);
    console.log("'Admin@123' matches DB hash:", matchAdmin123);
    
    const faceResult = await pool.query(`
      SELECT fe.is_active, fe.created_at 
      FROM face_embeddings fe 
      JOIN employees e ON fe.employee_id = e.id 
      WHERE e.employee_id = 'admin'
    `);
    console.log('Total face embeddings:', faceResult.rows.length);
    console.log('Face rows:', JSON.stringify(faceResult.rows));

    const bootResult = await pool.query(`
      SELECT fe.id 
      FROM face_embeddings fe 
      JOIN employees e ON fe.employee_id = e.id 
      WHERE e.employee_id = 'admin' AND fe.is_active = TRUE AND e.is_active = TRUE
    `);
    console.log('Active admin face embeddings (bootstrap off if > 0):', bootResult.rows.length);
    console.log('Bootstrap mode active:', bootResult.rows.length === 0);

  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

main();
