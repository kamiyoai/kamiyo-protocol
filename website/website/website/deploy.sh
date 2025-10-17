#!/bin/bash

# VARDEN Exploit Intelligence Platform - Deployment Script
# Deploys the complete platform with all 5 agents

set -e

echo "========================================="
echo "  VARDEN - Exploit Intelligence Platform"
echo "  Deployment Script"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo -e "${RED}IMPORTANT: Edit .env with your actual configuration before deploying!${NC}"
    exit 1
fi

# Parse command line arguments
ENVIRONMENT=${1:-development}
COMMAND=${2:-up}

echo "Environment: $ENVIRONMENT"
echo "Command: $COMMAND"
echo ""

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}Error: Docker is not running${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker is running${NC}"
}

# Function to check if docker-compose is installed
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}Error: docker-compose is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ docker-compose is installed${NC}"
}

# Function to build all services
build_services() {
    echo ""
    echo "Building all services..."
    docker-compose build
    echo -e "${GREEN}✓ All services built successfully${NC}"
}

# Function to start services
start_services() {
    echo ""
    echo "Starting services..."

    if [ "$ENVIRONMENT" == "production" ]; then
        docker-compose --profile production up -d
    else
        docker-compose up -d
    fi

    echo -e "${GREEN}✓ Services started${NC}"
}

# Function to stop services
stop_services() {
    echo ""
    echo "Stopping services..."
    docker-compose down
    echo -e "${GREEN}✓ Services stopped${NC}"
}

# Function to show logs
show_logs() {
    SERVICE=${1:-}
    if [ -z "$SERVICE" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f $SERVICE
    fi
}

# Function to check service health
check_health() {
    echo ""
    echo "Checking service health..."

    services=("postgres" "redis" "aggregator" "processor" "api" "frontend" "monitor")

    for service in "${services[@]}"; do
        if docker-compose ps | grep -q "$service.*Up"; then
            echo -e "${GREEN}✓ $service is running${NC}"
        else
            echo -e "${RED}✗ $service is not running${NC}"
        fi
    done
}

# Function to initialize database
init_database() {
    echo ""
    echo "Initializing database..."

    # Wait for postgres to be ready
    echo "Waiting for PostgreSQL to be ready..."
    sleep 5

    # Run migrations (if any)
    docker-compose exec api python -c "from database import init_db; init_db()"

    echo -e "${GREEN}✓ Database initialized${NC}"
}

# Function to run tests
run_tests() {
    echo ""
    echo "Running tests..."

    echo "Testing Aggregator..."
    docker-compose exec aggregator python -m pytest test_aggregators.py

    echo -e "${GREEN}✓ Tests passed${NC}"
}

# Main deployment logic
main() {
    case $COMMAND in
        up|start)
            check_docker
            check_docker_compose
            build_services
            start_services
            sleep 10
            check_health
            echo ""
            echo -e "${GREEN}=========================================${NC}"
            echo -e "${GREEN}  VARDEN Platform is running!${NC}"
            echo -e "${GREEN}=========================================${NC}"
            echo ""
            echo "Services:"
            echo "  • Frontend:     http://localhost:3000"
            echo "  • API:          http://localhost:8000"
            echo "  • API Docs:     http://localhost:8000/docs"
            echo "  • PostgreSQL:   localhost:5432"
            echo "  • Redis:        localhost:6379"
            echo ""
            echo "To view logs:     ./deploy.sh $ENVIRONMENT logs"
            echo "To stop:          ./deploy.sh $ENVIRONMENT down"
            ;;

        down|stop)
            stop_services
            ;;

        restart)
            stop_services
            start_services
            ;;

        logs)
            show_logs $3
            ;;

        build)
            build_services
            ;;

        health)
            check_health
            ;;

        init-db)
            init_database
            ;;

        test)
            run_tests
            ;;

        *)
            echo "Usage: $0 [environment] [command]"
            echo ""
            echo "Environments:"
            echo "  development    (default) - Dev environment without nginx"
            echo "  production     - Production with nginx reverse proxy"
            echo ""
            echo "Commands:"
            echo "  up|start       - Build and start all services"
            echo "  down|stop      - Stop all services"
            echo "  restart        - Restart all services"
            echo "  logs [service] - Show logs (optional: specific service)"
            echo "  build          - Build all services"
            echo "  health         - Check service health"
            echo "  init-db        - Initialize database"
            echo "  test           - Run tests"
            echo ""
            echo "Examples:"
            echo "  $0 development up"
            echo "  $0 production up"
            echo "  $0 development logs api"
            exit 1
            ;;
    esac
}

main
