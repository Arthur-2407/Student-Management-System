const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5434'),
  database: process.env.DB_NAME || 'student_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '3a4ec355b12ebe346d2a8ff574b5678d',
});

async function main() {
  try {
    const res = await pool.query(`
      SELECT se.*, s.student_id
      FROM security_events se
      LEFT JOIN students s ON se.student_id = s.id
      ORDER BY se.id DESC
      LIMIT 20
    `);
    console.log('Recent Security Events:');
    res.rows.forEach(row => {
      console.log(`[${row.timestamp || row.created_at || 'NO_TIME'}] ${row.student_id || 'UNKNOWN'}: ${row.event_type} (${row.severity})`);
      console.log('Details:', row.details);
      console.log('---');
    });
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
