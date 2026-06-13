# Employee Attendance System - Deployment Guide

## 🚀 **Overview**

This guide covers deploying the Employee Attendance System using Docker containers in a production environment.

## 📋 **Prerequisites**

### **System Requirements**
- **Operating System**: Linux (Ubuntu 20.04+), macOS, or Windows 10+
- **Docker**: Version 20.10+ with Docker Compose v2.0+
- **RAM**: Minimum 8GB, Recommended 16GB
- **Storage**: Minimum 20GB free space
- **Network**: Stable internet connection for image downloads

### **Software Dependencies**
```bash
# Install Docker (Ubuntu)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## 🔧 **Configuration Setup**

### **1. Environment Configuration**
```bash
# Copy environment template
cp .env.example .env

# Edit with your configuration
nano .env
```

**Critical Configuration Items:**
- `DB_PASSWORD`: Strong PostgreSQL password
- `REDIS_PASSWORD`: Strong Redis password
- `JWT_ACCESS_SECRET`: 32+ character random string
- `JWT_REFRESH_SECRET`: 32+ character random string
- `FRONTEND_URL`: Your production domain
- `CORS_ORIGIN`: Your production domain

### **2. SSL Certificates**
```bash
# Create SSL directory
mkdir -p nginx/ssl

# Generate self-signed certificates (development)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/server.key \
  -out nginx/ssl/server.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# OR use Let's Encrypt (production)
certbot certonly --standalone -d yourdomain.com
```

## 🐳 **Deployment Options**

### **Option 1: Automated Deployment (Recommended)**

#### **Linux/macOS**
```bash
# Make script executable
chmod +x deployment/scripts/deploy.sh

# Run deployment
./deployment/scripts/deploy.sh
```

#### **Windows**
```cmd
# Run deployment script
deployment\scripts\deploy.bat
```

### **Option 2: Manual Docker Compose**

#### **Development Environment**
```bash
# Start with mock services
docker-compose up -d

# View logs
docker-compose logs -f
```

#### **Production Environment**
```bash
# Start production services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### **Option 3: Individual Service Deployment**

#### **Backend API**
```bash
cd backend-api
docker build -f Dockerfile.prod -t attendance-backend:latest .
docker run -d --name backend-api \
  -p 3001:3001 \
  --env-file ../.env \
  attendance-backend:latest
```

#### **Face AI Service**
```bash
cd face-ai-service
docker build -f Dockerfile.prod -t attendance-face-ai:latest .
docker run -d --name face-ai-service \
  -p 8000:8000 \
  --env-file ../.env \
  attendance-face-ai:latest
```

#### **Frontend**
```bash
cd frontend
docker build -f Dockerfile.prod -t attendance-frontend:latest .
docker run -d --name frontend \
  -p 80:80 \
  attendance-frontend:latest
```

## 🔍 **Health Checks**

### **Service Health Endpoints**
```bash
# Backend API
curl http://localhost:3001/health

# Face AI Service
curl http://localhost:8000/health

# Frontend
curl http://localhost/health

# Nginx Proxy
curl http://localhost/health
```

### **Expected Response Format**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-29T10:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "face_ai_service": "connected"
  }
}
```

## 📊 **Monitoring and Logging**

### **View Logs**
```bash
# All services
docker-compose -f docker-compose.prod.yml logs

# Specific service
docker-compose -f docker-compose.prod.yml logs backend-api

# Real-time logs
docker-compose -f docker-compose.prod.yml logs -f
```

### **Resource Monitoring**
```bash
# Container status
docker-compose -f docker-compose.prod.yml ps

# Resource usage
docker stats

# Disk usage
docker system df
```

## 🔒 **Security Configuration**

### **Network Security**
- All services run in isolated Docker network
- Only necessary ports exposed (80, 443)
- Internal communication via service names

### **Application Security**
- JWT tokens with configurable expiry
- Rate limiting on authentication endpoints
- CORS properly configured
- Security headers implemented
- Non-root container users

### **Database Security**
- Strong password authentication
- Encrypted connections (SSL/TLS)
- Regular backups automated
- Access limited to application containers

## 🔄 **Maintenance Operations**

### **Updates**
```bash
# Pull latest images
docker-compose -f docker-compose.prod.yml pull

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build
```

### **Backups**
```bash
# Database backup
docker exec attendance-db-prod pg_dump -U postgres attendance_system > backup_$(date +%Y%m%d).sql

# Volume backup
docker run --rm -v attendance_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup_$(date +%Y%m%d).tar.gz -C /data .
```

### **Cleanup**
```bash
# Remove unused images
docker image prune -f

# Remove unused containers
docker container prune -f

# Remove unused volumes (careful!)
docker volume prune -f
```

## 🚨 **Troubleshooting**

### **Common Issues**

#### **Port Conflicts**
```bash
# Check port usage
netstat -tulpn | grep :80
netstat -tulpn | grep :3001
netstat -tulpn | grep :8000

# Kill processes using ports
sudo kill -9 <PID>
```

#### **Container Failures**
```bash
# Check container logs
docker logs <container_name>

# Restart specific service
docker-compose -f docker-compose.prod.yml restart <service_name>

# Recreate service
docker-compose -f docker-compose.prod.yml up -d --force-recreate <service_name>
```

#### **Database Connection Issues**
```bash
# Check database container
docker exec -it attendance-db-prod psql -U postgres -d attendance_system

# Test connection
docker exec attendance-backend-prod curl -f http://postgres:5432
```

#### **SSL Certificate Issues**
```bash
# Verify certificate
openssl x509 -in nginx/ssl/server.crt -text -noout

# Check certificate validity
openssl s_client -connect yourdomain.com:443
```

### **Performance Issues**

#### **High Memory Usage**
```bash
# Check container resource limits
docker inspect attendance-backend-prod | grep -i memory

# Adjust memory limits in docker-compose.prod.yml
deploy:
  resources:
    limits:
      memory: 2G
    reservations:
      memory: 1G
```

#### **Slow Database Queries**
```bash
# Connect to database
docker exec -it attendance-db-prod psql -U postgres attendance_system

# Enable slow query log
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_stat_statements_reset();
```

## 🌐 **Production Deployment**

### **Domain Configuration**
1. **DNS Setup**
   - Point A record to server IP
   - Configure CNAME for subdomains if needed

2. **SSL Certificate**
   - Use Let's Encrypt for production
   - Configure automatic renewal

3. **Firewall Rules**
   ```bash
   # UFW (Ubuntu)
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

### **Load Balancer Setup**
```nginx
upstream backend {
    server backend-api-1:3001;
    server backend-api-2:3001;
}

server {
    listen 80;
    server_name yourdomain.com;
    
    location /api {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### **Monitoring Setup**
```bash
# Prometheus + Grafana
docker-compose -f docker-compose.monitoring.yml up -d

# Log aggregation (ELK Stack)
docker-compose -f docker-compose.logging.yml up -d
```

## 📞 **Support**

### **Emergency Procedures**
1. **Service Down**: Check logs, restart affected service
2. **Database Issues**: Connect directly, check connectivity
3. **SSL Problems**: Verify certificates, check expiration
4. **Performance Issues**: Monitor resources, check queries

### **Contact Information**
- **Documentation**: Check `/docs` directory
- **Logs**: Use `docker-compose logs` command
- **Health Checks**: Use `/health` endpoints

---

## 🎯 **Quick Reference**

| Command | Description |
|---------|-------------|
| `./deployment/scripts/deploy.sh` | Full deployment |
| `docker-compose -f docker-compose.prod.yml ps` | Service status |
| `docker-compose -f docker-compose.prod.yml logs -f` | Live logs |
| `docker-compose -f docker-compose.prod.yml restart` | Restart services |
| `curl http://localhost/health` | Health check |

**Deployment Success! 🎉**
