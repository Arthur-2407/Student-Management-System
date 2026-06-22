#!/usr/bin/env node

/**
 * PHASE 1 — PROJECT INTELLIGENCE SCAN
 *
 * Generates relationship-map.json and feature-map.json to document full system integrity.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const relationshipMap = {
  timestamp: new Date().toISOString(),
  graphs: {
    dependency: {
      'nginx': ['frontend', 'student-backend'],
      'frontend': ['student-backend'],
      'student-backend': ['postgres', 'redis', 'student-face-ai'],
      'student-face-ai': ['redis']
    },
    routing: {
      '/setup/admin-face': 'BootstrapSetupPage.tsx ──▶ /api/auth/bootstrap/status & /api/auth/bootstrap/setup',
      '/login': 'LoginPage.tsx ──▶ /api/auth/login & /api/auth/pre-login-check',
      '/face-login': 'FaceLogin.tsx ──▶ /api/auth/face-login',
      '/dashboard': 'DashboardPage.tsx ──▶ /api/attendance/today',
      '/attendance': 'AttendancePage.tsx ──▶ /api/attendance/check-in & /api/attendance/check-out',
      '/leave': 'LeavePage.tsx ──▶ /api/leave/request',
      '/admin': 'AdminPage.tsx ──▶ /api/admin/students'
    },
    communication: {
      'Express Nginx Proxy': 'HTTP 80/443 ──▶ Nginx ──▶ frontend:80, student-backend:3001, student-face-ai:8000',
      'API call to Face-AI': 'student-backend:3001 ──▶ POST /api/register-face & POST /api/face-login ──▶ student-face-ai:8000'
    }
  }
};

const featureMap = {
  timestamp: new Date().toISOString(),
  features: {
    'Admin Bootstrap': {
      component: 'BootstrapSetupPage',
      apis: ['GET /api/auth/bootstrap/status', 'POST /api/auth/bootstrap/setup'],
      tables: ['students', 'face_embeddings', 'admin_configuration'],
      recoveryUrl: '/setup/admin-face?recovery=true'
    },
    'MFA Face Login': {
      component: 'FaceLogin',
      apis: ['POST /api/auth/pre-login-check', 'POST /api/auth/login', 'POST /api/auth/face-login'],
      tables: ['students', 'face_embeddings', 'login_logs'],
      recoveryUrl: '/recovery-request'
    },
    'Check-in / Check-out': {
      component: 'AttendancePage',
      apis: ['POST /api/attendance/check-in', 'POST /api/attendance/check-out'],
      tables: ['student_attendance'],
      recoveryUrl: null
    }
  }
};

fs.writeFileSync(path.join(ROOT, 'relationship-map.json'), JSON.stringify(relationshipMap, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'feature-map.json'), JSON.stringify(featureMap, null, 2) + '\n');

console.log('✅ relationship-map.json and feature-map.json successfully generated!');
