#!/bin/bash
# -*- coding: utf-8 -*-
# Cache Analysis Script for Kamiyo
# Analyzes cache effectiveness and provides optimization recommendations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
API_URL="${API_URL:-http://localhost:8000}"
OUTPUT_DIR="${OUTPUT_DIR:-./cache_reports}"

# Functions
print_header() {
    echo -e "${BLUE}===============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===============================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

check_dependencies() {
    print_header "Checking Dependencies"

    local missing_deps=0

    # Check Redis CLI
    if ! command -v redis-cli &> /dev/null; then
        print_error "redis-cli not found"
        missing_deps=1
    else
        print_success "redis-cli found"
    fi

    # Check curl
    if ! command -v curl &> /dev/null; then
        print_error "curl not found"
        missing_deps=1
    else
        print_success "curl found"
    fi

    # Check jq
    if ! command -v jq &> /dev/null; then
        print_warning "jq not found (optional, but recommended)"
    else
        print_success "jq found"
    fi

    # Check Python
    if ! command -v python3 &> /dev/null; then
        print_error "python3 not found"
        missing_deps=1
    else
        print_success "python3 found"
    fi

    if [ $missing_deps -eq 1 ]; then
        print_error "Missing required dependencies"
        exit 1
    fi
}

connect_redis() {
    print_header "Testing Redis Connection"

    if [ -n "$REDIS_PASSWORD" ]; then
        REDIS_CMD="redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD"
    else
        REDIS_CMD="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
    fi

    if $REDIS_CMD PING > /dev/null 2>&1; then
        print_success "Connected to Redis at $REDIS_HOST:$REDIS_PORT"
    else
        print_error "Failed to connect to Redis"
        exit 1
    fi
}

analyze_redis_info() {
    print_header "Redis Information"

    # Get Redis info
    INFO=$($REDIS_CMD INFO)

    # Extract key metrics
    REDIS_VERSION=$(echo "$INFO" | grep "redis_version" | cut -d: -f2 | tr -d '\r')
    UPTIME=$(echo "$INFO" | grep "uptime_in_days" | cut -d: -f2 | tr -d '\r')
    CONNECTED_CLIENTS=$(echo "$INFO" | grep "connected_clients" | cut -d: -f2 | tr -d '\r')
    USED_MEMORY=$(echo "$INFO" | grep "^used_memory_human" | cut -d: -f2 | tr -d '\r')
    USED_MEMORY_PEAK=$(echo "$INFO" | grep "^used_memory_peak_human" | cut -d: -f2 | tr -d '\r')
    TOTAL_COMMANDS=$(echo "$INFO" | grep "total_commands_processed" | cut -d: -f2 | tr -d '\r')
    KEYSPACE_HITS=$(echo "$INFO" | grep "keyspace_hits" | cut -d: -f2 | tr -d '\r')
    KEYSPACE_MISSES=$(echo "$INFO" | grep "keyspace_misses" | cut -d: -f2 | tr -d '\r')
    EVICTED_KEYS=$(echo "$INFO" | grep "evicted_keys" | cut -d: -f2 | tr -d '\r')
    EXPIRED_KEYS=$(echo "$INFO" | grep "expired_keys" | cut -d: -f2 | tr -d '\r')

    echo "Redis Version: $REDIS_VERSION"
    echo "Uptime: $UPTIME days"
    echo "Connected Clients: $CONNECTED_CLIENTS"
    echo "Used Memory: $USED_MEMORY"
    echo "Peak Memory: $USED_MEMORY_PEAK"
    echo "Total Commands: $TOTAL_COMMANDS"
    echo "Keyspace Hits: $KEYSPACE_HITS"
    echo "Keyspace Misses: $KEYSPACE_MISSES"
    echo "Evicted Keys: $EVICTED_KEYS"
    echo "Expired Keys: $EXPIRED_KEYS"

    # Calculate hit rate
    if [ -n "$KEYSPACE_HITS" ] && [ -n "$KEYSPACE_MISSES" ] && [ "$KEYSPACE_HITS" != "0" ]; then
        TOTAL_REQUESTS=$((KEYSPACE_HITS + KEYSPACE_MISSES))
        HIT_RATE=$(echo "scale=2; ($KEYSPACE_HITS * 100) / $TOTAL_REQUESTS" | bc)
        echo ""
        echo "Cache Hit Rate: ${HIT_RATE}%"

        if (( $(echo "$HIT_RATE > 80" | bc -l) )); then
            print_success "Excellent hit rate"
        elif (( $(echo "$HIT_RATE > 60" | bc -l) )); then
            print_warning "Good hit rate, but could be improved"
        else
            print_error "Low hit rate - needs optimization"
        fi
    fi
}

analyze_key_distribution() {
    print_header "Key Distribution Analysis"

    # Get all keys (use SCAN for production)
    echo "Scanning keys (this may take a while)..."
    KEYS=$($REDIS_CMD --scan --pattern "kamiyo:*" | head -1000)

    if [ -z "$KEYS" ]; then
        print_warning "No keys found in cache"
        return
    fi

    KEY_COUNT=$(echo "$KEYS" | wc -l)
    echo "Total Keys: $KEY_COUNT (sampled)"

    # Analyze key patterns
    echo ""
    echo "Key Patterns:"
    echo "$KEYS" | cut -d: -f2 | sort | uniq -c | sort -rn | head -10

    # Analyze key sizes
    echo ""
    echo "Analyzing key sizes..."

    TOTAL_SIZE=0
    LARGE_KEYS=()

    while IFS= read -r key; do
        SIZE=$($REDIS_CMD MEMORY USAGE "$key" 2>/dev/null || echo "0")
        TOTAL_SIZE=$((TOTAL_SIZE + SIZE))

        # Track large keys (>100KB)
        if [ "$SIZE" -gt 102400 ]; then
            LARGE_KEYS+=("$key:$SIZE")
        fi
    done <<< "$KEYS"

    echo "Total Memory (sampled): $((TOTAL_SIZE / 1024)) KB"

    if [ ${#LARGE_KEYS[@]} -gt 0 ]; then
        echo ""
        echo "Large Keys (>100KB):"
        printf '%s\n' "${LARGE_KEYS[@]}" | head -10
    fi
}

analyze_ttl_distribution() {
    print_header "TTL Distribution Analysis"

    echo "Analyzing TTL values..."

    KEYS=$($REDIS_CMD --scan --pattern "kamiyo:*" | head -500)

    NO_TTL=0
    SHORT_TTL=0  # < 5 min
    MEDIUM_TTL=0  # 5-60 min
    LONG_TTL=0  # > 60 min

    while IFS= read -r key; do
        TTL=$($REDIS_CMD TTL "$key" 2>/dev/null || echo "-2")

        if [ "$TTL" = "-1" ]; then
            NO_TTL=$((NO_TTL + 1))
        elif [ "$TTL" -lt 300 ]; then
            SHORT_TTL=$((SHORT_TTL + 1))
        elif [ "$TTL" -lt 3600 ]; then
            MEDIUM_TTL=$((MEDIUM_TTL + 1))
        else
            LONG_TTL=$((LONG_TTL + 1))
        fi
    done <<< "$KEYS"

    echo "No TTL (persistent): $NO_TTL"
    echo "Short TTL (<5 min): $SHORT_TTL"
    echo "Medium TTL (5-60 min): $MEDIUM_TTL"
    echo "Long TTL (>60 min): $LONG_TTL"

    if [ $NO_TTL -gt 0 ]; then
        print_warning "Found keys without TTL - may cause memory issues"
    fi
}

analyze_hot_keys() {
    print_header "Hot Key Analysis"

    echo "Identifying frequently accessed keys..."

    # This requires Redis with LFU eviction or external tracking
    # For now, we'll provide a simulated analysis

    print_warning "Hot key analysis requires Redis with LFU policy or external tracking"
    echo "Consider enabling: maxmemory-policy allkeys-lfu"
}

analyze_slow_queries() {
    print_header "Slow Query Analysis"

    echo "Checking for slow operations..."

    # Get slowlog
    SLOWLOG=$($REDIS_CMD SLOWLOG GET 10)

    if [ -z "$SLOWLOG" ]; then
        print_success "No slow queries found"
    else
        print_warning "Recent slow queries:"
        echo "$SLOWLOG"
    fi
}

analyze_api_endpoints() {
    print_header "API Endpoint Cache Analysis"

    echo "Testing API cache effectiveness..."

    # Test common endpoints
    ENDPOINTS=(
        "/exploits?page=1&page_size=100"
        "/stats?days=1"
        "/chains"
        "/health"
    )

    for endpoint in "${ENDPOINTS[@]}"; do
        echo ""
        echo "Testing: $endpoint"

        # First request (cache miss)
        START=$(date +%s%N)
        RESPONSE1=$(curl -s -w "%{time_total}" -o /dev/null "$API_URL$endpoint")
        TIME1=$(echo "scale=3; $RESPONSE1 * 1000" | bc)

        # Second request (cache hit)
        sleep 0.1
        START=$(date +%s%N)
        RESPONSE2=$(curl -s -w "%{time_total}" -o /dev/null "$API_URL$endpoint")
        TIME2=$(echo "scale=3; $RESPONSE2 * 1000" | bc)

        # Calculate improvement
        if [ -n "$TIME1" ] && [ -n "$TIME2" ]; then
            IMPROVEMENT=$(echo "scale=1; (($TIME1 - $TIME2) / $TIME1) * 100" | bc)
            echo "  First request: ${TIME1}ms"
            echo "  Second request: ${TIME2}ms"
            echo "  Improvement: ${IMPROVEMENT}%"

            if (( $(echo "$IMPROVEMENT > 50" | bc -l) )); then
                print_success "Cache working effectively"
            elif (( $(echo "$IMPROVEMENT > 20" | bc -l) )); then
                print_warning "Moderate cache benefit"
            else
                print_warning "Low cache benefit"
            fi
        fi
    done
}

generate_recommendations() {
    print_header "Optimization Recommendations"

    # Analyze and provide recommendations
    INFO=$($REDIS_CMD INFO)

    USED_MEMORY_PCT=$(echo "$INFO" | grep "used_memory_rss" | cut -d: -f2 | tr -d '\r')
    MAX_MEMORY=$(echo "$INFO" | grep "maxmemory:" | cut -d: -f2 | tr -d '\r')
    HIT_RATE=$(echo "$INFO" | grep "keyspace_hits" | cut -d: -f2 | tr -d '\r')
    MISS_RATE=$(echo "$INFO" | grep "keyspace_misses" | cut -d: -f2 | tr -d '\r')

    echo "Analyzing cache configuration..."
    echo ""

    # Memory recommendations
    if [ "$MAX_MEMORY" = "0" ]; then
        print_warning "No max memory limit set"
        echo "  → Set maxmemory in redis.conf (recommended: 2GB)"
        echo "  → Example: maxmemory 2gb"
    fi

    # Eviction policy
    EVICTION=$(echo "$INFO" | grep "maxmemory_policy" | cut -d: -f2 | tr -d '\r')
    if [ "$EVICTION" != "allkeys-lru" ]; then
        print_warning "Consider using allkeys-lru eviction policy"
        echo "  → Current: $EVICTION"
        echo "  → Recommended: allkeys-lru or allkeys-lfu"
    fi

    # Hit rate recommendations
    if [ -n "$HIT_RATE" ] && [ -n "$MISS_RATE" ]; then
        TOTAL=$((HIT_RATE + MISS_RATE))
        if [ $TOTAL -gt 0 ]; then
            RATE=$(echo "scale=1; ($HIT_RATE * 100) / $TOTAL" | bc)

            if (( $(echo "$RATE < 80" | bc -l) )); then
                print_warning "Hit rate below 80%"
                echo "  → Increase TTL for frequently accessed data"
                echo "  → Enable cache warming for hot endpoints"
                echo "  → Review cache invalidation strategy"
            fi
        fi
    fi

    # General recommendations
    echo ""
    echo "General Recommendations:"
    echo "  1. Monitor cache hit rate continuously"
    echo "  2. Set appropriate TTLs (5-60 min for most data)"
    echo "  3. Enable cache warming on startup"
    echo "  4. Use cache invalidation for data changes"
    echo "  5. Consider L1 cache for ultra-hot data"
    echo "  6. Monitor memory usage and set limits"
}

generate_report() {
    print_header "Generating Report"

    mkdir -p "$OUTPUT_DIR"
    REPORT_FILE="$OUTPUT_DIR/cache_report_$(date +%Y%m%d_%H%M%S).txt"

    {
        echo "Kamiyo Cache Analysis Report"
        echo "Generated: $(date)"
        echo "========================================"
        echo ""

        # Redis info
        echo "REDIS INFORMATION"
        echo "----------------"
        $REDIS_CMD INFO | grep -E "(redis_version|uptime|used_memory|keyspace)"
        echo ""

        # Key distribution
        echo "KEY DISTRIBUTION"
        echo "---------------"
        $REDIS_CMD --scan --pattern "kamiyo:*" | cut -d: -f2 | sort | uniq -c | sort -rn
        echo ""

    } > "$REPORT_FILE"

    print_success "Report saved to: $REPORT_FILE"
}

# Main execution
main() {
    clear

    print_header "Kamiyo Cache Analysis Tool"
    echo "Analyzing cache performance and effectiveness"
    echo ""

    check_dependencies
    connect_redis

    # Run analyses
    analyze_redis_info
    echo ""

    analyze_key_distribution
    echo ""

    analyze_ttl_distribution
    echo ""

    analyze_hot_keys
    echo ""

    analyze_slow_queries
    echo ""

    if command -v curl &> /dev/null; then
        analyze_api_endpoints
        echo ""
    fi

    generate_recommendations
    echo ""

    # Generate report
    read -p "Generate detailed report? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        generate_report
    fi

    print_header "Analysis Complete"
}

# Run main function
main
