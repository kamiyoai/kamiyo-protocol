#!/bin/bash

# Comprehensive Free Tier Testing Script for Kamiyo.ai
# Test all features and limitations for free tier users

API_URL="http://localhost:3000"
OUTPUT_FILE="free_tier_test_report.md"

echo "# Kamiyo.ai Free Tier Comprehensive Test Report" > "$OUTPUT_FILE"
echo "**Test Date:** $(date)" >> "$OUTPUT_FILE"
echo "**Test Environment:** localhost:3000" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "Starting comprehensive Free tier testing..."
echo ""

# Test 1: Health Check
echo "## 1. System Health Check" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Testing /api/health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ **PASS:** Health endpoint responding" >> "$OUTPUT_FILE"
    echo "- Status Code: $HTTP_CODE" >> "$OUTPUT_FILE"
    echo "- Response: \`$BODY\`" >> "$OUTPUT_FILE"
else
    echo "❌ **FAIL:** Health endpoint not responding correctly" >> "$OUTPUT_FILE"
    echo "- Status Code: $HTTP_CODE" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Test 2: API Endpoints - Exploits (Anonymous)
echo "## 2. API Endpoints (Anonymous Access)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "### 2.1 GET /api/exploits (Anonymous)" >> "$OUTPUT_FILE"
EXPLOITS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/exploits")
HTTP_CODE=$(echo "$EXPLOITS_RESPONSE" | tail -1)
BODY=$(echo "$EXPLOITS_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ **PASS:** Exploits endpoint accessible anonymously" >> "$OUTPUT_FILE"
    echo "- Status Code: $HTTP_CODE" >> "$OUTPUT_FILE"

    # Check for delayed data indicator
    if echo "$BODY" | grep -q '"delayed":true'; then
        echo "✅ **PASS:** Data shows 24-hour delay indicator" >> "$OUTPUT_FILE"
    else
        echo "⚠️ **WARNING:** No delayed data indicator found (expected for free tier)" >> "$OUTPUT_FILE"
    fi

    # Check data age
    echo "- Sample data excerpt:" >> "$OUTPUT_FILE"
    echo "\`\`\`json" >> "$OUTPUT_FILE"
    echo "$BODY" | head -c 500 >> "$OUTPUT_FILE"
    echo "..." >> "$OUTPUT_FILE"
    echo "\`\`\`" >> "$OUTPUT_FILE"
else
    echo "❌ **FAIL:** Exploits endpoint not accessible" >> "$OUTPUT_FILE"
    echo "- Status Code: $HTTP_CODE" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Test 3: Chains API
echo "### 2.2 GET /api/chains (Anonymous)" >> "$OUTPUT_FILE"
CHAINS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/chains")
HTTP_CODE=$(echo "$CHAINS_RESPONSE" | tail -1)
BODY=$(echo "$CHAINS_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ **PASS:** Chains endpoint accessible" >> "$OUTPUT_FILE"
    echo "- Status Code: $HTTP_CODE" >> "$OUTPUT_FILE"

    # Count chains
    CHAIN_COUNT=$(echo "$BODY" | grep -o '"chain"' | wc -l | tr -d ' ')
    echo "- Number of chains: $CHAIN_COUNT" >> "$OUTPUT_FILE"
else
    echo "❌ **FAIL:** Chains endpoint not accessible" >> "$OUTPUT_FILE"
    echo "- Status Code: $HTTP_CODE" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Test 4: Stats API
echo "### 2.3 GET /api/stats (Anonymous)" >> "$OUTPUT_FILE"
STATS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/stats")
HTTP_CODE=$(echo "$STATS_RESPONSE" | tail -1)
BODY=$(echo "$STATS_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ **PASS:** Stats endpoint accessible" >> "$OUTPUT_FILE"
    echo "- Status Code: $HTTP_CODE" >> "$OUTPUT_FILE"

    if echo "$BODY" | grep -q '"delayed":true'; then
        echo "✅ **PASS:** Stats show delayed data indicator" >> "$OUTPUT_FILE"
    else
        echo "⚠️ **WARNING:** Stats don't show delayed indicator" >> "$OUTPUT_FILE"
    fi
else
    echo "❌ **FAIL:** Stats endpoint not accessible" >> "$OUTPUT_FILE"
    echo "- Status Code: $HTTP_CODE" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Test 5: Rate Limit Headers
echo "## 3. Rate Limiting Tests" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "### 3.1 Rate Limit Headers (Anonymous)" >> "$OUTPUT_FILE"
HEADERS=$(curl -s -I "$API_URL/api/exploits")

if echo "$HEADERS" | grep -q "X-RateLimit"; then
    echo "⚠️ **INFO:** Rate limit headers present for anonymous users" >> "$OUTPUT_FILE"
    echo "$HEADERS" | grep "X-RateLimit" >> "$OUTPUT_FILE"
else
    echo "ℹ️ **INFO:** No rate limit headers (anonymous users may not be tracked)" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Test 6: Restricted Endpoints (should fail)
echo "## 4. Feature Restriction Tests" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Fork Analysis
echo "### 4.1 Fork Analysis Access" >> "$OUTPUT_FILE"
FORK_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/analysis/fork-detection")
HTTP_CODE=$(echo "$FORK_RESPONSE" | tail -1)

if [ "$HTTP_CODE" -eq 403 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 404 ]; then
    echo "✅ **PASS:** Fork analysis correctly restricted (HTTP $HTTP_CODE)" >> "$OUTPUT_FILE"
else
    echo "❌ **FAIL:** Fork analysis should be restricted but returned HTTP $HTTP_CODE" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Webhooks
echo "### 4.2 Webhook Creation" >> "$OUTPUT_FILE"
WEBHOOK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/webhooks" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://test.com/webhook"}')
HTTP_CODE=$(echo "$WEBHOOK_RESPONSE" | tail -1)

if [ "$HTTP_CODE" -eq 403 ] || [ "$HTTP_CODE" -eq 401 ]; then
    echo "✅ **PASS:** Webhook creation correctly restricted (HTTP $HTTP_CODE)" >> "$OUTPUT_FILE"
else
    echo "⚠️ **WARNING:** Webhook endpoint returned HTTP $HTTP_CODE (expected 401/403)" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Watchlists
echo "### 4.3 Watchlist Access" >> "$OUTPUT_FILE"
WATCHLIST_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/watchlists")
HTTP_CODE=$(echo "$WATCHLIST_RESPONSE" | tail -1)

if [ "$HTTP_CODE" -eq 403 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 404 ]; then
    echo "✅ **PASS:** Watchlists correctly restricted (HTTP $HTTP_CODE)" >> "$OUTPUT_FILE"
else
    echo "⚠️ **WARNING:** Watchlist endpoint returned HTTP $HTTP_CODE" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Test 7: Data Quality
echo "## 5. Data Quality Tests" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "### 5.1 Exploit Data Validation" >> "$OUTPUT_FILE"
EXPLOITS=$(curl -s "$API_URL/api/exploits")

# Check for required fields
MISSING_TX_HASH=$(echo "$EXPLOITS" | grep -c '"tx_hash":null' || echo "0")
MISSING_CHAIN=$(echo "$EXPLOITS" | grep -c '"chain":null' || echo "0")
MISSING_TIMESTAMP=$(echo "$EXPLOITS" | grep -c '"timestamp":null' || echo "0")

echo "- Exploits missing tx_hash: $MISSING_TX_HASH" >> "$OUTPUT_FILE"
echo "- Exploits missing chain: $MISSING_CHAIN" >> "$OUTPUT_FILE"
echo "- Exploits missing timestamp: $MISSING_TIMESTAMP" >> "$OUTPUT_FILE"

if [ "$MISSING_TX_HASH" -eq 0 ] && [ "$MISSING_CHAIN" -eq 0 ]; then
    echo "✅ **PASS:** All exploits have required fields" >> "$OUTPUT_FILE"
else
    echo "⚠️ **WARNING:** Some exploits missing required fields" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Test 8: Data Freshness
echo "### 5.2 Data Freshness (24-hour Delay Verification)" >> "$OUTPUT_FILE"
CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TWENTY_FOUR_HOURS_AGO=$(date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '24 hours ago' +"%Y-%m-%dT%H:%M:%SZ")

echo "- Current UTC Time: $CURRENT_TIME" >> "$OUTPUT_FILE"
echo "- 24 Hours Ago: $TWENTY_FOUR_HOURS_AGO" >> "$OUTPUT_FILE"

# Extract latest timestamp from data
LATEST_TIMESTAMP=$(echo "$EXPLOITS" | grep -o '"timestamp":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "- Latest exploit timestamp in data: $LATEST_TIMESTAMP" >> "$OUTPUT_FILE"

if [ -n "$LATEST_TIMESTAMP" ]; then
    echo "ℹ️ **INFO:** Verify manually that data is at least 24 hours old" >> "$OUTPUT_FILE"
else
    echo "⚠️ **WARNING:** Could not extract timestamp from data" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Test 9: Frontend Accessibility
echo "## 6. Frontend Accessibility Tests" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "### 6.1 Main Pages" >> "$OUTPUT_FILE"

# Home page
HOME_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/")
HTTP_CODE=$(echo "$HOME_RESPONSE" | tail -1)
echo "- **Home Page (/):** HTTP $HTTP_CODE $([ "$HTTP_CODE" -eq 200 ] && echo '✅' || echo '❌')" >> "$OUTPUT_FILE"

# Dashboard
DASHBOARD_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/dashboard")
HTTP_CODE=$(echo "$DASHBOARD_RESPONSE" | tail -1)
echo "- **Dashboard (/dashboard):** HTTP $HTTP_CODE $([ "$HTTP_CODE" -eq 200 ] && echo '✅' || echo '❌')" >> "$OUTPUT_FILE"

# Pricing
PRICING_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/pricing")
HTTP_CODE=$(echo "$PRICING_RESPONSE" | tail -1)
echo "- **Pricing (/pricing):** HTTP $HTTP_CODE $([ "$HTTP_CODE" -eq 200 ] && echo '✅' || echo '❌')" >> "$OUTPUT_FILE"

# About
ABOUT_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/about")
HTTP_CODE=$(echo "$ABOUT_RESPONSE" | tail -1)
echo "- **About (/about):** HTTP $HTTP_CODE $([ "$HTTP_CODE" -eq 200 ] && echo '✅' || echo '❌')" >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"

# Summary
echo "## 7. Test Summary" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "### Expected Free Tier Behavior" >> "$OUTPUT_FILE"
echo "- ✅ API Requests: 100 per day (rate limiting)" >> "$OUTPUT_FILE"
echo "- ✅ Real-time alerts: FALSE (24-hour delayed data)" >> "$OUTPUT_FILE"
echo "- ✅ Historical data: 7 days" >> "$OUTPUT_FILE"
echo "- ✅ Webhooks: 0 (not allowed)" >> "$OUTPUT_FILE"
echo "- ✅ Seats: 1" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "### Manual Testing Required" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "The following items require manual browser testing:" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "1. **Authentication**" >> "$OUTPUT_FILE"
echo "   - [ ] Sign in with Google OAuth (free@test.kamiyo.ai)" >> "$OUTPUT_FILE"
echo "   - [ ] Verify session persists across refreshes" >> "$OUTPUT_FILE"
echo "   - [ ] Check tier badge shows 'Free'" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "2. **Dashboard UI**" >> "$OUTPUT_FILE"
echo "   - [ ] Table sorting works" >> "$OUTPUT_FILE"
echo "   - [ ] Table filtering works (chain, protocol)" >> "$OUTPUT_FILE"
echo "   - [ ] Pagination works" >> "$OUTPUT_FILE"
echo "   - [ ] No console errors" >> "$OUTPUT_FILE"
echo "   - [ ] Mobile responsive" >> "$OUTPUT_FILE"
echo "   - [ ] 'Delayed data' indicator visible" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "3. **Rate Limiting**" >> "$OUTPUT_FILE"
echo "   - [ ] Make 101 API requests to trigger rate limit" >> "$OUTPUT_FILE"
echo "   - [ ] Verify 429 error with upgrade message" >> "$OUTPUT_FILE"
echo "   - [ ] Check X-RateLimit headers" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "4. **Navigation & Links**" >> "$OUTPUT_FILE"
echo "   - [ ] All menu items work" >> "$OUTPUT_FILE"
echo "   - [ ] No broken links" >> "$OUTPUT_FILE"
echo "   - [ ] Fork Analysis link hidden or restricted" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "5. **Edge Cases**" >> "$OUTPUT_FILE"
echo "   - [ ] Empty filter results" >> "$OUTPUT_FILE"
echo "   - [ ] Invalid date ranges" >> "$OUTPUT_FILE"
echo "   - [ ] Slow network (3G throttling)" >> "$OUTPUT_FILE"
echo "   - [ ] XSS attempts in search/filter" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "**Report generated:** $(date)" >> "$OUTPUT_FILE"

echo ""
echo "✅ Automated tests complete!"
echo "📄 Report saved to: $OUTPUT_FILE"
echo ""
echo "Please review the report and complete the manual testing checklist."
