#!/bin/bash

# Employee Attendance System - Deployment Script
# This script automates the deployment process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if .env file exists
    if [ ! -f .env ]; then
        warning ".env file not found. Creating from template..."
        cp .env.example .env
        warning "Please edit .env file with your configuration before proceeding."
        exit 1
    fi
    
    success "Prerequisites check passed"
}

# Backup current deployment
backup_deployment() {
    log "Creating backup of current deployment..."
    
    BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup docker-compose files
    cp docker-compose*.yml "$BACKUP_DIR/" 2>/dev/null || true
    
    # Backup environment files
    cp .env "$BACKUP_DIR/" 2>/dev/null || true
    
    # Backup database if running
    if docker ps | grep -q attendance-db; then
        log "Backing up database..."
        docker exec attendance-db pg_dump -U postgres attendance_system > "$BACKUP_DIR/database_backup.sql" 2>/dev/null || true
    fi
    
    success "Backup created at $BACKUP_DIR"
}

# Build and deploy services
deploy_services() {
    log "Building and deploying services..."
    
    # Stop existing services
    log "Stopping existing services..."
    docker-compose -f docker-compose.prod.yml down --remove-orphans || true
    
    # Pull latest images
    log "Pulling latest images..."
    docker-compose -f docker-compose.prod.yml pull
    
    # Build services
    log "Building services..."
    docker-compose -f docker-compose.prod.yml build --no-cache
    
    # Start services
    log "Starting services..."
    docker-compose -f docker-compose.prod.yml up -d
    
    success "Services deployed successfully"
}

# Health check
health_check() {
    log "Performing health checks..."
    
    # Wait for services to start
    sleep 30
    
    # Check backend health
    if curl -f http://localhost:3001/health &> /dev/null; then
        success "Backend API is healthy"
    else
        error "Backend API health check failed"
        return 1
    fi
    
    # Check Face AI service health
    if curl -f http://localhost:8000/health &> /dev/null; then
        success "Face AI Service is healthy"
    else
        error "Face AI Service health check failed"
        return 1
    fi
    
    # Check frontend health
    if curl -f http://localhost/health &> /dev/null; then
        success "Frontend is healthy"
    else
        error "Frontend health check failed"
        return 1
    fi
    
    success "All services are healthy"
}

# Cleanup old images and containers
cleanup() {
    log "Cleaning up old Docker resources..."
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused containers
    docker container prune -f
    
    # Remove unused volumes (be careful with this)
    # docker volume prune -f
    
    success "Cleanup completed"
}

# Show deployment status
show_status() {
    log "Deployment status:"
    docker-compose -f docker-compose.prod.yml ps
    
    log "Service URLs:"
    echo "🖥️  Frontend: http://localhost"
    echo "🔧 Backend API: http://localhost:3001"
    echo "🤖 Face AI Service: http://localhost:8000"
    echo "📊 Database: postgresql://localhost:5432"
    echo "🗄️  Redis: redis://localhost:6379"
}

# Main deployment function
main() {
    log "Starting deployment process..."
    
    check_prerequisites
    
    # Ask for backup confirmation
    read -p "Do you want to create a backup before deployment? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        backup_deployment
    fi
    
    deploy_services
    health_check
    cleanup
    show_status
    
    success "Deployment completed successfully!"
    log "Please update your DNS and SSL certificates as needed."
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "backup")
        backup_deployment
        ;;
    "health")
        health_check
        ;;
    "status")
        show_status
        ;;
    "cleanup")
        cleanup
        ;;
    "logs")
        docker-compose -f docker-compose.prod.yml logs -f
        ;;
    "stop")
        log "Stopping all services..."
        docker-compose -f docker-compose.prod.yml down
        success "All services stopped"
        ;;
    "restart")
        log "Restarting all services..."
        docker-compose -f docker-compose.prod.yml restart
        success "All services restarted"
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [command]"
        echo "Commands:"
        echo "  deploy   - Full deployment (default)"
        echo "  backup   - Create backup"
        echo "  health   - Health check"
        echo "  status   - Show deployment status"
        echo "  cleanup  - Clean up Docker resources"
        echo "  logs     - Show service logs"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  help     - Show this help"
        ;;
    *)
        error "Unknown command: $1"
        echo "Use '$0 help' for available commands"
        exit 1
        ;;
esac
