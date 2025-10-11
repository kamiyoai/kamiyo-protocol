#!/bin/bash

# Kamiyo Comprehensive Health Check Script
# Verifies all system components are operational

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
TIMEOUT=5

# Results tracking
PASSED=0
FAILED=0
WARNINGS=0

test_passed() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

test_failed() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

test_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

test_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo "=========================================="
echo "Kamiyo Health Check"
echo "=========================================="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "API URL: $API_URL"
echo "=========================================="
echo ""

# ============================================
# 1. API Service Health
# ============================================
echo "1. API Service Health"
echo "-------------------------------------------"

# Check if API is responding
if curl -s -f --max-time $TIMEOUT "$API_URL/health" > /dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -s "$API_URL/health")

    if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        test_passed "API is healthy"

        # Check uptime
        UPTIME=$(echo "$HEALTH_RESPONSE" | jq -r '.uptime // "unknown"')
        test_info "API uptime: $UPTIME"
    else
        test_failed "API reporting unhealthy status"
    fi
else
    test_failed "API not responding"
fi

# Check API response time
START=$(date +%s%N)
curl -s --max-time $TIMEOUT "$API_URL/health" > /dev/null 2>&1
END=$(date +%s%N)
RESPONSE_TIME=$(( ($END - $START) / 1000000 ))

if [ $RESPONSE_TIME -lt 500 ]; then
    test_passed "API response time: ${RESPONSE_TIME}ms"
elif [ $RESPONSE_TIME -lt 1000 ]; then
    test_warning "API response time slow: ${RESPONSE_TIME}ms"
else
    test_failed "API response time too slow: ${RESPONSE_TIME}ms"
fi

echo ""

# ============================================
# 2. Database Health
# ============================================
echo "2. Database Health"
echo "-------------------------------------------"

if curl -s --max-time $TIMEOUT "$API_URL/health/db" > /dev/null 2>&1; then
    DB_HEALTH=$(curl -s "$API_URL/health/db")

    if echo "$DB_HEALTH" | jq -e '.database == "connected"' > /dev/null 2>&1; then
        test_passed "Database connected"

        # Check connection pool
        POOL_SIZE=$(echo "$DB_HEALTH" | jq -r '.pool_size // 0')
        POOL_AVAILABLE=$(echo "$DB_HEALTH" | jq -r '.pool_available // 0')

        if [ "$POOL_SIZE" -gt 0 ]; then
            test_info "Connection pool: $POOL_AVAILABLE/$POOL_SIZE available"

            if [ "$POOL_AVAILABLE" -eq 0 ]; then
                test_warning "Connection pool exhausted"
            fi
        fi
    else
        test_failed "Database not connected"
    fi
else
    test_failed "Cannot check database health"
fi

echo ""

# ============================================
# 3. Redis Cache Health
# ============================================
echo "3. Redis Cache Health"
echo "-------------------------------------------"

if curl -s --max-time $TIMEOUT "$API_URL/health/cache" > /dev/null 2>&1; then
    CACHE_HEALTH=$(curl -s "$API_URL/health/cache")

    if echo "$CACHE_HEALTH" | jq -e '.cache == "connected"' > /dev/null 2>&1; then
        test_passed "Redis cache connected"

        # Check cache metrics
        HIT_RATE=$(echo "$CACHE_HEALTH" | jq -r '.hit_rate // 0')
        MEMORY_USAGE=$(echo "$CACHE_HEALTH" | jq -r '.memory_usage // "unknown"')

        test_info "Cache hit rate: ${HIT_RATE}%"
        test_info "Cache memory: $MEMORY_USAGE"

        if (( $(echo "$HIT_RATE < 50" | bc -l) )); then
            test_warning "Low cache hit rate: ${HIT_RATE}%"
        fi
    else
        test_failed "Redis cache not connected"
    fi
else
    test_warning "Cannot check cache health (endpoint may not exist)"
fi

echo ""

# ============================================
# 4. Docker Container Health
# ============================================
echo "4. Docker Container Health"
echo "-------------------------------------------"

if command -v docker &> /dev/null; then
    # Check API container
    if docker ps --filter "name=kamiyo-api" --filter "status=running" | grep -q kamiyo-api; then
        test_passed "API container running"

        # Check container health status
        HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' kamiyo-api 2>/dev/null || echo "unknown")
        if [ "$HEALTH_STATUS" == "healthy" ]; then
            test_passed "API container health status: healthy"
        elif [ "$HEALTH_STATUS" == "unknown" ]; then
            test_info "API container health check not configured"
        else
            test_failed "API container health status: $HEALTH_STATUS"
        fi
    else
        test_failed "API container not running"
    fi

    # Check database container
    if docker ps --filter "name=postgres" --filter "status=running" | grep -q postgres; then
        test_passed "PostgreSQL container running"
    else
        test_failed "PostgreSQL container not running"
    fi

    # Check Redis container
    if docker ps --filter "name=redis" --filter "status=running" | grep -q redis; then
        test_passed "Redis container running"
    else
        test_failed "Redis container not running"
    fi

    # Check aggregator container
    if docker ps --filter "name=kamiyo-aggregator" --filter "status=running" | grep -q kamiyo-aggregator; then
        test_passed "Aggregator container running"
    else
        test_warning "Aggregator container not running"
    fi
else
    test_info "Docker not available, skipping container checks"
fi

echo ""

# ============================================
# 5. Disk Space
# ============================================
echo "5. Disk Space"
echo "-------------------------------------------"

DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

if [ "$DISK_USAGE" -lt 70 ]; then
    test_passed "Disk usage: ${DISK_USAGE}%"
elif [ "$DISK_USAGE" -lt 85 ]; then
    test_warning "Disk usage: ${DISK_USAGE}%"
else
    test_failed "Disk usage critical: ${DISK_USAGE}%"
fi

# Check database disk space (if PostgreSQL data dir is known)
if [ -d "/var/lib/postgresql/data" ]; then
    DB_DISK_USAGE=$(df -h /var/lib/postgresql/data | awk 'NR==2 {print $5}' | sed 's/%//')
    test_info "Database disk usage: ${DB_DISK_USAGE}%"
fi

echo ""

# ============================================
# 6. Memory Usage
# ============================================
echo "6. Memory Usage"
echo "-------------------------------------------"

if command -v free &> /dev/null; then
    MEMORY_USAGE=$(free | awk 'NR==2 {printf "%.0f", $3/$2 * 100}')

    if [ "$MEMORY_USAGE" -lt 80 ]; then
        test_passed "Memory usage: ${MEMORY_USAGE}%"
    elif [ "$MEMORY_USAGE" -lt 90 ]; then
        test_warning "Memory usage: ${MEMORY_USAGE}%"
    else
        test_failed "Memory usage critical: ${MEMORY_USAGE}%"
    fi
else
    test_info "Cannot check memory usage (free command not available)"
fi

# Check Docker memory usage
if command -v docker &> /dev/null; then
    API_MEMORY=$(docker stats --no-stream --format "{{.MemPerc}}" kamiyo-api 2>/dev/null | sed 's/%//' || echo "0")
    if [ -n "$API_MEMORY" ] && [ "$API_MEMORY" != "0" ]; then
        test_info "API container memory: ${API_MEMORY}%"
    fi
fi

echo ""

# ============================================
# 7. CPU Load
# ============================================
echo "7. CPU Load"
echo "-------------------------------------------"

if command -v uptime &> /dev/null; then
    LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    CPU_COUNT=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "1")
    LOAD_PERCENT=$(echo "scale=0; $LOAD_AVG / $CPU_COUNT * 100" | bc)

    if [ "$LOAD_PERCENT" -lt 70 ]; then
        test_passed "CPU load: ${LOAD_AVG} (${LOAD_PERCENT}%)"
    elif [ "$LOAD_PERCENT" -lt 90 ]; then
        test_warning "CPU load: ${LOAD_AVG} (${LOAD_PERCENT}%)"
    else
        test_failed "CPU load critical: ${LOAD_AVG} (${LOAD_PERCENT}%)"
    fi
else
    test_info "Cannot check CPU load"
fi

echo ""

# ============================================
# 8. Network Connectivity
# ============================================
echo "8. Network Connectivity"
echo "-------------------------------------------"

# Check external connectivity
if ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1; then
    test_passed "External network connectivity"
else
    test_failed "No external network connectivity"
fi

# Check DNS resolution
if nslookup google.com > /dev/null 2>&1; then
    test_passed "DNS resolution working"
else
    test_failed "DNS resolution failed"
fi

# Check if API is accessible from outside (if public URL is set)
if [ -n "$PUBLIC_API_URL" ]; then
    if curl -s --max-time $TIMEOUT "$PUBLIC_API_URL/health" > /dev/null 2>&1; then
        test_passed "Public API accessible"
    else
        test_failed "Public API not accessible"
    fi
fi

echo ""

# ============================================
# 9. SSL/TLS Certificate
# ============================================
echo "9. SSL/TLS Certificate"
echo "-------------------------------------------"

if [ -n "$DOMAIN" ]; then
    CERT_EXPIRY=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | \
        openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

    if [ -n "$CERT_EXPIRY" ]; then
        EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$CERT_EXPIRY" +%s 2>/dev/null)
        CURRENT_EPOCH=$(date +%s)
        DAYS_LEFT=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

        if [ "$DAYS_LEFT" -gt 30 ]; then
            test_passed "SSL certificate valid for $DAYS_LEFT days"
        elif [ "$DAYS_LEFT" -gt 7 ]; then
            test_warning "SSL certificate expires in $DAYS_LEFT days"
        else
            test_failed "SSL certificate expires in $DAYS_LEFT days!"
        fi
    else
        test_warning "Cannot check SSL certificate"
    fi
else
    test_info "No domain configured, skipping SSL check"
fi

echo ""

# ============================================
# 10. Monitoring & Logging
# ============================================
echo "10. Monitoring & Logging"
echo "-------------------------------------------"

# Check Prometheus
if curl -s --max-time $TIMEOUT "http://localhost:9090/-/healthy" > /dev/null 2>&1; then
    test_passed "Prometheus is healthy"
else
    test_warning "Prometheus not accessible"
fi

# Check Grafana
if curl -s --max-time $TIMEOUT "http://localhost:3000/api/health" > /dev/null 2>&1; then
    test_passed "Grafana is healthy"
else
    test_warning "Grafana not accessible"
fi

# Check log files
LOG_FILES=("/var/log/kamiyo/api.log" "/var/log/kamiyo/backup.log")
for log_file in "${LOG_FILES[@]}"; do
    if [ -f "$log_file" ]; then
        LOG_SIZE=$(du -h "$log_file" | cut -f1)
        test_info "Log file: $log_file ($LOG_SIZE)"

        # Check for errors in last 100 lines
        ERROR_COUNT=$(tail -100 "$log_file" 2>/dev/null | grep -ci "error\|exception\|fatal" || echo "0")
        if [ "$ERROR_COUNT" -gt 10 ]; then
            test_warning "$ERROR_COUNT errors found in recent logs"
        fi
    fi
done

echo ""

# ============================================
# 11. Backup Status
# ============================================
echo "11. Backup Status"
echo "-------------------------------------------"

# Check last backup
if [ -n "$BACKUP_S3_BUCKET" ] && command -v aws &> /dev/null; then
    LAST_BACKUP=$(aws s3 ls "s3://${BACKUP_S3_BUCKET}/backups/" | \
        grep "kamiyo_backup_.*\.tar\.gz" | \
        sort -r | \
        head -1 | \
        awk '{print $1, $2, $4}')

    if [ -n "$LAST_BACKUP" ]; then
        BACKUP_DATE=$(echo "$LAST_BACKUP" | awk '{print $1}')
        BACKUP_SIZE=$(echo "$LAST_BACKUP" | awk '{print $3}')

        # Calculate backup age
        BACKUP_EPOCH=$(date -d "$BACKUP_DATE" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$BACKUP_DATE" +%s 2>/dev/null)
        CURRENT_EPOCH=$(date +%s)
        HOURS_AGO=$(( ($CURRENT_EPOCH - $BACKUP_EPOCH) / 3600 ))

        if [ "$HOURS_AGO" -lt 25 ]; then
            test_passed "Last backup: $HOURS_AGO hours ago"
        elif [ "$HOURS_AGO" -lt 48 ]; then
            test_warning "Last backup: $HOURS_AGO hours ago"
        else
            test_failed "Last backup: $HOURS_AGO hours ago (too old!)"
        fi
    else
        test_warning "No backups found"
    fi
else
    test_info "S3 backup check skipped (not configured or AWS CLI not available)"
fi

echo ""

# ============================================
# Summary
# ============================================
echo "=========================================="
echo "Health Check Summary"
echo "=========================================="
echo -e "${GREEN}Passed:${NC}   $PASSED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "${RED}Failed:${NC}   $FAILED"
echo ""

TOTAL=$((PASSED + WARNINGS + FAILED))
SUCCESS_RATE=$((PASSED * 100 / TOTAL))

echo "Success Rate: ${SUCCESS_RATE}%"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================="
echo ""

# Overall status
if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ ALL SYSTEMS OPERATIONAL${NC}"
    exit 0
elif [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}⚠️  SYSTEM OPERATIONAL WITH WARNINGS${NC}"
    exit 0
elif [ $FAILED -lt 3 ]; then
    echo -e "${YELLOW}⚠️  DEGRADED PERFORMANCE${NC}"
    exit 1
else
    echo -e "${RED}❌ CRITICAL SYSTEM ISSUES${NC}"
    exit 2
fi
