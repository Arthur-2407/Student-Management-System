/**
 * V7 — SECURITY HEADERS MIDDLEWARE
 *
 * Hardens HTTP security headers beyond what Helmet provides by default.
 * Adds enterprise-grade headers for XSS, clickjacking, MIME sniffing,
 * and cache control.
 *
 * Usage:
 *   app.use(securityHeaders());
 */

function securityHeaders() {
  return (req, res, next) => {
    // Strict Transport Security (1 year, includeSubDomains)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Clickjacking protection
    res.setHeader('X-Frame-Options', 'DENY');

    // XSS filter (legacy browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy (disable unnecessary browser features)
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');

    // Cache control for API responses
    if (req.url.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }

    next();
  };
}

module.exports = { securityHeaders };
