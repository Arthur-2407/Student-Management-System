/**
 * Reset Admin Face Enrollment & Unlock Account
 * 
 * Run from inside student-backend-prod:
 *   docker exec student-backend-prod node reset_admin_for_real_face.js
 */

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
    // 1. Get admin internal ID
    const adminRes = await pool.query("SELECT id, student_id, face_enrolled, failed_login_count, locked_until FROM students WHERE student_id = 'admin' OR role = 'admin'");
    if (adminRes.rows.length === 0) {
      console.error('❌ Admin student record not found.');
      return;
    }
    const admin = adminRes.rows[0];
    const adminId = admin.id;
    console.log('Current admin state:', JSON.stringify(admin, null, 2));

    // 2. Deactivate ALL face embeddings for admin in face DB
    const deactivateResult = await facePool.query(
      `UPDATE face_embeddings SET is_active = FALSE, updated_at = NOW() WHERE student_id = $1`,
      [adminId]
    );
    console.log(`✅ Deactivated ${deactivateResult.rowCount} face embeddings in face_embeddings table.`);

    // 3. Delete all user_images for admin in face DB
    const deleteImages = await facePool.query(
      `DELETE FROM user_images WHERE user_id = $1`,
      [adminId]
    );
    console.log(`✅ Deleted ${deleteImages.rowCount} user images from user_images table.`);

    // 4. Delete user record from face DB users table (if exists)
    try {
      const deleteUser = await facePool.query(
        `DELETE FROM users WHERE user_id = $1`,
        [adminId]
      );
      console.log(`✅ Deleted ${deleteUser.rowCount} user record(s) from users table.`);
    } catch (e) {
      console.log('ℹ️  users table may not exist or has no record - continuing.');
    }

    // 5. Reset admin face_enrolled flag and unlock account in main DB
    const updateResult = await pool.query(
      `UPDATE students 
       SET face_enrolled = FALSE, 
           face_enrolled_at = NULL,
           face_enrolled_by = NULL,
           failed_login_count = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE student_id = 'admin' OR role = 'admin'`
    );
    console.log(`✅ Reset face_enrolled=FALSE and unlocked account for ${updateResult.rowCount} admin row(s).`);

    // 6. Verify final state
    const verify = await pool.query(
      `SELECT student_id, face_enrolled, failed_login_count, locked_until, is_active FROM students WHERE student_id = 'admin' OR role = 'admin'`
    );
    console.log('\n=== Final Admin State ===');
    console.log(JSON.stringify(verify.rows[0], null, 2));

    const embeddingCheck = await facePool.query(
      `SELECT COUNT(*) as count, is_active FROM face_embeddings WHERE student_id = $1 GROUP BY is_active`,
      [adminId]
    );
    console.log('\n=== Face Embedding Counts (by is_active) ===');
    console.log(JSON.stringify(embeddingCheck.rows, null, 2));

    console.log('\n✅ Admin face enrollment reset complete!');
    console.log('📸 Bootstrap mode is now ACTIVE.');

  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
    await facePool.end();
  }
}

main();
