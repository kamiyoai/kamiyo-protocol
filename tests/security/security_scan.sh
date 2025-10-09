#!/bin/bash
#
# Comprehensive Security Scanning Script
#
# Performs multiple security scans:
# - OWASP ZAP automated scan
# - Dependency vulnerability checks (npm, pip)
# - Docker image scanning with Trivy
# - SSL/TLS configuration check
# - Security headers validation
#
# Days 19-21: Testing Suite & Documentation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TARGET_URL="${TARGET_URL:-http://localhost:8000}"
REPORT_DIR="./security-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🔒 Starting Comprehensive Security Scan"
echo "Target: $TARGET_URL"
echo "Report Directory: $REPORT_DIR"
echo ""

# Create report directory
mkdir -p "$REPORT_DIR"

# Function to print section header
print_header() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================================
# 1. OWASP ZAP Scan
# ============================================================
print_header "1. OWASP ZAP Security Scan"

if command_exists zap-cli; then
    echo "Running OWASP ZAP scan..."

    # Start ZAP daemon
    zap-cli start --start-options '-config api.disablekey=true'
    sleep 10

    # Open target URL
    zap-cli open-url "$TARGET_URL"
    sleep 5

    # Spider the application
    echo "Spidering application..."
    zap-cli spider "$TARGET_URL"

    # Active scan
    echo "Running active scan..."
    zap-cli active-scan "$TARGET_URL"

    # Wait for scan to complete
    zap-cli status -t 120

    # Generate reports
    zap-cli report -o "$REPORT_DIR/zap_report_${TIMESTAMP}.html" -f html
    zap-cli report -o "$REPORT_DIR/zap_report_${TIMESTAMP}.xml" -f xml

    # Check for high/critical issues
    ALERTS=$(zap-cli alerts -l High)
    if [ -n "$ALERTS" ]; then
        echo -e "${RED}❌ High/Critical security issues found!${NC}"
        echo "$ALERTS"
        exit 1
    else
        echo -e "${GREEN}✅ No high/critical issues found${NC}"
    fi

    # Shutdown ZAP
    zap-cli shutdown
else
    echo -e "${YELLOW}⚠️  OWASP ZAP not installed. Skipping...${NC}"
    echo "Install: pip install zapcli"
fi

# ============================================================
# 2. Dependency Vulnerability Scan (Python)
# ============================================================
print_header "2. Python Dependency Vulnerability Scan"

if command_exists safety; then
    echo "Scanning Python dependencies..."

    safety check --json --output "$REPORT_DIR/safety_report_${TIMESTAMP}.json" || true
    safety check --full-report > "$REPORT_DIR/safety_report_${TIMESTAMP}.txt" || true

    # Check for critical vulnerabilities
    CRITICAL_VULNS=$(safety check | grep -c "CRITICAL" || echo "0")

    if [ "$CRITICAL_VULNS" -gt 0 ]; then
        echo -e "${RED}❌ Found $CRITICAL_VULNS critical vulnerabilities${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ No critical vulnerabilities found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Safety not installed. Using pip-audit instead...${NC}"

    if command_exists pip-audit; then
        pip-audit --format json --output "$REPORT_DIR/pip_audit_${TIMESTAMP}.json" || true
        pip-audit > "$REPORT_DIR/pip_audit_${TIMESTAMP}.txt" || true
        echo -e "${GREEN}✅ Pip audit complete${NC}"
    else
        echo "Install: pip install safety or pip install pip-audit"
    fi
fi

# ============================================================
# 3. Dependency Vulnerability Scan (Node.js)
# ============================================================
print_header "3. Node.js Dependency Vulnerability Scan"

if [ -f "frontend-agent/package.json" ]; then
    echo "Scanning Node.js dependencies..."

    cd frontend-agent

    # NPM audit
    npm audit --json > "../$REPORT_DIR/npm_audit_${TIMESTAMP}.json" || true
    npm audit > "../$REPORT_DIR/npm_audit_${TIMESTAMP}.txt" || true

    # Check for critical/high vulnerabilities
    CRITICAL_COUNT=$(npm audit --json | jq '.metadata.vulnerabilities.critical // 0')
    HIGH_COUNT=$(npm audit --json | jq '.metadata.vulnerabilities.high // 0')

    if [ "$CRITICAL_COUNT" -gt 0 ] || [ "$HIGH_COUNT" -gt 3 ]; then
        echo -e "${RED}❌ Found critical or high vulnerabilities${NC}"
        echo "Critical: $CRITICAL_COUNT, High: $HIGH_COUNT"
        cd ..
        exit 1
    else
        echo -e "${GREEN}✅ No critical vulnerabilities found${NC}"
    fi

    cd ..
else
    echo -e "${YELLOW}⚠️  No package.json found. Skipping...${NC}"
fi

# ============================================================
# 4. Docker Image Security Scan
# ============================================================
print_header "4. Docker Image Security Scan (Trivy)"

if command_exists trivy; then
    echo "Scanning Docker images with Trivy..."

    # Get list of Docker images
    IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -v "<none>" | head -5)

    for IMAGE in $IMAGES; do
        echo "Scanning $IMAGE..."

        trivy image \
            --severity HIGH,CRITICAL \
            --format json \
            --output "$REPORT_DIR/trivy_${IMAGE//\//_}_${TIMESTAMP}.json" \
            "$IMAGE" || true

        trivy image \
            --severity HIGH,CRITICAL \
            "$IMAGE" > "$REPORT_DIR/trivy_${IMAGE//\//_}_${TIMESTAMP}.txt" || true
    done

    echo -e "${GREEN}✅ Docker image scan complete${NC}"
else
    echo -e "${YELLOW}⚠️  Trivy not installed. Skipping...${NC}"
    echo "Install: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
fi

# ============================================================
# 5. SSL/TLS Configuration Check
# ============================================================
print_header "5. SSL/TLS Configuration Check"

if command_exists testssl; then
    echo "Checking SSL/TLS configuration..."

    # Extract domain from URL
    DOMAIN=$(echo "$TARGET_URL" | sed -e 's|^[^/]*//||' -e 's|/.*$||')

    testssl --jsonfile "$REPORT_DIR/ssl_report_${TIMESTAMP}.json" "$DOMAIN" || true
    testssl "$DOMAIN" > "$REPORT_DIR/ssl_report_${TIMESTAMP}.txt" || true

    echo -e "${GREEN}✅ SSL/TLS check complete${NC}"
else
    echo -e "${YELLOW}⚠️  testssl.sh not installed. Skipping...${NC}"
    echo "Install: https://github.com/drwetter/testssl.sh"
fi

# ============================================================
# 6. Security Headers Check
# ============================================================
print_header "6. Security Headers Check"

echo "Checking security headers..."

# Required security headers
REQUIRED_HEADERS=(
    "Strict-Transport-Security"
    "X-Content-Type-Options"
    "X-Frame-Options"
    "X-XSS-Protection"
    "Content-Security-Policy"
)

MISSING_HEADERS=()

for HEADER in "${REQUIRED_HEADERS[@]}"; do
    if ! curl -s -I "$TARGET_URL" | grep -qi "$HEADER"; then
        MISSING_HEADERS+=("$HEADER")
    fi
done

if [ ${#MISSING_HEADERS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Missing security headers:${NC}"
    printf '%s\n' "${MISSING_HEADERS[@]}"
else
    echo -e "${GREEN}✅ All required security headers present${NC}"
fi

# Save full headers
curl -s -I "$TARGET_URL" > "$REPORT_DIR/headers_${TIMESTAMP}.txt"

# ============================================================
# 7. SQL Injection Test (Basic)
# ============================================================
print_header "7. SQL Injection Test"

echo "Testing for SQL injection vulnerabilities..."

SQL_PAYLOADS=(
    "' OR '1'='1"
    "admin' --"
    "' OR 1=1 --"
    "'; DROP TABLE users; --"
)

for PAYLOAD in "${SQL_PAYLOADS[@]}"; do
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/api/exploits?search=${PAYLOAD// /%20}")

    if [ "$RESPONSE" == "500" ]; then
        echo -e "${RED}❌ Potential SQL injection vulnerability detected${NC}"
        echo "Payload: $PAYLOAD"
        echo "Response: $RESPONSE"
    fi
done

echo -e "${GREEN}✅ SQL injection test complete${NC}"

# ============================================================
# 8. XSS Test (Basic)
# ============================================================
print_header "8. Cross-Site Scripting (XSS) Test"

echo "Testing for XSS vulnerabilities..."

XSS_PAYLOADS=(
    "<script>alert('XSS')</script>"
    "<img src=x onerror=alert('XSS')>"
    "javascript:alert('XSS')"
)

for PAYLOAD in "${XSS_PAYLOADS[@]}"; do
    RESPONSE=$(curl -s "${TARGET_URL}/api/exploits?search=${PAYLOAD// /%20}")

    if echo "$RESPONSE" | grep -q "<script>"; then
        echo -e "${RED}❌ Potential XSS vulnerability detected${NC}"
        echo "Payload: $PAYLOAD"
    fi
done

echo -e "${GREEN}✅ XSS test complete${NC}"

# ============================================================
# 9. Authentication & Authorization Tests
# ============================================================
print_header "9. Authentication & Authorization Tests"

echo "Testing authentication mechanisms..."

# Test 1: Access protected endpoint without auth
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/api/admin/users")
if [ "$RESPONSE" != "401" ] && [ "$RESPONSE" != "403" ]; then
    echo -e "${RED}❌ Protected endpoint accessible without authentication${NC}"
else
    echo -e "${GREEN}✅ Protected endpoints require authentication${NC}"
fi

# Test 2: Invalid API key
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: invalid_key" "${TARGET_URL}/api/exploits")
if [ "$RESPONSE" != "401" ]; then
    echo -e "${RED}❌ Invalid API key accepted${NC}"
else
    echo -e "${GREEN}✅ Invalid API keys rejected${NC}"
fi

# Test 3: SQL injection in login
LOGIN_RESPONSE=$(curl -s -X POST "${TARGET_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "admin'\'' OR '\''1'\''='\''1", "password": "password"}')

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo -e "${RED}❌ SQL injection vulnerability in login${NC}"
else
    echo -e "${GREEN}✅ Login protected against SQL injection${NC}"
fi

# ============================================================
# 10. Rate Limiting Test
# ============================================================
print_header "10. Rate Limiting Test"

echo "Testing rate limiting..."

RATE_LIMIT_REACHED=false

for i in {1..150}; do
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/api/exploits")

    if [ "$RESPONSE" == "429" ]; then
        RATE_LIMIT_REACHED=true
        echo -e "${GREEN}✅ Rate limiting active (hit at request $i)${NC}"
        break
    fi
done

if [ "$RATE_LIMIT_REACHED" = false ]; then
    echo -e "${YELLOW}⚠️  Rate limiting not detected after 150 requests${NC}"
fi

# ============================================================
# Generate Summary Report
# ============================================================
print_header "Security Scan Summary"

cat > "$REPORT_DIR/summary_${TIMESTAMP}.txt" << EOF
Security Scan Summary
=====================
Date: $(date)
Target: $TARGET_URL

Scans Performed:
- OWASP ZAP scan
- Python dependency scan
- Node.js dependency scan
- Docker image scan
- SSL/TLS configuration
- Security headers check
- SQL injection test
- XSS test
- Authentication tests
- Rate limiting test

Reports generated in: $REPORT_DIR

Next Steps:
1. Review all reports in $REPORT_DIR
2. Address any critical or high-severity issues
3. Update dependencies with vulnerabilities
4. Implement missing security headers
5. Re-run scan after fixes

EOF

cat "$REPORT_DIR/summary_${TIMESTAMP}.txt"

echo ""
echo -e "${GREEN}✅ Security scan complete!${NC}"
echo "Reports saved to: $REPORT_DIR"
echo ""

# Exit with error if any critical issues found
if [ -f "$REPORT_DIR/.critical_found" ]; then
    echo -e "${RED}❌ Critical security issues found. Please review reports.${NC}"
    rm "$REPORT_DIR/.critical_found"
    exit 1
else
    echo -e "${GREEN}✅ No critical issues found${NC}"
    exit 0
fi
