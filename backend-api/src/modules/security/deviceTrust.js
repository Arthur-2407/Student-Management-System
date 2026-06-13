/**
 * V8 — DEVICE TRUST SCORING ENGINE
 *
 * Assigns a trust score to login attempts based on device familiarity.
 * Known devices (by user-agent + IP fingerprint) get higher trust scores.
 * Unknown devices trigger step-up authentication requirements.
 *
 * Trust levels:
 *   HIGH   (80-100) — Known device, known IP, recent activity
 *   MEDIUM (40-79)  — Partial match (known device OR known IP)
 *   LOW    (0-39)   — Completely unknown device and IP
 *
 * Usage:
 *   const { deviceTrust } = require('./modules/security/deviceTrust');
 *   const score = deviceTrust.evaluate(userId, req);
 */
const crypto = require('crypto');
const { logger } = require('../../config/logger');

class DeviceTrustEngine {
  constructor() {
    this._devices = new Map(); // userId → Set of device fingerprints
    this._ips = new Map();     // userId → Set of known IPs
    this._maxPerUser = 20;
  }

  /** Generate a device fingerprint from request headers. */
  _fingerprint(req) {
    const ua = req.headers?.['user-agent'] || '';
    const accept = req.headers?.['accept-language'] || '';
    return crypto.createHash('sha256')
      .update(`${ua}|${accept}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Evaluate device trust for a login attempt.
   * @returns {{ score: number, level: string, isNewDevice: boolean, isNewIp: boolean }}
   */
  evaluate(userId, req) {
    const fp = this._fingerprint(req);
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    const knownDevices = this._devices.get(userId) || new Set();
    const knownIps = this._ips.get(userId) || new Set();

    const isKnownDevice = knownDevices.has(fp);
    const isKnownIp = knownIps.has(ip);

    let score = 0;
    if (isKnownDevice) score += 50;
    if (isKnownIp) score += 30;
    if (isKnownDevice && isKnownIp) score += 20; // bonus for full match

    const level = score >= 80 ? 'high' : score >= 40 ? 'medium' : 'low';

    return {
      score,
      level,
      isNewDevice: !isKnownDevice,
      isNewIp: !isKnownIp,
      fingerprint: fp,
    };
  }

  /** Register a device after successful authentication. */
  register(userId, req) {
    const fp = this._fingerprint(req);
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    if (!this._devices.has(userId)) this._devices.set(userId, new Set());
    if (!this._ips.has(userId)) this._ips.set(userId, new Set());

    const devices = this._devices.get(userId);
    const ips = this._ips.get(userId);

    devices.add(fp);
    ips.add(ip);

    // Cap stored devices/IPs per user
    if (devices.size > this._maxPerUser) {
      const oldest = devices.values().next().value;
      devices.delete(oldest);
    }
    if (ips.size > this._maxPerUser) {
      const oldest = ips.values().next().value;
      ips.delete(oldest);
    }

    logger.debug('[DeviceTrust] Device registered', { userId, fingerprint: fp, ip });
  }

  getStats() {
    return {
      trackedUsers: this._devices.size,
      totalDevices: [...this._devices.values()].reduce((sum, s) => sum + s.size, 0),
      totalIps: [...this._ips.values()].reduce((sum, s) => sum + s.size, 0),
    };
  }
}

const deviceTrust = new DeviceTrustEngine();

module.exports = { deviceTrust, DeviceTrustEngine };
