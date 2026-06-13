# OMEGA V9 — INTEGRATION & DEPLOYMENT GUIDE

**Version:** 1.0  
**Effective Date:** May 9, 2026  
**Status:** Phase 1 Production-Ready, Phase 5 In-Progress

---

## SYSTEM INTEGRATION OVERVIEW

All OMEGA V9 components integrate seamlessly with the existing attendance system infrastructure. **Zero breaking changes** — all new systems are additive.

### Service Topology

```
┌─────────────────────────────────────────────────────┐
│              Frontend (React/Vite)                  │
│  - Attendance UI                                    │
│  - Dashboard                                        │
│  - Admin controls                                   │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS (port 443)
┌──────────────────▼──────────────────────────────────┐
│            Backend API (Node.js)                    │
│            Port: 3001 (HTTP)                        │
│  ┌────────────────────────────────────────────────┐ │
│  │ Existing Attendance Endpoints                  │ │
│  │ - /api/attendance/checkin (MODIFIED for ONNX) │ │
│  │ - /api/attendance/checkout                    │ │
│  │ - /api/attendance/history                     │ │
│  │ - /api/employees/*                            │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ NEW: ONNX Orchestration Endpoints [Phase 1]   │ │
│  │ - GET /api/onnx/status                        │ │
│  │ - GET /api/onnx/metrics                       │ │
│  │ - POST /api/onnx/convert                      │ │
│  │ - POST /api/onnx/benchmark                    │ │
│  │ - GET /api/onnx/health                        │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ NEW: Prometheus Metrics [Phase 5]             │ │
│  │ - GET /api/telemetry/prometheus               │ │
│  │ - GET /api/telemetry/metrics                  │ │
│  │ - GET /api/telemetry/health                   │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ Infrastructure Modules                        │ │
│  │ - PrometheusRegistry (metrics storage)        │ │
│  │ - PrometheusCollector (metrics interface)     │ │
│  │ - ONNXOrchestration (model coordination)      │ │
│  └────────────────────────────────────────────────┘ │
└──────────────┬────────────────┬─────────────────────┘
               │                │
               │ GRPC           │ (metrics)
               │ (port 50051)   │
    ┌──────────▼────────┐   ┌───▼──────────────────┐
    │ AI Service        │   │ Prometheus           │
    │ (Python/FastAPI)  │   │ (metrics scraper)    │
    │ Port: 8000        │   │ Port: 9090           │
    │ ┌────────────────┐│   └──────────┬───────────┘
    │ │ ONNX Pipeline  ││              │
    │ │ - Convert      ││              │
    │ │ - Optimize     ││              │
    │ │ - Quantize     ││              │
    │ │ - Validate     ││   ┌──────────▼───────────┐
    │ │ - Runtime      ││   │ Grafana              │
    │ │ (with fallback)││   │ (dashboards)         │
    │ └────────────────┘│   │ Port: 3000           │
    │ ┌────────────────┐│   └─────────────────────┘
    │ │ AI Models      ││
    │ │ - Face detect  ││
    │ │ - Face recog   ││
    │ │ - Liveness     ││
    │ │ - Spoof detect ││
    │ └────────────────┘│
    └──────────────────┘
```

---

## INTEGRATION POINTS

### 1. ONNX Inference Integration

**File:** `backend-api/src/modules/ai-orchestration/onnx-orchestration.js`

**Hook into attendance check-in:**

```javascript
// backend-api/src/routes/attendance.js
const { inferenceWithFallback } = require('../modules/ai-orchestration/onnx-orchestration');

router.post('/checkin', async (req, res) => {
  try {
    const { frames, employeeId, location } = req.body;
    
    // Use ONNX with automatic CPU fallback
    const result = await inferenceWithFallback(frames, employeeId, {
      preferOnnx: true  // Use ONNX if available, fall back to CPU
    });
    
    // Rest of check-in logic unchanged
    const attendance = await recordAttendance({
      employeeId,
      location,
      timestamp: new Date(),
      recognitionEngine: result.engine,  // 'onnx' or 'cpu'
      faceMatch: result.result.match_confidence,
      livenessScore: result.result.liveness_score,
      latency: result.latency
    });
    
    res.json(attendance);
    
  } catch (error) {
    // Existing error handling
    res.status(500).json({ error: error.message });
  }
});
```

**No changes needed to:**
- ✅ Database schema
- ✅ API response format
- ✅ Authentication/authorization
- ✅ Existing endpoint behavior

### 2. Metrics Collection Integration

**File:** `backend-api/src/modules/prometheus/metrics-collector.js`

**Hook into request pipeline:**

```javascript
// backend-api/src/middleware/metrics.js
const { getPrometheusCollector } = require('../modules/prometheus/metrics-collector');
const collector = getPrometheusCollector();

module.exports = (req, res, next) => {
  const startTime = Date.now();
  
  // Intercept response
  const originalJson = res.json;
  res.json = function(data) {
    const latency = Date.now() - startTime;
    const statusCode = res.statusCode || 200;
    
    // Record metrics
    collector.recordAPIRequest(req.method, req.path, statusCode, latency);
    
    return originalJson.call(this, data);
  };
  
  next();
};

// In server.js
app.use(metricsMiddleware);
```

**Hook into database operations:**

```javascript
// backend-api/src/config/database.js
const { getPrometheusCollector } = require('../modules/prometheus/metrics-collector');

const query = async (sql, params) => {
  const startTime = Date.now();
  const collector = getPrometheusCollector();
  
  try {
    const result = await pool.query(sql, params);
    const latency = Date.now() - startTime;
    
    collector.recordDatabaseQuery('select', latency, true);
    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    collector.recordDatabaseQuery('select', latency, false);
    throw error;
  }
};
```

### 3. ONNX Initialization on Startup

**File:** `backend-api/src/server.js`

```javascript
const { initializeOnnx } = require('./modules/ai-orchestration/onnx-orchestration');

// During server initialization
async function startServer() {
  // Existing initialization...
  
  // Initialize ONNX systems (async, doesn't block server startup)
  initializeOnnx()
    .then(() => logger.info('[Server] ONNX system initialized'))
    .catch(err => logger.warn('[Server] ONNX initialization failed (CPU fallback enabled)', err));
  
  // Continue server startup
  app.listen(3001, () => {
    logger.info('[Server] Backend API listening on port 3001');
  });
}
```

### 4. Prometheus Metrics Export

**File:** `backend-api/src/routes/telemetry.js`

```javascript
const express = require('express');
const { getPrometheusCollector } = require('../modules/prometheus/metrics-collector');

const router = express.Router();

// Prometheus scrape endpoint
router.get('/prometheus', (req, res) => {
  const collector = getPrometheusCollector();
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(collector.getMetricsText());
});

// JSON metrics for dashboards
router.get('/metrics', (req, res) => {
  const collector = getPrometheusCollector();
  res.json(collector.getMetricsJSON());
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;
```

---

## DEPLOYMENT SEQUENCE

### Step 1: Python AI Service

```bash
# 1. Install ONNX dependencies
cd face-ai-service
pip install onnxruntime onnx onnx-optimizer

# 2. Update requirements.txt
echo "onnxruntime>=1.14.0" >> requirements.txt
echo "onnx>=1.12.0" >> requirements.txt
echo "onnx-optimizer>=0.3.0" >> requirements.txt

# 3. Build Docker image
docker build -f Dockerfile.prod -t face-ai-service:latest .

# 4. Start service
docker run -d \
  --name face-ai-service \
  -p 8000:8000 \
  -e USE_ONNX_INFERENCE=false \
  -v $(pwd)/models:/app/models \
  face-ai-service:latest
```

### Step 2: Backend API

```bash
# 1. Add metric routes to server.js
cd backend-api
# Edit src/server.js to include:
#   const telemetryRoutes = require('./routes/telemetry');
#   app.use('/api/telemetry', telemetryRoutes);
#   const onnxRoutes = require('./modules/ai-orchestration/onnx-routes');
#   app.use('/api/onnx', onnxRoutes);

# 2. Install dependencies (if not already present)
npm install  # axios already in package.json

# 3. Build Docker image
docker build -f Dockerfile.prod -t backend-api:latest .

# 4. Start service
docker run -d \
  --name backend-api \
  -p 3001:3001 \
  -e FACE_AI_SERVICE_URL=http://face-ai-service:8000 \
  -e USE_ONNX_INFERENCE=false \
  -e NODE_ENV=production \
  backend-api:latest
```

### Step 3: Prometheus

```bash
# 1. Create prometheus.yml
cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'attendance-system'
    static_configs:
      - targets: ['backend-api:3001']
    metrics_path: '/api/telemetry/prometheus'
    scrape_interval: 15s
    scrape_timeout: 10s
EOF

# 2. Start Prometheus
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus:latest
```

### Step 4: Grafana

```bash
# 1. Start Grafana
docker run -d \
  --name grafana \
  -p 3000:3000 \
  -e GF_SECURITY_ADMIN_PASSWORD=admin \
  grafana/grafana:latest

# 2. Add Prometheus datasource (API call)
curl -X POST http://localhost:3000/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Prometheus",
    "type": "prometheus",
    "url": "http://prometheus:9090",
    "access": "proxy",
    "isDefault": true
  }'

# 3. Import dashboards (done in Phase 6)
```

---

## VERIFICATION STEPS

### Verify ONNX System

```bash
# 1. Check health
curl http://localhost:3001/api/onnx/health
# Expected: {"status": "healthy", "onnx_status": "ready", ...}

# 2. Check status
curl http://localhost:3001/api/onnx/status
# Expected: {"status": "ready", "models_ready": 3, "conversions_in_progress": [], ...}

# 3. Check metrics
curl http://localhost:3001/api/onnx/metrics
# Expected: JSON with inference latencies and accuracy metrics

# 4. Run benchmark
curl -X POST http://localhost:3001/api/onnx/benchmark \
  -H "Content-Type: application/json" \
  -d '{
    "frames": ["base64_encoded_frame1", "base64_encoded_frame2"],
    "num_iterations": 3
  }'
# Expected: Speedup factor (should be > 1.0)
```

### Verify Metrics Collection

```bash
# 1. Check Prometheus metrics endpoint
curl http://localhost:3001/api/telemetry/prometheus
# Expected: Prometheus text format metrics (lots of output)

# 2. Check Prometheus scrape
curl http://localhost:9090/api/v1/targets
# Expected: Backend API target should show "UP"

# 3. Query a metric in Prometheus
curl 'http://localhost:9090/api/v1/query?query=attendance_system_api_requests_total'
# Expected: JSON with metric values
```

### Verify Grafana Integration

```bash
# 1. Access Grafana
open http://localhost:3000
# Login: admin / admin (default)

# 2. Verify datasource
Configuration → Data Sources → Prometheus
# Should show "Data source is working"

# 3. Check metrics
Explore → Select Prometheus datasource
# Query: attendance_system_api_requests_total
# Should show data being scraped
```

---

## CONFIGURATION OPTIONS

### Environment Variables

```bash
# AI Service
USE_ONNX_INFERENCE=true                    # Enable ONNX (false = CPU only)
ONNX_OPTIMIZATION_LEVEL=extended           # none, basic, extended, all
ONNX_QUANTIZATION_TYPE=dynamic_int8        # dynamic_int8, static_int8, float16, mixed

# Backend API
FACE_AI_SERVICE_URL=http://face-ai-service:8000
NODE_ENV=production
LOG_LEVEL=info

# Prometheus
PROMETHEUS_SCRAPE_INTERVAL=15s
PROMETHEUS_RETENTION=24h

# Grafana
GF_SECURITY_ADMIN_PASSWORD=secure_password
GF_SERVER_ROOT_URL=https://dashboard.company.com
```

---

## GRADUAL ROLLOUT STRATEGY

### Week 1: Shadow Mode

```bash
# Disable ONNX for all users
USE_ONNX_INFERENCE=false

# Collect metrics in background
# Monitor: ONNX conversion progress, error rates
```

### Week 2: Canary

```bash
# Enable for supervisors only
USE_ONNX_INFERENCE=true
ONNX_ALLOWED_ROLES=supervisor

# Monitor: Performance impact, accuracy, errors
# Target: < 0.1% accuracy loss, < 5% latency variance
```

### Week 3: Ramp

```bash
# Enable for morning hours only (6am-12pm)
USE_ONNX_INFERENCE=true
ONNX_TIME_WINDOW="06:00-12:00"

# Monitor: Same as canary
```

### Week 4: Full

```bash
# Enable globally
USE_ONNX_INFERENCE=true
# CPU fallback always enabled for safety

# Monitor: Full system impact, long-term stability
```

---

## TROUBLESHOOTING

### ONNX Inference Fails

```
Error: "ONNX inference failed, falling back to CPU"
Solution:
1. Check ONNX Runtime installation: pip list | grep onnxruntime
2. Check model files exist: ls -la face-ai-service/models/
3. Check Python logs: docker logs face-ai-service
4. Verify ONNX model format: python -m onnx face-ai-service/models/model.onnx
```

### Metrics Not Appearing

```
Error: Prometheus showing no data for attendance_system_*
Solution:
1. Check metrics endpoint: curl http://localhost:3001/api/telemetry/prometheus
2. Check Prometheus scrape: Prometheus UI → Status → Targets
3. Check backend logs: docker logs backend-api | grep metric
4. Verify middleware is active: Check metrics.js is required in server.js
```

### GPU Not Being Used (Phase 2)

```
Error: "GPU utilization is 0%"
Solution:
1. Check TensorRT installation: pip list | grep tensorrt
2. Check CUDA availability: nvidia-smi
3. Check GPU models loaded: GET /api/onnx/metrics
4. Verify Phase 2 is enabled
```

---

## MONITORING DASHBOARDS

See `Phase 6 (Grafana Dashboards)` for:
- 12 pre-built dashboards covering all system layers
- Alert rules for critical metrics
- SLA/SLO tracking
- Incident management views

---

## ROLLBACK PROCEDURE

### Immediate Rollback (If Critical Issue)

```bash
# 1. Disable ONNX
export USE_ONNX_INFERENCE=false

# 2. Restart backend API
docker restart backend-api

# 3. Verify system is stable
curl http://localhost:3001/api/attendance/checkin
# Should work with CPU inference only

# 4. Investigate in ONNX logs
docker logs face-ai-service | grep ERROR
```

### Full Rollback

```bash
# 1. Stop ONNX services
docker stop face-ai-service prometheus grafana

# 2. Restart backend API (CPU mode)
docker restart backend-api

# 3. Revert code changes (git)
git revert <onnx-commit-hash>

# 4. Redeploy
docker-compose -f docker-compose.prod.yml up -d
```

---

## NEXT INTEGRATION TASKS

1. **Phase 5 Completion**
   - [ ] Wire Prometheus routes into backend-api
   - [ ] Create Grafana datasource
   - [ ] Test metrics export

2. **Phase 6 (Grafana Dashboards)**
   - [ ] Create 12 dashboard templates
   - [ ] Set up alert rules
   - [ ] Configure dashboard provisioning

3. **Phase 2 (GPU Support)**
   - [ ] Provision GPU nodes in Kubernetes
   - [ ] Implement TensorRT engine generation
   - [ ] Wire GPU scheduling

---

## CONCLUSION

OMEGA V9 Phase 1 integrates seamlessly with existing infrastructure with **zero breaking changes**. All new systems are additive and include automatic CPU fallback for safety.

**Production deployment ready** — follow the deployment sequence above for a 4-step rollout process.

