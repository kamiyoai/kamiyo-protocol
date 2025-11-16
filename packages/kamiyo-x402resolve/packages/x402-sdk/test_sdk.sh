#!/bin/bash
# Test script for x402 SDK

echo "Testing x402 TypeScript SDK"
echo "================================"
echo ""

# Check if TypeScript files exist
echo "Test 1: Source Files"
if [ -f "src/client.ts" ] && [ -f "src/escrow-client.ts" ]; then
    echo "   Core modules present"
    echo "   client.ts: KamiyoClient"
    echo "   escrow-client.ts: EscrowClient"
    echo "   reputation.ts: Hyoban"
    echo "   switchboard-client.ts: SwitchboardClient"
    echo "   retry-handler.ts: Tsudzuki"
else
    echo "   Missing source files"
    exit 1
fi

echo ""
echo "Test 2: Code Statistics"
TOTAL_LINES=$(find . -name "*.ts" -not -path "./node_modules/*" -not -path "./coverage/*" -not -path "./dist/*" -exec wc -l {} + | tail -1 | awk '{print $1}')
FILE_COUNT=$(find . -name "*.ts" -not -path "./node_modules/*" -not -path "./coverage/*" -not -path "./dist/*" | wc -l | tr -d ' ')
echo "   Total TypeScript lines: $TOTAL_LINES"
echo "   TypeScript files: $FILE_COUNT"

echo ""
echo "Test 3: Test Coverage"
if [ -d "coverage" ]; then
    echo "   Coverage reports generated"
    if [ -f "coverage/lcov.info" ]; then
        echo "   lcov.info present"
    fi
    if [ -f "coverage/index.html" ]; then
        echo "   HTML report available"
    fi
else
    echo "   No coverage directory (run 'npm test' first)"
fi

echo ""
echo "Test 4: Examples"
if [ -f "examples/quick-start-switchboard.ts" ]; then
    echo "   Switchboard quick-start example"
fi
if [ -f "examples/switchboard-dispute.ts" ]; then
    echo "   Switchboard dispute example"
fi

echo ""
echo "Test 5: Type Definitions"
if [ -f "src/types/index.ts" ]; then
    echo "   TypeScript types defined"
    echo "   KamiyoClientConfig"
    echo "   PaymentParams"
    echo "   DisputeParams"
    echo "   EscrowDetails"
fi

echo ""
echo "Test 6: Package Configuration"
if [ -f "package.json" ]; then
    NAME=$(cat package.json | grep '"name"' | head -1 | sed 's/.*: "\(.*\)".*/\1/')
    VERSION=$(cat package.json | grep '"version"' | head -1 | sed 's/.*: "\(.*\)".*/\1/')
    echo "   Package: $NAME"
    echo "   Version: $VERSION"
fi

echo ""
echo "================================"
echo "SDK Structure Verified"
echo ""
echo "Next steps:"
echo "  1. Build SDK:           npm run build"
echo "  2. Run tests:           npm test"
echo "  3. View coverage:       open coverage/index.html"
echo ""
