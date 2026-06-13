# AUTO REPAIR SYSTEM - CONTINUOUS RUNTIME DIAGNOSTIC AGENT
# Run this script alongside Docker to automatically scan for errors.

$frontendDir = ".\frontend"
$backendDir = ".\backend-api"
$faceAiDir = ".\face-ai-service"

Write-Host "Starting Auto-Repair Diagnostics Agent..." -ForegroundColor Cyan

while ($true) {
    Write-Host "[*] Executing Deep Project Scan..." -ForegroundColor Yellow

    # Monitor Frontend
    Write-Host "   -> Checking Frontend Builds..."
    $frontendOut = Invoke-Expression "npm run build --prefix $frontendDir 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   [!] Frontend Build Error Detected!" -ForegroundColor Red
        # Logic to extract and auto-fix typescript/eslint errors goes here
        # e.g., scanning $frontendOut for specific files
    } else {
        Write-Host "   [OK] Frontend stable." -ForegroundColor Green
    }

    # Monitor Backend
    Write-Host "   -> Checking Backend Syntax..."
    $backendOut = node --check "$backendDir\src\server.js" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   [!] Backend Syntax Error Detected!" -ForegroundColor Red
        Write-Host $backendOut -ForegroundColor Red
    } else {
        Write-Host "   [OK] Backend stable (Syntax check passed)." -ForegroundColor Green
    }

    # Monitor Python / AI Service
    Write-Host "   -> Checking Python Dependencies..."
    $pyCheck = Invoke-Expression "python -c 'import deepface' 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   [!] Missing Python module in Face-AI-Service. Auto-installing..." -ForegroundColor Yellow
        Invoke-Expression "pip install -r $faceAiDir\requirements.txt"
    } else {
        Write-Host "   [OK] Python AI Services stable." -ForegroundColor Green
    }

    Write-Host "[*] Scan complete. Sleeping for next cycle..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 30
}
