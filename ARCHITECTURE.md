# Enterprise Employee Attendance System - Architecture

## System Overview
Production-grade platform for 80-100 employees supporting:
- Attendance tracking with face recognition
- Work tracking & leave management
- AI anti-spoof detection
- Geo-fence validation
- Real-time security monitoring

## Architecture Style
Modular backend architecture with simplified deployment

## Core Services Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Nginx         │    │   Supervisor    │
│   (React)       │◄──►│   Reverse Proxy │◄──►│   Dashboard     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   Backend API   │    │   Face AI        │
│   (Node.js)     │◄──►│   Service       │
└─────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   Redis         │
│   Database      │    │   Cache         │
└─────────────────┘    └─────────────────┘
```

## Backend Module Structure
```
backend-api/
├── auth-module/           # JWT authentication & face login
├── attendance-module/      # Attendance tracking & validation
├── leave-module/          # Leave request management
├── work-report-module/    # Work image reporting
├── excel-processing-module/ # Excel upload/download
├── notification-module/   # Real-time WebSocket notifications
├── backup-module/         # Automated database backups
├── geofence-module/       # Location validation
└── security-monitoring-module/ # Security event logging
```

## Face AI Service Responsibilities
```
face-ai-service/
├── face-detection/        # Face detection using RetinaFace
├── liveness-detection/   # Multi-frame analysis
├── challenge-response/   # Randomized user prompts
├── anti-spoof-detection/ # Texture & pattern analysis
├── embedding-generation/ # FaceNet 512D embeddings
└── similarity-matching/  # Cosine similarity comparison
```

## Face Verification Pipeline
```
1. Camera capture (10-20 frames/2s)
2. Face detection (RetinaFace/Mediapipe)
3. Multi-frame liveness detection:
   - Blink frequency analysis
   - Head movement tracking
   - Facial depth estimation
4. Challenge-response verification:
   - Random prompts: blink, turn head, smile
5. Anti-spoof texture analysis:
   - Screen glare detection
   - Printed texture analysis
   - Pixel pattern validation
6. Face embedding generation (FaceNet 512D)
7. Cosine similarity comparison
8. Authentication decision
```

## Security Layers
1. **Face Recognition** - Primary authentication
2. **Anti-Spoof Detection** - Prevents photo/video attacks
3. **Challenge Liveness** - Interactive verification
4. **Geo-Tech Location** - GPS validation
5. **Geo-Fence** - Office proximity validation (optional for login)
6. **Rate Limiting** - 5 attempts/minute
7. **JWT Security** - 15min access, 7day refresh tokens

## Data Flow
```
Frontend → Nginx → Backend API → [Database/Redis]
                            ↓
                     Face AI Service
                            ↓
                  [Anti-Spoof Detection]
                            ↓
                   [Embedding Comparison]
```

## Supervisor Dashboard Visibility
- Real-time spoof login attempts
- Face mismatch attempts
- Geo-fence violations
- Employee login history with locations
- Security event monitoring
- Analytics and reporting

## Technology Stack
- **Frontend**: React, TypeScript, TailwindCSS
- **Backend**: Node.js, Express.js
- **AI Service**: Python, OpenCV, DeepFace, FaceNet, Mediapipe
- **Database**: PostgreSQL with pgvector extension
- **Cache**: Redis
- **Deployment**: Docker Compose
- **Proxy**: Nginx with HTTPS/TLS

## Security Requirements
- All communications over HTTPS/TLS
- Face images encrypted in transit
- Rate limiting on authentication endpoints
- Comprehensive security logging
- Regular database backups

## Hardware Requirements
- CPU: 4 cores minimum
- RAM: 8 GB minimum  
- Storage: 10 GB SSD minimum
- GPU: Optional (for accelerated face processing)