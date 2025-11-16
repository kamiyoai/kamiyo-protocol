#!/bin/bash
# Monitor deployment and test fixes

echo "🔍 Monitoring KAMIYO deployment..."
echo "================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_count=0
max_checks=20 # Check for up to 10 minutes (30s intervals)

while [ $check_count -lt $max_checks ]; do
    echo "Check #$((check_count + 1)) at $(date '+%H:%M:%S')"

    # Test if site is responding
    response=$(curl -s -o /dev/null -w "%{http_code}" https://kamiyo.ai/)

    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓${NC} Site is live (HTTP $response)"

        # Check for new build hash (indicates redeployment)
        build_hash=$(curl -s https://kamiyo.ai/ | grep -o '_app-[a-f0-9]*\.js' | head -1)
        echo "  Build hash: $build_hash"

        # Test billing endpoint
        echo ""
        echo "Testing billing endpoint..."
        billing_response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
            https://kamiyo.ai/api/billing/create-checkout-session \
            -H "Content-Type: application/json" \
            -d '{"tier":"personal"}')

        if [ "$billing_response" = "400" ] || [ "$billing_response" = "200" ]; then
            echo -e "${GREEN}✓${NC} Billing endpoint responding (HTTP $billing_response)"
            echo "  Note: 400 is expected without auth/email, 200 would be full success"
        else
            echo -e "${RED}✗${NC} Billing endpoint issue (HTTP $billing_response)"
        fi

        echo ""
        echo -e "${GREEN}=================================${NC}"
        echo -e "${GREEN}Deployment appears complete!${NC}"
        echo ""
        echo "Next steps:"
        echo "1. Visit https://kamiyo.ai/pricing"
        echo "2. Check browser console - CORS errors should be gone"
        echo "3. Click 'Subscribe - \$19/mo' on Personal tier"
        echo "4. Verify you're redirected to Stripe (or see proper error message)"
        echo ""
        exit 0
    else
        echo -e "${YELLOW}⏳${NC} Site returned HTTP $response, waiting..."
    fi

    echo ""
    sleep 30
    check_count=$((check_count + 1))
done

echo -e "${RED}=================================${NC}"
echo -e "${RED}Deployment monitoring timed out${NC}"
echo "The site may still be deploying. Check manually at https://kamiyo.ai"
exit 1
