# Kamiyo.ai Free Tier Comprehensive Test Report
**Test Date:** Fre 10 Okt 2025 15:14:01 CEST
**Test Environment:** localhost:3000

## 1. System Health Check

✅ **PASS:** Health endpoint responding
- Status Code: 200
- Response: ``

## 2. API Endpoints (Anonymous Access)

### 2.1 GET /api/exploits (Anonymous)
❌ **FAIL:** Exploits endpoint not accessible
- Status Code: 404

### 2.2 GET /api/chains (Anonymous)
❌ **FAIL:** Chains endpoint not accessible
- Status Code: 404

### 2.3 GET /api/stats (Anonymous)
❌ **FAIL:** Stats endpoint not accessible
- Status Code: 401

## 3. Rate Limiting Tests

### 3.1 Rate Limit Headers (Anonymous)
ℹ️ **INFO:** No rate limit headers (anonymous users may not be tracked)

## 4. Feature Restriction Tests

### 4.1 Fork Analysis Access
✅ **PASS:** Fork analysis correctly restricted (HTTP 404)

### 4.2 Webhook Creation
⚠️ **WARNING:** Webhook endpoint returned HTTP 404 (expected 401/403)

### 4.3 Watchlist Access
✅ **PASS:** Watchlists correctly restricted (HTTP 404)

## 5. Data Quality Tests

### 5.1 Exploit Data Validation
- Exploits missing tx_hash: 0
0
- Exploits missing chain: 0
0
- Exploits missing timestamp: 0
0
⚠️ **WARNING:** Some exploits missing required fields

### 5.2 Data Freshness (24-hour Delay Verification)
- Current UTC Time: 2025-10-10T13:14:02Z
- 24 Hours Ago: 2025-10-09T13:14:02Z
- Latest exploit timestamp in data: 2025-10-10T13:14:02.224Z
ℹ️ **INFO:** Verify manually that data is at least 24 hours old

## 6. Frontend Accessibility Tests

### 6.1 Main Pages
- **Home Page (/):** HTTP 200 ✅
- **Dashboard (/dashboard):** HTTP 301 ❌
- **Pricing (/pricing):** HTTP 404 ❌
- **About (/about):** HTTP 404 ❌

## 7. Test Summary

### Expected Free Tier Behavior
- ✅ API Requests: 100 per day (rate limiting)
- ✅ Real-time alerts: FALSE (24-hour delayed data)
- ✅ Historical data: 7 days
- ✅ Webhooks: 0 (not allowed)
- ✅ Seats: 1

### Manual Testing Required

The following items require manual browser testing:

1. **Authentication**
   - [ ] Sign in with Google OAuth (free@test.kamiyo.ai)
   - [ ] Verify session persists across refreshes
   - [ ] Check tier badge shows 'Free'

2. **Dashboard UI**
   - [ ] Table sorting works
   - [ ] Table filtering works (chain, protocol)
   - [ ] Pagination works
   - [ ] No console errors
   - [ ] Mobile responsive
   - [ ] 'Delayed data' indicator visible

3. **Rate Limiting**
   - [ ] Make 101 API requests to trigger rate limit
   - [ ] Verify 429 error with upgrade message
   - [ ] Check X-RateLimit headers

4. **Navigation & Links**
   - [ ] All menu items work
   - [ ] No broken links
   - [ ] Fork Analysis link hidden or restricted

5. **Edge Cases**
   - [ ] Empty filter results
   - [ ] Invalid date ranges
   - [ ] Slow network (3G throttling)
   - [ ] XSS attempts in search/filter

---

**Report generated:** Fre 10 Okt 2025 15:14:02 CEST
