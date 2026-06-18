#!/bin/bash

# MailDeck deployment script (manual / emergency use)
# For normal deployments, push to main branch — GitHub Actions handles CI/CD automatically.
#
# Usage: ./deploy.sh
#   Run on the OCI server directly to rebuild and redeploy everything from the current git state.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "MailDeck Manual Deployment"
echo "=========================================="
echo ""

echo "[1/6] Pulling latest code..."
git pull
echo "✓ Git pull completed"
echo ""

echo "[2/6] Building backend (ASP.NET Core)..."
cd MailDeck.Api
dotnet publish -c Release -o ../build
cd ..
echo "✓ Backend build completed"
echo ""

echo "[3/6] Building frontend (React + Vite)..."
cd maildeck-ui
npm ci
npm run build
cd ..
echo "✓ Frontend build completed"
echo ""

echo "[4/6] Deploying frontend to /var/www/maildeck/..."
sudo rsync -av --delete maildeck-ui/dist/ /var/www/maildeck/
echo "✓ Frontend deployed"
echo ""

echo "[5/6] Restarting API service..."
sudo systemctl restart maildeck-api.service
echo "✓ Service restarted"
echo ""

echo "[6/6] Health check..."
sleep 3
sudo systemctl is-active maildeck-api.service
curl -sf http://localhost:5000/health && echo "✓ API responding" || echo "⚠ Health check failed — check logs"
echo ""

echo "=========================================="
echo "Deployment completed!"
echo "=========================================="
