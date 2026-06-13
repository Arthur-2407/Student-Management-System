/**
 * ADDITION 5 — ENTERPRISE OPERATIONAL TELEMETRY
 *
 * Collects and aggregates operational metrics across all services.
 * Provides realtime dashboard data, health analytics, and anomaly signals.
 *
 * Metrics collected:
 *   - API request latency (p50, p95, p99)
 *   - Error rates by route
 *   - Circuit breaker state transitions
 *   - Database query performance
 *   - Redis operation performance
 *   - WebSocket connection health
 *   - Degraded-mode transitions
 *   - Memory and event loop stats
 */
const { logger } = require('../../config/logger');
const { getAllStatus } = require('../../config/circuitBreaker');
const { degradedMode } = require('../../config/degradedMode');

class TelemetryCollector {
  constructor() {
    this._apiMetrics = [];       // { timestamp, method, url, statusCode, responseTimeMs }
    this._errorCounts = {};      // { route: count }
    this._degradedEvents = [];   // { timestamp, event, service, detail }
    this._startedAt = new Date().toISOString();
    this._maxMetrics = 10000;    // Rolling window

    // Listen for degraded-mode changes
    degradedMode.onStateChange((event, service, detail) => {
      this._degradedEvents.push({ timestamp: new Date().toISOString(), event, service, detail });
      if (this._degradedEvents.length > 500) this._degradedEvents.shift();
    });
  }

  /** Record an API request metric. */
  recordRequest(method, url, statusCode, responseTimeMs) {
    this._apiMetrics.push({
      timestamp: Date.now(),
      method, url, statusCode, responseTimeMs,
    });
    if (this._apiMetrics.length > this._maxMetrics) {
      this._apiMetrics = this._apiMetrics.slice(-this._maxMetrics / 2);
    }
    if (statusCode >= 500) {
      const key = `${method} ${url}`;
      this._errorCounts[key] = (this._errorCounts[key] || 0) + 1;
    }
  }

  /** Get aggregated dashboard metrics. */
  getDashboard(windowMinutes = 5) {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const recent = this._apiMetrics.filter(m => m.timestamp >= cutoff);

    const latencies = recent.map(m => m.responseTimeMs).sort((a, b) => a - b);
    const percentile = (arr, p) => arr.length ? arr[Math.floor(arr.length * p / 100)] : 0;

    const statusCodes = {};
    for (const m of recent) {
      const bucket = `${Math.floor(m.statusCode / 100)}xx`;
      statusCodes[bucket] = (statusCodes[bucket] || 0) + 1;
    }

    const memUsage = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      startedAt: this._startedAt,
      window: { minutes: windowMinutes, totalRequests: recent.length },
      latency: {
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        p99: percentile(latencies, 99),
        avg: recent.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      },
      statusCodes,
      errorRate: recent.length
        ? ((recent.filter(m => m.statusCode >= 500).length / recent.length) * 100).toFixed(2) + '%'
        : '0%',
      topErrors: Object.entries(this._errorCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([route, count]) => ({ route, count })),
      circuitBreakers: getAllStatus(),
      degradedMode: degradedMode.getStatus(),
      recentDegradedEvents: this._degradedEvents.slice(-20),
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
        externalMB: Math.round(memUsage.external / 1024 / 1024),
      },
      nodeVersion: process.version,
    };
  }

  /** Get health summary for all services. */
  getHealthSummary() {
    const breakers = getAllStatus();
    const degraded = degradedMode.getStatus();

    return {
      timestamp: new Date().toISOString(),
      overall: degraded.overall,
      services: {
        database: {
          circuit: breakers.database?.state || 'UNKNOWN',
          degraded: degraded.services.database?.status || 'unknown',
        },
        redis: {
          circuit: breakers.redis?.state || 'UNKNOWN',
          degraded: degraded.services.redis?.status || 'unknown',
        },
        aiService: {
          circuit: breakers['ai-service']?.state || 'UNKNOWN',
          degraded: degraded.services['ai-service']?.status || 'unknown',
        },
        websocket: {
          degraded: degraded.services.websocket?.status || 'unknown',
        },
      },
      uptime: process.uptime(),
    };
  }
}

const telemetry = new TelemetryCollector();

module.exports = { telemetry, TelemetryCollector };
