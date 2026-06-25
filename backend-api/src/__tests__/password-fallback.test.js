/**
 * Password Fallback Security Feature Tests
 */

process.env.PORT = '0'; // Bind to random port
process.env.RUN_MIGRATIONS = 'false';
process.env.NODE_ENV = 'test';

const mockQuery = jest.fn();

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

jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 1, studentId: 'admin', role: 'admin', department: 'IT' };
    return next();
  },
  generateTokens: jest.fn().mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' }),
  verifyRefreshToken: jest.fn().mockReturnValue({ jti: 'jti', tokenFamily: 'family' }),
  authorizeRole: (...allowedRoles) => (req, res, next) => {
    next();
  },
  requireRole: () => (req, res, next) => {
    req.user = { id: 1, studentId: 'admin', role: 'admin', department: 'IT' };
    next();
  },
  requirePermission: () => (req, res, next) => next(),
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
const bcrypt = require('bcryptjs');

describe('Student Initial Password Fallback Logic', () => {
  afterAll(async () => {
    if (io) {
      await new Promise(resolve => io.close(resolve));
    }
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  test('Creates student with custom password if provided', async () => {
    // Mock check if student exists (0 rows returned = doesn't exist)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Mock insert student returning details
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 10,
        student_id: 'EMP005',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.company',
        role: 'student'
      }]
    });

    const response = await request(app)
      .post('/api/admin/students')
      .send({
        studentId: 'EMP005',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.company',
        department: 'Engineering',
        position: 'Developer',
        role: 'student',
        hireDate: '2026-06-17',
        password: 'hello'
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);

    // Verify the query parameters passed to insert
    const insertCall = mockQuery.mock.calls[2];
    const insertParams = insertCall[1];
    const passwordHash = insertParams[10];

    // Verify password hash is actually matching 'hello'
    const match = await bcrypt.compare('hello', passwordHash);
    expect(match).toBe(true);
  });

  test('Creates student using studentId as password if password is left blank', async () => {
    // Mock check if student exists (0 rows returned = doesn't exist)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Mock insert student returning details
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 11,
        student_id: 'EMP006',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@test.company',
        role: 'student'
      }]
    });

    const response = await request(app)
      .post('/api/admin/students')
      .send({
        studentId: 'EMP006',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@test.company',
        department: 'Engineering',
        position: 'Developer',
        role: 'student',
        hireDate: '2026-06-17',
        password: '' // empty string
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);

    // Verify the query parameters passed to insert
    const insertCall = mockQuery.mock.calls[2];
    const insertParams = insertCall[1];
    const passwordHash = insertParams[10];

    // Verify password hash is matching 'EMP006' (the studentId)
    const match = await bcrypt.compare('EMP006', passwordHash);
    expect(match).toBe(true);
  });

  describe('Student Password Update Logic', () => {
    test('Allows changing password for a normal student', async () => {
      // Mock select target student
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 12, student_id: 'EMP007' }]
      });
      // Mock update student in DB
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 12, student_id: 'EMP007', first_name: 'Bob', last_name: 'Builder' }]
      });

      const response = await request(app)
        .put('/api/admin/students/EMP007')
        .send({
          password: 'new-secure-password'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify updates queries
      const updateCall = mockQuery.mock.calls[1];
      const updatesSql = updateCall[0];
      const updateParams = updateCall[1];

      expect(updatesSql).toContain('password_hash');
      const passwordHash = updateParams[1];
      const match = await bcrypt.compare('new-secure-password', passwordHash);
      expect(match).toBe(true);
    });

    test('Rejects changing password for the admin account via student update route', async () => {
      // Mock select target student
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, student_id: 'admin' }]
      });

      const response = await request(app)
        .put('/api/admin/students/admin')
        .send({
          password: 'admin-new-password'
        });

      expect(response.statusCode).toBe(403);
      expect(response.body.error).toContain('Cannot change password for admin account');
    });
  });
});
