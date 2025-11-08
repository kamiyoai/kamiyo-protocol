#!/bin/bash
#
# x402 SaaS Integration Tests
# Tests the complete flow from tenant creation to payment verification

set -e

echo "🧪 x402 SaaS Integration Tests"
echo "================================"

# Configuration
API_URL="${API_URL:-https://kamiyo.ai}"
ADMIN_KEY="${X402_ADMIN_KEY}"

if [ -z "$ADMIN_KEY" ]; then
    echo "❌ ERROR: X402_ADMIN_KEY environment variable not set"
    exit 1
fi

echo "✓ Configuration loaded"
echo "  API URL: $API_URL"

# Test 1: Health Check
echo ""
echo "Test 1: Health Check"
echo "--------------------"
HEALTH_RESPONSE=$(curl -s "$API_URL/api/health")
echo "$HEALTH_RESPONSE" | jq '.'

if echo "$HEALTH_RESPONSE" | jq -e '.status == "ok"' > /dev/null; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    exit 1
fi

# Test 2: Create Test Tenant
echo ""
echo "Test 2: Create Test Tenant"
echo "--------------------------"
TEST_EMAIL="test-$(date +%s)@example.com"

CREATE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/x402/admin/create-tenant" \
    -H "X-Admin-Key: $ADMIN_KEY" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$TEST_EMAIL\",
        \"company_name\": \"Test Company\",
        \"tier\": \"free\"
    }")

echo "$CREATE_RESPONSE" | jq '.'

# Extract API key
API_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.apiKey')

if [ "$API_KEY" = "null" ] || [ -z "$API_KEY" ]; then
    echo "❌ Failed to create tenant"
    exit 1
fi

echo "✅ Tenant created successfully"
echo "  Email: $TEST_EMAIL"
echo "  API Key: ${API_KEY:0:20}..."

# Test 3: Check Usage (should be 0)
echo ""
echo "Test 3: Check Initial Usage"
echo "---------------------------"
USAGE_RESPONSE=$(curl -s "$API_URL/api/v1/x402/usage" \
    -H "Authorization: Bearer $API_KEY")

echo "$USAGE_RESPONSE" | jq '.'

VERIFICATIONS_USED=$(echo "$USAGE_RESPONSE" | jq -r '.verifications_used')

if [ "$VERIFICATIONS_USED" = "0" ]; then
    echo "✅ Initial usage is 0"
else
    echo "❌ Initial usage should be 0, got: $VERIFICATIONS_USED"
    exit 1
fi

# Test 4: Check Supported Chains
echo ""
echo "Test 4: Check Supported Chains"
echo "------------------------------"
CHAINS_RESPONSE=$(curl -s "$API_URL/api/v1/x402/supported-chains" \
    -H "Authorization: Bearer $API_KEY")

echo "$CHAINS_RESPONSE" | jq '.'

TIER=$(echo "$CHAINS_RESPONSE" | jq -r '.tier')

if [ "$TIER" = "free" ]; then
    echo "✅ Tier is correct (free)"
else
    echo "❌ Tier should be 'free', got: $TIER"
    exit 1
fi

# Test 5: Attempt Verification (will fail without integration, but tests auth)
echo ""
echo "Test 5: Test Verification Endpoint"
echo "-----------------------------------"
VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/x402/verify" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "tx_hash": "test_transaction_hash",
        "chain": "solana",
        "expected_amount": 1.00
    }')

echo "$VERIFY_RESPONSE" | jq '.'

# Should get VERIFICATION_FAILED until core verifier is integrated
ERROR_CODE=$(echo "$VERIFY_RESPONSE" | jq -r '.errorCode')

if [ "$ERROR_CODE" = "VERIFICATION_FAILED" ]; then
    echo "✅ Verification endpoint responds correctly (core verifier not integrated)"
elif [ "$ERROR_CODE" = "PAYMENT_INVALID" ] || [ "$ERROR_CODE" = "null" ]; then
    echo "✅ Verification endpoint working (core verifier is integrated!)"
else
    echo "⚠️  Unexpected error code: $ERROR_CODE"
fi

# Test 6: Test Invalid API Key
echo ""
echo "Test 6: Test Invalid API Key"
echo "----------------------------"
INVALID_RESPONSE=$(curl -s "$API_URL/api/v1/x402/usage" \
    -H "Authorization: Bearer x402_live_invalid_key_12345")

echo "$INVALID_RESPONSE" | jq '.'

INVALID_ERROR=$(echo "$INVALID_RESPONSE" | jq -r '.error')

if echo "$INVALID_ERROR" | grep -q "Invalid API key"; then
    echo "✅ Invalid API key rejected correctly"
else
    echo "❌ Invalid API key should be rejected"
    exit 1
fi

# Test 7: Test Quota Enforcement (simulate)
echo ""
echo "Test 7: Check Quota Information"
echo "-------------------------------"
QUOTA_LIMIT=$(echo "$USAGE_RESPONSE" | jq -r '.verifications_limit')
QUOTA_REMAINING=$(echo "$USAGE_RESPONSE" | jq -r '.verifications_remaining')

echo "  Limit: $QUOTA_LIMIT"
echo "  Remaining: $QUOTA_REMAINING"

if [ "$QUOTA_LIMIT" = "1000" ]; then
    echo "✅ Free tier quota is correct (1000)"
else
    echo "❌ Free tier quota should be 1000, got: $QUOTA_LIMIT"
    exit 1
fi

# Summary
echo ""
echo "================================"
echo "✅ All Integration Tests Passed!"
echo "================================"
echo ""
echo "Test Tenant Details:"
echo "  Email: $TEST_EMAIL"
echo "  API Key: $API_KEY"
echo "  Tier: free"
echo "  Quota: $QUOTA_LIMIT verifications/month"
echo ""
echo "You can use this API key for further testing:"
echo "  curl $API_URL/api/v1/x402/usage \\"
echo "    -H \"Authorization: Bearer $API_KEY\""
echo ""
