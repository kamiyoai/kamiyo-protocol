#!/bin/bash
# Production Deployment Script for Kamiyo
# Safely deploys to production with health checks and rollback capability

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Kamiyo Production Deployment${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}\n"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}ERROR: Do not run as root${NC}"
    exit 1
fi

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo -e "${RED}ERROR: .env.production file not found${NC}"
    echo "Copy .env.production.template and fill in values"
    exit 1
fi

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

# Confirm deployment
echo -e "${YELLOW}Deploying to:${NC} $DOMAIN"
echo -e "${YELLOW}Environment:${NC} production"
read -p "Continue with deployment? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""
echo -e "${GREEN}Step 1: Pre-deployment checks${NC}"

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Docker is not running${NC}"
    exit 1
fi
echo "  ✓ Docker is running"

# Check docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}ERROR: docker-compose not installed${NC}"
    exit 1
fi
echo "  ✓ docker-compose installed"

# Check database URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}ERROR: DATABASE_URL not set${NC}"
    exit 1
fi
echo "  ✓ Environment variables loaded"

# Check SSL certificates exist
if [ ! -f "nginx/ssl/fullchain.pem" ]; then
    echo -e "${YELLOW}WARNING: SSL certificates not found${NC}"
    echo "  Run: sudo certbot certonly --standalone -d $DOMAIN"
fi

echo ""
echo -e "${GREEN}Step 2: Building Docker images${NC}"

# Build images with no cache for production
docker-compose -f docker-compose.production.yml build --no-cache --pull

echo ""
echo -e "${GREEN}Step 3: Running database migrations${NC}"

# Check if postgres is running
if docker ps | grep -q kamiyo-postgres; then
    echo "  ✓ PostgreSQL already running"
else
    echo "  Starting PostgreSQL..."
    docker-compose -f docker-compose.production.yml up -d postgres
    sleep 10  # Wait for postgres to be ready
fi

# Run migrations
echo "  Running migrations..."
docker-compose -f docker-compose.production.yml run --rm api \
    python -c "from database.postgres_manager import get_db; db = get_db(); print('✓ Database connection successful')"

echo ""
echo -e "${GREEN}Step 4: Starting services${NC}"

# Stop old containers (if running)
echo "  Stopping old containers..."
docker-compose -f docker-compose.production.yml down

# Start all services
echo "  Starting new containers..."
docker-compose -f docker-compose.production.yml up -d

# Wait for services to be ready
echo "  Waiting for services to start..."
sleep 15

echo ""
echo -e "${GREEN}Step 5: Health checks${NC}"

# Check API health
MAX_RETRIES=10
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:8000/health > /dev/null; then
        echo "  ✓ API is healthy"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "  Waiting for API... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 3
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}ERROR: API failed health check${NC}"
    echo "Rolling back deployment..."
    docker-compose -f docker-compose.production.yml logs api
    docker-compose -f docker-compose.production.yml down
    exit 1
fi

# Check database connectivity
docker-compose -f docker-compose.production.yml exec -T postgres \
    psql -U kamiyo -d kamiyo_prod -c "SELECT 1;" > /dev/null

if [ $? -eq 0 ]; then
    echo "  ✓ Database is accessible"
else
    echo -e "${RED}ERROR: Database connection failed${NC}"
    exit 1
fi

# Check Redis
docker-compose -f docker-compose.production.yml exec -T redis redis-cli ping | grep -q PONG
if [ $? -eq 0 ]; then
    echo "  ✓ Redis is responding"
else
    echo -e "${YELLOW}WARNING: Redis connection failed${NC}"
fi

echo ""
echo -e "${GREEN}Step 6: Post-deployment tasks${NC}"

# Show running containers
echo "  Active containers:"
docker-compose -f docker-compose.production.yml ps

# Check logs for errors
echo ""
echo "  Checking logs for errors..."
docker-compose -f docker-compose.production.yml logs --tail=50 | grep -i error || echo "  ✓ No errors in recent logs"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment successful! ✓${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"

echo ""
echo "Services available at:"
echo "  API: https://$DOMAIN/api"
echo "  Docs: https://$DOMAIN/docs"
echo "  Health: https://$DOMAIN/health"
echo "  Grafana: http://localhost:3001"
echo ""

echo "Useful commands:"
echo "  View logs: docker-compose -f docker-compose.production.yml logs -f"
echo "  Restart: docker-compose -f docker-compose.production.yml restart"
echo "  Stop: docker-compose -f docker-compose.production.yml down"
echo ""

# Tag deployment
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
echo "Deployment: $TIMESTAMP" >> deployments.log

echo -e "${GREEN}Done!${NC}"
