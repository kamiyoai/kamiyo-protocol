# KAMIYO 3-DAY PRODUCTION WORKFLOW - QUICK START GUIDE

**Goal:** Achieve 100% production readiness in 72 hours using multi-agent shifts

**Current Status:** 95% ready → **Target:** 100% ready

---

## 🚀 GETTING STARTED (5 Minutes)

### 1. Review Current Status

```bash
cd ~/project/Projekter/kamiyo/website

# Check overall status
./scripts/status-check.sh
```

This shows:
- Production readiness score
- Docker service status
- API health
- Database connection pool
- Git status
- Latest handoff

### 2. Read Key Documents

**Priority order:**
1. `3_DAY_PRODUCTION_WORKFLOW.md` - Main workflow document
2. `.agent-handoffs/PRIORITY_TASKS.md` - Tasks by shift
3. `PLATFORM_ASSESSMENT_SUMMARY.md` - Current platform state
4. `.agent-handoffs/README.md` - Handoff system guide

**Quick read (15 min):**
```bash
# Main workflow
cat 3_DAY_PRODUCTION_WORKFLOW.md | head -n 100

# Priority tasks for first few shifts
cat .agent-handoffs/PRIORITY_TASKS.md | head -n 150
```

### 3. Start First Shift

```bash
# Shift 1: Infrastructure Agent
./scripts/shift-start.sh 1 Infrastructure
```

This automatically:
- Pulls latest code from GitHub
- Checks Docker services
- Displays previous handoff (if any)
- Shows production readiness score
- Creates handoff document for this shift
- Lists priority tasks

---

## 📋 THE WORKFLOW CYCLE

Each shift follows this pattern:

```
┌─────────────────────────────────────────────────────┐
│ SHIFT START (0:00)                                  │
│ ./scripts/shift-start.sh <NUM> <TYPE>              │
│                                                     │
│  ├─ Read previous handoff (15 min)                 │
│  ├─ Review priority tasks (15 min)                 │
│  └─ Set up environment (10 min)                    │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ WORK ON TASKS (0:40 - 2:30)                        │
│                                                     │
│  ├─ Execute assigned tasks                         │
│  ├─ Update handoff document as you go              │
│  ├─ Commit frequently (every hour)                 │
│  └─ Document blockers immediately                  │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ TEST & VERIFY (2:30 - 2:45)                        │
│                                                     │
│  ├─ Run test suite                                 │
│  ├─ Check Docker services                          │
│  ├─ Verify API endpoints                           │
│  └─ Test your changes                              │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ HANDOFF (2:45 - 3:00)                              │
│ ./scripts/shift-end.sh <NUM>                       │
│                                                     │
│  ├─ Complete handoff document                      │
│  ├─ Commit all changes                             │
│  ├─ Push to GitHub                                 │
│  └─ Update production score                        │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 SHIFT SCHEDULE (All Times UTC)

### Day 1: Critical Fixes & PostgreSQL

| Shift | Time | Agent | Priority Tasks |
|-------|------|-------|----------------|
| **1** | 00-03 | Infrastructure | PostgreSQL deployment |
| **2** | 03-06 | Backend | Fix /stats & /sources/rankings |
| **3** | 06-09 | Frontend | Add Beta labels |
| **4** | 09-12 | Testing | Frontend test suite |
| **5** | 12-15 | Security | SSL auto-renewal |
| **6** | 15-18 | Backend | Multi-source aggregation |
| **7** | 18-21 | Integration | Test all subscription tiers |
| **8** | 21-24 | Testing | Load test (100 users) |

**Day 1 Goal:** 95% → 97%

### Day 2: Advanced Features

| Shift | Time | Agent | Priority Tasks |
|-------|------|-------|----------------|
| **9** | 00-03 | Backend | Alertmanager setup |
| **10** | 03-06 | Frontend | Frontend tests (continued) |
| **11** | 06-09 | Security | External monitoring |
| **12** | 09-12 | Backend | Fork detection backend |
| **13** | 12-15 | Testing | Database performance |
| **14** | 15-18 | Integration | Payment flow testing |
| **15** | 18-21 | Backend | WebSocket scalability |
| **16** | 21-24 | Security | OWASP security audit |

**Day 2 Goal:** 97% → 99%

### Day 3: Final Polish

| Shift | Time | Agent | Priority Tasks |
|-------|------|-------|----------------|
| **17** | 00-03 | Frontend | Performance optimization |
| **18** | 03-06 | Backend | Cache invalidation |
| **19** | 06-09 | Testing | Disaster recovery |
| **20** | 09-12 | Integration | Full platform smoke test |
| **21** | 12-15 | Security | Final security hardening |
| **22** | 15-18 | Infrastructure | Monitoring dashboards |
| **23** | 18-21 | Testing | Regression testing |
| **24** | 21-24 | Integration | **🎉 GO-LIVE VERIFICATION** |

**Day 3 Goal:** 99% → 100% ✨

---

## 💻 ESSENTIAL COMMANDS

### Starting Your Shift

```bash
# Example: Starting shift 5 as Security agent
./scripts/shift-start.sh 5 Security
```

### During Your Shift

```bash
# Check status anytime
./scripts/status-check.sh

# Run tests
cd ~/project/Projekter/kamiyo/website
npm test                    # Frontend tests
pytest                      # Backend tests

# Check services
docker-compose ps           # Service status
docker-compose logs -f api  # View API logs

# Check API health
curl http://localhost:3001/api/health
curl http://localhost:3001/api/db-stats

# Commit frequently
git add .
git commit -m "Shift #X: Brief description"
git push origin master
```

### Ending Your Shift

```bash
# This runs tests, prompts for commit, updates score
./scripts/shift-end.sh 5
```

---

## 📝 HANDOFF DOCUMENT CHECKLIST

Before ending your shift, ensure your handoff document contains:

### Required Sections

- [x] **Tasks Completed** - Specific details of what you finished
- [x] **Tasks In Progress** - What's not done yet, with status
- [x] **Blockers** - Any issues preventing progress
- [x] **Tests Run** - Actual numbers (X/Y passing)
- [x] **Git Commits** - List of commit SHAs and messages
- [x] **Production Score** - Updated percentage
- [x] **Environment Status** - Service health check results
- [x] **Notes for Next Agent** - Important context

### Quality Guidelines

**✅ Good:**
```markdown
## TASKS COMPLETED ✅

1. Fixed /stats endpoint (404 error)
   - File: api/main.py:145
   - Added router registration
   - Tests: backend 9/11 → 11/11 passing
   - Commit: abc123f

2. Optimized database queries
   - Files: api/routes/exploits.py:67-89
   - Added indexes on chain_id, timestamp
   - Query time: 450ms → 45ms
   - Commit: def456a
```

**❌ Bad:**
```markdown
## TASKS COMPLETED ✅

1. Fixed some API stuff
2. Made it faster
```

---

## 🚨 HANDLING BLOCKERS

If you encounter a blocker:

1. **Document immediately** in your handoff:
   ```markdown
   ## BLOCKERS ⚠️

   1. PostgreSQL migration fails with error "role does not exist"
      - Impact: CRITICAL - Blocks all database operations
      - Error: FATAL:  role "kamiyo_user" does not exist
      - Attempted: Created role manually, still failing
      - Needs: Database admin access or different approach
      - Workaround: Using SQLite for now (not production-ready)
   ```

2. **Try a workaround** if possible

3. **Alert next agent** in "Notes for Next Agent"

4. **Move to next task** - don't let one blocker stop all progress

5. **Update production score** to reflect the impact

---

## 📊 TRACKING PROGRESS

### View Overall Progress

```bash
cat .agent-handoffs/PROGRESS_TRACKER.md
```

Shows:
- Production readiness score over time
- Shift completion status
- Test pass rates
- Priority task completion
- Blockers and issues

### View Current Score

```bash
cat .agent-handoffs/PRODUCTION_SCORE.txt
```

### View Priority Tasks

```bash
# All tasks
cat .agent-handoffs/PRIORITY_TASKS.md

# Just your shift (example: Shift 5)
grep -A 20 "## Shift 5" .agent-handoffs/PRIORITY_TASKS.md
```

---

## 🔍 DEBUGGING COMMON ISSUES

### Docker Services Not Running

```bash
# Start all services
docker-compose up -d

# Check which are failing
docker-compose ps

# View logs
docker-compose logs api
docker-compose logs postgres
```

### Frontend Not Responding

```bash
cd ~/project/Projekter/kamiyo/website
npm install
npm run dev
```

### Backend API Errors

```bash
# Check API logs
docker-compose logs -f api

# Check database connection
curl http://localhost:3001/api/health

# Check connection pool
curl http://localhost:3001/api/db-stats
```

### Tests Failing

```bash
# Frontend tests
npm test -- --verbose

# Backend tests
pytest -v

# Database tests
pytest test_database.py -v
```

### Git Push Fails

```bash
# Pull first
git pull origin master

# Resolve conflicts if any
git status
git add .
git commit -m "Merge conflicts resolved"

# Push
git push origin master
```

---

## 📚 KEY FILES REFERENCE

### Workflow Documentation

| File | Purpose |
|------|---------|
| `3_DAY_PRODUCTION_WORKFLOW.md` | Complete workflow guide |
| `WORKFLOW_QUICK_START.md` | This file - quick reference |
| `.agent-handoffs/README.md` | Handoff system guide |
| `.agent-handoffs/PRIORITY_TASKS.md` | Tasks by shift |
| `.agent-handoffs/PROGRESS_TRACKER.md` | Progress dashboard |

### Platform Documentation

| File | Purpose |
|------|---------|
| `PLATFORM_ASSESSMENT_SUMMARY.md` | Current platform state |
| `PRIORITY_1_ALL_FIXES_COMPLETE.md` | Completed critical fixes |
| `CLAUDE.md` | Project guidelines |
| `README.md` | General project documentation |

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/shift-start.sh` | Start a shift |
| `scripts/shift-end.sh` | End a shift |
| `scripts/status-check.sh` | Quick health check |

---

## 🎯 SUCCESS CRITERIA

### Day 1 (End of Shift 8)
- [ ] Production score: **97%**
- [ ] PostgreSQL deployed and tested
- [ ] All P0 API endpoints working
- [ ] Beta labels added to demo features
- [ ] Frontend tests: >10/19 passing
- [ ] SSL auto-renewal configured
- [ ] Load testing completed (100 users)

### Day 2 (End of Shift 16)
- [ ] Production score: **99%**
- [ ] Frontend tests: >17/19 passing
- [ ] All payment flows tested
- [ ] Security audit passed (no critical issues)
- [ ] Multi-source aggregation active
- [ ] WebSocket tested under load

### Day 3 (End of Shift 24)
- [ ] Production score: **100%** 🎉
- [ ] All tests passing (45/45)
- [ ] Disaster recovery tested
- [ ] Monitoring dashboards live
- [ ] Documentation complete
- [ ] **PRODUCTION READY FOR LAUNCH**

---

## 🚀 QUICK TIPS FOR SUCCESS

1. **Read the handoff** - Previous agent's notes are your roadmap
2. **Test early, test often** - Don't wait until shift end
3. **Commit frequently** - Every hour minimum
4. **Update handoff as you go** - Don't try to remember at the end
5. **Document blockers immediately** - Help the next agent
6. **Focus on your shift's tasks** - Don't try to do everything
7. **Over-communicate** - Better too much detail than too little
8. **Use the scripts** - They're there to help you

---

## 📞 QUICK HELP

### "I don't know where to start"

```bash
# Run these in order:
./scripts/status-check.sh
cat .agent-handoffs/PRIORITY_TASKS.md | grep -A 15 "Shift ${YOUR_SHIFT}"
./scripts/shift-start.sh ${YOUR_SHIFT} ${YOUR_AGENT_TYPE}
```

### "Tests are failing"

1. Check the test logs in `test-results/`
2. Look at previous handoff for context
3. Start services if needed: `docker-compose up -d`
4. Run tests verbosely: `npm test -- --verbose` or `pytest -v`

### "I'm blocked on something"

1. Document it in your handoff (BLOCKERS section)
2. Try a workaround if possible
3. Move to the next task
4. Alert the next agent in "Notes for Next Agent"

### "I finished early"

1. Move to the next shift's tasks if they're related
2. Write extra detailed handoff notes
3. Add test coverage
4. Update documentation
5. Run extra tests

### "I'm running out of time"

1. Update your handoff with current status
2. Mark tasks as "In Progress" with detailed notes
3. Commit what you have (even if incomplete)
4. Give clear next steps to the next agent
5. Don't rush - quality over quantity

---

## 🎉 READY TO START?

### Your First Command

```bash
cd ~/project/Projekter/kamiyo/website
./scripts/status-check.sh
```

### Then Start Shift 1

```bash
./scripts/shift-start.sh 1 Infrastructure
```

**Good luck! Let's get to 100% production readiness! 🚀**

---

## 📖 Additional Resources

- **Workflow:** `~/project/Projekter/kamiyo/website/3_DAY_PRODUCTION_WORKFLOW.md`
- **Handoffs:** `~/project/Projekter/kamiyo/website/.agent-handoffs/`
- **Scripts:** `~/project/Projekter/kamiyo/website/scripts/`
- **Assessment:** `PLATFORM_ASSESSMENT_SUMMARY.md`
- **Guidelines:** `CLAUDE.md`

---

**Questions? Check the handoff README or status tracker!**

Last updated: 2025-10-10
