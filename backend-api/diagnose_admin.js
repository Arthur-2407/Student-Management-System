const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'student-db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'student_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'securepassword123',
});

const facePool = new Pool({
  host: process.env.FACE_DB_HOST || 'student-face-db',
  port: parseInt(process.env.FACE_DB_PORT || '5432'),
  database: process.env.FACE_DB_NAME || 'student_face_system',
  user: process.env.FACE_DB_USER || 'face_admin',
  password: process.env.FACE_DB_PASSWORD || 'securefacepassword123',
});

async function main() {
  try {
    const result = await pool.query("SELECT id, student_id, password_hash, failed_login_count, locked_until, face_enrolled FROM students WHERE student_id = 'admin' OR role = 'admin'");
    if (result.rows.length === 0) {
      console.log('Admin student record not found.');
      return;
    }
    const row = result.rows[0];
    const adminId = row.id;

    console.log('Student row:', JSON.stringify({
      student_id: row.student_id,
      hash_length: row.password_hash ? row.password_hash.length : 0,
      hash_prefix: row.password_hash ? row.password_hash.substring(0, 15) : 'NULL',
      failed_login_count: row.failed_login_count,
      locked_until: row.locked_until,
      face_enrolled: row.face_enrolled
    }));
    
    const matchAdmin123 = await bcrypt.compare('Admin@123', row.password_hash);
    console.log("'Admin@123' matches DB hash:", matchAdmin123);
    
    const faceResult = await facePool.query(`
      SELECT is_active, created_at 
      FROM face_embeddings 
      WHERE student_id = $1
    `, [adminId]);
    console.log('Total face embeddings in Face DB:', faceResult.rows.length);
    console.log('Face rows:', JSON.stringify(faceResult.rows));

    const bootResult = await facePool.query(`
      SELECT id 
      FROM face_embeddings 
      WHERE student_id = $1 AND is_active = TRUE
    `, [adminId]);
    console.log('Active admin face embeddings (bootstrap off if > 0):', bootResult.rows.length);
    console.log('Bootstrap mode active:', bootResult.rows.length === 0);

  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
    await facePool.end();
  }
}

main();
