# Kamiyo Production Testing - Quick Reference Card

**Quick Start Guide - Copy & Paste Commands**

---

## 🚀 Prerequisites (One-Time Setup)

```bash
# 1. Install Python dependencies
pip install pytest httpx pytest-asyncio requests

# 2. Install k6 (macOS)
brew install k6

# 3. Start API server
cd ~/project/Projekter/kamiyo
python api/main.py  # Runs on localhost:8000
```

---

## ✅ Test Execution Commands

### Test 1: k6 Load Test (~10 minutes)
```bash
cd ~/project/Projekter/kamiyo
k6 run k6/production-load-test.js
```
**Expected:** P95 < 800ms, error rate < 5%, rate limiting enforced

---

### Test 2: API Integration Tests (~2 minutes)
```bash
cd ~/project/Projekter/kamiyo
pytest tests/api/tier_enforcement.test.py -v
```
**Expected:** 20+ tests pass, 5 skipped (require API keys)

---

### Test 3: Monitoring Validation (~1 minute)
```bash
cd ~/project/Projekter/kamiyo
python tests/monitoring/validate_logs.py
```
**Expected:** All 12 PCI redaction tests pass

---

### Test 4: Comprehensive Free Tier Test (~2 minutes)
```bash
cd ~/project/Projekter/kamiyo
python test_free_tier_comprehensive.py
```
**Expected:** 24h delay verified, all endpoints working

---

## 📊 Files Created

| File | Purpose |
|------|---------|
| `k6/production-load-test.js` | Load testing (100-200 users) |
| `tests/api/tier_enforcement.test.py` | API integration tests |
| `tests/monitoring/validate_logs.py` | PCI & logging validation |
| `PRODUCTION_CHECKLIST_V2.md` | 152-item readiness checklist |
| `TESTING_README.md` | Comprehensive documentation |

---

## 🎯 Success Criteria

- ✅ k6: P95 < 800ms, errors < 5%
- ✅ pytest: All tests pass (skips OK)
- ✅ PCI: All 12 patterns redacted
- ✅ Checklist: Score >= 95%

---

## 🔧 Quick Troubleshooting

**API not responding?**
```bash
curl http://localhost:8000/health
# If fails, start API: python api/main.py
```

**k6 not installed?**
```bash
brew install k6
```

**pytest not found?**
```bash
pip install pytest httpx pytest-asyncio
```

---

## 📝 After Tests Complete

1. Open `PRODUCTION_CHECKLIST_V2.md`
2. Mark passing items as ✅
3. Calculate: (PASS / Total) × 100
4. If >= 95%: Ready for production! 🚀

---

**Full Documentation:** `TESTING_README.md`
**Summary:** `PRODUCTION_TESTING_SUMMARY.md`
