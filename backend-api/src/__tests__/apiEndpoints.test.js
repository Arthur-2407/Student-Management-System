/**
 * V8 — API Integration Tests: Prometheus & Frontend Error Endpoints
 */

// Set up port and env variables to prevent port collision and database connections during test import
process.env.PORT = '0'; // Bind to random port
process.env.RUN_MIGRATIONS = 'false';
process.env.NODE_ENV = 'test';

jest.mock('../config/database', () => ({
  connectDB: jest.fn().mockResolvedValue(true),
  connectFaceDB: jest.fn().mockResolvedValue(true),
  isDatabaseHealthy: jest.fn().mockResolvedValue(true),
  faceQuery: jest.fn(),
  pool: {
    end: jest.fn().mockImplementation((cb) => {
      if (cb) cb();
      return Promise.resolve();
    }),
  }
}));

jest.mock('../config/redis', () => ({
  connectRedis: jest.fn().mockResolvedValue(true),
  isRedisHealthy: jest.fn().mockResolvedValue(true),
  disconnectRedis: jest.fn().mockResolvedValue(true),
}));

jest.mock('../migrations/runMigrations', () => ({
  runMigrations: jest.fn().mockResolvedValue(true),
}));

// Mock http.get to bypass warmup service health checks and prevent long timers
const http = require('http');
jest.spyOn(http, 'get').mockImplementation((url, options, callback) => {
  const cb = typeof options === 'function' ? options : callback;
  const res = { statusCode: 200 };
  if (cb) cb(res);
  return {
    on: jest.fn(),
  };
});

const request = require('supertest');
const { app, io } = require('../server');

describe('API Observability Endpoints', () => {
  afterAll(async () => {
    // Graceful close of WebSocket server to allow Jest clean exit
    if (io) {
      await new Promise(resolve => io.close(resolve));
    }
  });

  describe('POST /api/dev/frontend-error', () => {
    test('accepts frontend errors and returns 204', async () => {
      const response = await request(app)
        .post('/api/dev/frontend-error')
        .send({
          level: 'error',
          message: 'Test UI Crash',
          timestamp: new Date().toISOString(),
          service: 'frontend',
        });
      
      expect(response.statusCode).toBe(204);
    });
  });

  describe('GET /metrics', () => {
    test('exposes Prometheus metrics and returns text/plain', async () => {
      const response = await request(app)
        .get('/metrics');
      
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('process_uptime_seconds');
    });
  });

  describe('GET /api/telemetry/prometheus', () => {
    test('rejects unauthenticated requests with 401', async () => {
      const response = await request(app)
        .get('/api/telemetry/prometheus');
      
      expect(response.statusCode).toBe(401);
    });
  });
});
