const bcrypt = require('bcryptjs');
const { pool, facePool } = require('../config/database');

async function main() {
  console.log('=== RESETTING ADMIN CREDENTIALS ===');
  
  const dbClient = await pool.connect();
  const faceClient = await facePool.connect();
  
  try {
    // 1. Reset Admin Password in Main DB to Admin@123
    console.log('Generating password hash...');
    const hash = await bcrypt.hash('Admin@123', 10);
    
    await dbClient.query('BEGIN');
    
    console.log('Updating Admin password and face enrollment flags in main DB...');
    await dbClient.query(
      `UPDATE employees 
       SET password_hash = $1, 
           face_enrolled = FALSE, 
           face_enrolled_at = NULL, 
           face_enrolled_by = NULL,
           failed_login_count = 0, 
           locked_until = NULL, 
           updated_at = NOW() 
       WHERE employee_id = 'admin'`,
      [hash]
    );
    
    await dbClient.query('COMMIT');
    console.log('✅ Main DB admin credentials updated successfully.');

    // 2. Clear Face Embeddings/Images of Admin in Face DB
    await faceClient.query('BEGIN');
    
    console.log('Clearing Admin face embeddings and images in Face DB...');
    
    // Delete face_embeddings for admin (employee_id = 1)
    const delEmbed = await faceClient.query(
      'DELETE FROM face_embeddings WHERE employee_id = 1'
    );
    console.log(`Deleted ${delEmbed.rowCount} face embeddings.`);
    
    // Delete user_images for admin (user_id = 1)
    const delImg = await faceClient.query(
      'DELETE FROM user_images WHERE user_id = 1'
    );
    console.log(`Deleted ${delImg.rowCount} user images.`);
    
    // Delete face_enrollment_logs for admin
    const delLogs = await faceClient.query(
      'DELETE FROM face_enrollment_logs WHERE target_employee_id = 1 OR employee_id = 1'
    );
    console.log(`Deleted ${delLogs.rowCount} face enrollment logs.`);
    
    await faceClient.query('COMMIT');
    console.log('✅ Face DB admin face records cleared successfully.');
    
    console.log('\n=== SUCCESS ===');
    console.log('Admin password has been reset to: Admin@123');
    console.log('Admin face profile has been cleared.');
    console.log('The system is now in BOOTSTRAP SETUP mode.');
    console.log('Go to http://localhost/bootstrap to set your custom credentials and register your face.');

  } catch (err) {
    console.error('❌ Error resetting admin credentials:', err);
    await dbClient.query('ROLLBACK').catch(() => {});
    await faceClient.query('ROLLBACK').catch(() => {});
    process.exit(1);
  } finally {
    dbClient.release();
    faceClient.release();
    await pool.end();
    await facePool.end();
  }
}

main();
