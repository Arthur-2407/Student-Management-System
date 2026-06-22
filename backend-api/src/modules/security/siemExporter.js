/**
 * V8 — SIEM-READY AUDIT LOG EXPORTER
 *
 * Provides structured, SIEM-compatible audit log output in CEF
 * (Common Event Format) and JSON formats suitable for Splunk,
 * ELK, Datadog, or any log aggregator.
 *
 * Subscribes to the event bus and transforms events into
 * SIEM-ready log entries with standardized fields.
 *
 * Usage:
 *   const { siemExporter } = require('./modules/security/siemExporter');
 *   siemExporter.exportCEF(event);
 */
const { logger } = require('../../config/logger');

const CEF_VENDOR = 'AttendanceSystem';
const CEF_PRODUCT = 'EnterprisePlatform';
const CEF_VERSION = '1.0';

const SEVERITY_MAP = {
  low: 3,
  medium: 5,
  high: 8,
  critical: 10,
};

class SiemExporter {
  constructor() {
    this._exported = 0;
  }

  /**
   * Export an event in CEF (Common Event Format).
   * CEF:0|Vendor|Product|Version|EventId|EventName|Severity|Extension
   */
  toCEF(event) {
    const severity = SEVERITY_MAP[event.severity] || 5;
    const extensions = [
      `src=${event.ip || 'unknown'}`,
      `suser=${event.userId || 'unknown'}`,
      `msg=${(event.message || event.eventType || '').replace(/\|/g, '\\|')}`,
      `rt=${event.timestamp || new Date().toISOString()}`,
      event.requestId ? `cs1=${event.requestId}` : null,
      event.method ? `requestMethod=${event.method}` : null,
    ].filter(Boolean).join(' ');

    this._exported++;
    return `CEF:0|${CEF_VENDOR}|${CEF_PRODUCT}|${CEF_VERSION}|${event.eventType || 'UNKNOWN'}|${event.message || event.eventType || 'Event'}|${severity}|${extensions}`;
  }

  /**
   * Export an event in SIEM JSON format (compatible with Splunk, Datadog, ELK).
   */
  toJSON(event) {
    this._exported++;
    return {
      '@timestamp': event.timestamp || new Date().toISOString(),
      'event.kind': 'event',
      'event.category': event.category || 'authentication',
      'event.type': event.eventType || 'info',
      'event.severity': SEVERITY_MAP[event.severity] || 5,
      'source.ip': event.ip || null,
      'user.id': event.userId || null,
      'user.name': event.studentId || null,
      'message': event.message || event.eventType || '',
      'trace.id': event.requestId || null,
      'service.name': 'attendance-backend',
      'service.version': CEF_VERSION,
      'labels': event.labels || {},
    };
  }

  /**
   * Log an event in both formats for maximum SIEM compatibility.
   */
  export(event) {
    const cef = this.toCEF(event);
    const json = this.toJSON(event);

    // Write to structured logger (JSON goes to log aggregator)
    logger.info('[SIEM] Audit event', json);

    return { cef, json };
  }

  getStats() {
    return { exported: this._exported };
  }
}

const siemExporter = new SiemExporter();

module.exports = { siemExporter, SiemExporter };
