/**
 * V8 — SENTRY INTEGRATION (OPTIONAL DEPENDENCY)
 *
 * Enterprise error tracking and performance monitoring via Sentry.
 * Works WITHOUT @sentry/node installed — all calls are no-ops when the SDK is absent.
 *
 * To activate:
 *   1. npm install @sentry/node
 *   2. Set SENTRY_DSN in your environment
 *   3. The module auto-detects and initializes Sentry on import
 *
 * Features:
 *   - Crash reporting with full stack traces
 *   - Performance tracing (distributed)
 *   - Release tracking via SENTRY_RELEASE or package.json version
 *   - Environment tagging (development/staging/production)
 *   - User context correlation
 *   - Express request handler + error handler middleware
 *
 * Usage:
 *   const { sentry, sentryMiddleware, sentryErrorHandler } = require('./config/sentry');
 *   sentry.captureException(error);
 *   sentry.captureMessage('Something happened', 'warning');
 *   sentry.setUser({ id: userId, email });
 */

const { logger } = require('./logger');

let Sentry = null;
let isInitialized = false;

// Attempt to load @sentry/node — fails gracefully if not installed
try {
  Sentry = require('@sentry/node');
} catch {
  // @sentry/node not installed — operating in no-op mode
}

function initSentry() {
  if (isInitialized) return;

  const dsn = process.env.SENTRY_DSN;

  if (!Sentry || !dsn) {
    if (dsn && !Sentry) {
      logger.warn('[Sentry] SENTRY_DSN is set but @sentry/node is not installed. Run: npm install @sentry/node');
    }
    logger.info('[Sentry] Operating in no-op mode (Sentry SDK not available or DSN not configured)');
    isInitialized = true;
    return;
  }

  try {
    const packageJson = require('../../package.json');

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || `attendance-backend@${packageJson.version || '1.0.0'}`,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),

      // Integrations
      integrations: [
        // HTTP integration for distributed tracing
        ...(Sentry.httpIntegration ? [Sentry.httpIntegration()] : []),
        // Express integration
        ...(Sentry.expressIntegration ? [Sentry.expressIntegration()] : []),
      ],

      // Before sending, scrub sensitive data
      beforeSend(event) {
        // Remove any JWT tokens from headers
        if (event.request && event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      },

      // Tags
      initialScope: {
        tags: {
          service: 'backend-api',
          component: 'express',
        },
      },
    });

    isInitialized = true;
    logger.info('[Sentry] Initialized successfully', {
      environment: process.env.NODE_ENV || 'development',
      dsn: dsn.replace(/\/\/.*@/, '//***@'), // Mask credentials in logs
    });
  } catch (error) {
    logger.error('[Sentry] Initialization failed', { error: error.message });
  }
}

// ── No-op safe wrappers ────────────────────────────────────────────────────────

const sentry = {
  captureException(error, context = {}) {
    if (Sentry && isInitialized) {
      Sentry.captureException(error, { extra: context });
    }
    // Always log locally too
    logger.error('[Sentry] Exception captured', {
      error: error.message,
      stack: error.stack,
      ...context,
    });
  },

  captureMessage(message, level = 'info', context = {}) {
    if (Sentry && isInitialized) {
      Sentry.captureMessage(message, { level, extra: context });
    }
  },

  setUser(user) {
    if (Sentry && isInitialized) {
      Sentry.setUser(user);
    }
  },

  clearUser() {
    if (Sentry && isInitialized) {
      Sentry.setUser(null);
    }
  },

  addBreadcrumb(breadcrumb) {
    if (Sentry && isInitialized) {
      Sentry.addBreadcrumb(breadcrumb);
    }
  },

  startTransaction(context) {
    if (Sentry && isInitialized && Sentry.startTransaction) {
      return Sentry.startTransaction(context);
    }
    // Return a no-op transaction
    return {
      finish() {},
      setStatus() {},
      startChild() {
        return { finish() {}, setStatus() {} };
      },
    };
  },

  flush(timeout = 2000) {
    if (Sentry && isInitialized) {
      return Sentry.flush(timeout);
    }
    return Promise.resolve();
  },

  isActive() {
    return !!(Sentry && isInitialized && process.env.SENTRY_DSN);
  },
};

// ── Express Middleware ──────────────────────────────────────────────────────────

function sentryMiddleware() {
  if (Sentry && isInitialized && Sentry.Handlers) {
    return Sentry.Handlers.requestHandler();
  }
  // No-op middleware
  return (req, res, next) => next();
}

function sentryErrorHandler() {
  if (Sentry && isInitialized && Sentry.Handlers) {
    return Sentry.Handlers.errorHandler();
  }
  // No-op middleware
  return (err, req, res, next) => next(err);
}

// Auto-initialize on import
initSentry();

module.exports = {
  sentry,
  sentryMiddleware,
  sentryErrorHandler,
  initSentry,
};
