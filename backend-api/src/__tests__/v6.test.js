/**
 * V6 — RBAC + Correlation ID + Error Handler Tests
 */

// ── RBAC Tests ─────────────────────────────────────────────────────────────
describe('RBAC Middleware', () => {
  let requireRole, requirePermission, getPermissionsForRole;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    ({ requireRole, requirePermission, getPermissionsForRole } = require('../middleware/rbac'));
  });

  test('allows admin access to admin routes', () => {
    const middleware = requireRole('admin');
    const req = { user: { id: 1, role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('denies employee access to admin routes', () => {
    const middleware = requireRole('admin');
    const req = { user: { id: 2, role: 'employee' }, url: '/test' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('allows supervisor access to supervisor routes', () => {
    const middleware = requireRole('supervisor');
    const req = { user: { id: 3, role: 'supervisor' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('allows admin access to supervisor routes (hierarchy)', () => {
    const middleware = requireRole('supervisor');
    const req = { user: { id: 1, role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('denies unauthenticated requests', () => {
    const middleware = requireRole('employee');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('getPermissionsForRole returns correct permissions', () => {
    const perms = getPermissionsForRole('employee');
    expect(perms['view:dashboard']).toBe(true);
    expect(perms['manage:security']).toBe(false);
    expect(perms['manage:mfa']).toBe(true);
  });

  test('requirePermission grants access for valid permission', () => {
    const middleware = requirePermission('view:dashboard');
    const req = { user: { id: 1, role: 'employee' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('requirePermission denies for insufficient permission', () => {
    const middleware = requirePermission('manage:security');
    const req = { user: { id: 2, role: 'employee' }, url: '/test' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── Correlation ID Tests ───────────────────────────────────────────────────
describe('Correlation ID Middleware', () => {
  let correlationId;

  beforeEach(() => {
    jest.resetModules();
    ({ correlationId } = require('../middleware/correlationId'));
  });

  test('generates a request ID when none provided', () => {
    const req = { headers: {} };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    correlationId(req, res, next);
    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(/^req_/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  test('preserves existing X-Request-Id header', () => {
    const req = { headers: { 'x-request-id': 'existing-123' } };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    correlationId(req, res, next);
    expect(req.requestId).toBe('existing-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'existing-123');
  });
});

// ── Error Handler Tests ────────────────────────────────────────────────────
describe('Error Handler', () => {
  let errorHandler;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    ({ errorHandler } = require('../middleware/errorHandler'));
  });

  test('handles circuit breaker open errors', () => {
    const err = new Error('Circuit open');
    err.code = 'CIRCUIT_OPEN';
    const req = { method: 'GET', url: '/test', requestId: 'req_test' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.retryAfter).toBe(30);
    expect(body.requestId).toBe('req_test');
  });

  test('handles JWT errors', () => {
    const err = new Error('invalid token');
    err.name = 'JsonWebTokenError';
    const req = { method: 'GET', url: '/test', requestId: 'req_test' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('handles generic errors with 500', () => {
    const err = new Error('Something broke');
    const req = { method: 'POST', url: '/api/test', requestId: 'req_abc' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].requestId).toBe('req_abc');
  });
});
