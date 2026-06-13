/**
 * PHASE 5 — PROMETHEUS METRICS REGISTRY
 *
 * Centralized metrics registry for all Prometheus metrics.
 * Provides unified interface for recording metrics across all services.
 * Exports metrics in Prometheus text format.
 *
 * Metric types:
 *   - Gauge: snapshot values (cpu usage, memory, connections)
 *   - Counter: monotonic values (total requests, errors, invocations)
 *   - Histogram: distributions (latency, request sizes)
 *   - Summary: quantiles (similar to histogram)
 */

const { logger } = require('../../config/logger');

class PrometheusRegistry {
  constructor() {
    this._metrics = {};
    this._namespace = 'attendance_system';
    
    // Initialize metric categories
    this._initializeMetrics();
    logger.info('[PrometheusRegistry] Initialized');
  }
  
  _initializeMetrics() {
    // API Metrics
    this._metrics.api_requests_total = { type: 'counter', value: 0, labels: ['method', 'path', 'status'] };
    this._metrics.api_request_duration_seconds = { type: 'histogram', buckets: [0.01, 0.05, 0.1, 0.5, 1, 5], values: [] };
    this._metrics.api_errors_total = { type: 'counter', value: 0, labels: ['method', 'path', 'error_code'] };
    
    // Database Metrics
    this._metrics.db_connections_active = { type: 'gauge', value: 0 };
    this._metrics.db_query_duration_seconds = { type: 'histogram', buckets: [0.001, 0.005, 0.01, 0.05, 0.1], values: [] };
    this._metrics.db_queries_total = { type: 'counter', value: 0 };
    this._metrics.db_queries_slow_total = { type: 'counter', value: 0 };
    this._metrics.db_pool_size = { type: 'gauge', value: 0 };
    
    // Redis Metrics
    this._metrics.redis_commands_total = { type: 'counter', value: 0, labels: ['command'] };
    this._metrics.redis_command_duration_seconds = { type: 'histogram', buckets: [0.001, 0.01, 0.1, 1], values: [] };
    this._metrics.redis_connected_clients = { type: 'gauge', value: 0 };
    this._metrics.redis_used_memory_bytes = { type: 'gauge', value: 0 };
    this._metrics.redis_keyspace_keys = { type: 'gauge', value: 0, labels: ['db'] };
    
    // WebSocket Metrics
    this._metrics.websocket_connections_active = { type: 'gauge', value: 0 };
    this._metrics.websocket_connections_total = { type: 'counter', value: 0 };
    this._metrics.websocket_auth_failures_total = { type: 'counter', value: 0 };
    this._metrics.websocket_messages_sent_total = { type: 'counter', value: 0 };
    this._metrics.websocket_messages_received_total = { type: 'counter', value: 0 };
    
    // AI Inference Metrics
    this._metrics.ai_inference_duration_seconds = { type: 'histogram', buckets: [0.01, 0.05, 0.1, 0.5, 1, 5], values: [] };
    this._metrics.ai_inference_total = { type: 'counter', value: 0, labels: ['model', 'success'] };
    this._metrics.ai_model_errors_total = { type: 'counter', value: 0, labels: ['model', 'error_type'] };
    this._metrics.ai_confidence_scores = { type: 'histogram', buckets: [0.1, 0.3, 0.5, 0.7, 0.9, 0.95], values: [] };
    this._metrics.ai_deepfake_detection_score = { type: 'histogram', buckets: [0.1, 0.3, 0.5, 0.7, 0.9], values: [] };
    this._metrics.ai_gpu_utilization_percent = { type: 'gauge', value: 0 };
    this._metrics.ai_gpu_memory_used_bytes = { type: 'gauge', value: 0 };
    
    // Queue Metrics
    this._metrics.job_queue_size = { type: 'gauge', value: 0 };
    this._metrics.job_queue_processed_total = { type: 'counter', value: 0 };
    this._metrics.job_queue_failed_total = { type: 'counter', value: 0 };
    this._metrics.job_queue_dead_letter_total = { type: 'counter', value: 0 };
    
    // Attendance Metrics
    this._metrics.attendance_checkin_total = { type: 'counter', value: 0, labels: ['location', 'success'] };
    this._metrics.attendance_checkout_total = { type: 'counter', value: 0, labels: ['location', 'success'] };
    this._metrics.face_match_success_rate = { type: 'gauge', value: 0 };
    this._metrics.geofence_violation_total = { type: 'counter', value: 0 };
    
    // Security Metrics
    this._metrics.authentication_success_total = { type: 'counter', value: 0 };
    this._metrics.authentication_failure_total = { type: 'counter', value: 0, labels: ['reason'] };
    this._metrics.security_events_total = { type: 'counter', value: 0, labels: ['event_type', 'severity'] };
    this._metrics.account_lockouts_total = { type: 'counter', value: 0 };
    
    // Circuit Breaker Metrics
    this._metrics.circuit_breaker_state = { type: 'gauge', value: 1, labels: ['service'] };  // 0=open, 0.5=half-open, 1=closed
    this._metrics.circuit_breaker_transitions_total = { type: 'counter', value: 0, labels: ['service', 'state'] };
    
    // Process Metrics
    this._metrics.process_uptime_seconds = { type: 'gauge', value: 0 };
    this._metrics.process_cpu_seconds_total = { type: 'counter', value: 0 };
    this._metrics.process_resident_memory_bytes = { type: 'gauge', value: 0 };
    this._metrics.process_heap_used_bytes = { type: 'gauge', value: 0 };
    this._metrics.process_heap_total_bytes = { type: 'gauge', value: 0 };
    
    // Kubernetes Metrics
    this._metrics.kube_pod_restart_count_total = { type: 'gauge', value: 0, labels: ['pod', 'namespace'] };
    this._metrics.kube_deployment_replicas = { type: 'gauge', value: 0, labels: ['deployment', 'state'] };  // state: desired, ready, updated
    
    logger.info('[PrometheusRegistry] Metrics initialized');
  }
  
  /**
   * Record a counter metric increment
   */
  incrementCounter(metricName, value = 1, labels = {}) {
    const metric = this._metrics[metricName];
    if (!metric) {
      logger.warn(`[PrometheusRegistry] Unknown counter: ${metricName}`);
      return;
    }
    
    if (metric.type !== 'counter') {
      logger.warn(`[PrometheusRegistry] Metric ${metricName} is not a counter`);
      return;
    }
    
    metric.value += value;
  }
  
  /**
   * Set a gauge metric value
   */
  setGauge(metricName, value, labels = {}) {
    const metric = this._metrics[metricName];
    if (!metric) {
      logger.warn(`[PrometheusRegistry] Unknown gauge: ${metricName}`);
      return;
    }
    
    if (metric.type !== 'gauge') {
      logger.warn(`[PrometheusRegistry] Metric ${metricName} is not a gauge`);
      return;
    }
    
    metric.value = value;
  }
  
  /**
   * Record a histogram value (observation)
   */
  observeHistogram(metricName, value, labels = {}) {
    const metric = this._metrics[metricName];
    if (!metric) {
      logger.warn(`[PrometheusRegistry] Unknown histogram: ${metricName}`);
      return;
    }
    
    if (metric.type !== 'histogram') {
      logger.warn(`[PrometheusRegistry] Metric ${metricName} is not a histogram`);
      return;
    }
    
    metric.values.push(value);
    if (metric.values.length > 10000) {
      metric.values = metric.values.slice(-5000);  // Keep rolling window
    }
  }
  
  /**
   * Get all metrics in Prometheus text format
   */
  getMetricsText() {
    let text = '';
    
    // Add help and type annotations, then values
    for (const [name, metric] of Object.entries(this._metrics)) {
      const fullName = `${this._namespace}_${name}`;
      
      // Skip empty metrics
      if (metric.type === 'counter' && metric.value === 0) continue;
      if (metric.type === 'gauge' && metric.value === 0) continue;
      if (metric.type === 'histogram' && metric.values.length === 0) continue;
      
      // Help text
      text += `# HELP ${fullName} ${this._getMetricHelp(name)}\n`;
      text += `# TYPE ${fullName} ${metric.type}\n`;
      
      // Value(s)
      if (metric.type === 'histogram') {
        // Histogram buckets
        for (const bucket of metric.buckets || []) {
          const count = metric.values.filter(v => v <= bucket).length;
          text += `${fullName}_bucket{le="${bucket}"} ${count}\n`;
        }
        text += `${fullName}_bucket{le="+Inf"} ${metric.values.length}\n`;
        text += `${fullName}_sum ${metric.values.reduce((a, b) => a + b, 0).toFixed(6)}\n`;
        text += `${fullName}_count ${metric.values.length}\n`;
      } else {
        // Gauge or Counter
        text += `${fullName} ${metric.value}\n`;
      }
    }
    
    return text;
  }
  
  /**
   * Get all metrics as JSON (for dashboards)
   */
  getMetricsJSON() {
    const result = {};
    
    for (const [name, metric] of Object.entries(this._metrics)) {
      if (metric.type === 'histogram') {
        result[name] = {
          type: metric.type,
          count: metric.values.length,
          sum: metric.values.reduce((a, b) => a + b, 0),
          min: Math.min(...metric.values),
          max: Math.max(...metric.values),
          avg: metric.values.reduce((a, b) => a + b, 0) / metric.values.length,
          p50: this._percentile(metric.values, 0.5),
          p95: this._percentile(metric.values, 0.95),
          p99: this._percentile(metric.values, 0.99)
        };
      } else {
        result[name] = {
          type: metric.type,
          value: metric.value
        };
      }
    }
    
    return result;
  }
  
  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
  }
  
  _getMetricHelp(name) {
    const helps = {
      api_requests_total: 'Total API requests',
      api_request_duration_seconds: 'API request duration in seconds',
      api_errors_total: 'Total API errors',
      db_connections_active: 'Active database connections',
      db_query_duration_seconds: 'Database query duration in seconds',
      redis_connected_clients: 'Connected Redis clients',
      websocket_connections_active: 'Active WebSocket connections',
      ai_inference_duration_seconds: 'AI inference duration in seconds',
      ai_inference_total: 'Total AI inferences',
      attendance_checkin_total: 'Total check-ins',
      attendance_checkout_total: 'Total check-outs',
      security_events_total: 'Total security events',
      process_uptime_seconds: 'Process uptime in seconds',
      process_resident_memory_bytes: 'Resident memory in bytes'
    };
    
    return helps[name] || `${name} metric`;
  }
  
  /**
   * Get metrics snapshot for a specific category
   */
  getMetricsForCategory(category) {
    const result = {};
    
    for (const [name, metric] of Object.entries(this._metrics)) {
      if (name.startsWith(category)) {
        result[name] = metric.type === 'histogram' 
          ? {
              type: metric.type,
              count: metric.values.length,
              avg: metric.values.reduce((a, b) => a + b, 0) / metric.values.length
            }
          : { type: metric.type, value: metric.value };
      }
    }
    
    return result;
  }
  
  /**
   * Reset all metrics (for testing)
   */
  reset() {
    for (const metric of Object.values(this._metrics)) {
      if (metric.type === 'counter' || metric.type === 'gauge') {
        metric.value = 0;
      } else if (metric.type === 'histogram') {
        metric.values = [];
      }
    }
    logger.info('[PrometheusRegistry] All metrics reset');
  }
}

// Singleton instance
let _registry_instance = null;

function getPrometheusRegistry() {
  if (!_registry_instance) {
    _registry_instance = new PrometheusRegistry();
  }
  return _registry_instance;
}

module.exports = {
  PrometheusRegistry,
  getPrometheusRegistry
};
