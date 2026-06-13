const { logger } = require('../config/logger');
const { randomUUID } = require('crypto'); // built-in, no install needed

function logRequest(req, res, next) {
  // Attach a unique requestId to every request for correlated log tracing
  req.requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('x-request-id', req.requestId);

  const startTime = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const responseTimeMs = Date.now() - startTime;

    // Skip logging for health checks and static files
    if (req.path === '/health' || req.path.startsWith('/static/')) return;

    const logData = {
      requestId:     req.requestId,
      method:        req.method,
      route:         req.route ? req.route.path : req.path,
      url:           req.url,
      statusCode:    res.statusCode,
      responseTimeMs,
      ip:            req.ip,
      userAgent:     req.headers['user-agent'],
      userId:        req.user?.id    ?? null,
      employeeId:    req.user?.employeeId ?? null,
      traceId:       req.span?.traceId ?? null,
      spanId:        req.span?.spanId ?? null,
    };

    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';

    logger[level](`${req.method} ${req.url} ${res.statusCode}`, logData);
  });

  next();
}

module.exports = { logRequest };