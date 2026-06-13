/**
 * V5 — Integration Tests: Degraded Mode, Telemetry, API Versioning, Job Queue
 *
 * Tests the V3/V5 enterprise systems work correctly in isolation.
 */

// ── DegradedModeManager Tests ──────────────────────────────────────────────
describe('DegradedModeManager', () => {
  let DegradedModeManager;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    ({ DegradedModeManager } = require('../config/degradedMode'));
  });

  test('starts all services as healthy', () => {
    const mgr = new DegradedModeManager();
    expect(mgr.isDegraded()).toBe(false);
    expect(mgr.getStatus().overall).toBe('healthy');
  });

  test('setDegraded marks service and overall as degraded', () => {
    const mgr = new DegradedModeManager();
    mgr.setDegraded('database', 'Connection lost');
    expect(mgr.isDegraded()).toBe(true);
    expect(mgr.isServiceDegraded('database')).toBe(true);
    expect(mgr.getStatus().degradedServices).toContain('database');
  });

  test('setHealthy recovers service', () => {
    const mgr = new DegradedModeManager();
    mgr.setDegraded('redis', 'Timeout');
    mgr.setHealthy('redis');
    expect(mgr.isServiceDegraded('redis')).toBe(false);
  });

  test('emits state change events', () => {
    const mgr = new DegradedModeManager();
    const events = [];
    mgr.onStateChange((event, service) => events.push({ event, service }));
    mgr.setDegraded('database', 'down');
    mgr.setHealthy('database');
    expect(events).toEqual([
      { event: 'degraded', service: 'database' },
      { event: 'recovered', service: 'database' },
    ]);
  });

  test('duplicate setDegraded is idempotent', () => {
    const mgr = new DegradedModeManager();
    const events = [];
    mgr.onStateChange((event) => events.push(event));
    mgr.setDegraded('redis', 'down');
    mgr.setDegraded('redis', 'still down');
    expect(events.length).toBe(1); // Only one event
  });
});

// ── CircuitBreaker Tests ───────────────────────────────────────────────────
describe('CircuitBreaker', () => {
  let CircuitBreaker;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    ({ CircuitBreaker } = require('../config/circuitBreaker'));
  });

  test('starts in CLOSED state', () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2 });
    expect(cb.state).toBe('CLOSED');
  });

  test('opens after failure threshold', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2, cooldownMs: 100 });
    const fail = () => cb.call(() => { throw new Error('fail'); });
    await expect(fail()).rejects.toThrow('fail');
    await expect(fail()).rejects.toThrow('fail');
    expect(cb.state).toBe('OPEN');
  });

  test('short-circuits when open', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, cooldownMs: 60000 });
    await expect(cb.call(() => { throw new Error('x'); })).rejects.toThrow();
    await expect(cb.call(() => 'ok')).rejects.toThrow('Circuit is OPEN');
  });

  test('successful calls reset failure counter', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
    await expect(cb.call(() => { throw new Error('x'); })).rejects.toThrow();
    await cb.call(() => 'ok');
    expect(cb.state).toBe('CLOSED');
    expect(cb.getStatus().failures).toBe(0);
  });
});

// ── JobQueue Tests ─────────────────────────────────────────────────────────
describe('JobQueue', () => {
  let JobQueue;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    ({ JobQueue } = require('../config/jobQueue'));
  });

  test('processes a job', async () => {
    const q = new JobQueue({ concurrency: 1, maxRetries: 1 });
    const results = [];
    q.process('test', async (job) => results.push(job.data));
    q.add('test', { msg: 'hello' });
    // Allow tick to fire
    await new Promise(r => setTimeout(r, 200));
    expect(results).toEqual([{ msg: 'hello' }]);
  });

  test('deduplicates by idempotency key', () => {
    const q = new JobQueue();
    q.process('test', async () => {});
    expect(q.add('test', {}, { idempotencyKey: 'abc' })).toBe(true);
    expect(q.add('test', {}, { idempotencyKey: 'abc' })).toBe(false);
  });

  test('respects priority ordering', () => {
    const q = new JobQueue();
    // Don't register a processor so _tick won't consume items
    q._queues.test = [];
    q.add('test', { name: 'low' }, { priority: 10 });
    q.add('test', { name: 'high' }, { priority: 1 });
    expect(q._queues.test[0].data.name).toBe('high');
  });

  test('reports stats correctly', () => {
    const q = new JobQueue();
    // Don't register a processor so _tick won't consume items
    q._queues.test = [];
    q.add('test', {});
    q.add('test', {});
    const stats = q.getStats();
    expect(stats.enqueued).toBe(2);
    expect(stats.pending.test).toBe(2);
  });
});

// ── API Versioning Tests ───────────────────────────────────────────────────
describe('API Versioning', () => {
  let apiVersioning, isFeatureEnabled;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    ({ apiVersioning, isFeatureEnabled } = require('../middleware/apiVersioning'));
  });

  test('defaults to v1', () => {
    const middleware = apiVersioning();
    const req = { headers: {}, url: '/api/test' };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(req.apiVersion).toBe('v1');
    expect(next).toHaveBeenCalled();
  });

  test('reads Accept-Version header', () => {
    const middleware = apiVersioning();
    const req = { headers: { 'accept-version': 'v2' }, url: '/api/test' };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(req.apiVersion).toBe('v2');
  });

  test('telemetry-dashboard feature is enabled by default', () => {
    expect(isFeatureEnabled('telemetry-dashboard')).toBe(true);
  });
});
