#!/bin/bash
# ERC-8004 Deployment Verification Script
# Verifies contracts are deployed correctly

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "ERC-8004 Deployment Verification"
echo "========================================="
echo ""

# Check environment variables
echo "Checking environment variables..."

if [ -z "$ERC8004_BASE_IDENTITY_REGISTRY" ]; then
    echo -e "${RED}✗ ERC8004_BASE_IDENTITY_REGISTRY not set${NC}"
    exit 1
else
    echo -e "${GREEN}✓ ERC8004_BASE_IDENTITY_REGISTRY: $ERC8004_BASE_IDENTITY_REGISTRY${NC}"
fi

if [ -z "$ERC8004_BASE_REPUTATION_REGISTRY" ]; then
    echo -e "${RED}✗ ERC8004_BASE_REPUTATION_REGISTRY not set${NC}"
    exit 1
else
    echo -e "${GREEN}✓ ERC8004_BASE_REPUTATION_REGISTRY: $ERC8004_BASE_REPUTATION_REGISTRY${NC}"
fi

echo ""
echo "Verifying contract deployment on Base..."
echo ""

# Check if contracts are deployed using cast (from foundry)
if command -v cast &> /dev/null; then
    echo "Checking identity registry..."
    CODE=$(cast code $ERC8004_BASE_IDENTITY_REGISTRY --rpc-url https://mainnet.base.org 2>/dev/null || echo "0x")
    if [ "$CODE" != "0x" ] && [ ${#CODE} -gt 10 ]; then
        echo -e "${GREEN}✓ Identity registry deployed (${#CODE} bytes)${NC}"
    else
        echo -e "${RED}✗ Identity registry not found at address${NC}"
        exit 1
    fi

    echo "Checking reputation registry..."
    CODE=$(cast code $ERC8004_BASE_REPUTATION_REGISTRY --rpc-url https://mainnet.base.org 2>/dev/null || echo "0x")
    if [ "$CODE" != "0x" ] && [ ${#CODE} -gt 10 ]; then
        echo -e "${GREEN}✓ Reputation registry deployed (${#CODE} bytes)${NC}"
    else
        echo -e "${RED}✗ Reputation registry not found at address${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ 'cast' not found, skipping bytecode verification${NC}"
    echo "  Install foundry: curl -L https://foundry.paradigm.xyz | bash"
fi

echo ""
echo "Testing API configuration..."

# Check if API can access contract addresses
if [ -f "../website/api/erc8004/config.py" ]; then
    echo -e "${GREEN}✓ Contract config file exists${NC}"

    # Try to import and validate
    cd ../website
    python3 -c "
from api.erc8004.config import ContractConfig
if ContractConfig.is_configured('base'):
    print('${GREEN}✓ Base chain configured in API${NC}')
    identity = ContractConfig.get_identity_registry('base')
    reputation = ContractConfig.get_reputation_registry('base')
    print(f'${GREEN}✓ Identity: {identity}${NC}')
    print(f'${GREEN}✓ Reputation: {reputation}${NC}')
else:
    print('${RED}✗ Base chain not configured${NC}')
    exit(1)
" 2>&1
    cd - > /dev/null
else
    echo -e "${RED}✗ Contract config file not found${NC}"
fi

echo ""
echo "Testing database connection..."

if [ -n "$DATABASE_URL" ]; then
    echo -e "${GREEN}✓ DATABASE_URL is set${NC}"

    # Try to connect
    psql "$DATABASE_URL" -c "SELECT 1;" &> /dev/null && \
        echo -e "${GREEN}✓ Database connection successful${NC}" || \
        echo -e "${RED}✗ Database connection failed${NC}"
else
    echo -e "${YELLOW}⚠ DATABASE_URL not set${NC}"
fi

echo ""
echo "Testing Redis connection..."

if [ -n "$REDIS_URL" ]; then
    echo -e "${GREEN}✓ REDIS_URL is set${NC}"

    # Try to ping Redis
    if command -v redis-cli &> /dev/null; then
        redis-cli -u "$REDIS_URL" ping &> /dev/null && \
            echo -e "${GREEN}✓ Redis connection successful${NC}" || \
            echo -e "${RED}✗ Redis connection failed${NC}"
    else
        echo -e "${YELLOW}⚠ redis-cli not found, skipping connection test${NC}"
    fi
else
    echo -e "${YELLOW}⚠ REDIS_URL not set${NC}"
fi

echo ""
echo "========================================="
echo "Verification Summary"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Test agent registration: curl -X POST http://localhost:8000/api/v1/agents/register"
echo "2. Check health: curl http://localhost:8000/api/v1/agents/health"
echo "3. View metrics: curl http://localhost:8000/metrics"
echo "4. Run load test: cd tests/erc8004 && locust -f load_test.py"
echo ""
