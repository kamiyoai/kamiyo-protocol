#!/bin/bash
# KAMIYO Production Deployment Script
set -e

echo "🚀 KAMIYO x402 Production Deployment"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check .env.production
if [ ! -f .env.production ]; then
    echo -e "${RED}❌ .env.production not found${NC}"
    exit 1
fi

# Validate configuration
echo "📋 Validating configuration..."
python3 scripts/validate_production_config.py
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Configuration validation failed${NC}"
    exit 1
fi

# Build and deploy
echo ""
echo "🏗️  Building containers..."
docker-compose -f docker-compose.prod.yml build

echo ""
echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

echo ""
echo "⏳ Waiting for services..."
sleep 10

# Health check
if curl -f http://localhost:8000/health &> /dev/null; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    exit 1
fi

echo ""
echo "📊 Service Status:"
docker-compose -f docker-compose.prod.yml ps
