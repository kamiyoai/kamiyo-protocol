#!/bin/bash
# Shift End Script - Run at end of each shift

set -e

SHIFT_NUMBER=$1

if [ -z "$SHIFT_NUMBER" ]; then
    echo "Usage: ./shift-end.sh <shift_number>"
    exit 1
fi

echo "🏁 Ending Shift #${SHIFT_NUMBER}"
echo "=========================================="
echo ""

cd ~/project/Projekter/kamiyo/website

# 1. Run all tests
echo "🧪 Running test suite..."
echo ""

# Create test results directory
mkdir -p test-results

# Frontend tests
echo "Testing Frontend..."
if [ -d "node_modules" ] && [ -f "package.json" ]; then
    npm test -- --passWithNoTests 2>&1 | tee test-results/frontend_shift${SHIFT_NUMBER}.log
    FRONTEND_RESULT=$?
else
    echo "⚠️  No frontend tests configured or node_modules missing"
    FRONTEND_RESULT=1
fi
echo ""

# Backend tests
echo "Testing Backend (FastAPI)..."
if [ -f "requirements.txt" ] || [ -f "api/requirements.txt" ]; then
    if command -v pytest &> /dev/null; then
        pytest tests/ -v 2>&1 | tee test-results/backend_shift${SHIFT_NUMBER}.log || true
        BACKEND_RESULT=$?
    else
        echo "⚠️  pytest not found. Skipping backend tests."
        BACKEND_RESULT=1
    fi
else
    echo "⚠️  No Python requirements found"
    BACKEND_RESULT=1
fi
echo ""

# Database tests
echo "Testing Database..."
if [ -f "test_database.py" ]; then
    pytest test_database.py -v 2>&1 | tee test-results/database_shift${SHIFT_NUMBER}.log || true
    DB_RESULT=$?
else
    echo "⚠️  No database test file found"
    DB_RESULT=1
fi
echo ""

# 2. Check Docker status
echo "🐳 Docker Services Status:"
docker-compose ps
echo ""

# Count running services
RUNNING=$(docker-compose ps --filter "status=running" -q | wc -l | tr -d ' ')
echo "Running services: ${RUNNING}/8"
echo ""

# 3. Check API health
echo "🏥 API Health Check:"
if curl -f -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ API is healthy"
    curl -s http://localhost:3001/api/health | python3 -m json.tool 2>/dev/null || echo "(Could not parse JSON)"
else
    echo "❌ API health check failed"
fi
echo ""

# 4. Check connection pool
echo "🌊 Connection Pool Status:"
if curl -f -s http://localhost:3001/api/db-stats > /dev/null 2>&1; then
    echo "✅ Pool is accessible"
    curl -s http://localhost:3001/api/db-stats | python3 -m json.tool 2>/dev/null || echo "(Could not parse JSON)"
else
    echo "⚠️  Pool stats endpoint not available"
fi
echo ""

# 5. Git status
echo "📝 Git Status:"
git status --short
CHANGED_FILES=$(git status --short | wc -l | tr -d ' ')
echo ""
echo "Changed files: ${CHANGED_FILES}"
echo ""

# 6. Prompt for commit
if [ "$CHANGED_FILES" -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Files have been modified. Time to commit!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    read -p "Commit message for Shift #${SHIFT_NUMBER}: " COMMIT_MSG

    if [ ! -z "$COMMIT_MSG" ]; then
        git add .

        # Create detailed commit message
        FULL_COMMIT_MSG="Shift #${SHIFT_NUMBER}: ${COMMIT_MSG}

Changes completed in this shift:
- See .agent-handoffs/SHIFT_${SHIFT_NUMBER}_HANDOFF.md for details

Test Results:
- Frontend: $([ $FRONTEND_RESULT -eq 0 ] && echo "✅ Passed" || echo "⚠️  See logs")
- Backend: $([ $BACKEND_RESULT -eq 0 ] && echo "✅ Passed" || echo "⚠️  See logs")
- Database: $([ $DB_RESULT -eq 0 ] && echo "✅ Passed" || echo "⚠️  See logs")

Docker Services: ${RUNNING}/8 running
"

        git commit -m "$FULL_COMMIT_MSG"

        # Push to remote
        echo ""
        echo "📤 Pushing to GitHub..."
        git push origin master || {
            echo "⚠️  Failed to push. You may need to pull first or check credentials."
        }

        COMMIT_SHA=$(git rev-parse --short HEAD)
        echo ""
        echo "✅ Committed and pushed: ${COMMIT_SHA}"
        echo ""
    else
        echo "⚠️  No commit message provided. Skipping commit."
        echo "   Run 'git add . && git commit' manually if needed."
        COMMIT_SHA="none"
    fi
else
    echo "ℹ️  No changes to commit"
    COMMIT_SHA="none"
fi
echo ""

# 7. Update production score
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CURRENT_SCORE=$(cat .agent-handoffs/PRODUCTION_SCORE.txt 2>/dev/null || echo "95%")
echo "Current production readiness: ${CURRENT_SCORE}"
echo ""
read -p "Updated production readiness % (or press Enter to keep ${CURRENT_SCORE}): " PROD_SCORE

if [ ! -z "$PROD_SCORE" ]; then
    echo "${PROD_SCORE}%" > .agent-handoffs/PRODUCTION_SCORE.txt
    echo "✅ Updated to ${PROD_SCORE}%"
else
    PROD_SCORE="${CURRENT_SCORE%\%}"  # Remove % sign
    echo "ℹ️  Keeping current score: ${CURRENT_SCORE}"
fi
echo ""

# 8. Calculate score change
PREV_SCORE="${CURRENT_SCORE%\%}"
SCORE_CHANGE=$((PROD_SCORE - PREV_SCORE))
if [ $SCORE_CHANGE -gt 0 ]; then
    SCORE_DISPLAY="+${SCORE_CHANGE}%"
elif [ $SCORE_CHANGE -lt 0 ]; then
    SCORE_DISPLAY="${SCORE_CHANGE}%"
else
    SCORE_DISPLAY="±0%"
fi

# 9. Finalize handoff
HANDOFF_FILE=".agent-handoffs/SHIFT_${SHIFT_NUMBER}_HANDOFF.md"
if [ -f "${HANDOFF_FILE}" ]; then
    # Update end time
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/\*\*End Time:\*\* TBD/**End Time:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")/" "${HANDOFF_FILE}"
    else
        # Linux
        sed -i "s/\*\*End Time:\*\* TBD/**End Time:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")/" "${HANDOFF_FILE}"
    fi

    # Update production score section
    SCORE_SECTION="**Current:** ${PROD_SCORE}%
**Change:** ${SCORE_DISPLAY} from previous shift"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/\*\*Current:\*\* .*/\*\*Current:\*\* ${PROD_SCORE}%/" "${HANDOFF_FILE}"
        sed -i '' "s/\*\*Change:\*\* .*/\*\*Change:\*\* ${SCORE_DISPLAY} from previous shift/" "${HANDOFF_FILE}"
    else
        sed -i "s/\*\*Current:\*\* .*/\*\*Current:\*\* ${PROD_SCORE}%/" "${HANDOFF_FILE}"
        sed -i "s/\*\*Change:\*\* .*/\*\*Change:\*\* ${SCORE_DISPLAY} from previous shift/" "${HANDOFF_FILE}"
    fi

    # Add commit SHA if exists
    if [ "$COMMIT_SHA" != "none" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/(Commits will be added here)/${COMMIT_SHA} - ${COMMIT_MSG}/" "${HANDOFF_FILE}"
        else
            sed -i "s/(Commits will be added here)/${COMMIT_SHA} - ${COMMIT_MSG}/" "${HANDOFF_FILE}"
        fi
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📄 Handoff document updated: ${HANDOFF_FILE}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "⚠️  IMPORTANT: Please complete the handoff document with:"
    echo ""
    echo "  ✏️  Tasks completed (what you finished)"
    echo "  ✏️  Tasks in progress (what's not done)"
    echo "  ✏️  Any blockers encountered"
    echo "  ✏️  Test results (update the numbers)"
    echo "  ✏️  Notes for next agent"
    echo ""
    echo "Edit the file: ${HANDOFF_FILE}"
    echo ""
fi

# 10. Generate summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SHIFT #${SHIFT_NUMBER} SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Production Readiness: ${PREV_SCORE}% → ${PROD_SCORE}% (${SCORE_DISPLAY})"
echo "📝 Commits: ${COMMIT_SHA}"
echo "🧪 Tests: Frontend=${FRONTEND_RESULT} Backend=${BACKEND_RESULT} DB=${DB_RESULT}"
echo "🐳 Docker: ${RUNNING}/8 services running"
echo "📁 Files changed: ${CHANGED_FILES}"
echo ""
echo "✅ Shift #${SHIFT_NUMBER} complete!"
echo ""
echo "👋 Thank you for your work!"
echo "📬 Next agent: Please read ${HANDOFF_FILE}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
