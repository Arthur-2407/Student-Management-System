/**
 * V9 — Face Change Request and Approval Workflow Integration Tests
 */

process.env.PORT = '0'; // Bind to random port
process.env.RUN_MIGRATIONS = 'false';
process.env.NODE_ENV = 'test';

const mockQuery = jest.fn();
const mockFaceQuery = jest.fn();

jest.mock('../config/database', () => ({
  connectDB: jest.fn().mockResolvedValue(true),
  connectFaceDB: jest.fn().mockResolvedValue(true),
  isDatabaseHealthy: jest.fn().mockResolvedValue(true),
  query: mockQuery,
  faceQuery: mockQuery,
  pool: {
    end: jest.fn().mockImplementation((cb) => {
      if (cb) cb();
      return Promise.resolve();
    }),
  }
}));

jest.mock('../config/redis', () => ({
  connectRedis: jest.fn().mockResolvedValue(true),
  isRedisHealthy: jest.fn().mockResolvedValue(true),
  disconnectRedis: jest.fn().mockResolvedValue(true),
  checkRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../migrations/runMigrations', () => ({
  runMigrations: jest.fn().mockResolvedValue(true),
}));

jest.mock('axios', () => ({
  post: jest.fn().mockImplementation((url) => {
    if (url.includes('/api/register-face')) {
      return Promise.resolve({
        data: {
          success: true,
          embedding: [0.1, 0.2, 0.3],
          model_version: '2.0-facenet-vggface2',
          quality_score: 0.95
        }
      });
    }
    return Promise.reject(new Error('Not mocked'));
  })
}));

jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer admin-token') {
      req.user = { id: 1, studentId: 'admin', role: 'admin', department: 'IT' };
      return next();
    }
    if (authHeader === 'Bearer teacher-token') {
      req.user = { id: 2, studentId: 'teacher', role: 'teacher', department: 'HR' };
      return next();
    }
    if (authHeader === 'Bearer student-token') {
      req.user = { id: 3, studentId: 'EMP003', role: 'student', department: 'HR' };
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  },
  generateTokens: jest.fn().mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' }),
  verifyRefreshToken: jest.fn().mockReturnValue({ jti: 'jti', tokenFamily: 'family' }),
  authorizeRole: (...allowedRoles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Auth required' });
    if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  },
  authorizeTeacher: () => (req, res, next) => next(),
}));

// Mock http.get to bypass warmup service health checks
const http = require('http');
jest.spyOn(http, 'get').mockImplementation((url, options, callback) => {
  const cb = typeof options === 'function' ? options : callback;
  const res = { statusCode: 200 };
  if (cb) cb(res);
  return {
    on: jest.fn(),
  };
});

const request = require('supertest');
const { app, io } = require('../server');

describe('Face Approval Workflow API', () => {
  afterAll(async () => {
    if (io) {
      await new Promise(resolve => io.close(resolve));
    }
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  describe('POST /api/face-change-requests', () => {
    test('Student submits a face change request for themselves successfully', async () => {
      // 1. SELECT query to check target student
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 3, student_id: 'EMP003', role: 'student', face_enrolled: false }]
      });
      // 2. SELECT query to get previous embedding
      mockQuery.mockResolvedValueOnce({
        rows: []
      });
      // 3. BEGIN transaction
      mockQuery.mockResolvedValueOnce({
        rows: []
      });
      // 4. INSERT query for face_change_requests
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 101 }]
      });
      // 5. INSERT query for face_approval_requests
      mockQuery.mockResolvedValueOnce({
        rows: []
      });
      // 6. COMMIT transaction
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const response = await request(app)
        .post('/api/face-change-requests')
        .set('Authorization', 'Bearer student-token')
        .send({
          studentId: 'EMP003',
          requestType: 'ADD',
          frames: ['frame1_base64_data_here']
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.requestId).toBe(101);
      expect(response.body.assignedApproverRole).toBe('teacher');
    });

    test('Student cannot request face change for another student', async () => {
      // SELECT query checks target student
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 4, student_id: 'EMP004', role: 'student', face_enrolled: false }]
      });

      const response = await request(app)
        .post('/api/face-change-requests')
        .set('Authorization', 'Bearer student-token')
        .send({
          studentId: 'EMP004',
          requestType: 'ADD',
          frames: ['frame1']
        });

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Admin registers face instantly bypassing approval', async () => {
      // 1. SELECT target student
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 3, student_id: 'EMP003', role: 'student', face_enrolled: false }]
      });
      // 2. SELECT previous embedding
      mockQuery.mockResolvedValueOnce({
        rows: []
      });
      // 3. BEGIN transaction, UPDATE old embeddings, INSERT new embedding, UPDATE students...
      mockQuery.mockResolvedValue({
        rows: [{ id: 201 }]
      });

      const response = await request(app)
        .post('/api/face-change-requests')
        .set('Authorization', 'Bearer admin-token')
        .send({
          studentId: 'EMP003',
          requestType: 'ADD',
          frames: ['frame1']
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.instant).toBe(true);
    });
  });

  describe('GET /api/face-change-requests/pending', () => {
    test('Admin retrieves all pending requests', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 10, request_type: 'ADD', student_id: 'EMP003', first_name: 'John', last_name: 'Doe' }
        ]
      });

      const response = await request(app)
        .get('/api/face-change-requests/pending')
        .set('Authorization', 'Bearer admin-token');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/face-change-requests/:id/approve', () => {
    test('Teacher approves team member pending request successfully', async () => {
      // 1. SELECT request details
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10,
          student_id: 3,
          request_type: 'ADD',
          new_face_embedding: '[]',
          status: 'PENDING',
          assigned_approver_role: 'teacher',
          target_student_id: 'EMP003'
        }]
      });
      // 2. Check supervision helper query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 3 }] // supervised is true
      });
      // 3. UPDATE/INSERT transaction queries
      mockQuery.mockResolvedValue({
        rows: [{ id: 501 }]
      });

      const response = await request(app)
        .post('/api/face-change-requests/10/approve')
        .set('Authorization', 'Bearer teacher-token')
        .send({ notes: 'Verified face visually' });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Regular student cannot approve requests', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10,
          student_id: 3,
          request_type: 'ADD',
          new_face_embedding: '[]',
          status: 'PENDING',
          assigned_approver_role: 'teacher',
          target_student_id: 'EMP003'
        }]
      });

      const response = await request(app)
        .post('/api/face-change-requests/10/approve')
        .set('Authorization', 'Bearer student-token');

      expect(response.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/face-management/admin-delete/:studentId', () => {
    test('Admin deletes student face profile directly', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 3, student_id: 'EMP003', face_enrolled: true }]
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5 }]
      });
      mockQuery.mockResolvedValue({
        rows: []
      });

      const response = await request(app)
        .delete('/api/face-management/admin-delete/EMP003')
        .set('Authorization', 'Bearer admin-token');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Teacher is denied direct face deletion', async () => {
      const response = await request(app)
        .delete('/api/face-management/admin-delete/EMP003')
        .set('Authorization', 'Bearer teacher-token');

      expect(response.statusCode).toBe(403);
    });
  });
});
