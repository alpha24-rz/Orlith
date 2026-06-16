# ORLITH AI - Installation Script for Windows (PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "               ORLITH AI INSTALLER                      " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# Check for Git
if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Git is not installed. Please install Git for Windows and try again." -ForegroundColor Red
    exit 1
}

# Check for Docker
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker is not installed. Please install Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

# Check for Docker Compose
$hasCompose = $false
if (Get-Command "docker-compose" -ErrorAction SilentlyContinue) {
    $hasCompose = $true
} elseif (docker compose version 2>$null) {
    $hasCompose = $true
}

if (-not $hasCompose) {
    Write-Host "Error: Docker Compose is not installed or accessible. Please ensure Docker Desktop is running properly." -ForegroundColor Red
    exit 1
}

$InstallDir = "documind-ai"

if (Test-Path $InstallDir) {
    Write-Host "Directory '$InstallDir' already exists. Navigating into it..." -ForegroundColor Yellow
    Set-Location $InstallDir
    Write-Host "Pulling latest changes..." -ForegroundColor Yellow
    git pull origin main
} else {
    Write-Host "Cloning ORLITH AI repository..." -ForegroundColor Yellow
    # Replace the URL below with the actual remote repository URL when ready
    git clone https://github.com/alpha24-rz/documind-ai.git $InstallDir
    if (-not $?) {
        Write-Host "Error cloning repository." -ForegroundColor Red
        exit 1
    }
    Set-Location $InstallDir
}

Write-Host "Setting up environment variables..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "Created .env from .env.example. You can modify it later if needed." -ForegroundColor Green
    } else {
        # Generate a random 32-char hex string for SECRET_KEY
        $Bytes = New-Object Byte[] 16
        [Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($Bytes)
        $SecretKey = ($Bytes | ForEach-Object { $_.ToString("x2") }) -join ''

        $EnvContent = @"
ENVIRONMENT=production
SECRET_KEY=$SecretKey
LOG_LEVEL=INFO
# NEXT_PUBLIC_API_URL=http://your-server-ip:8000
"@
        Set-Content -Path ".env" -Value $EnvContent
        Write-Host "Generated a new .env file." -ForegroundColor Green
    }
} else {
    Write-Host ".env file already exists, skipping." -ForegroundColor Yellow
}

Write-Host "Building and starting Docker containers..." -ForegroundColor Yellow
if (docker compose version 2>$null) {
    docker compose up --build -d
} else {
    docker-compose up --build -d
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "                 INSTALLATION COMPLETE!                 " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "ORLITH AI is now running."
Write-Host ""
Write-Host "Access the application at:"
Write-Host " - Frontend UI: http://localhost:3000"
Write-Host " - Backend API: http://localhost:8000/docs"
Write-Host ""
Write-Host "To manage your instance, navigate to the directory:"
Write-Host "  cd $InstallDir"
Write-Host "========================================================" -ForegroundColor Cyan
