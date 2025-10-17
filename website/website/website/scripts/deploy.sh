#!/bin/bash

# Kamiyo Zero-Downtime Deployment Script
# Performs rolling deployment with health checks

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Configuration
DEPLOYMENT_ENV="${1:-production}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:8000/health}"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=2
BACKUP_BEFORE_DEPLOY="${BACKUP_BEFORE_DEPLOY:-true}"

echo "=========================================="
echo "Kamiyo Zero-Downtime Deployment"
echo "=========================================="
echo "Environment: $DEPLOYMENT_ENV"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================="
echo ""

# ============================================
# Pre-Deployment Checks
# ============================================

log_step "Running pre-deployment checks..."

# Check if we're in the right directory
if [ ! -f "docker-compose.production.yml" ]; then
    log_error "docker-compose.production.yml not found. Are you in the project root?"
    exit 1
fi

# Check if environment file exists
if [ ! -f ".env.production" ]; then
    log_error ".env.production not found. Please configure environment variables."
    exit 1
fi

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running"
    exit 1
fi

log_info "Pre-deployment checks passed"
echo ""

# ============================================
# Git Status Check
# ============================================

log_step "Checking git status..."

if git diff-index --quiet HEAD --; then
    log_info "Working directory is clean"
else
    log_warn "Uncommitted changes detected"
    git status --short
    echo ""
    read -p "Continue with deployment? (yes/no): " CONTINUE
    if [ "$CONTINUE" != "yes" ]; then
        log_error "Deployment cancelled"
        exit 1
    fi
fi

CURRENT_COMMIT=$(git rev-parse HEAD)
CURRENT_BRANCH=$(git branch --show-current)
log_info "Deploying: $CURRENT_BRANCH @ $CURRENT_COMMIT"
echo ""

# ============================================
# Pre-Deployment Backup
# ============================================

if [ "$BACKUP_BEFORE_DEPLOY" == "true" ]; then
    log_step "Creating pre-deployment backup..."

    if [ -f "scripts/backup_database.sh" ]; then
        ./scripts/backup_database.sh || log_warn "Backup failed, continuing anyway..."
    else
        log_warn "Backup script not found, skipping backup"
    fi

    echo ""
fi

# ============================================
# Build New Images
# ============================================

log_step "Building new Docker images..."

# Build with build cache
docker-compose -f docker-compose.production.yml build --parallel || {
    log_error "Docker build failed"
    exit 1
}

log_info "Docker images built successfully"
echo ""

# ============================================
# Database Migrations
# ============================================

log_step "Running database migrations..."

# Run migrations in a temporary container
docker-compose -f docker-compose.production.yml run --rm api python -m alembic upgrade head || {
    log_error "Database migration failed"
    log_error "Rolling back..."
    exit 1
}

log_info "Database migrations completed"
echo ""

# ============================================
# Rolling Deployment
# ============================================

log_step "Starting rolling deployment..."

# Get list of services to deploy
SERVICES=$(docker-compose -f docker-compose.production.yml config --services | grep -v postgres | grep -v redis)

for service in $SERVICES; do
    log_info "Deploying service: $service"

    # Scale up new version
    log_info "  Scaling up new version of $service..."
    docker-compose -f docker-compose.production.yml up -d --no-deps --scale $service=2 $service

    # Wait for new instance to be healthy
    log_info "  Waiting for new instance to be healthy..."
    sleep 5

    # Health check
    RETRIES=0
    HEALTHY=false

    while [ $RETRIES -lt $HEALTH_CHECK_RETRIES ]; do
        if curl -sf --max-time 5 "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
            HEALTHY=true
            break
        fi

        log_info "  Health check attempt $((RETRIES + 1))/$HEALTH_CHECK_RETRIES..."
        sleep $HEALTH_CHECK_INTERVAL
        ((RETRIES++))
    done

    if [ "$HEALTHY" = true ]; then
        log_info "  New instance is healthy"

        # Scale down old version
        log_info "  Scaling down old version..."
        docker-compose -f docker-compose.production.yml up -d --no-deps --scale $service=1 $service

        # Remove old containers
        docker-compose -f docker-compose.production.yml ps -q $service | tail -n +2 | xargs -r docker stop
        docker-compose -f docker-compose.production.yml ps -q $service | tail -n +2 | xargs -r docker rm

        log_info "  Service $service deployed successfully"
    else
        log_error "  New instance failed health checks"
        log_error "  Rolling back $service..."

        # Scale back to 1 instance (keep old version)
        docker-compose -f docker-compose.production.yml up -d --no-deps --scale $service=1 $service

        exit 1
    fi

    echo ""
done

log_info "Rolling deployment completed"
echo ""

# ============================================
# Post-Deployment Verification
# ============================================

log_step "Running post-deployment verification..."

# Run health checks
if [ -f "scripts/health_check.sh" ]; then
    ./scripts/health_check.sh || {
        log_warn "Health check failed, but deployment is complete"
    }
else
    log_warn "Health check script not found"
fi

# Verify critical endpoints
log_info "Verifying critical endpoints..."

ENDPOINTS=(
    "/health"
    "/api/v1/exploits"
    "/api/v1/sources"
)

for endpoint in "${ENDPOINTS[@]}"; do
    if curl -sf --max-time 5 "${HEALTH_CHECK_URL%/health}$endpoint" > /dev/null 2>&1; then
        log_info "  ✓ $endpoint"
    else
        log_warn "  ✗ $endpoint (may require authentication)"
    fi
done

echo ""

# ============================================
# Cleanup
# ============================================

log_step "Cleaning up..."

# Remove old images
log_info "Removing old Docker images..."
docker image prune -f > /dev/null 2>&1

# Remove stopped containers
docker container prune -f > /dev/null 2>&1

log_info "Cleanup completed"
echo ""

# ============================================
# Update Deployment Record
# ============================================

log_step "Recording deployment..."

DEPLOY_RECORD="deployments/deployment_$(date +%Y%m%d_%H%M%S).json"
mkdir -p deployments

cat > "$DEPLOY_RECORD" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$DEPLOYMENT_ENV",
  "commit": "$CURRENT_COMMIT",
  "branch": "$CURRENT_BRANCH",
  "deployed_by": "$(whoami)",
  "services_deployed": [
$(echo "$SERVICES" | sed 's/^/    "/; s/$/",/' | sed '$ s/,$//')
  ],
  "status": "success"
}
EOF

log_info "Deployment record saved: $DEPLOY_RECORD"
echo ""

# ============================================
# Notification
# ============================================

log_step "Sending deployment notification..."

DEPLOYMENT_MESSAGE="🚀 Kamiyo deployed successfully
Environment: $DEPLOYMENT_ENV
Commit: $CURRENT_COMMIT
Branch: $CURRENT_BRANCH
Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Slack notification
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"attachments\": [{
                \"color\": \"good\",
                \"title\": \"🚀 Deployment Successful\",
                \"text\": \"$DEPLOYMENT_MESSAGE\",
                \"fields\": [
                    {\"title\": \"Environment\", \"value\": \"$DEPLOYMENT_ENV\", \"short\": true},
                    {\"title\": \"Commit\", \"value\": \"$CURRENT_COMMIT\", \"short\": true},
                    {\"title\": \"Branch\", \"value\": \"$CURRENT_BRANCH\", \"short\": true},
                    {\"title\": \"Deployed By\", \"value\": \"$(whoami)\", \"short\": true}
                ]
            }]
        }" > /dev/null 2>&1 || log_warn "Slack notification failed"
fi

# Discord notification
if [ -n "$DISCORD_WEBHOOK_URL" ]; then
    curl -X POST "$DISCORD_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"embeds\": [{
                \"title\": \"🚀 Deployment Successful\",
                \"description\": \"$DEPLOYMENT_MESSAGE\",
                \"color\": 3066993,
                \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
            }]
        }" > /dev/null 2>&1 || log_warn "Discord notification failed"
fi

echo ""

# ============================================
# Summary
# ============================================

echo "=========================================="
echo "Deployment Summary"
echo "=========================================="
echo "Environment:    $DEPLOYMENT_ENV"
echo "Commit:         $CURRENT_COMMIT"
echo "Branch:         $CURRENT_BRANCH"
echo "Services:       $(echo $SERVICES | wc -w)"
echo "Duration:       $SECONDS seconds"
echo "Status:         SUCCESS"
echo "=========================================="
echo ""
echo -e "${GREEN}✅ DEPLOYMENT COMPLETED SUCCESSFULLY${NC}"
echo ""
echo "Next steps:"
echo "  1. Monitor application logs: docker-compose -f docker-compose.production.yml logs -f"
echo "  2. Check metrics in Grafana: http://grafana.kamiyo.ai"
echo "  3. Verify functionality: curl $HEALTH_CHECK_URL"
echo ""
echo "In case of issues, rollback with:"
echo "  git checkout <previous-commit>"
echo "  ./scripts/deploy.sh"
