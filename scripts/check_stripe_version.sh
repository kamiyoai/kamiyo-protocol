#!/bin/bash
# -*- coding: utf-8 -*-
# Stripe API Version Health Check Script
# PCI DSS Requirement 12.10.1 - Incident response planning
#
# Run weekly via cron to monitor Stripe API version age
# Alerts DevOps if version is approaching end-of-life
#
# Crontab entry:
# 0 9 * * 1 /path/to/check_stripe_version.sh >> /var/log/stripe_version_check.log 2>&1
# (Runs every Monday at 9:00 AM)

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PYTHON_SCRIPT="$PROJECT_ROOT/api/payments/stripe_version_monitor.py"
LOG_FILE="${LOG_FILE:-/var/log/kamiyo/stripe_version_check.log}"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR] $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}" | tee -a "$LOG_FILE"
}

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

log "=== Stripe API Version Health Check Started ==="

# Check if Python script exists
if [ ! -f "$PYTHON_SCRIPT" ]; then
    log_error "Version monitor script not found: $PYTHON_SCRIPT"
    exit 1
fi

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    log "Loading environment from .env file"
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
elif [ -f "$PROJECT_ROOT/.env.production" ]; then
    log "Loading environment from .env.production file"
    export $(grep -v '^#' "$PROJECT_ROOT/.env.production" | xargs)
else
    log_warning "No .env file found, using system environment variables"
fi

# Check if Stripe API key is configured
if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
    log_error "STRIPE_SECRET_KEY not configured"
    exit 1
fi

log "Running version health check..."

# Run Python version monitor
cd "$PROJECT_ROOT"

# Execute version monitor and capture output
PYTHON_OUTPUT=$(python3 "$PYTHON_SCRIPT" 2>&1)
EXIT_CODE=$?

# Log output
echo "$PYTHON_OUTPUT" | tee -a "$LOG_FILE"

# Check exit code
if [ $EXIT_CODE -eq 0 ]; then
    log_success "Version health check completed successfully"

    # Parse output for status
    if echo "$PYTHON_OUTPUT" | grep -q "Status: critical"; then
        log_error "CRITICAL: Stripe API version is outdated (>1 year old)"
        log_error "ACTION REQUIRED: Upgrade Stripe API version immediately"
        log_error "See: https://stripe.com/docs/upgrades"
        exit 2
    elif echo "$PYTHON_OUTPUT" | grep -q "Status: warning"; then
        log_warning "WARNING: Stripe API version approaching end-of-life (>6 months old)"
        log_warning "RECOMMENDED: Plan upgrade within 3-6 months"
        log_warning "See: https://stripe.com/docs/upgrades"
        exit 1
    else
        log_success "Stripe API version is current (healthy)"
        exit 0
    fi
else
    log_error "Version health check failed with exit code: $EXIT_CODE"
    exit $EXIT_CODE
fi

log "=== Stripe API Version Health Check Completed ==="
