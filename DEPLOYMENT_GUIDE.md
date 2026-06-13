# Enterprise Attendance System - Deployment Guide

## Prerequisites
- Docker and Docker Compose installed
- 4+ CPU cores, 8+ GB RAM, 10+ GB storage
- SSL certificates for HTTPS (production)

## Quick Start (Development)

1. **Clone and setup**
   ```bash
   git clone <repository>
   cd enterprise-attendance-system
   ```

2. **Configure environment variables**
   Create `.env` files for each service with required configuration:
   
   - `backend-api/.env`
   - `face-ai-service/.env` 
   - `frontend/.env`

3. **Start services**
   ```bash
   docker-compose up -d
   ```

4. **Access applications**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Face AI Service: http://localhost:5000

## Production Deployment

### 1. Environment Configuration

**Backend API (.env)**
```bash
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=attendance_system
DB_USER=postgres
DB_PASSWORD=your-secure-db-password

# Redis
REDIS_URL=redis://:your-redis-password@redis:6379

# JWT Secrets (generate strong secrets)
JWT_ACCESS_SECRET=generate-strong-random-secret-here
JWT_REFRESH_SECRET=generate-another-strong-random-secret-here
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Services
FACE_AI_SERVICE_URL=http://face-ai-service:5000
FRONTEND_URL=https://your-domain.com

# Security
PORT=3001
NODE_ENV=production
```

**Face AI Service (.env)**
```bash
PORT=5000
REDIS_URL=redis://:your-redis-password@redis:6379
MODEL_PATH=/app/models
```

**Frontend (.env)**
```bash
REACT_APP_API_URL=https://your-domain.com/api
REACT_APP_FACE_AI_URL=https://your-domain.com
```

### 2. SSL Certificate Setup

1. Generate or obtain SSL certificates
2. Place certificates in `nginx/ssl/` directory:
   - `cert.pem` - SSL certificate
   - `key.pem` - Private key

### 3. Database Initialization

The system will automatically:
- Create PostgreSQL database with pgvector extension
- Initialize all required tables
- Set up default office location
- Configure backup system

### 4. Start Production Services

```bash
# Build and start all services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

## Service Architecture

```
Internet → Nginx (SSL Termination) → Frontend → Backend API → Database/Redis
                                   ↘ Face AI Service
```

### Port Mapping
- **80/443**: Nginx (HTTP/HTTPS)
- **3000**: Frontend (React)
- **3001**: Backend API (Node.js)
- **5000**: Face AI Service (Python)
- **5432**: PostgreSQL
- **6379**: Redis

## Security Configuration

### 1. JWT Secrets
Generate strong secrets:
```bash
# Generate random 64-character secrets
openssl rand -base64 48 | tr -d '/+' | cut -c1-64
```

### 2. Database Passwords
Use strong passwords for:
- PostgreSQL database user
- Redis authentication

### 3. Firewall Rules
- Expose only ports 80/443 to internet
- Restrict internal service ports
- Enable rate limiting

### 4. SSL/TLS Configuration
- Use TLS 1.2/1.3 only
- Enable HSTS headers
- Regular certificate rotation

## Monitoring & Maintenance

### Health Checks
All services include health endpoints:
- Backend: `GET /health`
- Face AI: `GET /health`
- Database: Automatic healthchecks

### Logging
- System logs stored in PostgreSQL
- Security events logged with severity levels
- Docker container logs

### Backups
Automatic daily backups:
- Database backups to `./backups` directory
- 30-day retention policy
- Configurable schedule

## Scaling Considerations

### Horizontal Scaling
- Add more backend API instances
- Use Redis cluster for distributed caching
- Database read replicas

### Resource Allocation
- **Face AI Service**: CPU-intensive, consider GPU acceleration
- **Database**: SSD storage recommended
- **Redis**: Memory-optimized instances

## Troubleshooting

### Common Issues
1. **SSL Certificate Errors**
   - Verify certificate paths in nginx config
   - Check certificate expiration

2. **Database Connection Issues**
   - Verify database credentials
   - Check PostgreSQL health status

3. **Face Detection Failures**
   - Check Face AI service health
   - Verify model files are available

4. **Memory Issues**
   - Monitor Redis memory usage
   - Check for memory leaks in services

### Logs Location
- Docker logs: `docker-compose logs <service>`
- Application logs: PostgreSQL system_logs table
- Nginx logs: `/var/log/nginx` inside container

## Support

For issues:
1. Check service health endpoints
2. Review Docker container logs
3. Examine system_logs table
4. Verify environment configuration

## Version Information
- Backend: Node.js 18
- Face AI: Python 3.9
- Database: PostgreSQL 15 with pgvector
- Cache: Redis 7
- Frontend: React 18
- Proxy: Nginx

---

**Note**: This is a production-ready enterprise system with:
- ✅ HTTPS/TLS encryption
- ✅ Rate limiting and security headers
- ✅ Automated backups
- ✅ Health monitoring
- ✅ Scalable architecture
- ✅ Comprehensive logging
- ✅ Anti-spoof face detection
- ✅ Geo-fence validation