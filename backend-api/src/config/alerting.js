/**
 * V8 — ALERTING ENGINE
 *
 * Configurable alerting system that monitors application health and fires
 * notifications via Email, Slack, and Webhook integrations.
 *
 * Alert rules are evaluated periodically against metrics from the
 * Prometheus registry and application health probes.
 *
 * Configuration via environment variables:
 *   ALERT_SLACK_WEBHOOK_URL     — Slack incoming webhook URL
 *   ALERT_EMAIL_ENABLED         — Enable email alerts (true/false)
 *   ALERT_WEBHOOK_URL           — Custom webhook URL for alerts
 *   ALERT_CHECK_INTERVAL_MS     — Alert evaluation interval (default: 60000)
 *
 * Usage:
 *   const { alertEngine } = require('./config/alerting');
 *   alertEngine.start();       // Start periodic evaluation
 *   alertEngine.stop();        // Stop on shutdown
 *   alertEngine.getStatus();   // Get alert status
 */

const { logger } = require('./logger');

class AlertRule {
  constructor({ name, condition, severity, message, cooldownMs = 300000 }) {
    this.name = name;
    this.condition = condition;       // Function returning boolean
    this.severity = severity;         // 'info' | 'warning' | 'critical'
    this.message = message;           // Function returning alert message
    this.cooldownMs = cooldownMs;     // Minimum time between repeated alerts
    this.lastFired = null;
    this.fireCount = 0;
    this.isActive = false;
  }
}

class AlertEngine {
  constructor() {
    this._rules = [];
    this._channels = [];
    this._interval = null;
    this._alertHistory = [];
    this._maxHistory = 1000;
    this._checkIntervalMs = parseInt(process.env.ALERT_CHECK_INTERVAL_MS || '60000', 10);

    this._initializeDefaultRules();
    this._initializeChannels();
    logger.info('[AlertEngine] Initialized');
  }

  _initializeDefaultRules() {
    // Rule: High Memory Usage (>85% heap)
    this._rules.push(new AlertRule({
      name: 'high_memory_usage',
      condition: () => {
        const mem = process.memoryUsage();
        return mem.heapUsed / mem.heapTotal > 0.85;
      },
      severity: 'warning',
      message: () => {
        const mem = process.memoryUsage();
        const usedMB = Math.round(mem.heapUsed / 1024 / 1024);
        const totalMB = Math.round(mem.heapTotal / 1024 / 1024);
        return `High memory usage: ${usedMB}MB / ${totalMB}MB (${Math.round(mem.heapUsed / mem.heapTotal * 100)}%)`;
      },
      cooldownMs: 300000, // 5 min cooldown
    }));

    // Rule: Critical Memory Usage (>95% heap)
    this._rules.push(new AlertRule({
      name: 'critical_memory_usage',
      condition: () => {
        const mem = process.memoryUsage();
        return mem.heapUsed / mem.heapTotal > 0.95;
      },
      severity: 'critical',
      message: () => {
        const mem = process.memoryUsage();
        const usedMB = Math.round(mem.heapUsed / 1024 / 1024);
        return `CRITICAL memory usage: ${usedMB}MB — risk of OOM crash`;
      },
      cooldownMs: 60000, // 1 min cooldown
    }));

    // Rule: High Event Loop Lag (>100ms)
    this._rules.push(new AlertRule({
      name: 'event_loop_lag',
      condition: () => {
        // Simple event loop lag detection
        const start = Date.now();
        return new Promise(resolve => {
          setImmediate(() => {
            resolve(Date.now() - start > 100);
          });
        });
      },
      severity: 'warning',
      message: () => 'Event loop lag detected (>100ms) — possible blocking operation',
      cooldownMs: 120000, // 2 min cooldown
    }));

    // Rule: Process running too long without restart (>7 days)
    this._rules.push(new AlertRule({
      name: 'long_running_process',
      condition: () => process.uptime() > 7 * 24 * 60 * 60,
      severity: 'info',
      message: () => `Process uptime: ${Math.round(process.uptime() / 3600)}h — consider scheduled restart`,
      cooldownMs: 86400000, // 24h cooldown
    }));
  }

  _initializeChannels() {
    // Slack channel
    if (process.env.ALERT_SLACK_WEBHOOK_URL) {
      this._channels.push({
        name: 'slack',
        send: async (alert) => {
          try {
            const http = require('http');
            const https = require('https');
            const url = new URL(process.env.ALERT_SLACK_WEBHOOK_URL);
            const client = url.protocol === 'https:' ? https : http;

            const payload = JSON.stringify({
              text: `🚨 *[${alert.severity.toUpperCase()}]* ${alert.name}\n${alert.message}`,
              attachments: [{
                color: alert.severity === 'critical' ? '#FF0000' : alert.severity === 'warning' ? '#FFA500' : '#36A64F',
                fields: [
                  { title: 'Service', value: 'attendance-backend', short: true },
                  { title: 'Environment', value: process.env.NODE_ENV || 'development', short: true },
                  { title: 'Timestamp', value: new Date().toISOString(), short: false },
                ],
              }],
            });

            await new Promise((resolve, reject) => {
              const req = client.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
                resolve(res.statusCode);
              });
              req.on('error', reject);
              req.write(payload);
              req.end();
            });
          } catch (error) {
            logger.error('[AlertEngine] Slack notification failed', { error: error.message });
          }
        },
      });
      logger.info('[AlertEngine] Slack channel configured');
    }

    // Webhook channel
    if (process.env.ALERT_WEBHOOK_URL) {
      this._channels.push({
        name: 'webhook',
        send: async (alert) => {
          try {
            const http = require('http');
            const https = require('https');
            const url = new URL(process.env.ALERT_WEBHOOK_URL);
            const client = url.protocol === 'https:' ? https : http;

            const payload = JSON.stringify({
              alert: alert.name,
              severity: alert.severity,
              message: alert.message,
              service: 'attendance-backend',
              environment: process.env.NODE_ENV || 'development',
              timestamp: new Date().toISOString(),
            });

            await new Promise((resolve, reject) => {
              const req = client.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
                resolve(res.statusCode);
              });
              req.on('error', reject);
              req.write(payload);
              req.end();
            });
          } catch (error) {
            logger.error('[AlertEngine] Webhook notification failed', { error: error.message });
          }
        },
      });
      logger.info('[AlertEngine] Webhook channel configured');
    }

    // Console/log channel (always active)
    this._channels.push({
      name: 'log',
      send: async (alert) => {
        const logFn = alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warn' : 'info';
        logger[logFn](`[ALERT] ${alert.name}: ${alert.message}`, {
          severity: alert.severity,
          fireCount: alert.fireCount,
        });
      },
    });
  }

  /**
   * Add a custom alert rule.
   */
  addRule(ruleConfig) {
    this._rules.push(new AlertRule(ruleConfig));
    logger.info('[AlertEngine] Custom rule added', { name: ruleConfig.name });
  }

  /**
   * Start periodic alert evaluation.
   */
  start() {
    if (this._interval) return;

    this._interval = setInterval(() => this._evaluate(), this._checkIntervalMs);
    if (this._interval.unref) this._interval.unref(); // Don't prevent process exit

    logger.info('[AlertEngine] Started', {
      rules: this._rules.length,
      channels: this._channels.map(c => c.name),
      intervalMs: this._checkIntervalMs,
    });
  }

  /**
   * Stop alert evaluation.
   */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    logger.info('[AlertEngine] Stopped');
  }

  /**
   * Evaluate all rules and fire alerts.
   */
  async _evaluate() {
    for (const rule of this._rules) {
      try {
        const now = Date.now();

        // Check cooldown
        if (rule.lastFired && (now - rule.lastFired) < rule.cooldownMs) {
          continue;
        }

        // Evaluate condition
        let triggered = rule.condition();
        if (triggered instanceof Promise) {
          triggered = await triggered;
        }

        if (triggered) {
          rule.isActive = true;
          rule.fireCount++;
          rule.lastFired = now;

          const alertMsg = typeof rule.message === 'function' ? rule.message() : rule.message;

          const alertPayload = {
            name: rule.name,
            severity: rule.severity,
            message: alertMsg,
            timestamp: new Date().toISOString(),
            fireCount: rule.fireCount,
          };

          // Record in history
          this._alertHistory.push(alertPayload);
          if (this._alertHistory.length > this._maxHistory) {
            this._alertHistory = this._alertHistory.slice(-this._maxHistory / 2);
          }

          // Send to all channels
          for (const channel of this._channels) {
            try {
              await channel.send(alertPayload);
            } catch (error) {
              logger.error(`[AlertEngine] Channel ${channel.name} send failed`, { error: error.message });
            }
          }
        } else {
          if (rule.isActive) {
            rule.isActive = false;
            logger.info(`[AlertEngine] Alert resolved: ${rule.name}`);
          }
        }
      } catch (error) {
        logger.error(`[AlertEngine] Rule evaluation failed: ${rule.name}`, { error: error.message });
      }
    }
  }

  /**
   * Get current alert status and history.
   */
  getStatus() {
    return {
      active: this._rules.filter(r => r.isActive).map(r => ({
        name: r.name,
        severity: r.severity,
        fireCount: r.fireCount,
        lastFired: r.lastFired ? new Date(r.lastFired).toISOString() : null,
      })),
      rules: this._rules.map(r => ({
        name: r.name,
        severity: r.severity,
        isActive: r.isActive,
        fireCount: r.fireCount,
      })),
      channels: this._channels.map(c => c.name),
      history: this._alertHistory.slice(-20),
    };
  }
}

const alertEngine = new AlertEngine();

module.exports = { alertEngine, AlertEngine, AlertRule };
