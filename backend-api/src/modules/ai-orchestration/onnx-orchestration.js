/**
 * PHASE 1 — ONNX ORCHESTRATION BACKEND
 *
 * Node.js backend layer that coordinates:
 *   - Model conversion/optimization requests to Python service
 *   - ONNX model selection for inference
 *   - Fallback to CPU inference when ONNX unavailable
 *   - Performance comparison (original vs ONNX)
 *   - Telemetry collection for ONNX systems
 */

const axios = require('axios');
const { logger } = require('../../config/logger');
const { telemetry } = require('../telemetry/collector');
const { tracing } = require('../../config/tracing');

/**
 * Configuration for ONNX inference
 */
const ONNX_CONFIG = {
  aiServiceUrl: process.env.FACE_AI_SERVICE_URL || 'http://localhost:8000',
  useOnnxByDefault: process.env.USE_ONNX_INFERENCE === 'true',
  fallbackOnError: true,
  modelCache: {},
  conversionInProgress: {},
  optimizationStats: {}
};

/**
 * Model configuration: source → ONNX conversion parameters
 */
const MODEL_CONFIGS = {
  'face_mesh_lite': {
    sourcePath: 'face_mesh_lite.pbtxt',
    sourceFramework: 'mediapipe',
    quantization: 'dynamic_int8',
    optimizationLevel: 'extended'
  },
  'liveness_detector': {
    sourcePath: 'liveness_detector.pt',
    sourceFramework: 'pytorch',
    quantization: 'static_int8',
    optimizationLevel: 'extended'
  },
  'spoof_detector': {
    sourcePath: 'spoof_detector',
    sourceFramework: 'tensorflow',
    quantization: 'float16',
    optimizationLevel: 'extended'
  }
};

/**
 * Initiates model conversion to ONNX (async, returns immediately)
 */
async function initiateModelConversion(modelName) {
  const span = tracing.startSpan('onnx.model_conversion', { model_name: modelName });
  
  try {
    if (ONNX_CONFIG.conversionInProgress[modelName]) {
      logger.warn(`[ONNXOrchestration] Conversion already in progress: ${modelName}`);
      return { status: 'in_progress', model: modelName };
    }
    
    const config = MODEL_CONFIGS[modelName];
    if (!config) {
      span.setStatus('ERROR');
      return { status: 'error', message: `Unknown model: ${modelName}` };
    }
    
    // Mark as in progress
    ONNX_CONFIG.conversionInProgress[modelName] = {
      startedAt: Date.now(),
      config: config
    };
    
    logger.info(`[ONNXOrchestration] Initiating conversion: ${modelName}`);
    
    // Fire async request to Python service (don't wait for completion)
    // Python service will handle convert → optimize → quantize → validate → runtime
    axios.post(`${ONNX_CONFIG.aiServiceUrl}/api/onnx/optimize`, {
      model_name: modelName,
      source_framework: config.sourceFramework,
      quantization_type: config.quantization,
      optimization_level: config.optimizationLevel,
      validate: true,
      warmup: true,
      async: true  // Tell Python service this is async
    }).catch(err => {
      logger.error(`[ONNXOrchestration] Async conversion request failed: ${err.message}`);
      delete ONNX_CONFIG.conversionInProgress[modelName];
    });
    
    span.end();
    return { status: 'conversion_initiated', model: modelName };
    
  } catch (error) {
    logger.error(`[ONNXOrchestration] Conversion initiation failed: ${error.message}`);
    span.setStatus('ERROR');
    span.end();
    return { status: 'error', message: error.message };
  }
}

/**
 * Check ONNX model status (converted, validated, ready for inference?)
 */
async function getModelStatus(modelName) {
  try {
    logger.debug(`[ONNXOrchestration] Checking model status: ${modelName}`);
    
    const response = await axios.get(
      `${ONNX_CONFIG.aiServiceUrl}/api/onnx/model-status/${modelName}`
    );
    
    return response.data;
    
  } catch (error) {
    logger.warn(`[ONNXOrchestration] Failed to get model status: ${error.message}`);
    return { status: 'unavailable', model: modelName };
  }
}

/**
 * Perform face recognition inference with automatic ONNX/CPU fallback
 */
async function inferenceWithFallback(frames, studentId, options = {}) {
  const span = tracing.startSpan('onnx.inference_with_fallback', {
    student_id: studentId,
    frames_count: frames.length
  });
  
  const startTime = Date.now();
  
  try {
    // Determine if ONNX should be used
    const useOnnx = options.preferOnnx !== false && ONNX_CONFIG.useOnnxByDefault;
    
    if (useOnnx) {
      logger.debug(`[ONNXOrchestration] Attempting ONNX inference: ${studentId}`);
      span.setAttribute('inference_engine', 'onnx');
      
      try {
        const result = await axios.post(
          `${ONNX_CONFIG.aiServiceUrl}/api/face-login-onnx`,
          { frames, student_id: studentId },
          { timeout: 15000 }
        );
        
        const latency = Date.now() - startTime;
        span.setAttribute('latency_ms', latency);
        span.setAttribute('status', 'success_onnx');
        span.end();
        
        telemetry.recordRequest('POST', '/api/face-login-onnx', 200, latency);
        
        return {
          success: true,
          engine: 'onnx',
          result: result.data,
          latency
        };
        
      } catch (error) {
        if (!ONNX_CONFIG.fallbackOnError) {
          logger.error(`[ONNXOrchestration] ONNX inference failed, fallback disabled`);
          throw error;
        }
        
        logger.warn(
          `[ONNXOrchestration] ONNX inference failed, falling back to CPU: ${error.message}`
        );
      }
    }
    
    // Fallback to CPU inference
    logger.debug(`[ONNXOrchestration] Using CPU inference: ${studentId}`);
    span.setAttribute('inference_engine', 'cpu_fallback');
    
    const result = await axios.post(
      `${ONNX_CONFIG.aiServiceUrl}/api/face-login`,
      { frames, student_id: studentId },
      { timeout: 15000 }
    );
    
    const latency = Date.now() - startTime;
    span.setAttribute('latency_ms', latency);
    span.setAttribute('status', 'success_cpu');
    span.end();
    
    telemetry.recordRequest('POST', '/api/face-login', 200, latency);
    
    return {
      success: true,
      engine: 'cpu',
      result: result.data,
      latency
    };
    
  } catch (error) {
    const latency = Date.now() - startTime;
    logger.error(`[ONNXOrchestration] Inference failed completely: ${error.message}`);
    
    span.setStatus('ERROR');
    span.setAttribute('latency_ms', latency);
    span.end();
    
    telemetry.recordRequest('POST', '/api/face-login', 500, latency);
    
    throw {
      code: 'INFERENCE_FAILED',
      message: 'Face recognition inference failed',
      error: error.message
    };
  }
}

/**
 * Get ONNX system status (conversion progress, model availability, performance)
 */
async function getOnnxStatus() {
  try {
    logger.debug('[ONNXOrchestration] Fetching ONNX system status');
    
    // Get status from Python service
    const response = await axios.get(
      `${ONNX_CONFIG.aiServiceUrl}/api/onnx/status`
    );
    
    return {
      ...response.data,
      conversionsInProgress: Object.keys(ONNX_CONFIG.conversionInProgress),
      config: {
        useOnnxByDefault: ONNX_CONFIG.useOnnxByDefault,
        fallbackOnError: ONNX_CONFIG.fallbackOnError
      }
    };
    
  } catch (error) {
    logger.warn(`[ONNXOrchestration] Failed to get ONNX status: ${error.message}`);
    return {
      status: 'unavailable',
      error: error.message,
      conversionsInProgress: Object.keys(ONNX_CONFIG.conversionInProgress)
    };
  }
}

/**
 * Get performance metrics for ONNX models
 */
async function getOnnxMetrics() {
  try {
    logger.debug('[ONNXOrchestration] Fetching ONNX metrics');
    
    const response = await axios.get(
      `${ONNX_CONFIG.aiServiceUrl}/api/onnx/metrics`
    );
    
    return response.data;
    
  } catch (error) {
    logger.warn(`[ONNXOrchestration] Failed to get ONNX metrics: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * Compare performance: ONNX vs CPU for a test sample
 */
async function benchmarkInference(frames, sampleId = 'benchmark') {
  const span = tracing.startSpan('onnx.benchmark', { sample_id: sampleId });
  
  try {
    logger.info(`[ONNXOrchestration] Starting inference benchmark`);
    
    // CPU inference
    const cpuStart = Date.now();
    const cpuResult = await axios.post(
      `${ONNX_CONFIG.aiServiceUrl}/api/face-login`,
      { frames, student_id: sampleId },
      { timeout: 60000 }
    );
    const cpuLatency = Date.now() - cpuStart;
    
    // ONNX inference
    const onnxStart = Date.now();
    let onnxLatency = 0;
    let onnxResult = null;
    try {
      onnxResult = await axios.post(
        `${ONNX_CONFIG.aiServiceUrl}/api/face-login-onnx`,
        { frames, student_id: sampleId },
        { timeout: 60000 }
      );
      onnxLatency = Date.now() - onnxStart;
    } catch (error) {
      logger.warn(`[ONNXOrchestration] ONNX benchmark failed: ${error.message}`);
      onnxLatency = null;
    }
    
    const benchmark = {
      cpu_latency_ms: cpuLatency,
      onnx_latency_ms: onnxLatency,
      speedup_factor: onnxLatency ? (cpuLatency / onnxLatency).toFixed(2) : 'n/a',
      cpu_result: cpuResult.data,
      onnx_result: onnxResult?.data || null
    };
    
    logger.info(
      `[ONNXOrchestration] Benchmark complete: CPU=${cpuLatency}ms, ONNX=${onnxLatency}ms, ` +
      `Speedup=${benchmark.speedup_factor}x`
    );
    
    span.end();
    return benchmark;
    
  } catch (error) {
    logger.error(`[ONNXOrchestration] Benchmark failed: ${error.message}`);
    span.setStatus('ERROR');
    span.end();
    throw error;
  }
}

/**
 * Initialize ONNX system on server startup
 */
async function initializeOnnx() {
  logger.info('[ONNXOrchestration] Initializing ONNX systems...');
  
  try {
    // Check if Python service is available
    const healthResponse = await axios.get(
      `${ONNX_CONFIG.aiServiceUrl}/health`,
      { timeout: 5000 }
    );
    
    logger.info('[ONNXOrchestration] Python AI service available:', healthResponse.data);
    
    // Initiate conversions for all models (async, happens in background)
    for (const [modelName, config] of Object.entries(MODEL_CONFIGS)) {
      try {
        await initiateModelConversion(modelName);
      } catch (error) {
        logger.warn(`[ONNXOrchestration] Failed to initiate conversion for ${modelName}: ${error.message}`);
      }
    }
    
    logger.info('[ONNXOrchestration] ONNX initialization complete (conversions in progress)');
    return true;
    
  } catch (error) {
    logger.warn(`[ONNXOrchestration] ONNX initialization failed: ${error.message}`);
    logger.warn('[ONNXOrchestration] Will continue with CPU-only inference');
    ONNX_CONFIG.useOnnxByDefault = false;
    return false;
  }
}

module.exports = {
  ONNX_CONFIG,
  MODEL_CONFIGS,
  initiateModelConversion,
  getModelStatus,
  inferenceWithFallback,
  getOnnxStatus,
  getOnnxMetrics,
  benchmarkInference,
  initializeOnnx
};
