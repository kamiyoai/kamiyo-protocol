#!/bin/bash
# Kamiyo Social Media Module - Environment Variables Validation Script
# Validates all required environment variables before deployment

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNING_CHECKS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_CHECKS++))
}

# Check if variable is set and non-empty
check_required() {
    local var_name=$1
    local var_value="${!var_name:-}"

    ((TOTAL_CHECKS++))

    if [ -z "$var_value" ]; then
        log_error "$var_name is required but not set"
        return 1
    else
        log_success "$var_name is set"
        return 0
    fi
}

# Check if variable is set (optional)
check_optional() {
    local var_name=$1
    local var_value="${!var_name:-}"

    ((TOTAL_CHECKS++))

    if [ -z "$var_value" ]; then
        log_warning "$var_name is not set (optional)"
        return 0
    else
        log_success "$var_name is set"
        return 0
    fi
}

# Check if URL is valid format
check_url() {
    local var_name=$1
    local var_value="${!var_name:-}"

    ((TOTAL_CHECKS++))

    if [ -z "$var_value" ]; then
        log_error "$var_name is required but not set"
        return 1
    fi

    if [[ ! "$var_value" =~ ^https?:// ]] && [[ ! "$var_value" =~ ^wss?:// ]]; then
        log_error "$var_name is not a valid URL: $var_value"
        return 1
    fi

    log_success "$var_name is a valid URL"
    return 0
}

# Check if boolean is valid
check_boolean() {
    local var_name=$1
    local var_value="${!var_name:-false}"

    ((TOTAL_CHECKS++))

    if [[ ! "$var_value" =~ ^(true|false|True|False|TRUE|FALSE|1|0)$ ]]; then
        log_error "$var_name must be a boolean (true/false): $var_value"
        return 1
    fi

    log_success "$var_name is a valid boolean: $var_value"
    return 0
}

# Check if number is valid
check_number() {
    local var_name=$1
    local var_value="${!var_name:-}"

    ((TOTAL_CHECKS++))

    if [ -z "$var_value" ]; then
        log_warning "$var_name is not set, using default"
        return 0
    fi

    if ! [[ "$var_value" =~ ^[0-9]+$ ]]; then
        log_error "$var_name must be a number: $var_value"
        return 1
    fi

    log_success "$var_name is a valid number: $var_value"
    return 0
}

# Print banner
echo ""
echo "TPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPW"
echo "Q    Kamiyo Social Media Environment Validation       Q"
echo "ZPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP]"
echo ""

# Core Kamiyo API Configuration
log_info "Checking Core Kamiyo API Configuration..."
check_url KAMIYO_API_URL
check_required KAMIYO_API_KEY
check_url KAMIYO_WEBSOCKET_URL || log_warning "WebSocket URL optional if using polling mode"

# Watcher Configuration
echo ""
log_info "Checking Watcher Configuration..."
check_optional WATCHER_MODE
check_number POLL_INTERVAL_SECONDS
check_number SOCIAL_MIN_AMOUNT_USD
check_optional SOCIAL_ENABLED_CHAINS

# Platform Enable Flags
echo ""
log_info "Checking Platform Enable Flags..."
check_boolean REDDIT_ENABLED
check_boolean DISCORD_SOCIAL_ENABLED
check_boolean TELEGRAM_SOCIAL_ENABLED
check_boolean X_TWITTER_ENABLED

# Reddit Configuration
echo ""
log_info "Checking Reddit Configuration..."
if [ "${REDDIT_ENABLED:-false}" = "true" ]; then
    check_required REDDIT_CLIENT_ID
    check_required REDDIT_CLIENT_SECRET
    check_required REDDIT_USERNAME
    check_required REDDIT_PASSWORD
    check_optional REDDIT_SUBREDDITS
else
    log_info "Reddit is disabled, skipping credentials check"
fi

# Discord Configuration
echo ""
log_info "Checking Discord Configuration..."
if [ "${DISCORD_SOCIAL_ENABLED:-false}" = "true" ]; then
    check_required DISCORD_SOCIAL_WEBHOOKS

    # Validate webhook format
    if [ ! -z "${DISCORD_SOCIAL_WEBHOOKS:-}" ]; then
        if [[ ! "$DISCORD_SOCIAL_WEBHOOKS" =~ discord.com/api/webhooks ]]; then
            log_error "DISCORD_SOCIAL_WEBHOOKS must contain valid Discord webhook URLs"
            ((FAILED_CHECKS++))
        else
            log_success "Discord webhooks format is valid"
        fi
    fi
else
    log_info "Discord is disabled, skipping credentials check"
fi

# Telegram Configuration
echo ""
log_info "Checking Telegram Configuration..."
if [ "${TELEGRAM_SOCIAL_ENABLED:-false}" = "true" ]; then
    check_required TELEGRAM_SOCIAL_BOT_TOKEN
    check_required TELEGRAM_SOCIAL_CHATS
else
    log_info "Telegram is disabled, skipping credentials check"
fi

# X/Twitter Configuration
echo ""
log_info "Checking X/Twitter Configuration..."
if [ "${X_TWITTER_ENABLED:-false}" = "true" ]; then
    check_required X_API_KEY
    check_required X_API_SECRET
    check_required X_ACCESS_TOKEN
    check_required X_ACCESS_SECRET
    check_optional X_BEARER_TOKEN
else
    log_info "X/Twitter is disabled, skipping credentials check"
fi

# Logging Configuration
echo ""
log_info "Checking Logging Configuration..."
check_optional LOG_LEVEL
check_optional LOG_FORMAT

# Monitoring Configuration
echo ""
log_info "Checking Monitoring Configuration..."
check_optional SENTRY_DSN
check_boolean PROMETHEUS_ENABLED || true

# Health Check Configuration
echo ""
log_info "Checking Health Check Configuration..."
check_number HEALTH_CHECK_PORT || log_warning "Using default port 8000"

# Redis Configuration (optional)
echo ""
log_info "Checking Redis Configuration (optional)..."
check_optional REDIS_PASSWORD

# Print summary
echo ""
echo "TPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPW"
echo "Q                  Validation Summary                  Q"
echo "ZPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP]"
echo ""
echo -e "Total Checks:    ${BLUE}${TOTAL_CHECKS}${NC}"
echo -e "Passed:          ${GREEN}${PASSED_CHECKS}${NC}"
echo -e "Warnings:        ${YELLOW}${WARNING_CHECKS}${NC}"
echo -e "Failed:          ${RED}${FAILED_CHECKS}${NC}"
echo ""

# Check if at least one platform is enabled
PLATFORMS_ENABLED=0
[ "${REDDIT_ENABLED:-false}" = "true" ] && ((PLATFORMS_ENABLED++))
[ "${DISCORD_SOCIAL_ENABLED:-false}" = "true" ] && ((PLATFORMS_ENABLED++))
[ "${TELEGRAM_SOCIAL_ENABLED:-false}" = "true" ] && ((PLATFORMS_ENABLED++))
[ "${X_TWITTER_ENABLED:-false}" = "true" ] && ((PLATFORMS_ENABLED++))

if [ $PLATFORMS_ENABLED -eq 0 ]; then
    log_error "No social media platforms are enabled!"
    ((FAILED_CHECKS++))
else
    log_success "$PLATFORMS_ENABLED social media platform(s) enabled"
fi

# Exit with appropriate code
if [ $FAILED_CHECKS -gt 0 ]; then
    echo ""
    log_error "Validation failed with $FAILED_CHECKS error(s)"
    echo ""
    log_info "Please set the required environment variables and try again"
    log_info "See deploy/docker-compose.yml for reference"
    exit 1
else
    echo ""
    log_success "All validations passed!"
    if [ $WARNING_CHECKS -gt 0 ]; then
        log_warning "There are $WARNING_CHECKS warning(s), but deployment can proceed"
    fi
    exit 0
fi
