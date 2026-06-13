/**
 * ADDITION 3 — DEGRADED-MODE ARCHITECTURE
 *
 * Central degraded-state manager for the entire backend platform.
 * Tracks health of every critical dependency and provides:
 *   - Unified degraded-state object
 *   - Automatic degraded/recovered transitions
 *   - Telemetry emission on state changes
 *   - Operator-visible status for dashboards
 *
 * Usage:
 *   const { degradedMode } = require('./config/degradedMode');
 *   degradedMode.setDegraded('redis', 'Connection lost');
 *   degradedMode.setHealthy('redis');
 *   const status = degradedMode.getStatus();
 */
const { logger } = require('./logger');

const SERVICES = ['database', 'redis', 'ai-service', 'websocket', 'notifications', 'analytics'];

class DegradedModeManager {
  constructor() {
    this._services = {};
    for (const svc of SERVICES) {
      this._services[svc] = {
        status: 'healthy',
        degradedSince: null,
        lastError: null,
        recoveryCount: 0,
        degradationCount: 0,
      };
    }
    this._listeners = [];
  }

  /** Mark a service as degraded with reason. */
  setDegraded(service, reason) {
    if (!this._services[service]) this._register(service);
    const svc = this._services[service];
    if (svc.status === 'degraded') return; // already degraded

    svc.status = 'degraded';
    svc.degradedSince = new Date().toISOString();
    svc.lastError = reason;
    svc.degradationCount++;

    logger.warn(`[DegradedMode] ${service} entered degraded mode`, { reason });
    this._emit('degraded', service, reason);
  }

  /** Mark a service as healthy (recovered). */
  setHealthy(service) {
    if (!this._services[service]) return;
    const svc = this._services[service];
    if (svc.status === 'healthy') return; // already healthy

    const downtime = svc.degradedSince
      ? `${((Date.now() - new Date(svc.degradedSince).getTime()) / 1000).toFixed(1)}s`
      : 'unknown';

    svc.status = 'healthy';
    svc.degradedSince = null;
    svc.recoveryCount++;

    logger.info(`[DegradedMode] ${service} recovered`, { downtime });
    this._emit('recovered', service, downtime);
  }

  /** Check if the platform is in any degraded state. */
  isDegraded() {
    return Object.values(this._services).some(s => s.status === 'degraded');
  }

  /** Check if a specific service is degraded. */
  isServiceDegraded(service) {
    return this._services[service]?.status === 'degraded';
  }

  /** Get full status object for /health and dashboards. */
  getStatus() {
    const overall = this.isDegraded() ? 'degraded' : 'healthy';
    const degradedList = Object.entries(this._services)
      .filter(([, s]) => s.status === 'degraded')
      .map(([name]) => name);

    return {
      overall,
      degradedServices: degradedList,
      services: { ...this._services },
      timestamp: new Date().toISOString(),
    };
  }

  /** Register a listener for state changes. */
  onStateChange(fn) {
    this._listeners.push(fn);
  }

  _register(service) {
    this._services[service] = {
      status: 'healthy', degradedSince: null,
      lastError: null, recoveryCount: 0, degradationCount: 0,
    };
  }

  _emit(event, service, detail) {
    for (const fn of this._listeners) {
      try { fn(event, service, detail); } catch { /* swallow listener errors */ }
    }
  }
}

const degradedMode = new DegradedModeManager();

module.exports = { degradedMode, DegradedModeManager };
