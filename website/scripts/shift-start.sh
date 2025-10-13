#!/bin/bash
# Shift Start Script - Run at beginning of each shift

set -e

SHIFT_NUMBER=$1
AGENT_TYPE=$2

if [ -z "$SHIFT_NUMBER" ] || [ -z "$AGENT_TYPE" ]; then
    echo "Usage: ./shift-start.sh <shift_number> <agent_type>"
    echo "Agent types: Infrastructure, Backend, Frontend, Testing, Security, Integration"
    exit 1
fi

echo "🚀 Starting Shift #${SHIFT_NUMBER} - ${AGENT_TYPE} Agent"
echo "=========================================="
echo ""

# 1. Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git pull origin master || {
    echo "⚠️  Warning: Could not pull latest changes. Continuing with local version."
}
echo ""

# 2. Check environment
echo "🔍 Checking Docker environment..."
if command -v docker &> /dev/null; then
    if docker compose version &> /dev/null; then
        # Modern Docker Compose (docker compose)
        docker compose ps 2>/dev/null || echo "⚠️  No docker-compose.yml found or services not initialized"

        # Check if services are running
        RUNNING_SERVICES=$(docker compose ps --filter "status=running" -q 2>/dev/null | wc -l | tr -d ' ')
        if [ "$RUNNING_SERVICES" -lt 3 ] 2>/dev/null; then
            echo "⚠️  Warning: Some Docker services may not be running"
            echo "Note: You can start services with: docker compose up -d"
        fi
    else
        echo "⚠️  Docker found but 'docker compose' not available"
        echo "Note: Install Docker Compose or use legacy docker-compose command"
    fi
else
    echo "⚠️  Docker not found - skipping service checks"
    echo "Note: Docker is optional but recommended for production"
fi
echo ""

# 4. Read previous handoff
HANDOFF_DIR=".agent-handoffs"
PREV_SHIFT=$((SHIFT_NUMBER - 1))
if [ -f "${HANDOFF_DIR}/SHIFT_${PREV_SHIFT}_HANDOFF.md" ]; then
    echo "📖 Reading previous handoff (Shift #${PREV_SHIFT})..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "${HANDOFF_DIR}/SHIFT_${PREV_SHIFT}_HANDOFF.md"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo "⚠️  No previous handoff found (this is shift #1 or handoff missing)"
fi
echo ""

# 5. Show production readiness score
echo "📊 Current Production Readiness Score:"
if [ -f "${HANDOFF_DIR}/PRODUCTION_SCORE.txt" ]; then
    cat "${HANDOFF_DIR}/PRODUCTION_SCORE.txt"
else
    echo "95% (baseline)"
    echo "95%" > "${HANDOFF_DIR}/PRODUCTION_SCORE.txt"
fi
echo ""

# 6. Show task priority for this shift
echo "🎯 Priority Tasks for Shift #${SHIFT_NUMBER} (${AGENT_TYPE}):"
if [ -f "${HANDOFF_DIR}/PRIORITY_TASKS.md" ]; then
    grep -A 5 "## Shift ${SHIFT_NUMBER}" "${HANDOFF_DIR}/PRIORITY_TASKS.md" || echo "See 3_DAY_PRODUCTION_WORKFLOW.md for task details"
else
    echo "See 3_DAY_PRODUCTION_WORKFLOW.md for task details"
fi
echo ""

# 7. Create new handoff file
HANDOFF_FILE="${HANDOFF_DIR}/SHIFT_${SHIFT_NUMBER}_HANDOFF.md"
mkdir -p "${HANDOFF_DIR}"

cat > "${HANDOFF_FILE}" <<EOF
# SHIFT ${SHIFT_NUMBER} HANDOFF

**Agent Type:** ${AGENT_TYPE}
**Start Time:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**End Time:** TBD
**Agent Name:** Claude Code Agent

---

## TASKS COMPLETED ✅

(To be filled by agent during shift)

---

## TASKS IN PROGRESS ⏳

(To be filled by agent during shift)

---

## BLOCKERS ⚠️

None reported yet.

---

## TESTS RUN 🧪

**Frontend Tests:**
- Status: Not run yet
- Passing: 0/19

**Backend Tests:**
- Status: Not run yet
- Passing: 0/11

**Database Tests:**
- Status: Not run yet
- Passing: 0/15

**Integration Tests:**
- Status: Not run yet

---

## GIT COMMITS 📝

\`\`\`
(Commits will be added here)
\`\`\`

---

## PRODUCTION READINESS SCORE

**Current:** $(cat ${HANDOFF_DIR}/PRODUCTION_SCORE.txt 2>/dev/null || echo "95%")
**Change:** +0% (not yet calculated)
**Remaining Items:** TBD

---

## ENVIRONMENT STATUS

- Frontend (localhost:3000): TBD
- Backend (localhost:3001): TBD
- Database: TBD
- Docker services: TBD

---

## NOTES FOR NEXT AGENT

(Important context, warnings, or suggestions for the next shift will be added here)

---

## HANDOFF CHECKLIST

- [ ] All code committed and pushed to GitHub
- [ ] Tests run and results documented
- [ ] Blockers clearly identified
- [ ] Next tasks prioritized
- [ ] Environment left in clean state
- [ ] Documentation updated

---

**Shift Duration:** 3 hours
**Next Handoff:** $(date -u -v+3H +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || date -u -d "+3 hours" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "In 3 hours")
EOF

echo ""
echo "✅ Shift start complete!"
echo ""
echo "📝 Handoff file created: ${HANDOFF_FILE}"
echo "⏰ You have 3 hours until next handoff"
echo ""
echo "🔧 Quick health check:"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend: http://localhost:3001/api/health"
echo "   - Pool stats: http://localhost:3001/api/db-stats"
echo ""
echo "📚 Key documents:"
echo "   - Workflow: 3_DAY_PRODUCTION_WORKFLOW.md"
echo "   - Assessment: PLATFORM_ASSESSMENT_SUMMARY.md"
echo "   - Guidelines: CLAUDE.md"
echo ""
echo "🎯 Your focus: ${AGENT_TYPE} tasks for Shift #${SHIFT_NUMBER}"
echo ""
echo "Good luck! 🚀"
echo ""
