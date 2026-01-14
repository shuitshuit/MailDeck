#!/bin/bash

# MailDeck deployment script
# This script pulls latest code, builds both frontend and backend, and restarts services

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "MailDeck Deployment Script"
echo "=========================================="
echo ""

# Step 1: Git pull
echo "[1/5] Pulling latest code from git..."
git pull
echo "✓ Git pull completed"
echo ""

# Step 2: Build backend
echo "[2/5] Building backend (ASP.NET Core)..."
cd MailDeck.Api
# Clean previous build artifacts
dotnet clean -c Release
# Build to bin/Release/net8.0/publish/ to avoid polluting project root
dotnet publish -c Release -o ../build
echo "✓ Backend build completed"
echo ""

# Step 3: Build frontend
echo "[3/5] Building frontend (React + Vite)..."
cd ../maildeck-ui
npm run build
echo "✓ Frontend build completed"
echo ""

# Step 4: Stop services
echo "[4/5] Stopping MailDeck services..."
sudo systemctl stop maildeck-api.service
echo "✓ Services stopped"
echo ""

# Step 5: Start services
echo "[5/5] Starting MailDeck services..."
sudo systemctl start maildeck-api.service
echo "✓ Services started"
echo ""

# Check service status
echo "=========================================="
echo "Deployment Status"
echo "=========================================="
sudo systemctl status maildeck-api --no-pager -l
echo ""

echo "=========================================="
echo "Deployment completed successfully!"
echo "=========================================="
