const fs = require('fs');

const PROXY_URL = 'http://localhost';
const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const dummyFrames = Array(10).fill(dummyBase64);

async function verifyAdmin() {
  console.log('=== VERIFYING ADMIN SETUP STATE ===');
  
  // 1. Check health
  const healthRes = await fetch(`${PROXY_URL}/health`);
  const health = await healthRes.json();
  console.log('System Health Status:', health.status);
  
  // 2. Perform Admin Face Login
  const loginPayload = {
    studentId: 'admin',
    password: 'Admin@123',
    frames: dummyFrames
  };
  
  console.log('Attempting Admin Face Login...');
  const response = await fetch(`${PROXY_URL}/api/auth/face-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(loginPayload)
  });
  
  const result = await response.json();
  console.log('HTTP Status:', response.status);
  console.log('Login Response:', JSON.stringify(result, null, 2));
  
  if (response.status === 200 && result.success === true && result.tokens) {
    console.log('✅ Admin credentials and face authentication VERIFIED successfully.');
  } else {
    console.error('❌ Admin login verification FAILED.');
    process.exit(1);
  }
}

verifyAdmin().catch(err => {
  console.error('Error during admin verification:', err);
  process.exit(1);
});
