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
    req.user = { id: 1, employeeId: 'admin', role: 'admin', department: 'IT' };
    return next();
  },
  generateTokens: jest.fn().mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' }),
  verifyRefreshToken: jest.fn().mockReturnValue({ jti: 'jti', tokenFamily: 'family' }),
  authorizeRole: (...allowedRoles) => (req, res, next) => {
    next();
  },
  requireRole: () => (req, res, next) => {
    req.user = { id: 1, employeeId: 'admin', role: 'admin', department: 'IT' };
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

describe('Employee Initial Password Fallback Logic', () => {
  afterAll(async () => {
    if (io) {
      await new Promise(resolve => io.close(resolve));
    }
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  test('Creates employee with custom password if provided', async () => {
    // Mock check if employee exists (0 rows returned = doesn't exist)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Mock insert employee returning details
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 10,
        employee_id: 'EMP005',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.company',
        role: 'employee'
      }]
    });

    const response = await request(app)
      .post('/api/admin/employees')
      .send({
        employeeId: 'EMP005',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.company',
        department: 'Engineering',
        position: 'Developer',
        role: 'employee',
        hireDate: '2026-06-17',
        password: 'hello'
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);

    // Verify the query parameters passed to insert
    const insertCall = mockQuery.mock.calls[1];
    const insertParams = insertCall[1];
    const passwordHash = insertParams[10];

    // Verify password hash is actually matching 'hello'
    const match = await bcrypt.compare('hello', passwordHash);
    expect(match).toBe(true);
  });

  test('Creates employee using employeeId as password if password is left blank', async () => {
    // Mock check if employee exists (0 rows returned = doesn't exist)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Mock insert employee returning details
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 11,
        employee_id: 'EMP006',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@test.company',
        role: 'employee'
      }]
    });

    const response = await request(app)
      .post('/api/admin/employees')
      .send({
        employeeId: 'EMP006',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@test.company',
        department: 'Engineering',
        position: 'Developer',
        role: 'employee',
        hireDate: '2026-06-17',
        password: '' // empty string
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);

    // Verify the query parameters passed to insert
    const insertCall = mockQuery.mock.calls[1];
    const insertParams = insertCall[1];
    const passwordHash = insertParams[10];

    // Verify password hash is matching 'EMP006' (the employeeId)
    const match = await bcrypt.compare('EMP006', passwordHash);
    expect(match).toBe(true);
  });

  describe('Employee Password Update Logic', () => {
    test('Allows changing password for a normal employee', async () => {
      // Mock select target employee
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 12, employee_id: 'EMP007' }]
      });
      // Mock update employee in DB
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 12, employee_id: 'EMP007', first_name: 'Bob', last_name: 'Builder' }]
      });

      const response = await request(app)
        .put('/api/admin/employees/EMP007')
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

    test('Rejects changing password for the admin account via employee update route', async () => {
      // Mock select target employee
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, employee_id: 'admin' }]
      });

      const response = await request(app)
        .put('/api/admin/employees/admin')
        .send({
          password: 'admin-new-password'
        });

      expect(response.statusCode).toBe(403);
      expect(response.body.error).toContain('Cannot change password for admin account');
    });
  });
});
