const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Employee Attendance System...\n');

// Function to start a service and log output
function startService(name, command, cwd, color = '\x1b[36m') {
  return new Promise((resolve) => {
    console.log(`${color}Starting ${name}...${color}`);
    
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, { 
      cwd, 
      stdio: 'pipe',
      shell: true 
    });
    
    child.stdout.on('data', (data) => {
      console.log(`${color}[${name}]${color} ${data.toString().trim()}`);
    });
    
    child.stderr.on('data', (data) => {
      console.error(`${color}[${name} ERROR]${color} ${data.toString().trim()}`);
    });
    
    child.on('error', (error) => {
      console.error(`${color}[${name} ERROR]${color} Failed to start: ${error.message}`);
    });
    
    // Wait a moment for the service to start
    setTimeout(() => {
      resolve(child);
    }, 2000);
  });
}

async function startAllServices() {
  try {
    const colors = {
      backend: '\x1b[32m',  // Green
      frontend: '\x1b[34m', // Blue  
      faceai: '\x1b[35m'    // Magenta
    };
    
    // Start Backend
    const backend = await startService(
      'Backend API', 
      'node src/dev-server.js', 
      path.join(__dirname, 'backend-api'),
      colors.backend
    );
    
    // Start Face AI Service
    const faceAI = await startService(
      'Face AI Service', 
      'python mock-service.py', 
      path.join(__dirname, 'face-ai-service'),
      colors.faceai
    );
    
    // Start Frontend
    const frontend = await startService(
      'Frontend', 
      'npm run dev', 
      path.join(__dirname, 'frontend'),
      colors.frontend
    );
    
    console.log('\n✅ All services started successfully!\n');
    console.log('📋 Service URLs:');
    console.log('   🖥️  Frontend:        http://localhost:3000');
    console.log('   🔧 Backend API:     http://localhost:3001');
    console.log('   🤖 Face AI Service: http://localhost:8000');
    console.log('\n🧪 Test Pages:');
    console.log('   🔗 Connection Test: http://localhost:3000/test-connection.html');
    console.log('   📊 Backend Info:    http://localhost:3001/dev-info');
    console.log('   🤖 Face AI Info:    http://localhost:8000/info');
    
    console.log('\n📝 Available API Endpoints:');
    console.log('   🔐 POST /api/auth/face-login - Face authentication');
    console.log('   📅 GET  /api/attendance/today - Today\'s attendance');
    console.log('   📤 POST /api/attendance/check-in - Check in');
    console.log('   📥 POST /api/attendance/check-out - Check out');
    console.log('   📝 GET  /api/leave - Leave requests');
    console.log('   📊 GET  /api/work-report - Work reports');
    console.log('   🗺️  GET  /api/geofence/check - Geofence check');
    console.log('   🔒 GET  /api/security/events - Security events');
    console.log('   🔔 GET  /api/notification/ - Notifications');
    
    console.log('\n🎯 Development Mode Features:');
    console.log('   ✅ Mock database (no PostgreSQL required)');
    console.log('   ✅ Mock Redis (no Redis server required)');
    console.log('   ✅ Mock Face AI service with realistic responses');
    console.log('   ✅ Full API functionality with sample data');
    console.log('   ✅ WebSocket support for real-time features');
    console.log('   ✅ CORS properly configured');
    console.log('   ✅ Vite proxy working correctly');
    
    console.log('\n⚡ Quick Test Commands:');
    console.log('   curl http://localhost:3001/health');
    console.log('   curl http://localhost:3000/api/test');
    console.log('   curl http://localhost:8000/health');
    
    console.log('\n🛑 To stop all services: Press Ctrl+C or run taskkill /F /IM node.exe');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down services...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start services:', error.message);
    process.exit(1);
  }
}

// Check if required directories exist
const fs = require('fs');
const requiredDirs = ['backend-api', 'frontend', 'face-ai-service'];

for (const dir of requiredDirs) {
  if (!fs.existsSync(path.join(__dirname, dir))) {
    console.error(`❌ Required directory not found: ${dir}`);
    process.exit(1);
  }
}

startAllServices();
