#!/bin/bash
# ORLITH AI - Installation Script for Linux and macOS

set -e

echo "========================================================"
echo "               ORLITH AI INSTALLER                      "
echo "========================================================"

# Check for Git
if ! command -v git &> /dev/null; then
    echo "Error: Git is not installed. Please install Git and try again."
    exit 1
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker and try again."
    exit 1
fi

# Check for Docker Compose (either 'docker-compose' or 'docker compose')
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Error: Docker Compose is not installed. Please install it and try again."
    exit 1
fi

INSTALL_DIR="documind-ai"

if [ -d "$INSTALL_DIR" ]; then
    echo "Directory '$INSTALL_DIR' already exists. Navigating into it..."
    cd "$INSTALL_DIR"
    echo "Pulling latest changes..."
    git pull origin main
else
    echo "Cloning ORLITH AI repository..."
    # Replace the URL below with the actual remote repository URL when ready
    git clone https://github.com/alpha24-rz/Orlith.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo "Setting up environment variables..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Created .env from .env.example. You can modify it later if needed."
    else
        cat <<EOF > .env
ENVIRONMENT=production
SECRET_KEY=$(openssl rand -hex 32)
LOG_LEVEL=INFO
# NEXT_PUBLIC_API_URL=http://your-server-ip:8000
EOF
        echo "Generated a new .env file."
    fi
else
    echo ".env file already exists, skipping."
fi

echo "Building and starting Docker containers..."
if docker compose version &> /dev/null; then
    docker compose up --build -d
else
    docker-compose up --build -d
fi

echo "========================================================"
echo "                 INSTALLATION COMPLETE!                 "
echo "========================================================"
echo "ORLITH AI is now running."
echo ""
echo "Access the application at:"
echo " - Frontend UI: http://localhost:3000"
echo " - Backend API: http://localhost:8000/docs"
echo ""
echo "To manage your instance, navigate to the directory:"
echo "  cd $INSTALL_DIR"
echo "========================================================"
