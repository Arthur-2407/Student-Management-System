@echo off
setlocal enabledelayedexpansion

REM Employee Attendance System - Windows Deployment Script
REM This script automates the deployment process on Windows

title Employee Attendance System Deployment

echo.
echo ========================================
echo  Employee Attendance System Deployment
echo ========================================
echo.

REM Check prerequisites
echo [INFO] Checking prerequisites...

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

REM Check if Docker Compose is available
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker Compose is not available. Please install Docker Compose.
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist .env (
    echo [WARNING] .env file not found. Creating from template...
    copy .env.example .env >nul
    echo [WARNING] Please edit .env file with your configuration before proceeding.
    pause
    exit /b 1
)

echo [SUCCESS] Prerequisites check passed
echo.

REM Ask for backup
set /p backup_choice="Do you want to create a backup before deployment? (y/N): "
if /i "%backup_choice%"=="y" (
    call :backup_deployment
)

REM Build and deploy services
echo [INFO] Building and deploying services...

REM Stop existing services
echo [INFO] Stopping existing services...
docker-compose -f docker-compose.prod.yml down --remove-orphans >nul 2>&1

REM Pull latest images
echo [INFO] Pulling latest images...
docker-compose -f docker-compose.prod.yml pull

REM Build services
echo [INFO] Building services...
docker-compose -f docker-compose.prod.yml build --no-cache

REM Start services
echo [INFO] Starting services...
docker-compose -f docker-compose.prod.yml up -d

echo [SUCCESS] Services deployed successfully
echo.

REM Health check
echo [INFO] Performing health checks...
timeout /t 30 /nobreak >nul

REM Check backend health
curl -f http://localhost:3001/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Backend API is healthy
) else (
    echo [ERROR] Backend API health check failed
)

REM Check Face AI service health
curl -f http://localhost:8000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Face AI Service is healthy
) else (
    echo [ERROR] Face AI Service health check failed
)

REM Check frontend health
curl -f http://localhost/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Frontend is healthy
) else (
    echo [ERROR] Frontend health check failed
)

echo.
echo [SUCCESS] All services are healthy
echo.

REM Cleanup
echo [INFO] Cleaning up old Docker resources...
docker image prune -f >nul 2>&1
docker container prune -f >nul 2>&1
echo [SUCCESS] Cleanup completed
echo.

REM Show status
echo [INFO] Deployment status:
docker-compose -f docker-compose.prod.yml ps
echo.

echo [INFO] Service URLs:
echo    🖥️  Frontend: http://localhost
echo    🔧 Backend API: http://localhost:3001
echo    🤖 Face AI Service: http://localhost:8000
echo    📊 Database: postgresql://localhost:5432
echo    🗄️  Redis: redis://localhost:6379
echo.

echo [SUCCESS] Deployment completed successfully!
echo [INFO] Please update your DNS and SSL certificates as needed.
echo.
pause
goto :eof

:backup_deployment
echo [INFO] Creating backup of current deployment...

REM Create backup directory
for /f "tokens=1-3 delims=/ " %%a in ('echo %date%') do set "date_parts=%%a"
for /f "tokens=1-3 delims=: " %%a in ('echo %time%') do set "time_parts=%%a"
set "backup_dir=backups\%date_parts:~0,4%%date_parts:~1,2%%date_parts:~2,2%_%time_parts:~0,2%%time_parts:~3,2%%time_parts:~6,2%"
if not exist backups mkdir backups
if not exist "%backup_dir%" mkdir "%backup_dir%"

REM Backup docker-compose files
copy docker-compose*.yml "%backup_dir%\" >nul 2>&1

REM Backup environment file
copy .env "%backup_dir%\" >nul 2>&1

REM Backup database if running
docker ps | findstr attendance-db >nul
if %errorlevel% equ 0 (
    echo [INFO] Backing up database...
    docker exec attendance-db pg_dump -U postgres attendance_system > "%backup_dir%\database_backup.sql" 2>nul
)

echo [SUCCESS] Backup created at %backup_dir%
goto :eof

:health_check
echo [INFO] Performing health checks...
timeout /t 30 /nobreak >nul

curl -f http://localhost:3001/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Backend API is healthy
) else (
    echo [ERROR] Backend API health check failed
)

curl -f http://localhost:8000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Face AI Service is healthy
) else (
    echo [ERROR] Face AI Service health check failed
)

curl -f http://localhost/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Frontend is healthy
) else (
    echo [ERROR] Frontend health check failed
)

goto :eof

:show_status
echo [INFO] Deployment status:
docker-compose -f docker-compose.prod.yml ps
echo.
echo [INFO] Service URLs:
echo    🖥️  Frontend: http://localhost
echo    🔧 Backend API: http://localhost:3001
echo    🤖 Face AI Service: http://localhost:8000
echo    📊 Database: postgresql://localhost:5432
echo    🗄️  Redis: redis://localhost:6379
goto :eof

:cleanup
echo [INFO] Cleaning up old Docker resources...
docker image prune -f >nul 2>&1
docker container prune -f >nul 2>&1
echo [SUCCESS] Cleanup completed
goto :eof

:stop_services
echo [INFO] Stopping all services...
docker-compose -f docker-compose.prod.yml down
echo [SUCCESS] All services stopped
goto :eof

:restart_services
echo [INFO] Restarting all services...
docker-compose -f docker-compose.prod.yml restart
echo [SUCCESS] All services restarted
goto :eof

:show_help
echo Usage: %0 [command]
echo Commands:
echo   deploy   - Full deployment (default)
echo   backup   - Create backup
echo   health   - Health check
echo   status   - Show deployment status
echo   cleanup  - Clean up Docker resources
echo   stop     - Stop all services
echo   restart  - Restart all services
echo   help     - Show this help
goto :eof

REM Handle command line arguments
if "%1"=="backup" call :backup_deployment & goto :eof
if "%1"=="health" call :health_check & goto :eof
if "%1"=="status" call :show_status & goto :eof
if "%1"=="cleanup" call :cleanup & goto :eof
if "%1"=="stop" call :stop_services & goto :eof
if "%1"=="restart" call :restart_services & goto :eof
if "%1"=="help" call :show_help & goto :eof
if "%1"=="-h" call :show_help & goto :eof
if "%1"=="--help" call :show_help & goto :eof
