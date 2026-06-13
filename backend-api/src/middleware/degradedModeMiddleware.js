/**
 * ADDITION 3 — DEGRADED-MODE MIDDLEWARE
 *
 * Express middleware that:
 *   1. Injects degraded-mode state into every request context
 *   2. Returns graceful fallback responses when critical services are down
 *   3. Adds X-Degraded-Mode and X-Degraded-Services headers
 *   4. Allows requests to proceed on non-critical degradation
 *   5. Blocks destructive operations when DB is unavailable
 */
const { degradedMode } = require('../config/degradedMode');
const { logger } = require('../config/logger');

// Routes that absolutely require the database
const DB_REQUIRED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function degradedModeMiddleware(req, res, next) {
  const status = degradedMode.getStatus();
  req.degradedMode = status;

  // Always add headers for observability
  res.setHeader('X-Degraded-Mode', status.overall);
  if (status.degradedServices.length > 0) {
    res.setHeader('X-Degraded-Services', status.degradedServices.join(','));
  }

  // If database is degraded, block write operations with a graceful response
  if (degradedMode.isServiceDegraded('database') && DB_REQUIRED_METHODS.has(req.method)) {
    logger.warn('[DegradedMode] Blocking write operation — database unavailable', {
      method: req.method,
      url: req.url,
      requestId: req.requestId,
    });

    return res.status(503).json({
      error: 'Service temporarily unavailable',
      code: 'DATABASE_DEGRADED',
      message: 'Write operations are temporarily disabled. The system will recover automatically.',
      degradedServices: status.degradedServices,
      retryAfter: 30,
    });
  }

  // If AI service is degraded and request targets AI endpoints
  if (degradedMode.isServiceDegraded('ai-service') && req.url.includes('face')) {
    res.setHeader('X-AI-Fallback', 'true');
    req.aiFallback = true;
  }

  next();
}

/**
 * Degraded health endpoint — provides detailed operational status.
 * Available at GET /api/system/status (no auth required for operators).
 */
function systemStatusHandler(req, res) {
  const status = degradedMode.getStatus();
  res.status(status.overall === 'healthy' ? 200 : 503).json(status);
}

module.exports = { degradedModeMiddleware, systemStatusHandler };
