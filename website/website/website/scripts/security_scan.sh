#!/bin/bash

# Kamiyo Security Scanning Script
# Comprehensive security testing for production readiness

set -e

echo "=========================================="
echo "Kamiyo Security Scanning Suite"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

CRITICAL=0
HIGH=0
MEDIUM=0
LOW=0
INFO=0

# Create results directory
RESULTS_DIR="security_scan_results_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

log_critical() {
    echo -e "${RED}[CRITICAL]${NC} $1"
    ((CRITICAL++))
}

log_high() {
    echo -e "${RED}[HIGH]${NC} $1"
    ((HIGH++))
}

log_medium() {
    echo -e "${YELLOW}[MEDIUM]${NC} $1"
    ((MEDIUM++))
}

log_low() {
    echo -e "${BLUE}[LOW]${NC} $1"
    ((LOW++))
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
    ((INFO++))
}

# ============================================
# 1. Dependency Vulnerability Scanning
# ============================================
echo "1. Scanning Python Dependencies..."
echo "-------------------------------------------"

if command -v safety &> /dev/null; then
    safety check --json > "$RESULTS_DIR/safety_report.json" 2>&1 || true

    # Parse results
    if [ -s "$RESULTS_DIR/safety_report.json" ]; then
        VULNS=$(jq length "$RESULTS_DIR/safety_report.json" 2>/dev/null || echo "0")
        if [ "$VULNS" -gt "0" ]; then
            log_high "Found $VULNS vulnerabilities in Python dependencies"
            jq -r '.[] | "  - \(.package): \(.vulnerability)"' "$RESULTS_DIR/safety_report.json" || true
        else
            log_info "No vulnerabilities found in Python dependencies"
        fi
    fi
else
    log_medium "safety not installed (pip install safety)"
fi

# Check for outdated packages
if command -v pip &> /dev/null; then
    echo ""
    echo "Checking for outdated packages..."
    pip list --outdated > "$RESULTS_DIR/outdated_packages.txt" 2>&1 || true
    OUTDATED=$(grep -c "^" "$RESULTS_DIR/outdated_packages.txt" || echo "0")
    if [ "$OUTDATED" -gt "0" ]; then
        log_low "$OUTDATED outdated packages found"
    else
        log_info "All packages up to date"
    fi
fi

echo ""

# ============================================
# 2. Docker Image Security Scanning
# ============================================
echo "2. Scanning Docker Images..."
echo "-------------------------------------------"

if command -v trivy &> /dev/null; then
    # Scan API image
    if docker images | grep -q "kamiyo-api"; then
        echo "Scanning kamiyo-api image..."
        trivy image --severity HIGH,CRITICAL --format json kamiyo-api:latest > "$RESULTS_DIR/trivy_api.json" 2>&1 || true

        CRITICAL_VULNS=$(jq '[.Results[].Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length' "$RESULTS_DIR/trivy_api.json" 2>/dev/null || echo "0")
        HIGH_VULNS=$(jq '[.Results[].Vulnerabilities[]? | select(.Severity=="HIGH")] | length' "$RESULTS_DIR/trivy_api.json" 2>/dev/null || echo "0")

        if [ "$CRITICAL_VULNS" -gt "0" ]; then
            log_critical "kamiyo-api: $CRITICAL_VULNS critical vulnerabilities"
        fi
        if [ "$HIGH_VULNS" -gt "0" ]; then
            log_high "kamiyo-api: $HIGH_VULNS high vulnerabilities"
        fi
        if [ "$CRITICAL_VULNS" -eq "0" ] && [ "$HIGH_VULNS" -eq "0" ]; then
            log_info "kamiyo-api: No critical/high vulnerabilities"
        fi
    fi

    # Scan aggregator image
    if docker images | grep -q "kamiyo-aggregator"; then
        echo "Scanning kamiyo-aggregator image..."
        trivy image --severity HIGH,CRITICAL --format json kamiyo-aggregator:latest > "$RESULTS_DIR/trivy_aggregator.json" 2>&1 || true

        CRITICAL_VULNS=$(jq '[.Results[].Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length' "$RESULTS_DIR/trivy_aggregator.json" 2>/dev/null || echo "0")
        HIGH_VULNS=$(jq '[.Results[].Vulnerabilities[]? | select(.Severity=="HIGH")] | length' "$RESULTS_DIR/trivy_aggregator.json" 2>/dev/null || echo "0")

        if [ "$CRITICAL_VULNS" -gt "0" ]; then
            log_critical "kamiyo-aggregator: $CRITICAL_VULNS critical vulnerabilities"
        fi
        if [ "$HIGH_VULNS" -gt "0" ]; then
            log_high "kamiyo-aggregator: $HIGH_VULNS high vulnerabilities"
        fi
        if [ "$CRITICAL_VULNS" -eq "0" ] && [ "$HIGH_VULNS" -eq "0" ]; then
            log_info "kamiyo-aggregator: No critical/high vulnerabilities"
        fi
    fi
else
    log_medium "trivy not installed (https://github.com/aquasecurity/trivy)"
fi

echo ""

# ============================================
# 3. Static Code Analysis
# ============================================
echo "3. Static Code Analysis..."
echo "-------------------------------------------"

# Bandit - Python security linter
if command -v bandit &> /dev/null; then
    echo "Running Bandit security scan..."
    bandit -r api/ aggregation-agent/ processing-agent/ -f json -o "$RESULTS_DIR/bandit_report.json" 2>&1 || true

    if [ -s "$RESULTS_DIR/bandit_report.json" ]; then
        BANDIT_ISSUES=$(jq '.results | length' "$RESULTS_DIR/bandit_report.json" 2>/dev/null || echo "0")
        if [ "$BANDIT_ISSUES" -gt "0" ]; then
            log_medium "Bandit found $BANDIT_ISSUES potential security issues"
            jq -r '.results[] | "  - \(.issue_text) (\(.test_id)) at \(.filename):\(.line_number)"' "$RESULTS_DIR/bandit_report.json" 2>/dev/null | head -10
        else
            log_info "No security issues found by Bandit"
        fi
    fi
else
    log_medium "bandit not installed (pip install bandit)"
fi

echo ""

# ============================================
# 4. Secret Scanning
# ============================================
echo "4. Scanning for Secrets..."
echo "-------------------------------------------"

# Check for common secret patterns
SECRET_PATTERNS=(
    "sk_live_[a-zA-Z0-9]+"
    "sk_test_[a-zA-Z0-9]+"
    "whsec_[a-zA-Z0-9]+"
    "postgres://.*:.*@"
    "mongodb://.*:.*@"
    "api[_-]?key.*=.*['\"][a-zA-Z0-9]{20,}['\"]"
    "password.*=.*['\"][^'\"]+['\"]"
    "secret.*=.*['\"][^'\"]+['\"]"
)

echo "Checking for hardcoded secrets..."
for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -r -E "$pattern" --include="*.py" --include="*.js" --include="*.ts" . 2>/dev/null | grep -v ".env" | grep -v "test" | grep -v "example" > /dev/null; then
        log_critical "Found potential secret matching pattern: $pattern"
        grep -r -E "$pattern" --include="*.py" --include="*.js" --include="*.ts" . 2>/dev/null | grep -v ".env" | grep -v "test" | grep -v "example" | head -3
    fi
done

# Check .env files are gitignored
if [ -f ".env" ] || [ -f ".env.production" ]; then
    if ! git check-ignore .env .env.production &> /dev/null; then
        log_critical ".env files are not properly gitignored!"
    else
        log_info ".env files properly gitignored"
    fi
fi

echo ""

# ============================================
# 5. Infrastructure Security Checks
# ============================================
echo "5. Infrastructure Security Checks..."
echo "-------------------------------------------"

# Check Docker Compose security
if [ -f "docker-compose.production.yml" ]; then
    echo "Checking Docker Compose configuration..."

    # Check for privileged containers
    if grep -q "privileged: true" docker-compose.production.yml; then
        log_high "Privileged containers found in docker-compose.yml"
    else
        log_info "No privileged containers"
    fi

    # Check for default passwords
    if grep -q "CHANGE_ME" docker-compose.production.yml; then
        log_critical "Default passwords found in docker-compose.yml"
    fi

    # Check for exposed ports
    EXPOSED_PORTS=$(grep -c "0.0.0.0:" docker-compose.production.yml || echo "0")
    if [ "$EXPOSED_PORTS" -gt "0" ]; then
        log_medium "$EXPOSED_PORTS services exposed to 0.0.0.0"
    fi
fi

echo ""

# ============================================
# 6. API Security Testing
# ============================================
echo "6. API Security Testing..."
echo "-------------------------------------------"

# Check if API is running
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "API is running, performing security checks..."

    # Test CORS headers
    CORS_RESPONSE=$(curl -s -H "Origin: https://evil.com" http://localhost:8000/api/v1/exploits -I || echo "")
    if echo "$CORS_RESPONSE" | grep -q "Access-Control-Allow-Origin: \*"; then
        log_high "CORS allows all origins (*)"
    else
        log_info "CORS properly configured"
    fi

    # Test security headers
    HEADERS=$(curl -s -I http://localhost:8000/ || echo "")

    if ! echo "$HEADERS" | grep -q "X-Content-Type-Options"; then
        log_medium "Missing X-Content-Type-Options header"
    fi

    if ! echo "$HEADERS" | grep -q "X-Frame-Options"; then
        log_medium "Missing X-Frame-Options header"
    fi

    if ! echo "$HEADERS" | grep -q "Strict-Transport-Security"; then
        log_medium "Missing HSTS header"
    fi

    # Test for SQL injection (basic)
    SQL_TEST=$(curl -s "http://localhost:8000/api/v1/exploits?id=1' OR '1'='1" || echo "")
    if echo "$SQL_TEST" | grep -q "error\|exception\|syntax"; then
        log_high "Potential SQL injection vulnerability"
    fi

    # Test rate limiting
    echo "Testing rate limiting..."
    RATE_LIMIT_STATUS=0
    for i in {1..20}; do
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/exploits)
        if [ "$RESPONSE" == "429" ]; then
            RATE_LIMIT_STATUS=1
            break
        fi
    done

    if [ $RATE_LIMIT_STATUS -eq 1 ]; then
        log_info "Rate limiting is active"
    else
        log_medium "Rate limiting may not be properly configured"
    fi
else
    log_medium "API not running, skipping API security tests"
fi

echo ""

# ============================================
# 7. Database Security
# ============================================
echo "7. Database Security Checks..."
echo "-------------------------------------------"

# Check database configuration
if [ -f "database/schema.sql" ]; then
    # Check for default passwords in schema
    if grep -qi "password.*=.*'password'" database/schema.sql; then
        log_critical "Default passwords in database schema"
    fi

    # Check for SQL injection prevention
    if grep -qi "EXECUTE\|exec\|sp_executesql" database/schema.sql; then
        log_medium "Dynamic SQL found - review for injection risks"
    fi
fi

# Check PostgreSQL connection security
if [ -n "$DATABASE_URL" ]; then
    if echo "$DATABASE_URL" | grep -q "sslmode=disable"; then
        log_high "PostgreSQL SSL disabled"
    else
        log_info "PostgreSQL SSL configuration OK"
    fi
fi

echo ""

# ============================================
# 8. SSL/TLS Configuration
# ============================================
echo "8. SSL/TLS Configuration..."
echo "-------------------------------------------"

if [ -f "nginx/nginx.conf" ]; then
    # Check SSL protocols
    if grep -q "ssl_protocols.*TLSv1.1\|SSLv3" nginx/nginx.conf; then
        log_high "Insecure SSL/TLS protocols enabled"
    else
        log_info "SSL/TLS protocols properly configured"
    fi

    # Check cipher suites
    if grep -q "ssl_ciphers.*DES\|RC4" nginx/nginx.conf; then
        log_high "Weak cipher suites enabled"
    fi
fi

echo ""

# ============================================
# Summary Report
# ============================================
echo "=========================================="
echo "Security Scan Summary"
echo "=========================================="
echo -e "${RED}Critical:${NC} $CRITICAL"
echo -e "${RED}High:${NC}     $HIGH"
echo -e "${YELLOW}Medium:${NC}   $MEDIUM"
echo -e "${BLUE}Low:${NC}      $LOW"
echo -e "${GREEN}Info:${NC}     $INFO"
echo ""

TOTAL_ISSUES=$((CRITICAL + HIGH + MEDIUM + LOW))
echo "Total Issues: $TOTAL_ISSUES"
echo ""

# Generate JSON report
cat > "$RESULTS_DIR/summary.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "summary": {
    "critical": $CRITICAL,
    "high": $HIGH,
    "medium": $MEDIUM,
    "low": $LOW,
    "info": $INFO,
    "total": $TOTAL_ISSUES
  },
  "results_directory": "$RESULTS_DIR"
}
EOF

echo "Detailed results saved to: $RESULTS_DIR/"
echo ""

# Exit code based on severity
if [ $CRITICAL -gt 0 ]; then
    echo -e "${RED}❌ CRITICAL ISSUES FOUND - DO NOT DEPLOY${NC}"
    exit 2
elif [ $HIGH -gt 0 ]; then
    echo -e "${RED}❌ HIGH SEVERITY ISSUES FOUND - REVIEW BEFORE DEPLOY${NC}"
    exit 1
elif [ $MEDIUM -gt 5 ]; then
    echo -e "${YELLOW}⚠️  MULTIPLE MEDIUM ISSUES - REVIEW RECOMMENDED${NC}"
    exit 0
else
    echo -e "${GREEN}✅ SECURITY SCAN PASSED${NC}"
    exit 0
fi
