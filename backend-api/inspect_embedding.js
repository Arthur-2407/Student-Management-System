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
    const result = await pool.query(`
      SELECT fe.id, fe.is_active, fe.created_at, fe.confidence_score, fe.embedding_version,
             length(fe.embedding_vector::text) as embedding_text_len,
             left(fe.embedding_vector::text, 100) as embedding_preview
      FROM face_embeddings fe 
      JOIN employees e ON fe.employee_id = e.id 
      WHERE e.employee_id = 'admin'
    `);
    
    if (result.rows.length === 0) {
      console.log('No face embedding found for admin');
      return;
    }
    
    const row = result.rows[0];
    console.log('Embedding info:', JSON.stringify({
      id: row.id,
      is_active: row.is_active,
      created_at: row.created_at,
      confidence_score: row.confidence_score,
      embedding_version: row.embedding_version,
      embedding_text_len: row.embedding_text_len,
      embedding_preview: row.embedding_preview
    }, null, 2));
    
    // Parse the vector and check some properties
    const rawResult = await pool.query(`
      SELECT fe.embedding_vector::text as vec
      FROM face_embeddings fe 
      JOIN employees e ON fe.employee_id = e.id 
      WHERE e.employee_id = 'admin' AND fe.is_active = TRUE
      LIMIT 1
    `);
    
    if (rawResult.rows.length > 0) {
      const vecStr = rawResult.rows[0].vec;
      try {
        const vec = JSON.parse(vecStr);
        if (Array.isArray(vec)) {
          console.log('Embedding dimension:', vec.length);
          console.log('First 5 values:', vec.slice(0, 5));
          console.log('Last 5 values:', vec.slice(-5));
          const norm = Math.sqrt(vec.reduce((s, v) => s + v*v, 0));
          console.log('L2 norm:', norm);
          const nonZero = vec.filter(v => Math.abs(v) > 0.001).length;
          console.log('Non-zero elements:', nonZero, '/', vec.length);
          const allZero = vec.every(v => Math.abs(v) < 0.001);
          console.log('Is zero/mock vector:', allZero);
        }
      } catch(e) {
        console.log('Could not parse vector JSON:', e.message);
        console.log('Raw vec (first 200 chars):', vecStr.substring(0, 200));
      }
    }
    
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

main();
