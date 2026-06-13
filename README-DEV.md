# Employee Attendance System - Development Setup

## 🚀 Quick Start

### Option 1: Automated Startup (Recommended)
```bash
# Double-click this file or run in terminal
start-project.bat

# Or run directly with Node.js
node start-project.js
```

### Option 2: Manual Startup
```bash
# Terminal 1 - Backend API
cd backend-api
node src/dev-server.js

# Terminal 2 - Face AI Service  
cd face-ai-service
python mock-service.py

# Terminal 3 - Frontend
cd frontend
npm run dev
```

## 📋 Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| 🖥️ Frontend | http://localhost:3000 | React application |
| 🔧 Backend API | http://localhost:3001 | Node.js API server |
| 🤖 Face AI Service | http://localhost:8000 | Python ML service |

## 🧪 Testing

### Connection Test Page
Visit: http://localhost:3000/test-connection.html

This page provides:
- ✅ Automated connection tests
- 📊 Real-time status updates  
- 🔍 Detailed error reporting
- 🎯 Interactive API testing

### Quick API Tests
```bash
# Backend health check
curl http://localhost:3001/health

# Frontend proxy test
curl http://localhost:3000/api/test

# Face AI service check
curl http://localhost:8000/health
```

## 🔐 Authentication (Mock)

The system uses mock authentication for development:

### Face Login
```bash
curl -X POST http://localhost:3000/api/auth/face-login \
  -H "Content-Type: application/json" \
  -d '{"employeeId": "EMP001", "frames": ["base64_image_data"]}'
```

### Sample Response
```json
{
  "success": true,
  "accessToken": "mock-access-token-123456",
  "refreshToken": "mock-refresh-token-123456", 
  "user": {
    "id": "EMP001",
    "name": "John Doe",
    "email": "john@company.com",
    "role": "employee"
  }
}
```

## 📅 Available API Endpoints

### Attendance
- `GET /api/attendance/today` - Today's attendance status
- `POST /api/attendance/check-in` - Check in for work
- `POST /api/attendance/check-out` - Check out from work
- `GET /api/attendance/history` - Attendance history

### Leave Management  
- `GET /api/leave` - Get leave requests
- `POST /api/leave` - Submit leave request

### Work Reports
- `GET /api/work-report` - Get work reports
- `POST /api/work-report` - Submit work report

### Security
- `GET /api/security/events` - Security events log

### Geofence
- `GET /api/geofence/check` - Check location within geofence

### Notifications
- `GET /api/notification/` - Get notifications

## 🎯 Development Features

### ✅ What's Working
- **Full API functionality** with mock data
- **Face authentication simulation** (80% success rate)
- **Real-time WebSocket** notifications
- **CORS and proxy** configuration
- **Mock database** (no PostgreSQL required)
- **Mock Redis** (no Redis server required)
- **Mock Face AI** service with realistic responses

### 🔧 Configuration Files
- `backend-api/config.env` - Backend environment variables
- `frontend/config.env` - Frontend environment variables
- `frontend/vite.config.ts` - Vite proxy configuration

### 📁 Project Structure
```
├── backend-api/
│   ├── src/
│   │   ├── dev-server.js      # Development server with mocks
│   │   ├── mock-routes.js     # Mock API routes
│   │   └── config.env         # Environment config
├── frontend/
│   ├── src/
│   │   ├── services/api.ts    # API client
│   │   └── test-connection.js # Connection testing
│   ├── public/
│   │   └── test-connection.html # Browser test page
│   └── vite.config.ts         # Proxy configuration
├── face-ai-service/
│   └── mock-service.py        # Mock Face AI service
├── start-project.js           # Automated startup script
└── start-project.bat          # Windows batch file
```

## 🛠️ Troubleshooting

### Port Already in Use
```bash
# Kill all Node.js processes
taskkill /F /IM node.exe

# Or kill specific process by port
netstat -ano | findstr :3000
taskkill /F /PID [PID]
```

### Proxy Not Working
1. Restart the frontend server
2. Check backend is running on port 3001
3. Verify vite.config.ts proxy settings

### Face AI Service Not Responding
1. Ensure Python is installed
2. Check if port 8000 is available
3. Verify mock-service.py is running

### Frontend Not Loading
1. Check if Node.js dependencies are installed:
   ```bash
   cd frontend && npm install
   ```
2. Verify port 3000 is available
3. Check browser console for errors

## 🐳 Docker Setup (Optional)

For full production-like setup with PostgreSQL, Redis, and real Face AI service:

1. Start Docker Desktop
2. Run: `docker-compose up -d`
3. Services will be available at same URLs

## 📝 Next Steps

1. **Explore the test page** at http://localhost:3000/test-connection.html
2. **Try the API endpoints** using curl or the test page
3. **Build frontend features** using the mock APIs
4. **Switch to Docker** when ready for full integration testing

## 🆘 Support

If you encounter issues:
1. Check all services are running (use the test page)
2. Verify ports are not in use
3. Check browser console for JavaScript errors
4. Review terminal output for error messages

---

**Happy Development! 🎉**
