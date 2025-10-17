#!/bin/bash
# Kamiyo Social Media Module - Rollback Script
# Usage: ./scripts/rollback_social.sh [docker|kubernetes] [version_or_revision]

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"

# Parameters
DEPLOYMENT_TYPE="${1:-docker}"  # docker or kubernetes
TARGET_VERSION="${2:-previous}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Print banner
print_banner() {
    echo ""
    echo "TPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPW"
    echo "Q    Kamiyo Social Media Rollback Script              Q"
    echo "Q    Type: $(printf '%-42s' "$DEPLOYMENT_TYPE")Q"
    echo "Q    Target: $(printf '%-40s' "$TARGET_VERSION")Q"
    echo "ZPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP]"
    echo ""
}

# Confirm rollback
confirm_rollback() {
    log_warning "You are about to rollback the deployment!"
    log_warning "This will stop the current version and restore the previous one."
    echo ""
    read -p "Are you sure you want to proceed? (yes/no): " CONFIRM

    if [ "$CONFIRM" != "yes" ]; then
        log_info "Rollback cancelled"
        exit 0
    fi
}

# Rollback Docker deployment
rollback_docker() {
    log_info "Rolling back Docker deployment..."

    cd "$DEPLOY_DIR"

    # Stop current containers
    log_info "Stopping current containers..."
    docker-compose down

    # Find previous image
    if [ "$TARGET_VERSION" = "previous" ]; then
        PREVIOUS_IMAGE=$(docker images kamiyo/social --format "{{.Tag}}" | grep -v "latest" | head -n 2 | tail -n 1)

        if [ -z "$PREVIOUS_IMAGE" ]; then
            log_error "No previous image found"
            exit 1
        fi

        log_info "Found previous image: kamiyo/social:${PREVIOUS_IMAGE}"
    else
        PREVIOUS_IMAGE="$TARGET_VERSION"
        log_info "Using specified version: kamiyo/social:${PREVIOUS_IMAGE}"
    fi

    # Update docker-compose to use previous image
    export IMAGE_TAG="$PREVIOUS_IMAGE"

    # Start with previous image
    log_info "Starting containers with previous image..."
    docker-compose up -d

    # Wait for health check
    log_info "Waiting for service to be healthy..."
    sleep 5

    HEALTH_URL="http://localhost:${HEALTH_CHECK_PORT:-8000}/health"
    MAX_RETRIES=30
    RETRY_COUNT=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -f -s "$HEALTH_URL" > /dev/null 2>&1; then
            log_success "Service is healthy!"
            break
        fi

        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo -n "."
        sleep 2
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        log_error "Service failed to become healthy after rollback"
        docker-compose logs --tail=50
        exit 1
    fi

    log_success "Rollback completed successfully!"
    docker-compose ps
}

# Rollback Kubernetes deployment
rollback_kubernetes() {
    log_info "Rolling back Kubernetes deployment..."

    if [ "$TARGET_VERSION" = "previous" ]; then
        log_info "Rolling back to previous revision..."
        kubectl rollout undo deployment/kamiyo-social -n kamiyo
    else
        # Rollback to specific revision
        log_info "Rolling back to revision: $TARGET_VERSION"
        kubectl rollout undo deployment/kamiyo-social -n kamiyo --to-revision="$TARGET_VERSION"
    fi

    # Wait for rollout
    log_info "Waiting for rollout to complete..."
    kubectl rollout status deployment/kamiyo-social -n kamiyo --timeout=300s

    # Verify rollback
    log_info "Verifying rollback..."
    kubectl get pods -n kamiyo -l app=kamiyo-social

    # Check health
    log_info "Checking service health..."
    kubectl port-forward -n kamiyo service/kamiyo-social 8000:80 &
    PF_PID=$!
    sleep 3

    HEALTH_URL="http://localhost:8000/health"
    RESPONSE=$(curl -s "$HEALTH_URL" || echo "{}")

    if echo "$RESPONSE" | grep -q '"status":"healthy"'; then
        log_success "Health check passed after rollback!"
    else
        log_error "Health check failed after rollback!"
        kill $PF_PID 2>/dev/null || true
        exit 1
    fi

    # Cleanup
    kill $PF_PID 2>/dev/null || true

    log_success "Kubernetes rollback completed successfully!"
}

# List available versions
list_versions() {
    log_info "Available versions:"
    echo ""

    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        log_info "Docker images:"
        docker images kamiyo/social --format "table {{.Tag}}\t{{.CreatedSince}}\t{{.Size}}"
    elif [ "$DEPLOYMENT_TYPE" = "kubernetes" ]; then
        log_info "Kubernetes deployment history:"
        kubectl rollout history deployment/kamiyo-social -n kamiyo
    fi

    echo ""
}

# Main rollback flow
main() {
    print_banner

    # Check if deployment type is valid
    if [ "$DEPLOYMENT_TYPE" != "docker" ] && [ "$DEPLOYMENT_TYPE" != "kubernetes" ]; then
        log_error "Invalid deployment type: $DEPLOYMENT_TYPE"
        log_info "Usage: $0 [docker|kubernetes] [version_or_revision]"
        exit 1
    fi

    # List available versions
    list_versions

    # Confirm rollback
    confirm_rollback

    # Perform rollback
    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        rollback_docker
    elif [ "$DEPLOYMENT_TYPE" = "kubernetes" ]; then
        rollback_kubernetes
    fi

    log_success "Rollback completed successfully!"
    log_info "Monitor the service to ensure it's working correctly"

    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        log_info "  docker-compose logs -f"
    else
        log_info "  kubectl logs -f -n kamiyo deployment/kamiyo-social"
    fi
}

# Run main function
main "$@"
