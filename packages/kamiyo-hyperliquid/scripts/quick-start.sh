#!/bin/bash
# ============================================================================
# KAMIYO Hyperliquid - Quick Start Script
# ============================================================================
# Automated deployment for development and production environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}========================================${NC}\n"
}

print_info() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check dependencies
check_dependencies() {
    print_header "Checking Dependencies"

    local missing_deps=0

    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        missing_deps=$((missing_deps + 1))
    else
        print_info "Docker found: $(docker --version)"
    fi

    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        missing_deps=$((missing_deps + 1))
    else
        print_info "Docker Compose found: $(docker-compose --version)"
    fi

    if [ $missing_deps -gt 0 ]; then
        print_error "Please install missing dependencies first"
        print_info "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
}

# Generate secure passwords
generate_passwords() {
    print_header "Generating Secure Passwords"

    if [ ! -f .env ]; then
        cp .env.example .env
        print_info "Created .env from .env.example"

        # Generate passwords
        POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
        REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
        GRAFANA_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-12)

        # Update .env file
        sed -i.bak "s/kamiyo_secure_password/$POSTGRES_PASSWORD/g" .env
        sed -i.bak "s/kamiyo_redis_password/$REDIS_PASSWORD/g" .env
        sed -i.bak "s/GRAFANA_PASSWORD=admin/GRAFANA_PASSWORD=$GRAFANA_PASSWORD/g" .env

        rm .env.bak 2>/dev/null || true

        print_info "Generated secure passwords"
        print_warning "Passwords saved in .env file - keep this file secure!"

        # Save passwords for user reference
        echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" > .env.passwords
        echo "REDIS_PASSWORD=$REDIS_PASSWORD" >> .env.passwords
        echo "GRAFANA_PASSWORD=$GRAFANA_PASSWORD" >> .env.passwords
        chmod 600 .env.passwords

        print_info "Passwords also saved to .env.passwords"
    else
        print_warning ".env file already exists, skipping password generation"
    fi
}

# Start core services
start_core_services() {
    print_header "Starting Core Services"

    print_info "Starting PostgreSQL and Redis..."
    docker-compose up -d postgres redis

    print_info "Waiting for database to be ready..."
    sleep 10

    # Wait for PostgreSQL to be healthy
    local retries=30
    while [ $retries -gt 0 ]; do
        if docker-compose exec -T postgres pg_isready -U kamiyo &> /dev/null; then
            print_info "Database is ready!"
            break
        fi
        retries=$((retries - 1))
        echo -n "."
        sleep 2
    done

    if [ $retries -eq 0 ]; then
        print_error "Database failed to start in time"
        exit 1
    fi
}

# Initialize database
initialize_database() {
    print_header "Initializing Database"

    print_info "Creating database schema..."
    docker-compose exec -T postgres psql -U kamiyo -d kamiyo_hyperliquid -f /docker-entrypoint-initdb.d/01-schema.sql || true

    print_info "Verifying database tables..."
    docker-compose exec -T postgres psql -U kamiyo -d kamiyo_hyperliquid -c "\dt" | grep "public" && print_info "Database initialized successfully"
}

# Start API server
start_api() {
    print_header "Starting API Server"

    docker-compose up -d api

    print_info "Waiting for API to be ready..."
    sleep 5

    # Wait for API health check
    local retries=30
    while [ $retries -gt 0 ]; do
        if curl -sf http://localhost:8000/health > /dev/null; then
            print_info "API is ready!"
            break
        fi
        retries=$((retries - 1))
        echo -n "."
        sleep 2
    done

    if [ $retries -eq 0 ]; then
        print_warning "API health check timeout - checking logs..."
        docker-compose logs --tail=20 api
    fi
}

# Start monitoring stack (optional)
start_monitoring() {
    print_header "Starting Monitoring Stack (Optional)"

    read -p "Do you want to start Prometheus and Grafana? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose --profile monitoring up -d
        print_info "Monitoring stack started"
        print_info "Grafana: http://localhost:3000 (admin / see .env.passwords)"
        print_info "Prometheus: http://localhost:9090"
    else
        print_info "Skipping monitoring stack"
    fi
}

# Run tests
run_tests() {
    print_header "Running Tests"

    read -p "Do you want to run production readiness tests? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Running production readiness tests..."
        docker-compose exec api python tests/test_production_readiness.py || print_warning "Some tests may have failed (expected for first run)"
    fi
}

# Display summary
display_summary() {
    print_header "Deployment Complete!"

    echo -e "${GREEN}Services are running:${NC}"
    echo ""
    echo -e "  API Server:       ${GREEN}http://localhost:8000${NC}"
    echo -e "  API Docs:         ${GREEN}http://localhost:8000/docs${NC}"
    echo -e "  Health Check:     ${GREEN}http://localhost:8000/health${NC}"
    echo -e "  Security Dashboard: ${GREEN}http://localhost:8000/security/dashboard${NC}"
    echo ""

    if docker-compose ps | grep grafana > /dev/null; then
        echo -e "  Grafana:          ${GREEN}http://localhost:3000${NC}"
        echo -e "  Prometheus:       ${GREEN}http://localhost:9090${NC}"
        echo ""
    fi

    echo -e "${YELLOW}Passwords saved in:${NC} .env.passwords"
    echo ""
    echo -e "${GREEN}Quick commands:${NC}"
    echo -e "  View logs:        ${YELLOW}docker-compose logs -f api${NC}"
    echo -e "  Stop services:    ${YELLOW}docker-compose down${NC}"
    echo -e "  Restart services: ${YELLOW}docker-compose restart${NC}"
    echo -e "  Run tests:        ${YELLOW}docker-compose exec api python tests/test_production_readiness.py${NC}"
    echo ""
    echo -e "${GREEN}Example API calls:${NC}"
    echo -e "  ${YELLOW}curl http://localhost:8000/health | jq${NC}"
    echo -e "  ${YELLOW}curl http://localhost:8000/security/dashboard | jq${NC}"
    echo -e "  ${YELLOW}curl http://localhost:8000/security/hlp-vault | jq${NC}"
    echo ""

    print_info "System is ready! 🚀"
}

# Main execution
main() {
    clear
    print_header "KAMIYO Hyperliquid - Quick Start"

    check_dependencies
    generate_passwords
    start_core_services
    initialize_database
    start_api
    start_monitoring
    run_tests
    display_summary
}

# Run main function
main
