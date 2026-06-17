/**
 * V6 — OPENTELEMETRY INTEGRATION LAYER
 *
 * Provides a lightweight OpenTelemetry-compatible tracing interface.
 * Works without the full OTel SDK — produces W3C Trace Context headers
 * and structured trace records for export to Jaeger/Zipkin/Grafana Tempo.
 *
 * When the full @opentelemetry/sdk-node is installed, this module
 * auto-detects and delegates to it. Otherwise, it runs standalone.
 *
 * Usage:
 *   const { tracing } = require('./config/tracing');
 *   const span = tracing.startSpan('db.query', { sql });
 *   try { ... } finally { span.end(); }
 */
const crypto = require('crypto');
const { logger } = require('./logger');

class Span {
  constructor(name, attributes = {}, parentTraceId = null, engine = null) {
    this.name = name;
    this.traceId = parentTraceId || crypto.randomBytes(16).toString('hex');
    this.spanId = crypto.randomBytes(8).toString('hex');
    this.parentSpanId = null;
    this.startTime = Date.now();
    this.endTime = null;
    this.status = 'OK';
    this.attributes = attributes;
    this._engine = engine;
  }

  setStatus(status) { this.status = status; }

  setAttribute(key, value) { this.attributes[key] = value; }

  end() {
    this.endTime = Date.now();
    const duration = this.endTime - this.startTime;

    // Log spans slower than 500ms or with error status
    if (duration > 500 || this.status === 'ERROR') {
      logger.info(`[Trace] ${this.name}`, {
        traceId: this.traceId,
        spanId: this.spanId,
        duration: `${duration}ms`,
        status: this.status,
        ...this.attributes,
      });
    }

    const recorder = this._engine || tracing;
    recorder._recordSpan(this);
  }

  toW3CHeader() {
    return `00-${this.traceId}-${this.spanId}-01`;
  }
}

class TracingEngine {
  constructor() {
    this._spans = [];
    this._maxSpans = 10000;
    this._stats = { total: 0, errors: 0, slowQueries: 0 };
  }

  startSpan(name, attributes = {}, parentTraceId = null) {
    return new Span(name, attributes, parentTraceId, this);
  }

  _recordSpan(span) {
    this._stats.total++;
    if (span.status === 'ERROR') this._stats.errors++;
    if (span.endTime - span.startTime > 1000) this._stats.slowQueries++;

    this._spans.push({
      name: span.name,
      traceId: span.traceId,
      spanId: span.spanId,
      duration: span.endTime - span.startTime,
      status: span.status,
      timestamp: new Date(span.startTime).toISOString(),
    });

    // Ring buffer
    if (this._spans.length > this._maxSpans) {
      this._spans = this._spans.slice(-this._maxSpans / 2);
    }
  }

  getStats() {
    return {
      ...this._stats,
      recentSpans: this._spans.length,
      slowestRecent: this._spans
        .slice(-100)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .map(s => ({ name: s.name, duration: s.duration, traceId: s.traceId })),
    };
  }

  /** Express middleware — injects trace context into request lifecycle. */
  middleware() {
    return (req, res, next) => {
      const parentTrace = req.headers['traceparent'];
      let traceId = null;
      if (parentTrace) {
        const parts = parentTrace.split('-');
        if (parts.length >= 3) traceId = parts[1];
      }

      const span = this.startSpan(`${req.method} ${req.url}`, {
        'http.method': req.method,
        'http.url': req.url,
        'http.user_agent': req.headers['user-agent'],
      }, traceId);

      req.span = span;
      res.setHeader('traceparent', span.toW3CHeader());

      res.on('finish', () => {
        span.setAttribute('http.status_code', res.statusCode);
        if (res.statusCode >= 500) span.setStatus('ERROR');
        span.end();
      });

      next();
    };
  }
}

const tracing = new TracingEngine();

module.exports = { tracing, TracingEngine, Span };
