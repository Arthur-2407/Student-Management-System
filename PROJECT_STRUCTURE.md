# Project Folder Structure

## Root Directory Structure
```
enterprise-attendance-system/
├── docker-compose.yml
├── nginx/
│   ├── nginx.conf
│   └── ssl/ (TLS certificates)
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   └── public/
├── backend-api/
│   ├── package.json
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── attendance/
│   │   │   ├── leave/
│   │   │   ├── work-report/
│   │   │   ├── excel-processing/
│   │   │   ├── notification/
│   │   │   ├── backup/
│   │   │   ├── geofence/
│   │   │   └── security-monitoring/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── config/
│   └── Dockerfile
├── face-ai-service/
│   ├── requirements.txt
│   ├── src/
│   │   ├── face_detection/
│   │   ├── liveness_detection/
│   │   ├── challenge_response/
│   │   ├── anti_spoof_detection/
│   │   ├── embedding_generation/
│   │   └── similarity_matching/
│   └── Dockerfile
├── database/
│   ├── init.sql
│   ├── migrations/
│   └── backups/
├── redis/
│   └── redis.conf
└── docs/
    ├── ARCHITECTURE.md
    └── API_DOCUMENTATION.md
```

## Backend API Module Responsibilities

### Auth Module
- JWT token generation & validation
- Face login endpoint (/auth/face-login)
- Rate limiting (5 attempts/minute)
- Refresh token management

### Attendance Module  
- Clock-in/clock-out operations
- Geo-fence validation (Haversine formula)
- Attendance history management
- Location tracking (latitude/longitude)

### Leave Module
- Leave request submission
- Supervisor approval workflow
- Leave balance tracking
- Calendar integration

### Work Report Module
- Image upload for work reporting
- Report validation & storage
- Supervisor review system

### Excel Processing Module
- Excel template generation
- Bulk data import/export
- Report generation in Excel format

### Notification Module
- WebSocket real-time notifications
- Email/SMS alerts for security events
- Supervisor dashboard updates

### Backup Module
- Automated daily database backups
- Backup file management
- Restoration procedures

### Geofence Module
- Office location configuration
- Radius validation (50-100 meters)
- Distance calculation using Haversine

### Security Monitoring Module
- Security event logging
- Login attempt tracking
- Spoof detection logging
- Audit trail maintenance

## Face AI Service Components

### Face Detection
- RetinaFace for high-accuracy detection
- Multi-frame capture (10-20 frames)
- Landmark detection

### Liveness Detection  
- Blink frequency analysis
- Head movement tracking
- Facial depth estimation
- Confidence scoring

### Challenge-Response
- Randomized prompt generation
- User instruction display
- Response validation
- Prevents video playback attacks

### Anti-Spoof Detection
- Screen glare detection
- Printed texture analysis  
- Moire pattern detection
- Abnormal pixel pattern analysis

### Embedding Generation
- FaceNet 512-dimensional embeddings
- Normalization and preprocessing
- Feature extraction

### Similarity Matching
- Cosine similarity calculation
- Threshold-based matching
- Confidence scoring

## Database Schema Overview

### Core Tables
- Employees (with face embeddings)
- AttendanceRecords (with geo-fence status)
- LeaveRequests 
- WorkReports
- LoginLogs (with spoof detection flags)
- SecurityEvents
- SystemLogs

### Vector Support
- PostgreSQL with pgvector extension
- 512-dimensional face embedding storage
- Efficient similarity search

## Deployment Architecture

### Docker Services
1. nginx: Reverse proxy with TLS termination
2. frontend: React application
3. backend-api: Node.js REST API
4. database: PostgreSQL with pgvector
5. redis: Session caching & rate limiting
6. face-ai-service: Python AI processing

### Network Security
- Internal service communication
- HTTPS-only external access
- Encrypted face image transmission
- Secure API endpoints

## Environment Configuration

### Required Environment Variables
- Database connection strings
- JWT secret keys
- Office coordinates (lat/long)
- Geo-fence radius
- AI model paths
- Email/SMS credentials
- Backup storage configuration