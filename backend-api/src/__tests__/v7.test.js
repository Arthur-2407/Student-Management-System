/**
 * V7 — Distributed Lock + Request Timeout + Security Headers Tests
 */

// ── Distributed Lock Tests ─────────────────────────────────────────────────
describe('DistributedLock', () => {
  let DistributedLock;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    ({ DistributedLock } = require('../config/distributedLock'));
  });

  test('acquires and releases an in-memory lock', async () => {
    const lock = new DistributedLock();
    const release = await lock.acquire('test-key', 5000);
    expect(release).not.toBeNull();
    expect(typeof release).toBe('function');
    release();
  });

  test('prevents double-acquire of same lock', async () => {
    const lock = new DistributedLock();
    const release1 = await lock.acquire('dup-key', 5000);
    const release2 = await lock.acquire('dup-key', 5000);
    expect(release1).not.toBeNull();
    expect(release2).toBeNull();
    release1();
  });

  test('allows re-acquire after release', async () => {
    const lock = new DistributedLock();
    const release1 = await lock.acquire('reuse-key', 5000);
    release1();
    const release2 = await lock.acquire('reuse-key', 5000);
    expect(release2).not.toBeNull();
    release2();
  });

  test('auto-expires locks after TTL', async () => {
    const lock = new DistributedLock();
    await lock.acquire('ttl-key', 1); // 1ms TTL
    await new Promise(r => setTimeout(r, 10));
    const release = await lock.acquire('ttl-key', 5000);
    expect(release).not.toBeNull();
    release();
  });

  test('isLocked returns correct state', async () => {
    const lock = new DistributedLock();
    expect(await lock.isLocked('check-key')).toBe(false);
    const release = await lock.acquire('check-key', 5000);
    expect(await lock.isLocked('check-key')).toBe(true);
    release();
    expect(await lock.isLocked('check-key')).toBe(false);
  });

  test('getStats returns backend type', () => {
    const lock = new DistributedLock();
    const stats = lock.getStats();
    expect(stats.backend).toBe('in-memory');
    expect(stats.activeLocks).toBe(0);
  });
});

// ── Request Timeout Tests ──────────────────────────────────────────────────
describe('Request Timeout Middleware', () => {
  let requestTimeout;

  beforeEach(() => {
    jest.resetModules();
    ({ requestTimeout } = require('../middleware/requestTimeout'));
  });

  test('calls next immediately', () => {
    const middleware = requestTimeout(5000);
    const req = { requestId: 'test' };
    const res = { on: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    // Clean up timer
    res.on.mock.calls.forEach(([event, cb]) => {
      if (event === 'finish' || event === 'close') cb();
    });
  });

  test('returns 504 after timeout', async () => {
    jest.useFakeTimers();
    const middleware = requestTimeout(100);
    const req = { requestId: 'timeout-test' };
    let headersSent = false;
    const res = {
      headersSent,
      on: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(() => { headersSent = true; }),
    };
    const next = jest.fn();
    middleware(req, res, next);

    jest.advanceTimersByTime(200);
    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GATEWAY_TIMEOUT',
    }));
    jest.useRealTimers();
  });
});

// ── Security Headers Tests ─────────────────────────────────────────────────
describe('Security Headers Middleware', () => {
  let securityHeaders;

  beforeEach(() => {
    jest.resetModules();
    ({ securityHeaders } = require('../middleware/securityHeaders'));
  });

  test('sets HSTS header', () => {
    const middleware = securityHeaders();
    const req = { url: '/test' };
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    const next = jest.fn();
    middleware(req, res, next);
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(next).toHaveBeenCalled();
  });

  test('sets X-Frame-Options to DENY', () => {
    const middleware = securityHeaders();
    const req = { url: '/test' };
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    const next = jest.fn();
    middleware(req, res, next);
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  test('sets Cache-Control on API routes', () => {
    const middleware = securityHeaders();
    const req = { url: '/api/users' };
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    const next = jest.fn();
    middleware(req, res, next);
    expect(headers['Cache-Control']).toContain('no-store');
    expect(headers['Pragma']).toBe('no-cache');
  });

  test('does not set Cache-Control on non-API routes', () => {
    const middleware = securityHeaders();
    const req = { url: '/health' };
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    const next = jest.fn();
    middleware(req, res, next);
    expect(headers['Cache-Control']).toBeUndefined();
  });

  test('sets Permissions-Policy', () => {
    const middleware = securityHeaders();
    const req = { url: '/' };
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    const next = jest.fn();
    middleware(req, res, next);
    expect(headers['Permissions-Policy']).toContain('camera=()');
  });
});
