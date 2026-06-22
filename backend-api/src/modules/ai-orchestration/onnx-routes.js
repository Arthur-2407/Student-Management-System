/**
 * PHASE 1 — ONNX API ROUTES
 *
 * Endpoints for:
 *   - Checking ONNX system status
 *   - Initiating model conversions
 *   - Getting inference metrics
 *   - Benchmarking performance
 *   - Managing ONNX lifecycle
 */

const express = require('express');
const { logger } = require('../../config/logger');
const {
  initiateModelConversion,
  getModelStatus,
  getOnnxStatus,
  getOnnxMetrics,
  benchmarkInference
} = require('./onnx-orchestration');
const { requireRole } = require('../../middleware/rbac');

const router = express.Router();

/**
 * GET /api/onnx/status
 * Get current ONNX system status (model conversions, availability)
 */
router.get('/status', requireRole('teacher'), async (req, res) => {
  try {
    logger.debug('[ONNXRoutes] GET /onnx/status');
    
    const status = await getOnnxStatus();
    res.json(status);
    
  } catch (error) {
    logger.error('[ONNXRoutes] Status fetch failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to get ONNX status',
      code: 'ONNX_STATUS_ERROR'
    });
  }
});

/**
 * GET /api/onnx/metrics
 * Get ONNX inference performance metrics
 */
router.get('/metrics', requireRole('teacher'), async (req, res) => {
  try {
    logger.debug('[ONNXRoutes] GET /onnx/metrics');
    
    const metrics = await getOnnxMetrics();
    res.json(metrics);
    
  } catch (error) {
    logger.error('[ONNXRoutes] Metrics fetch failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to get ONNX metrics',
      code: 'ONNX_METRICS_ERROR'
    });
  }
});

/**
 * GET /api/onnx/model-status/:modelName
 * Check status of a specific model conversion
 */
router.get('/model-status/:modelName', requireRole('teacher'), async (req, res) => {
  try {
    const { modelName } = req.params;
    logger.debug('[ONNXRoutes] GET /onnx/model-status', { model: modelName });
    
    const status = await getModelStatus(modelName);
    res.json(status);
    
  } catch (error) {
    logger.error('[ONNXRoutes] Model status fetch failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to get model status',
      code: 'MODEL_STATUS_ERROR'
    });
  }
});

/**
 * POST /api/onnx/convert
 * Initiate model conversion to ONNX
 * 
 * Body: { model_name: string, quantization?: string, optimization_level?: string }
 */
router.post('/convert', requireRole('admin'), async (req, res) => {
  try {
    const { model_name, quantization = 'dynamic_int8', optimization_level = 'extended' } = req.body;
    
    if (!model_name) {
      return res.status(400).json({
        error: 'Missing required field: model_name',
        code: 'INVALID_REQUEST'
      });
    }
    
    logger.info('[ONNXRoutes] POST /onnx/convert', {
      model_name,
      quantization,
      optimization_level,
      requestId: req.requestId
    });
    
    const result = await initiateModelConversion(model_name, {
      quantization_type: quantization,
      optimization_level
    });
    
    res.json(result);
    
  } catch (error) {
    logger.error('[ONNXRoutes] Conversion initiation failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to initiate model conversion',
      code: 'CONVERSION_FAILED',
      details: error.message
    });
  }
});

/**
 * POST /api/onnx/benchmark
 * Benchmark inference performance (ONNX vs CPU)
 * 
 * Body: { frames: Base64[], num_iterations?: number }
 */
router.post('/benchmark', requireRole('admin'), async (req, res) => {
  try {
    const { frames, num_iterations = 1 } = req.body;
    
    if (!frames || frames.length === 0) {
      return res.status(400).json({
        error: 'Missing required field: frames',
        code: 'INVALID_REQUEST'
      });
    }
    
    logger.info('[ONNXRoutes] POST /onnx/benchmark', {
      framesCount: frames.length,
      iterations: num_iterations,
      requestId: req.requestId
    });
    
    const results = [];
    for (let i = 0; i < num_iterations; i++) {
      const benchmark = await benchmarkInference(frames, `benchmark_${i}`);
      results.push(benchmark);
    }
    
    // Calculate averages across iterations
    const avgCpuLatency = results.reduce((sum, b) => sum + b.cpu_latency_ms, 0) / results.length;
    const avgOnnxLatency = results.filter(b => b.onnx_latency_ms).reduce((sum, b) => sum + b.onnx_latency_ms, 0) / results.filter(b => b.onnx_latency_ms).length;
    
    res.json({
      iterations: num_iterations,
      results: results,
      summary: {
        avg_cpu_latency_ms: avgCpuLatency.toFixed(2),
        avg_onnx_latency_ms: avgOnnxLatency.toFixed(2),
        avg_speedup_factor: (avgCpuLatency / avgOnnxLatency).toFixed(2)
      }
    });
    
  } catch (error) {
    logger.error('[ONNXRoutes] Benchmark failed', { error: error.message });
    res.status(500).json({
      error: 'Benchmark failed',
      code: 'BENCHMARK_FAILED',
      details: error.message
    });
  }
});

/**
 * GET /api/onnx/health
 * Lightweight health check for ONNX subsystem
 */
router.get('/health', async (req, res) => {
  try {
    const status = await getOnnxStatus();
    const isHealthy = status.status === 'ready' || status.status === 'partial';
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      onnx_status: status.status,
      models_ready: status.models_ready || 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
