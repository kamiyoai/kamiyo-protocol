#!/bin/bash
# Kamiyo Social Media Module - Automated Deployment Script
# Usage: ./scripts/deploy_social.sh [production|staging|development] [docker|kubernetes]

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

# Default environment
ENVIRONMENT="${1:-development}"
DEPLOYMENT_TYPE="${2:-docker}"  # docker or kubernetes

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
    echo "Q    Kamiyo Social Media Deployment Script            Q"
    echo "Q    Environment: $(printf '%-35s' "$ENVIRONMENT")Q"
    echo "Q    Type: $(printf '%-42s' "$DEPLOYMENT_TYPE")Q"
    echo "ZPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP]"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        if ! command -v docker &> /dev/null; then
            log_error "Docker is not installed"
            exit 1
        fi

        if ! command -v docker-compose &> /dev/null; then
            log_error "Docker Compose is not installed"
            exit 1
        fi

        log_success "Docker and Docker Compose are installed"
    fi

    if [ "$DEPLOYMENT_TYPE" = "kubernetes" ]; then
        if ! command -v kubectl &> /dev/null; then
            log_error "kubectl is not installed"
            exit 1
        fi

        if ! kubectl cluster-info &> /dev/null; then
            log_error "Cannot connect to Kubernetes cluster"
            exit 1
        fi

        log_success "kubectl is installed and connected to cluster"
    fi
}

# Validate environment variables
validate_environment() {
    log_info "Validating environment variables..."

    if [ -f "$SCRIPT_DIR/validate_social_env.sh" ]; then
        bash "$SCRIPT_DIR/validate_social_env.sh" || {
            log_error "Environment validation failed"
            exit 1
        }
        log_success "Environment validation passed"
    else
        log_warning "Environment validation script not found, skipping..."
    fi
}

# Build Docker image
build_docker_image() {
    log_info "Building Docker image..."

    cd "$PROJECT_ROOT"

    # Get version from git
    VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
    BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

    docker build \
        -f "$DEPLOY_DIR/Dockerfile" \
        -t "kamiyo/social:${VERSION}" \
        -t "kamiyo/social:latest" \
        --build-arg VERSION="$VERSION" \
        --build-arg BUILD_DATE="$BUILD_DATE" \
        .

    log_success "Docker image built: kamiyo/social:${VERSION}"
}

# Deploy with Docker Compose
deploy_docker() {
    log_info "Deploying with Docker Compose..."

    cd "$DEPLOY_DIR"

    # Load environment file if exists
    ENV_FILE="$PROJECT_ROOT/.env.$ENVIRONMENT"
    if [ -f "$ENV_FILE" ]; then
        log_info "Loading environment from $ENV_FILE"
        export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
    else
        log_warning "Environment file not found: $ENV_FILE"
    fi

    # Pull latest images (if needed)
    docker-compose pull

    # Stop existing containers
    docker-compose down

    # Start new containers
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
        log_error "Service failed to become healthy"
        docker-compose logs --tail=50
        exit 1
    fi

    log_success "Deployment completed successfully!"

    # Show status
    docker-compose ps
}

# Deploy to Kubernetes
deploy_kubernetes() {
    log_info "Deploying to Kubernetes..."

    cd "$DEPLOY_DIR/kubernetes"

    # Create namespace if it doesn't exist
    kubectl create namespace kamiyo --dry-run=client -o yaml | kubectl apply -f -

    # Apply ConfigMap
    log_info "Applying ConfigMap..."
    kubectl apply -f configmap.yaml

    # Apply Secrets (if exists and not a template)
    if [ -f "secrets-production.yaml" ]; then
        log_info "Applying Secrets..."
        kubectl apply -f secrets-production.yaml
    else
        log_warning "Production secrets file not found. Using template (not recommended for production!)"
        kubectl apply -f secrets.yaml
    fi

    # Apply Service
    log_info "Applying Service..."
    kubectl apply -f service.yaml

    # Apply Deployment
    log_info "Applying Deployment..."
    kubectl apply -f deployment.yaml

    # Wait for rollout
    log_info "Waiting for rollout to complete..."
    kubectl rollout status deployment/kamiyo-social -n kamiyo --timeout=300s

    # Check pod status
    log_info "Checking pod status..."
    kubectl get pods -n kamiyo -l app=kamiyo-social

    log_success "Kubernetes deployment completed successfully!"
}

# Backup current deployment
backup_deployment() {
    log_info "Creating backup of current deployment..."

    BACKUP_DIR="$PROJECT_ROOT/backups"
    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/deployment_${ENVIRONMENT}_${TIMESTAMP}.tar.gz"

    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        # Backup docker-compose state
        cd "$DEPLOY_DIR"
        docker-compose ps > "$BACKUP_DIR/containers_${TIMESTAMP}.txt" 2>/dev/null || true
    fi

    if [ "$DEPLOYMENT_TYPE" = "kubernetes" ]; then
        # Backup Kubernetes resources
        kubectl get all -n kamiyo -o yaml > "$BACKUP_DIR/k8s_resources_${TIMESTAMP}.yaml" 2>/dev/null || true
    fi

    log_success "Backup metadata created in $BACKUP_DIR"
}

# Post-deployment verification
verify_deployment() {
    log_info "Verifying deployment..."

    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        HEALTH_URL="http://localhost:${HEALTH_CHECK_PORT:-8000}/health"
    else
        # Port-forward for Kubernetes health check
        kubectl port-forward -n kamiyo service/kamiyo-social 8000:80 &
        PF_PID=$!
        sleep 3
        HEALTH_URL="http://localhost:8000/health"
    fi

    RESPONSE=$(curl -s "$HEALTH_URL" || echo "{}")

    if echo "$RESPONSE" | grep -q '"status":"healthy"'; then
        log_success "Health check passed!"
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    else
        log_error "Health check failed!"
        echo "$RESPONSE"
        [ ! -z "${PF_PID:-}" ] && kill $PF_PID 2>/dev/null || true
        exit 1
    fi

    # Cleanup port-forward
    if [ ! -z "${PF_PID:-}" ]; then
        kill $PF_PID 2>/dev/null || true
    fi
}

# Main deployment flow
main() {
    print_banner

    check_prerequisites
    validate_environment
    backup_deployment
    build_docker_image

    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        deploy_docker
    elif [ "$DEPLOYMENT_TYPE" = "kubernetes" ]; then
        deploy_kubernetes
    else
        log_error "Invalid deployment type: $DEPLOYMENT_TYPE"
        exit 1
    fi

    verify_deployment

    log_success "Deployment completed successfully!"
    log_info "View logs:"
    if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
        log_info "  docker-compose logs -f"
    else
        log_info "  kubectl logs -f -n kamiyo deployment/kamiyo-social"
    fi
}

# Run main function
main "$@"
