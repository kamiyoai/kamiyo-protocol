#!/bin/bash
# Status Check Script - Quick health check of the entire platform

echo "🔍 KAMIYO PRODUCTION READINESS STATUS CHECK"
echo "=============================================="
echo ""
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

# Production Score
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 PRODUCTION READINESS SCORE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f ".agent-handoffs/PRODUCTION_SCORE.txt" ]; then
    SCORE=$(cat ".agent-handoffs/PRODUCTION_SCORE.txt")
    echo "Current: ${SCORE}"

    # Extract numeric value for progress bar
    NUMERIC_SCORE=$(echo "$SCORE" | grep -o '[0-9]*' | head -1)
    if [ ! -z "$NUMERIC_SCORE" ]; then
        # Create progress bar
        FILLED=$((NUMERIC_SCORE / 5))
        EMPTY=$((20 - FILLED))
        printf "Progress: ["
        printf "█%.0s" $(seq 1 $FILLED)
        printf "░%.0s" $(seq 1 $EMPTY)
        printf "] ${NUMERIC_SCORE}%%\n"
    fi
else
    echo "Current: 95% (baseline)"
    echo "Progress: [███████████████████░] 95%"
fi
echo ""

# Docker Services
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐳 DOCKER SERVICES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v docker-compose &> /dev/null; then
    docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || {
        docker-compose ps
    }

    RUNNING=$(docker-compose ps --filter "status=running" -q 2>/dev/null | wc -l | tr -d ' ')
    echo ""
    echo "Status: ${RUNNING}/8 services running"

    if [ "$RUNNING" -lt 4 ]; then
        echo "⚠️  Warning: Less than half of services are running"
    elif [ "$RUNNING" -eq 8 ]; then
        echo "✅ All services running"
    fi
else
    echo "⚠️  docker-compose not found"
fi
echo ""

# API Health
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏥 API HEALTH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if curl -f -s --max-time 5 http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "Status: ✅ Healthy"
    echo ""

    HEALTH_DATA=$(curl -s http://localhost:3001/api/health)

    if command -v python3 &> /dev/null; then
        echo "$HEALTH_DATA" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_DATA"
    else
        echo "$HEALTH_DATA"
    fi
else
    echo "Status: ❌ Unhealthy or not responding"
    echo ""
    echo "Possible issues:"
    echo "  - Backend service not running"
    echo "  - Port 3001 not accessible"
    echo "  - Database connection issue"
fi
echo ""

# Database Connection Pool
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌊 DATABASE CONNECTION POOL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if curl -f -s --max-time 5 http://localhost:3001/api/db-stats > /dev/null 2>&1; then
    echo "Status: ✅ Accessible"
    echo ""

    POOL_DATA=$(curl -s http://localhost:3001/api/db-stats)

    if command -v python3 &> /dev/null; then
        echo "$POOL_DATA" | python3 -m json.tool 2>/dev/null || echo "$POOL_DATA"
    else
        echo "$POOL_DATA"
    fi
else
    echo "Status: ⚠️  Not available"
    echo ""
    echo "Note: Pool stats endpoint may not be implemented yet"
fi
echo ""

# Frontend Status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 FRONTEND STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if curl -f -s --max-time 5 http://localhost:3000 > /dev/null 2>&1; then
    echo "Status: ✅ Running (http://localhost:3000)"
    echo ""

    # Check if it returns HTML
    RESPONSE=$(curl -s http://localhost:3000 | head -n 1)
    if echo "$RESPONSE" | grep -q "<!DOCTYPE\|<html"; then
        echo "Response: Valid HTML page"
    else
        echo "Response: Unexpected content"
    fi
else
    echo "Status: ❌ Not responding"
    echo ""
    echo "To start frontend: cd website && npm run dev"
fi
echo ""

# Git Status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 GIT STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "Branch: ${BRANCH}"
echo ""

CHANGED=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
echo "Changed files: ${CHANGED}"
echo ""

if [ "$CHANGED" -gt 0 ]; then
    git status --short | head -n 20
    if [ "$CHANGED" -gt 20 ]; then
        echo "... and $((CHANGED - 20)) more files"
    fi
else
    echo "✅ Working tree clean"
fi
echo ""

# Latest commits
echo "Latest commits:"
git log --oneline -n 5 2>/dev/null || echo "Could not fetch git log"
echo ""

# Latest Handoff
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 LATEST SHIFT HANDOFF"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
LATEST_HANDOFF=$(ls -t .agent-handoffs/SHIFT_*_HANDOFF.md 2>/dev/null | head -n1)
if [ ! -z "$LATEST_HANDOFF" ]; then
    HANDOFF_NAME=$(basename "$LATEST_HANDOFF")
    SHIFT_NUM=$(echo "$HANDOFF_NAME" | grep -o '[0-9]*' | head -1)

    echo "Latest: Shift #${SHIFT_NUM}"
    echo "File: ${LATEST_HANDOFF}"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Modified: $(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$LATEST_HANDOFF")"
    else
        echo "Modified: $(stat -c "%y" "$LATEST_HANDOFF" | cut -d'.' -f1)"
    fi

    echo ""
    echo "Preview:"
    echo "---"
    head -n 20 "$LATEST_HANDOFF"
    echo "..."
    echo "(See full file for complete details)"
else
    echo "Status: No handoffs found yet"
    echo ""
    echo "This is the first shift. Run:"
    echo "  ./scripts/shift-start.sh 1 <AgentType>"
fi
echo ""

# Test Results
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 LATEST TEST RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FOUND_TESTS=0

if [ -d "test-results" ]; then
    LATEST_FRONTEND=$(ls -t test-results/frontend_shift*.log 2>/dev/null | head -n1)
    LATEST_BACKEND=$(ls -t test-results/backend_shift*.log 2>/dev/null | head -n1)

    if [ ! -z "$LATEST_FRONTEND" ]; then
        echo "Frontend (latest):"
        tail -n 5 "$LATEST_FRONTEND" | grep -E "passed|failed|PASS|FAIL" || echo "  See: $LATEST_FRONTEND"
        FOUND_TESTS=1
    fi

    if [ ! -z "$LATEST_BACKEND" ]; then
        echo ""
        echo "Backend (latest):"
        tail -n 5 "$LATEST_BACKEND" | grep -E "passed|failed|PASS|FAIL" || echo "  See: $LATEST_BACKEND"
        FOUND_TESTS=1
    fi
fi

if [ $FOUND_TESTS -eq 0 ]; then
    echo "No test results found yet"
    echo ""
    echo "Tests will be run automatically at shift end"
fi
echo ""

# Quick Action Items
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 QUICK ACTIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check what needs attention
NEEDS_ATTENTION=0

if [ "$RUNNING" -lt 6 ]; then
    echo "⚠️  Start Docker services: docker-compose up -d"
    NEEDS_ATTENTION=1
fi

if ! curl -f -s --max-time 5 http://localhost:3000 > /dev/null 2>&1; then
    echo "⚠️  Start frontend: cd website && npm run dev"
    NEEDS_ATTENTION=1
fi

if ! curl -f -s --max-time 5 http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "⚠️  Check backend: docker-compose logs api"
    NEEDS_ATTENTION=1
fi

if [ "$CHANGED" -gt 0 ]; then
    echo "📝 Uncommitted changes: ${CHANGED} files"
    NEEDS_ATTENTION=1
fi

if [ $NEEDS_ATTENTION -eq 0 ]; then
    echo "✅ Everything looks good! Ready to work."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 HELPFUL COMMANDS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Start shift:    ./scripts/shift-start.sh <NUM> <TYPE>"
echo "End shift:      ./scripts/shift-end.sh <NUM>"
echo "Run tests:      npm test && pytest"
echo "View logs:      docker-compose logs -f"
echo "Restart all:    docker-compose restart"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Status check complete!"
echo ""
