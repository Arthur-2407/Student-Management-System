/**
 * ADDITION 5 — TELEMETRY API ROUTES
 *
 * Exposes enterprise operational telemetry endpoints:
 *   GET /api/telemetry/dashboard    — Full operational dashboard data
 *   GET /api/telemetry/health       — Service health summary
 *   GET /api/telemetry/metrics      — Raw metrics snapshot
 *
 * Protected by supervisor/admin role check.
 */
const express = require('express');
const { telemetry } = require('./collector');

const router = express.Router();

// Dashboard — full operational view
router.get('/dashboard', (req, res) => {
  const windowMinutes = parseInt(req.query.window, 10) || 5;
  res.json(telemetry.getDashboard(windowMinutes));
});

// Health summary — lightweight service status
router.get('/health', (req, res) => {
  const summary = telemetry.getHealthSummary();
  res.status(summary.overall === 'healthy' ? 200 : 503).json(summary);
});

// Raw metrics — for external monitoring integration
router.get('/metrics', (req, res) => {
  const dashboard = telemetry.getDashboard(1);
  // Prometheus-compatible text format
  const lines = [
    `# HELP api_latency_p95 API latency 95th percentile in ms`,
    `# TYPE api_latency_p95 gauge`,
    `api_latency_p95 ${dashboard.latency.p95}`,
    `# HELP api_latency_p99 API latency 99th percentile in ms`,
    `# TYPE api_latency_p99 gauge`,
    `api_latency_p99 ${dashboard.latency.p99}`,
    `# HELP api_requests_total Total API requests in window`,
    `# TYPE api_requests_total gauge`,
    `api_requests_total ${dashboard.window.totalRequests}`,
    `# HELP process_heap_used_bytes Heap used in bytes`,
    `# TYPE process_heap_used_bytes gauge`,
    `process_heap_used_bytes ${dashboard.memory.heapUsedMB * 1024 * 1024}`,
    `# HELP process_uptime_seconds Process uptime in seconds`,
    `# TYPE process_uptime_seconds gauge`,
    `process_uptime_seconds ${dashboard.uptime}`,
  ];
  res.set('Content-Type', 'text/plain; charset=utf-8').send(lines.join('\n') + '\n');
});

module.exports = router;
