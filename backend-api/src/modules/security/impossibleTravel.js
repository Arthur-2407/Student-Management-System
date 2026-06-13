/**
 * V7 — IMPOSSIBLE TRAVEL DETECTION ENGINE
 *
 * Detects geographically impossible login patterns by comparing
 * consecutive login locations against maximum human travel speed.
 *
 * If two logins from the same user occur from locations that would
 * require faster-than-possible travel, a security event is raised.
 *
 * Usage:
 *   const { impossibleTravel } = require('./modules/security/impossibleTravel');
 *   const threat = impossibleTravel.check(userId, { lat, lng, timestamp });
 */
const { logger } = require('../../config/logger');

const MAX_SPEED_KMH = 900; // Max plausible speed (commercial jet)

class ImpossibleTravelDetector {
  constructor() {
    this._lastLogins = new Map(); // userId → { lat, lng, timestamp }
    this._alerts = [];
    this._maxAlerts = 1000;
  }

  /**
   * Check a login attempt for impossible travel.
   * @returns {{ isThreat: boolean, details?: object }}
   */
  check(userId, location) {
    if (!location || !location.lat || !location.lng) {
      return { isThreat: false };
    }

    const last = this._lastLogins.get(userId);
    const now = location.timestamp || Date.now();

    // Store current login
    this._lastLogins.set(userId, { lat: location.lat, lng: location.lng, timestamp: now });

    if (!last) {
      return { isThreat: false };
    }

    const distanceKm = this._haversine(last.lat, last.lng, location.lat, location.lng);
    const timeDiffHrs = (now - last.timestamp) / (1000 * 60 * 60);

    if (timeDiffHrs <= 0) {
      return { isThreat: false };
    }

    const requiredSpeedKmh = distanceKm / timeDiffHrs;

    if (requiredSpeedKmh > MAX_SPEED_KMH && distanceKm > 50) {
      const alert = {
        userId,
        from: { lat: last.lat, lng: last.lng },
        to: { lat: location.lat, lng: location.lng },
        distanceKm: Math.round(distanceKm),
        timeDiffMinutes: Math.round(timeDiffHrs * 60),
        requiredSpeedKmh: Math.round(requiredSpeedKmh),
        severity: requiredSpeedKmh > 5000 ? 'critical' : 'high',
        timestamp: new Date(now).toISOString(),
      };

      this._alerts.push(alert);
      if (this._alerts.length > this._maxAlerts) {
        this._alerts = this._alerts.slice(-this._maxAlerts / 2);
      }

      logger.warn('[ImpossibleTravel] Threat detected', alert);

      return { isThreat: true, details: alert };
    }

    return { isThreat: false };
  }

  /** Haversine formula — distance between two GPS coordinates in km. */
  _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = this._toRad(lat2 - lat1);
    const dLng = this._toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2))
      * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  _toRad(deg) { return deg * (Math.PI / 180); }

  getAlerts(limit = 50) {
    return this._alerts.slice(-limit).reverse();
  }

  getStats() {
    return {
      trackedUsers: this._lastLogins.size,
      totalAlerts: this._alerts.length,
      recentAlerts: this._alerts.slice(-5),
    };
  }

  /** Clear tracking data for a user (e.g., on password reset). */
  clearUser(userId) {
    this._lastLogins.delete(userId);
  }
}

const impossibleTravel = new ImpossibleTravelDetector();

module.exports = { impossibleTravel, ImpossibleTravelDetector };
