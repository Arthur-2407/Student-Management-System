/**
 * PHASE 5 — PROMETHEUS METRICS COLLECTOR
 *
 * Hooks into telemetry and tracing systems to collect production metrics.
 * Integrates with existing observability infrastructure.
 * Exports metrics in Prometheus text format via /api/telemetry/prometheus endpoint.
 */

const os = require('os');
const { logger } = require('../../config/logger');
const { getPrometheusRegistry } = require('./metrics-registry');

class PrometheusCollector {
  constructor() {
    this.registry = getPrometheusRegistry();
    this.startTime = Date.now();
    this.processStartTime = process.uptime();
    this._initializeSystemMetrics();
    logger.info('[PrometheusCollector] Initialized');
  }
  
  _initializeSystemMetrics() {
    // Collect immediately on startup
    this._collectProcessMetrics();
    
    // Track process metrics periodically
    this.metricsInterval = setInterval(() => {
      this._collectProcessMetrics();
    }, 10000);  // Every 10 seconds
    if (this.metricsInterval.unref) {
      this.metricsInterval.unref();
    }
  }
  
  _collectProcessMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      this.registry.setGauge('process_uptime_seconds', uptime);
      this.registry.setGauge('process_resident_memory_bytes', memUsage.rss);
      this.registry.setGauge('process_heap_used_bytes', memUsage.heapUsed);
      this.registry.setGauge('process_heap_total_bytes', memUsage.heapTotal);
      
    } catch (error) {
      logger.warn('[PrometheusCollector] Process metrics collection failed', { error: error.message });
    }
  }
  
  /**
   * Record API request metrics
   */
  recordAPIRequest(method, path, statusCode, latencyMs, labels = {}) {
    try {
      // Counter: total requests
      this.registry.incrementCounter('api_requests_total', 1);
      
      // Histogram: request latency
      this.registry.observeHistogram('api_request_duration_seconds', latencyMs / 1000);
      
      // Counter: errors (if status >= 400)
      if (statusCode >= 400) {
        this.registry.incrementCounter('api_errors_total', 1);
      }
      
    } catch (error) {
      logger.warn('[PrometheusCollector] API metrics recording failed', { error: error.message });
    }
  }
  
  /**
   * Record database query metrics
   */
  recordDatabaseQuery(queryType, latencyMs, success = true, labels = {}) {
    try {
      this.registry.incrementCounter('db_queries_total', 1);
      this.registry.observeHistogram('db_query_duration_seconds', latencyMs / 1000);
      
      if (latencyMs > 1000) {
        this.registry.incrementCounter('db_queries_slow_total', 1);
      }
      
      if (!success) {
        this.registry.incrementCounter('api_errors_total', 1);
      }
      
    } catch (error) {
      logger.warn('[PrometheusCollector] Database metrics recording failed', { error: error.message });
    }
  }
  
  /**
   * Record database connection pool metrics
   */
  recordDatabasePoolStatus(activeConnections, poolSize) {
    try {
      this.registry.setGauge('db_connections_active', activeConnections);
      this.registry.setGauge('db_pool_size', poolSize);
    } catch (error) {
      logger.warn('[PrometheusCollector] Database pool metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record Redis operation metrics
   */
  recordRedisCommand(command, latencyMs, success = true) {
    try {
      this.registry.incrementCounter('redis_commands_total', 1);
      this.registry.observeHistogram('redis_command_duration_seconds', latencyMs / 1000);
      
      if (!success) {
        this.registry.incrementCounter('api_errors_total', 1);
      }
      
    } catch (error) {
      logger.warn('[PrometheusCollector] Redis metrics recording failed', { error: error.message });
    }
  }
  
  /**
   * Record Redis server status
   */
  recordRedisStatus(connectedClients, usedMemoryBytes, keyspaceInfo = {}) {
    try {
      this.registry.setGauge('redis_connected_clients', connectedClients);
      this.registry.setGauge('redis_used_memory_bytes', usedMemoryBytes);
      
      for (const [db, keyCount] of Object.entries(keyspaceInfo)) {
        this.registry.setGauge('redis_keyspace_keys', keyCount);
      }
      
    } catch (error) {
      logger.warn('[PrometheusCollector] Redis status recording failed', { error: error.message });
    }
  }
  
  /**
   * Record WebSocket connection metrics
   */
  recordWebSocketConnection(connected = true) {
    try {
      if (connected) {
        this.registry.incrementCounter('websocket_connections_total', 1);
        // Track active connections via gauge — increment internal tracker
        this._wsActiveConnections = (this._wsActiveConnections || 0) + 1;
      } else {
        this._wsActiveConnections = Math.max(0, (this._wsActiveConnections || 0) - 1);
      }
      this.registry.setGauge('websocket_connections_active', this._wsActiveConnections || 0);
    } catch (error) {
      logger.warn('[PrometheusCollector] WebSocket metrics recording failed', { error: error.message });
    }
  }
  
  /**
   * Record WebSocket message metrics
   */
  recordWebSocketMessage(direction = 'sent') {
    try {
      if (direction === 'sent') {
        this.registry.incrementCounter('websocket_messages_sent_total', 1);
      } else {
        this.registry.incrementCounter('websocket_messages_received_total', 1);
      }
    } catch (error) {
      logger.warn('[PrometheusCollector] WebSocket message metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record AI inference metrics
   */
  recordAIInference(model, latencyMs, success = true, confidence = null) {
    try {
      this.registry.incrementCounter('ai_inference_total', 1);
      this.registry.observeHistogram('ai_inference_duration_seconds', latencyMs / 1000);
      
      if (confidence !== null) {
        this.registry.observeHistogram('ai_confidence_scores', confidence);
      }
      
      if (!success) {
        this.registry.incrementCounter('ai_model_errors_total', 1);
      }
      
    } catch (error) {
      logger.warn('[PrometheusCollector] AI inference metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record deepfake detection score
   */
  recordDeepfakeScore(score) {
    try {
      this.registry.observeHistogram('ai_deepfake_detection_score', score);
    } catch (error) {
      logger.warn('[PrometheusCollector] Deepfake metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record GPU utilization
   */
  recordGPUMetrics(utilizationPercent, memoryUsedBytes) {
    try {
      this.registry.setGauge('ai_gpu_utilization_percent', utilizationPercent);
      this.registry.setGauge('ai_gpu_memory_used_bytes', memoryUsedBytes);
    } catch (error) {
      logger.warn('[PrometheusCollector] GPU metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record job queue metrics
   */
  recordJobQueue(size, processed, failed, deadLetters) {
    try {
      this.registry.setGauge('job_queue_size', size);
      this.registry.setGauge('job_queue_processed_total', processed);
      this.registry.setGauge('job_queue_failed_total', failed);
      this.registry.setGauge('job_queue_dead_letter_total', deadLetters);
    } catch (error) {
      logger.warn('[PrometheusCollector] Job queue metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record attendance check-in
   */
  recordAttendanceCheckIn(location, success) {
    try {
      this.registry.incrementCounter('attendance_checkin_total', 1);
    } catch (error) {
      logger.warn('[PrometheusCollector] Attendance metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record attendance check-out
   */
  recordAttendanceCheckOut(location, success) {
    try {
      this.registry.incrementCounter('attendance_checkout_total', 1);
    } catch (error) {
      logger.warn('[PrometheusCollector] Attendance metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record face match success rate
   */
  recordFaceMatchRate(successRate) {
    try {
      this.registry.setGauge('face_match_success_rate', successRate);
    } catch (error) {
      logger.warn('[PrometheusCollector] Face match metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record geofence violation
   */
  recordGeofenceViolation() {
    try {
      this.registry.incrementCounter('geofence_violation_total', 1);
    } catch (error) {
      logger.warn('[PrometheusCollector] Geofence metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record authentication metrics
   */
  recordAuthentication(success, reason = null) {
    try {
      if (success) {
        this.registry.incrementCounter('authentication_success_total', 1);
      } else {
        this.registry.incrementCounter('authentication_failure_total', 1);
      }
    } catch (error) {
      logger.warn('[PrometheusCollector] Authentication metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record security events
   */
  recordSecurityEvent(eventType, severity) {
    try {
      this.registry.incrementCounter('security_events_total', 1);
    } catch (error) {
      logger.warn('[PrometheusCollector] Security metrics failed', { error: error.message });
    }
  }
  
  /**
   * Record circuit breaker state
   */
  recordCircuitBreakerState(service, state) {
    try {
      // state: 0=open, 0.5=half-open, 1=closed
      this.registry.setGauge('circuit_breaker_state', state);
    } catch (error) {
      logger.warn('[PrometheusCollector] Circuit breaker metrics failed', { error: error.message });
    }
  }
  
  /**
   * Get metrics in Prometheus text format
   */
  getMetricsText() {
    return this.registry.getMetricsText();
  }
  
  /**
   * Get metrics as JSON
   */
  getMetricsJSON() {
    return this.registry.getMetricsJSON();
  }
  
  /**
   * Get metrics for specific category
   */
  getMetricsForCategory(category) {
    return this.registry.getMetricsForCategory(category);
  }
  
  /**
   * Reset metrics (for testing)
   */
  reset() {
    this.registry.reset();
  }
  
  /**
   * Cleanup
   */
  destroy() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    logger.info('[PrometheusCollector] Destroyed');
  }
}

// Singleton instance
let _collector_instance = null;

function getPrometheusCollector() {
  if (!_collector_instance) {
    _collector_instance = new PrometheusCollector();
  }
  return _collector_instance;
}

module.exports = {
  PrometheusCollector,
  getPrometheusCollector
};
