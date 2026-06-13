# Deployment Directory

This directory contains all deployment-related files and configurations for the Employee Attendance System.

## 📁 **Directory Structure**

```
deployment/
├── 📄 README.md              # This file
├── 📄 DEPLOYMENT.md          # Comprehensive deployment guide
├── 📄 project-structure.md   # Project structure documentation
├── 📁 scripts/               # Deployment automation scripts
│   ├── 📄 deploy.sh          # Linux/macOS deployment script
│   └── 📄 deploy.bat         # Windows deployment script
├── 📁 kubernetes/           # Kubernetes manifests (future)
├── 📁 terraform/            # Infrastructure as Code (future)
└── 📄 .env.example          # Environment variables template
```

## 🚀 **Quick Start**

### **Automated Deployment**
```bash
# Linux/macOS
./scripts/deploy.sh

# Windows
scripts\deploy.bat
```

### **Manual Deployment**
```bash
# Production
docker-compose -f docker-compose.prod.yml up -d

# Development
docker-compose up -d
```

## 📋 **Configuration**

1. Copy `.env.example` to `.env`
2. Edit with your production values
3. Run deployment script

## 🔧 **Available Scripts**

| Script | Platform | Description |
|---------|----------|-------------|
| `deploy.sh` | Linux/macOS | Full deployment with health checks |
| `deploy.bat` | Windows | Windows batch deployment script |

## 📚 **Documentation**

- **DEPLOYMENT.md**: Complete deployment guide
- **project-structure.md**: Project organization
- **../README-DEV.md**: Development setup guide

## 🛠️ **Troubleshooting**

Common issues and solutions are documented in `DEPLOYMENT.md`.
