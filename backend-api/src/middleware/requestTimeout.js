/**
 * V7 — REQUEST TIMEOUT MIDDLEWARE
 *
 * Enforces maximum request processing time to prevent hung connections.
 * Returns 504 Gateway Timeout if the response is not sent within the limit.
 *
 * Usage:
 *   app.use(requestTimeout(30000)); // 30s default
 */

function requestTimeout(timeoutMs = 30000) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Request timeout',
          code: 'GATEWAY_TIMEOUT',
          timeoutMs,
          requestId: req.requestId || 'unknown',
        });
      }
    }, timeoutMs);

    // Clear timeout when response finishes
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}

module.exports = { requestTimeout };
