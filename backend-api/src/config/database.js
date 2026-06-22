const { Pool } = require('pg');
const { logger } = require('./logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'attendance_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 3000),
});

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT']);
const RETRYABLE_MESSAGES = ['connection terminated', 'timeout exceeded', 'Client was closed'];

function isRetryable(error) {
  if (RETRYABLE_CODES.has(error.code)) return true;
  return RETRYABLE_MESSAGES.some((message) => error.message && error.message.includes(message));
}

async function withRetry(fn, maxAttempts = 3, baseDelayMs = 200, label = 'DB operation') {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isRetryable(error)) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn('[DB] transient operation failure; retrying', {
          label,
          attempt,
          maxAttempts,
          delay,
          error: error.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError;
}

async function connectDB(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let client;

    try {
      client = await pool.connect();
      logger.info('PostgreSQL connected successfully');

      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
        logger.info('pgvector extension is available');
      } catch (extensionError) {
        logger.warn('pgvector extension is unavailable; continuing without vector indexes', {
          error: extensionError.message,
        });
      }

      return true;
    } catch (error) {
      logger.error(`Database connection attempt ${attempt}/${maxAttempts} failed`, {
        error: error.message,
      });

      if (attempt >= maxAttempts) {
        throw error;
      }

      const delay = 1000 * attempt;
      logger.info(`Retrying database connection in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      if (client) client.release();
    }
  }

  return false;
}

async function query(text, params) {
  return withRetry(async () => {
    const start = Date.now();

    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;

      if (process.env.NODE_ENV === 'development') {
        logger.debug('Executed query', {
          text,
          duration,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      logger.error('Database query error', {
        code: error.code,
        error: error.message,
      });
      throw error;
    }
  }, 3, 200, `query: ${String(text).substring(0, 80)}`);
}

const facePool = new Pool({
  host: process.env.FACE_DB_HOST || 'localhost',
  port: Number(process.env.FACE_DB_PORT || 5432),
  database: process.env.FACE_DB_NAME || 'attendance_face_system',
  user: process.env.FACE_DB_USER || 'face_admin',
  password: process.env.FACE_DB_PASSWORD || 'securefacepassword123',
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 3000),
});

async function faceQuery(text, params) {
  return withRetry(async () => {
    const start = Date.now();

    try {
      const result = await facePool.query(text, params);
      const duration = Date.now() - start;

      if (process.env.NODE_ENV === 'development') {
        logger.debug('Executed face query', {
          text,
          duration,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      logger.error('Face database query error', {
        code: error.code,
        error: error.message,
      });
      throw error;
    }
  }, 3, 200, `faceQuery: ${String(text).substring(0, 80)}`);
}

async function initializeFaceSchema(client) {
  // Create tables in correct dependency order
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INT PRIMARY KEY,
      name VARCHAR(100)
    );

    CREATE TABLE IF NOT EXISTS user_images (
      image_id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
      image_data BYTEA,
      image_hash VARCHAR(64),
      face_embedding JSON,
      verification_status VARCHAR(20),
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS face_embeddings (
      id            BIGSERIAL PRIMARY KEY,
      student_id   INTEGER NOT NULL,
      embedding_vector TEXT NOT NULL,
      embedding_version VARCHAR(20) NOT NULL DEFAULT '1.0',
      confidence_score FLOAT,
      model_name    VARCHAR(100) DEFAULT 'face-recognition-v1',
      enrolled_by   INTEGER,
      enrollment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_verified_at TIMESTAMPTZ,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_face_embeddings_student ON face_embeddings(student_id);
    CREATE INDEX IF NOT EXISTS idx_face_embeddings_active ON face_embeddings(student_id) WHERE is_active = TRUE;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS face_change_requests (
      id            BIGSERIAL PRIMARY KEY,
      student_id   INTEGER NOT NULL,
      request_type  VARCHAR(20) NOT NULL CHECK (request_type IN ('ADD', 'UPDATE', 'REPLACE', 'DELETE')),
      requested_by  INTEGER NOT NULL,
      new_face_embedding TEXT,
      previous_face_embedding TEXT,
      status        VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at    TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_face_change_requests_student ON face_change_requests(student_id);
    CREATE INDEX IF NOT EXISTS idx_face_change_requests_status ON face_change_requests(status);
    CREATE INDEX IF NOT EXISTS idx_face_change_requests_not_deleted ON face_change_requests(created_at DESC) WHERE deleted_at IS NULL;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS face_approval_requests (
      id                    BIGSERIAL PRIMARY KEY,
      request_id            BIGINT NOT NULL REFERENCES face_change_requests(id) ON DELETE CASCADE,
      assigned_approver_role VARCHAR(20) NOT NULL CHECK (assigned_approver_role IN ('admin', 'teacher')),
      status                VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_face_approval_requests_request ON face_approval_requests(request_id);
    CREATE INDEX IF NOT EXISTS idx_face_approval_requests_role ON face_approval_requests(assigned_approver_role) WHERE status = 'PENDING';
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS face_approval_history (
      id              BIGSERIAL PRIMARY KEY,
      request_id      BIGINT NOT NULL REFERENCES face_change_requests(id) ON DELETE CASCADE,
      action          VARCHAR(20) NOT NULL CHECK (action IN ('APPROVE', 'REJECT')),
      actioned_by     INTEGER NOT NULL,
      actioned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_face_approval_hist_request ON face_approval_history(request_id);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS face_audit_logs (
      id                    BIGSERIAL PRIMARY KEY,
      student_id           INTEGER NOT NULL,
      action                VARCHAR(20) NOT NULL CHECK (action IN ('ADD', 'UPDATE', 'REPLACE', 'DELETE')),
      performed_by          INTEGER NOT NULL,
      previous_embedding_id BIGINT,
      new_embedding_id      BIGINT,
      ip_address            INET,
      device_info           TEXT,
      timestamp             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_face_audit_logs_student ON face_audit_logs(student_id);
    CREATE INDEX IF NOT EXISTS idx_face_audit_logs_timestamp ON face_audit_logs(timestamp DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS face_enrollment_logs (
      id              BIGSERIAL PRIMARY KEY,
      student_id     INTEGER,
      target_student_id INTEGER,
      action          VARCHAR(30) NOT NULL CHECK (action IN (
        'ENROLL', 'UPDATE', 'DELETE', 'VERIFY_SUCCESS', 'VERIFY_FAIL',
        'ENROLLMENT_REJECTED', 'ENROLLMENT_APPROVED'
      )),
      performed_by_role VARCHAR(20),
      confidence_score FLOAT,
      embedding_version VARCHAR(20),
      ip_address      INET,
      device_info     TEXT,
      reason          TEXT,
      previous_embedding_id BIGINT,
      details         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_face_logs_student ON face_enrollment_logs(student_id);
    CREATE INDEX IF NOT EXISTS idx_face_logs_target ON face_enrollment_logs(target_student_id);
    CREATE INDEX IF NOT EXISTS idx_face_logs_created ON face_enrollment_logs(created_at DESC);
  `);
}

async function seedFaceDatabase() {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  try {
    const countRes = await faceQuery('SELECT COUNT(*) FROM face_embeddings');
    if (parseInt(countRes.rows[0].count, 10) > 0) {
      return; // Already seeded
    }

    const adminRes = await query("SELECT id FROM students WHERE student_id = 'admin'");
    const teacherRes = await query("SELECT id FROM students WHERE student_id = 'teacher'");

    const v_vector = '[0.6,0.9207,0.9546,0.5706,0.1216,0.0205,0.3603,0.8285,0.9947,0.7061,0.228,0,0.2317,0.7101,0.9953,0.8251,0.356,0.0193,0.1245,0.5749,0.9565,0.9183,0.4956,0.0769,0.0472,0.4338,0.8813,0.9782,0.6355,0.1682,0.006,0.298,0.7757,1,0.7645,0.2859,0.0041,0.1782,0.6482,0.9819,0.8726,0.4207,0.0417,0.0841,0.5089,0.9255,0.9509,0.5618,0.1159,0.0231,0.3688,0.8351,0.9933,0.698,0.2206,0.0001,0.2392,0.7181,0.9964,0.8184,0.3476,0.0169,0.1304,0.5837,0.96,0.9134,0.4867,0.0722,0.051,0.4426,0.8869,0.9755,0.6269,0.1616,0.0074,0.3061,0.7831,0.9998,0.757,0.2779,0.0031,0.1851,0.6566,0.9842,0.8666,0.412,0.0383,0.0891,0.5177,0.93,0.947,0.553,0.1103,0.0259,0.3774,0.8416,0.9918,0.6898,0.2133,0.0004,0.2468,0.726,0.9974,0.8115,0.3392,0.0147,0.1364,0.5924,0.9634,0.9084,0.4779,0.0677,0.055,0.4514,0.8925,0.9727,0.6183,0.1552,0.009,0.3143,0.7903,0.9994,0.7494,0.27,0.0022,0.192,0.665,0.9863,0.8605,0.4033,0.0349,0.0942,0.5265,0.9345,0.943,0.5442,0.1048,0.0287,0.386,0.848,0.9901,0.6816,0.2061,0.0008,0.2545,0.7339,0.9982,0.8045,0.3308,0.0127,0.1426,0.6011,0.9667,0.9032,0.469,0.0633,0.0591,0.4602,0.8979,0.9698,0.6097,0.1488,0.0108,0.3225,0.7975,0.9989,0.7416,0.2622,0.0014,0.199,0.6733,0.9883,0.8543,0.3946,0.0318,0.0994,0.5354,0.9388,0.9388,0.5354,0.0994,0.0318,0.3946,0.8543,0.9883,0.6733,0.199,0.0014,0.2622,0.7417,0.9989,0.7975,0.3225,0.0108,0.1488,0.6097,0.9698,0.8979,0.4602,0.0591,0.0634,0.4691,0.9032,0.9667,0.6011,0.1426,0.0127,0.3308,0.8045,0.9982,0.7339,0.2545,0.0008,0.2061,0.6816,0.9901,0.848,0.386,0.0287,0.1048,0.5442,0.943,0.9345,0.5265,0.0942,0.035,0.4033,0.8605,0.9863,0.665,0.192,0.0022,0.2701,0.7494,0.9994,0.7903,0.3143,0.009,0.1552,0.6183,0.9727,0.8925,0.4514,0.055,0.0677,0.4779,0.9084,0.9634,0.5924,0.1364,0.0147,0.3392,0.8115,0.9974,0.726,0.2468,0.0004,0.2133,0.6898,0.9918,0.8416,0.3774,0.0259,0.1103,0.553,0.947,0.93,0.5177,0.0891,0.0383,0.412,0.8666,0.9842,0.6566,0.185,0.0031,0.278,0.757,0.9998,0.783,0.3061,0.0074,0.1616,0.6269,0.9755,0.8869,0.4426,0.051,0.0722,0.4867,0.9134,0.96,0.5837,0.1304,0.0169,0.3476,0.8184,0.9964,0.7181,0.2392,0.0001,0.2206,0.698,0.9933,0.8351,0.3688,0.0231,0.1159,0.5618,0.9509,0.9254,0.5088,0.0841,0.0417,0.4207,0.8726,0.9819,0.6482,0.1782,0.0041,0.2859,0.7646,1,0.7757,0.298,0.006,0.1682,0.6355,0.9782,0.8813,0.4338,0.0472,0.0769,0.4956,0.9183,0.9565,0.5749,0.1245,0.0193,0.3561,0.8252,0.9953,0.7101,0.2317,0,0.228,0.7061,0.9947,0.8285,0.3603,0.0205,0.1216,0.5706,0.9547,0.9207,0.5,0.0793,0.0454,0.4295,0.8784,0.9795,0.6397,0.1715,0.0053,0.294,0.772,1,0.7683,0.2899,0.0047,0.1749,0.644,0.9807,0.8755,0.425,0.0435,0.0817,0.5044,0.9231,0.9528,0.5662,0.1187,0.0218,0.3646,0.8318,0.994,0.702,0.2243,0,0.2355,0.7141,0.9959,0.8218,0.3518,0.0181,0.1275,0.5793,0.9583,0.9159,0.4911,0.0745,0.0491,0.4382,0.8841,0.9769,0.6312,0.1649,0.0067,0.3021,0.7794,0.9999,0.7608,0.2819,0.0036,0.1816,0.6524,0.9831,0.8696,0.4163,0.04,0.0866,0.5133,0.9278,0.949,0.5574,0.113,0.0245,0.3731,0.8384,0.9926,0.6939,0.2169,0.0002,0.243,0.7221,0.9969,0.8149,0.3434,0.0158,0.1334,0.5881,0.9617,0.9109,0.4823,0.07,0.053,0.447,0.8897,0.9741,0.6226,0.1584,0.0082,0.3102,0.7867,0.9996,0.7532,0.274,0.0026,0.1885,0.6608,0.9853,0.8636,0.4076,0.0366,0.0916,0.5221,0.9323,0.945,0.5486,0.1075,0.0273,0.3817,0.8449,0.991,0.6857,0.2097,0.0006,0.2507,0.73,0.9978,0.808,0.335,0.0137,0.1395,0.5968,0.9651,0.9058,0.4734,0.0655,0.057,0.4558,0.8952,0.9713,0.614,0.1519,0.0099,0.3184,0.7939,0.9992,0.7455,0.2661,0.0018,0.1955,0.6692,0.9873,0.8574,0.3989,0.0333,0.0968,0.531,0.9367,0.9409]';

    if (adminRes.rows.length > 0) {
      const adminId = adminRes.rows[0].id;
      await faceQuery(
        `INSERT INTO face_embeddings (student_id, embedding_vector, embedding_version, confidence_score, enrolled_by)
         VALUES ($1, $2, '1.0', 1.0, $1) ON CONFLICT DO NOTHING`,
        [adminId, v_vector]
      );
      await query("UPDATE students SET face_enrolled = TRUE, face_enrolled_at = NOW(), face_enrolled_by = $1 WHERE id = $1", [adminId]);
    }

    if (teacherRes.rows.length > 0) {
      const teacherId = teacherRes.rows[0].id;
      const adminId = adminRes.rows.length > 0 ? adminRes.rows[0].id : teacherId;
      await faceQuery(
        `INSERT INTO face_embeddings (student_id, embedding_vector, embedding_version, confidence_score, enrolled_by)
         VALUES ($1, $2, '1.0', 1.0, $3) ON CONFLICT DO NOTHING`,
        [teacherId, v_vector, adminId]
      );
      await query("UPDATE students SET face_enrolled = TRUE, face_enrolled_at = NOW(), face_enrolled_by = $2 WHERE id = $1", [teacherId, adminId]);
    }

    logger.info('PostgreSQL Face DB seeded successfully');
  } catch (err) {
    logger.error('Failed to seed face database', { error: err.message });
  }
}

async function migrateToUserImages(client) {
  try {
    const activeEmbeddings = await client.query(
      'SELECT student_id, embedding_vector, enrollment_date FROM face_embeddings WHERE is_active = TRUE'
    );
    for (const row of activeEmbeddings.rows) {
      // Fetch user details from main database
      const empRes = await query('SELECT first_name, last_name FROM students WHERE id = $1', [row.student_id]);
      if (empRes.rows.length > 0) {
        const emp = empRes.rows[0];
        const name = `${emp.first_name} ${emp.last_name}`;
        
        // Insert into users
        await client.query(
          `INSERT INTO users (user_id, name)
           VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name`,
          [row.student_id, name]
        );

        // Convert embedding_vector from string/JSON representation to JSON/object
        let emb = row.embedding_vector;
        if (typeof emb === 'string') {
          try {
            emb = JSON.parse(emb);
          } catch (e) {}
        }

        // Check if already exists in user_images
        const imgExists = await client.query('SELECT image_id FROM user_images WHERE user_id = $1 LIMIT 1', [row.student_id]);
        if (imgExists.rows.length === 0) {
          await client.query(
            `INSERT INTO user_images (user_id, face_embedding, verification_status, uploaded_at)
             VALUES ($1, $2, 'VERIFIED', $3)`,
            [row.student_id, JSON.stringify(emb), row.enrollment_date]
          );
        }
      }
    }
    logger.info('Migration of face records to users/user_images completed successfully');
  } catch (migErr) {
    logger.error('Failed to migrate face records to users/user_images', { error: migErr.message });
  }
}

async function connectFaceDB(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let client;

    try {
      client = await facePool.connect();
      logger.info('PostgreSQL Face DB connected successfully');

      // Initialize schemas for face database
      await initializeFaceSchema(client);

      // Seed if necessary
      await seedFaceDatabase();

      // Migrate to user_images
      await migrateToUserImages(client);

      return true;
    } catch (error) {
      logger.error(`Face database connection attempt ${attempt}/${maxAttempts} failed`, {
        error: error.message,
      });

      if (attempt >= maxAttempts) {
        throw error;
      }

      const delay = 1000 * attempt;
      logger.info(`Retrying face database connection in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      if (client) client.release();
    }
  }

  return false;
}

async function getClient() {
  return withRetry(() => pool.connect(), 3, 200, 'pool.connect');
}

async function isDatabaseHealthy() {
  let client;

  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    if (client) client.release();
  }
}

async function getFaceClient() {
  return withRetry(() => facePool.connect(), 3, 200, 'facePool.connect');
}

async function isFaceDatabaseHealthy() {
  let client;

  try {
    client = await facePool.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  pool,
  connectDB,
  query,
  getClient,
  isDatabaseHealthy,
  withRetry,
  facePool,
  faceQuery,
  connectFaceDB,
  getFaceClient,
  isFaceDatabaseHealthy,
};
