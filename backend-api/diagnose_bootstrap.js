
const { Pool } = require('pg');
require('dotenv').config();

const mainPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'student_management',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

const facePool = new Pool({
  host: process.env.FACE_DB_HOST || 'localhost',
  port: Number(process.env.FACE_DB_PORT || 5432),
  database: process.env.FACE_DB_NAME || 'attendance_face_system',
  user: process.env.FACE_DB_USER || 'face_admin',
  password: process.env.FACE_DB_PASSWORD || 'securefacepassword123',
});

async function check() {
  try {
    const adminRes = await mainPool.query(
      "SELECT id, student_id, role, face_enrolled FROM students WHERE (student_id = 'admin' OR role = 'admin') AND is_active = TRUE LIMIT 1"
    );
    console.log('Admin rows from main DB:', JSON.stringify(adminRes.rows));

    if (adminRes.rows.length > 0) {
      const adminId = adminRes.rows[0].id;
      const faceRes = await facePool.query(
        'SELECT id, student_id, is_active FROM face_embeddings WHERE student_id = $1 AND is_active = TRUE LIMIT 5',
        [adminId]
      );
      console.log('Active face embeddings in face DB:', JSON.stringify(faceRes.rows));
      console.log('hasAdminFace:', faceRes.rows.length > 0);
      console.log('bootstrapMode (hasAdminFace=false means bootstrap=true):', faceRes.rows.length === 0);
    } else {
      console.log('NO admin found in main DB => bootstrapMode would be true (but could still be a bug if admin lookup fails)');
    }

    // Also check all face_embeddings for any student_id that looks admin-like
    const allFaceRes = await facePool.query(
      'SELECT id, student_id, is_active FROM face_embeddings ORDER BY id DESC LIMIT 10'
    );
    console.log('All face_embeddings (last 10):', JSON.stringify(allFaceRes.rows));

    // Check students table for admin role
    const allAdmins = await mainPool.query(
      "SELECT id, student_id, role, face_enrolled, is_active FROM students WHERE role = 'admin' OR student_id ILIKE 'admin%'"
    );
    console.log('All admin-related students:', JSON.stringify(allAdmins.rows));

  } catch(e) {
    console.error('Error:', e.message, e.stack);
  } finally {
    await mainPool.end().catch(() => {});
    await facePool.end().catch(() => {});
  }
}

check();
