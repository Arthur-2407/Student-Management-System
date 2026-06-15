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
    // Generate the correct hash for Admin@123
    const password = 'Admin@123';
    const hash = await bcrypt.hash(password, 10);
    console.log('New hash:', hash);
    console.log('Hash length:', hash.length);
    
    // Verify the hash before inserting
    const verify = await bcrypt.compare(password, hash);
    console.log('Pre-update verification:', verify);
    
    if (!verify) {
      console.error('Hash verification failed before update - aborting!');
      process.exit(1);
    }

    // Update password hash using parameterized query (safe from shell escaping!)
    const updateResult = await pool.query(
      'UPDATE employees SET password_hash = $1, failed_login_count = 0, locked_until = NULL WHERE employee_id = $2',
      [hash, 'admin']
    );
    console.log('Rows updated:', updateResult.rowCount);

    // Verify after update
    const readBack = await pool.query("SELECT password_hash, failed_login_count, locked_until FROM employees WHERE employee_id = 'admin'");
    const storedHash = readBack.rows[0].password_hash;
    console.log('Stored hash length:', storedHash.length);
    console.log('Stored hash starts with $2a:', storedHash.startsWith('$2a'));
    
    const postVerify = await bcrypt.compare(password, storedHash);
    console.log('Post-update verification (Admin@123 works):', postVerify);
    
    if (postVerify) {
      console.log('\n✅ SUCCESS: Admin password set to Admin@123 and account unlocked!');
    } else {
      console.error('\n❌ FAILED: Password verification failed after update!');
    }
    
  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

main();
