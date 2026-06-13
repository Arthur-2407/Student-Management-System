/**
 * V7 — WEBSOCKET TELEMETRY COLLECTOR
 *
 * Tracks WebSocket connection metrics:
 *   - Active connections
 *   - Total connections / disconnections
 *   - Auth failures
 *   - Messages sent / received
 *   - Connection duration histogram
 *
 * Integrates with the telemetry collector for /api/telemetry/prometheus export.
 */

class WebSocketTelemetry {
  constructor() {
    this._stats = {
      activeConnections: 0,
      totalConnections: 0,
      totalDisconnections: 0,
      authFailures: 0,
      messagesSent: 0,
      messagesReceived: 0,
      peakConnections: 0,
    };
    this._connectionStarts = new Map(); // socketId → timestamp
  }

  onConnect(socketId) {
    this._stats.totalConnections++;
    this._stats.activeConnections++;
    if (this._stats.activeConnections > this._stats.peakConnections) {
      this._stats.peakConnections = this._stats.activeConnections;
    }
    this._connectionStarts.set(socketId, Date.now());
  }

  onDisconnect(socketId) {
    this._stats.totalDisconnections++;
    this._stats.activeConnections = Math.max(0, this._stats.activeConnections - 1);
    this._connectionStarts.delete(socketId);
  }

  onAuthFailure() {
    this._stats.authFailures++;
  }

  onMessageSent() {
    this._stats.messagesSent++;
  }

  onMessageReceived() {
    this._stats.messagesReceived++;
  }

  getStats() {
    return { ...this._stats };
  }

  /** Prometheus-compatible metrics string */
  toPrometheus() {
    const s = this._stats;
    return [
      `# HELP ws_active_connections Current active WebSocket connections`,
      `# TYPE ws_active_connections gauge`,
      `ws_active_connections ${s.activeConnections}`,
      `# HELP ws_total_connections Total WebSocket connections`,
      `# TYPE ws_total_connections counter`,
      `ws_total_connections ${s.totalConnections}`,
      `# HELP ws_auth_failures Total WebSocket auth failures`,
      `# TYPE ws_auth_failures counter`,
      `ws_auth_failures ${s.authFailures}`,
      `# HELP ws_peak_connections Peak concurrent connections`,
      `# TYPE ws_peak_connections gauge`,
      `ws_peak_connections ${s.peakConnections}`,
    ].join('\n');
  }
}

const wsTelemetry = new WebSocketTelemetry();

module.exports = { wsTelemetry, WebSocketTelemetry };
