/**
 * ADDITION 6 — API VERSIONING & COMPATIBILITY MIDDLEWARE
 *
 * Implements enterprise-grade API versioning and backward compatibility:
 *   - Version header detection (Accept-Version, X-API-Version)
 *   - URL prefix versioning (/api/v1/, /api/v2/)
 *   - Compatibility layer for deprecated endpoints
 *   - Feature flag support for staged rollouts
 *   - Deprecation warnings in response headers
 *
 * Usage:
 *   app.use(apiVersioning());
 *   // Then req.apiVersion is set (default 'v1')
 */
const { logger } = require('../config/logger');

const SUPPORTED_VERSIONS = ['v1', 'v2'];
const DEFAULT_VERSION = 'v1';
const CURRENT_VERSION = 'v1';

// Feature flags — loaded from environment or defaults
const FEATURE_FLAGS = {
  'telemetry-dashboard':    process.env.FF_TELEMETRY_DASHBOARD !== 'false',
  'degraded-mode-api':      process.env.FF_DEGRADED_MODE_API !== 'false',
  'api-versioning':         process.env.FF_API_VERSIONING !== 'false',
  'bundle-verification':    process.env.FF_BUNDLE_VERIFICATION !== 'false',
  'mfa-enrollment':         process.env.FF_MFA_ENROLLMENT === 'true',
  'advanced-analytics':     process.env.FF_ADVANCED_ANALYTICS === 'true',
  'canary-deployment':      process.env.FF_CANARY_DEPLOYMENT === 'true',
};

// Deprecated routes — maps old path to new + deprecation info
const DEPRECATED_ROUTES = {
  // Example: '/api/login' → '/api/auth/login'
};

/**
 * API versioning middleware.
 */
function apiVersioning() {
  return (req, res, next) => {
    // Detect version from header, URL, or default
    let version = req.headers['accept-version']
      || req.headers['x-api-version']
      || null;

    // URL-based version detection: /api/v2/...
    const versionMatch = req.url.match(/^\/api\/(v\d+)\//);
    if (versionMatch) {
      version = versionMatch[1];
    }

    req.apiVersion = version && SUPPORTED_VERSIONS.includes(version)
      ? version
      : DEFAULT_VERSION;

    // Add version headers to response
    res.setHeader('X-API-Version', req.apiVersion);
    res.setHeader('X-API-Current-Version', CURRENT_VERSION);

    // Deprecation warnings
    if (req.apiVersion !== CURRENT_VERSION) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString());
      logger.debug('[APIVersioning] Request using non-current version', {
        version: req.apiVersion,
        url: req.url,
      });
    }

    // Check deprecated routes
    if (DEPRECATED_ROUTES[req.path]) {
      const deprecated = DEPRECATED_ROUTES[req.path];
      res.setHeader('Deprecation', 'true');
      res.setHeader('Link', `<${deprecated.newPath}>; rel="successor-version"`);
      logger.warn('[APIVersioning] Deprecated route accessed', {
        path: req.path,
        successor: deprecated.newPath,
      });
    }

    next();
  };
}

/**
 * Feature flag checker.
 */
function isFeatureEnabled(flag) {
  return FEATURE_FLAGS[flag] === true;
}

/**
 * Feature flag middleware — blocks requests if feature is disabled.
 */
function requireFeature(flag) {
  return (req, res, next) => {
    if (!isFeatureEnabled(flag)) {
      return res.status(404).json({
        error: 'Feature not available',
        code: 'FEATURE_DISABLED',
        feature: flag,
      });
    }
    next();
  };
}

/**
 * Get all feature flags (for admin dashboard).
 */
function getFeatureFlags() {
  return { ...FEATURE_FLAGS };
}

module.exports = {
  apiVersioning,
  isFeatureEnabled,
  requireFeature,
  getFeatureFlags,
  SUPPORTED_VERSIONS,
  CURRENT_VERSION,
};
