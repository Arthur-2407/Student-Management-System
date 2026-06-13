/**
 * V6 — REQUEST CORRELATION MIDDLEWARE
 *
 * Assigns a unique X-Request-Id to every incoming request for distributed tracing.
 * If the client/load-balancer already provides one, it is preserved.
 *
 * The ID is:
 *   - attached to req.requestId
 *   - returned in the X-Request-Id response header
 *   - included in all structured log entries via loggingMiddleware
 *   - propagated to downstream services in outbound requests
 */
const crypto = require('crypto');

function correlationId(req, res, next) {
  const id = req.headers['x-request-id']
    || `req_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;

  req.requestId = id;
  res.setHeader('X-Request-Id', id);

  next();
}

module.exports = { correlationId };
