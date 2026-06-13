const { logger } = require('../config/logger');

function errorHandler(err, req, res, next) {
  // Guard: if headers were already sent (e.g., streaming response), delegate to Express default
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId || 'unknown';

  // Structured error log with requestId for tracing
  logger.error(err.message || 'Internal Server Error', {
    requestId,
    errorCode:  err.code  || 'INTERNAL_ERROR',
    statusCode: err.statusCode || err.status || 500,
    method:     req.method,
    url:        req.url,
    userId:     req.user?.id ?? null,
    stack:      process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  // Determine status code
  let statusCode = err.statusCode || err.status || 500;
  
  // Error response
  const errorResponse = {
    error: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  // V6: Circuit breaker short-circuit
  if (err.code === 'CIRCUIT_OPEN') {
    statusCode = 503;
    errorResponse.error = 'Service temporarily unavailable';
    errorResponse.code = 'SERVICE_UNAVAILABLE';
    errorResponse.retryAfter = 30;
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    errorResponse.error = 'Validation Error';
    errorResponse.code = 'VALIDATION_ERROR';
    errorResponse.details = err.errors;
  }

  if (err.name === 'JsonWebTokenError') {
    errorResponse.error = 'Invalid token';
    errorResponse.code = 'INVALID_TOKEN';
    statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    errorResponse.error = 'Token expired';
    errorResponse.code = 'TOKEN_EXPIRED';
    statusCode = 401;
  }

  // Database errors
  if (err.code === '23505') { // Unique violation
    errorResponse.error = 'Duplicate entry';
    errorResponse.code = 'DUPLICATE_ENTRY';
    errorResponse.details = err.detail;
    statusCode = 409;
  }

  if (err.code === '23503') { // Foreign key violation
    errorResponse.error = 'Reference error';
    errorResponse.code = 'REFERENCE_ERROR';
    errorResponse.details = err.detail;
    statusCode = 400;
  }

  res.status(statusCode).json(errorResponse);
}

module.exports = { errorHandler };