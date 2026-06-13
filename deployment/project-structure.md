# Employee Attendance System - Project Structure

## 📁 **Organized Directory Structure**

```
website/
├── 📁 services/                    # Core application services
│   ├── 📁 backend-api/            # Node.js Express API
│   │   ├── 📁 src/
│   │   │   ├── 📄 server.js       # Production server
│   │   │   ├── 📄 dev-server.js   # Development server with mocks
│   │   │   ├── 📄 mock-routes.js  # Mock API routes
│   │   │   ├── 📁 config/         # Database and Redis config
│   │   │   ├── 📁 middleware/     # Express middleware
│   │   │   └── 📁 modules/       # Feature modules
│   │   ├── 📄 package.json        # Dependencies and scripts
│   │   ├── 📄 Dockerfile          # Container configuration
│   │   └── 📄 config.env         # Environment variables
│   │
│   ├── 📁 face-ai-service/       # Python Face Recognition API
│   │   ├── 📄 mock-service.py     # Development mock service
│   │   ├── 📄 app.py            # Production Face AI service
│   │   ├── 📄 requirements.txt    # Python dependencies
│   │   └── 📄 Dockerfile         # Container configuration
│   │
│   └── 📁 frontend/              # React TypeScript Application
│       ├── 📁 src/
│       │   ├── 📁 components/     # React components
│       │   ├── 📁 pages/          # Page components
│       │   ├── 📁 services/       # API services
│       │   ├── 📁 hooks/          # Custom React hooks
│       │   ├── 📁 store/          # State management
│       │   └── 📁 utils/          # Utility functions
│       ├── 📁 public/             # Static assets
│       ├── 📄 package.json        # Dependencies and scripts
│       ├── 📄 vite.config.ts      # Vite configuration
│       ├── 📄 Dockerfile          # Container configuration
│       └── 📄 config.env         # Environment variables
│
├── 📁 infrastructure/             # Infrastructure as Code
│   ├── 📁 docker/               # Docker configurations
│   │   ├── 📄 docker-compose.yml  # Multi-service orchestration
│   │   ├── 📄 docker-compose.prod.yml # Production configuration
│   │   └── 📁 nginx/           # Reverse proxy configuration
│   │       ├── 📄 nginx.conf      # Nginx configuration
│   │       └── 📄 Dockerfile      # Nginx container
│   │
│   ├── 📁 database/              # Database setup
│   │   ├── 📄 init.sql          # Database initialization
│   │   └── 📄 migrations/       # Database migrations
│   │
│   └── 📁 ssl/                  # SSL certificates
│       ├── 📄 .gitkeep          # Keep directory structure
│       └── 📄 generate-ssl.js   # SSL generation script
│
├── 📁 deployment/               # Deployment configurations
│   ├── 📁 kubernetes/           # K8s manifests
│   ├── 📁 terraform/            # Infrastructure provisioning
│   ├── 📁 scripts/              # Deployment scripts
│   └── 📄 .env.example          # Environment template
│
├── 📁 docs/                    # Documentation
│   ├── 📄 README.md             # Main documentation
│   ├── 📄 DEPLOYMENT.md         # Deployment guide
│   ├── 📄 API.md               # API documentation
│   └── 📄 ARCHITECTURE.md       # System architecture
│
├── 📁 scripts/                 # Development and utility scripts
│   ├── 📄 start-project.js      # Development startup script
│   ├── 📄 start-project.bat     # Windows batch script
│   ├── 📄 test-api.js          # API testing
│   └── 📄 setup.sh             # Environment setup
│
├── 📄 docker-compose.yml        # Development Docker setup
├── 📄 docker-compose.prod.yml   # Production Docker setup
├── 📄 .gitignore              # Git ignore rules
└── 📄 package.json             # Root package.json
```

## 🏗️ **Service Responsibilities**

### **Backend API (Node.js)**
- ✅ RESTful API endpoints
- ✅ JWT authentication
- ✅ Database operations
- ✅ WebSocket support
- ✅ Rate limiting and security

### **Face AI Service (Python)**
- ✅ Face detection and recognition
- ✅ Liveness detection
- ✅ Anti-spoofing
- ✅ Face embedding generation

### **Frontend (React + TypeScript)**
- ✅ Modern React application
- ✅ TypeScript support
- ✅ Vite build system
- ✅ TailwindCSS styling

### **Infrastructure (Docker + Nginx)**
- ✅ Container orchestration
- ✅ Reverse proxy
- ✅ SSL termination
- ✅ Load balancing

## 🚀 **Deployment Environments**

### **Development**
- Mock services (database, Redis, Face AI)
- Hot reload enabled
- Debug logging
- Local development

### **Staging**
- Real services (PostgreSQL, Redis, Face AI)
- Production-like configuration
- Testing environment
- CI/CD integration

### **Production**
- Full containerized deployment
- Load balancing
- SSL/TLS encryption
- Monitoring and logging
