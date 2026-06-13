/**
 * V6 — Tracing Engine + Rate Limiter Tests
 */

// ── Tracing Engine Tests ───────────────────────────────────────────────────
describe('TracingEngine', () => {
  let TracingEngine, Span;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    ({ TracingEngine, Span } = require('../config/tracing'));
  });

  test('creates a span with name and attributes', () => {
    const engine = new TracingEngine();
    const span = engine.startSpan('db.query', { sql: 'SELECT 1' });
    expect(span.name).toBe('db.query');
    expect(span.traceId).toHaveLength(32);
    expect(span.spanId).toHaveLength(16);
    expect(span.attributes.sql).toBe('SELECT 1');
  });

  test('span.end() records duration', () => {
    const engine = new TracingEngine();
    const span = engine.startSpan('test');
    span.end();
    expect(span.endTime).toBeGreaterThanOrEqual(span.startTime);
  });

  test('generates W3C traceparent header', () => {
    const engine = new TracingEngine();
    const span = engine.startSpan('test');
    const header = span.toW3CHeader();
    expect(header).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
  });

  test('tracks stats correctly', () => {
    const engine = new TracingEngine();
    const span1 = engine.startSpan('ok');
    span1.end();
    const span2 = engine.startSpan('err');
    span2.setStatus('ERROR');
    span2.end();
    const stats = engine.getStats();
    expect(stats.total).toBe(2);
    expect(stats.errors).toBe(1);
  });

  test('middleware injects span and traceparent header', () => {
    const engine = new TracingEngine();
    const mw = engine.middleware();
    const req = { headers: {}, method: 'GET', url: '/test' };
    const res = {
      setHeader: jest.fn(),
      on: jest.fn(),
    };
    const next = jest.fn();
    mw(req, res, next);
    expect(req.span).toBeDefined();
    expect(res.setHeader).toHaveBeenCalledWith('traceparent', expect.stringMatching(/^00-/));
    expect(next).toHaveBeenCalled();
  });

  test('middleware propagates parent trace ID', () => {
    const engine = new TracingEngine();
    const mw = engine.middleware();
    const req = {
      headers: { traceparent: '00-abcd1234abcd1234abcd1234abcd1234-efgh5678efgh5678-01' },
      method: 'GET',
      url: '/test',
    };
    const res = { setHeader: jest.fn(), on: jest.fn() };
    const next = jest.fn();
    mw(req, res, next);
    expect(req.span.traceId).toBe('abcd1234abcd1234abcd1234abcd1234');
  });

  test('ring buffer prevents unbounded memory growth', () => {
    const engine = new TracingEngine();
    engine._maxSpans = 10;
    for (let i = 0; i < 20; i++) {
      const span = engine.startSpan(`op_${i}`);
      span.end();
    }
    expect(engine._spans.length).toBeLessThanOrEqual(10);
  });
});
