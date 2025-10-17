# Subscription Tier System - Comprehensive Audit

**Date**: 2025-10-10
**Status**: In Progress
**Purpose**: Complete audit of subscription tier definitions, API access controls, and feature gating

---

## Executive Summary

This document provides a comprehensive audit of the KAMIYO subscription tier system, identifying:
- Current tier definitions and features
- API endpoints and their tier requirements
- Inconsistencies in access control
- Recommendations for fixes

---

## 1. Subscription Tier Definitions

### Current Tiers

| Tier | Price | API Requests/Day | Historical Data | Key Features |
|------|-------|------------------|-----------------|--------------|
| **Free** | $0 | 1,000 | 7 days | Email alerts only, Public dashboard |
| **Pro** | $99/mo | 50,000 | 90 days | Discord/Telegram alerts, WebSocket feed, Feature extraction |
| **Team** | $299/mo | 200,000 | 1 year | 5 webhooks, 5 seats, Slack, Fork detection, Pattern clustering |
| **Enterprise** | $999/mo | Unlimited | 2+ years | 50 webhooks, Watchlists, Anomaly detection, Fork graph viz |

### Feature Matrix

#### Data Access
- **Free**: 24-hour delayed data, 7-day history
- **Pro**: Real-time data, 90-day history
- **Team**: Real-time data, 1-year history
- **Enterprise**: Real-time data, 2+ year history

####  Alert Channels
- **Free**: Email only (10 alerts/month)
- **Pro**: Email + Discord + Telegram (unlimited)
- **Team**: All Pro + Slack integration
- **Enterprise**: All Team channels

#### Analysis Features
- **Free**: None
- **Pro**: Feature extraction API
- **Team**: Feature extraction + Fork detection + Pattern clustering
- **Enterprise**: All Team + Fork graph visualization + Anomaly detection

#### Integration Features
- **Free**: None
- **Pro**: WebSocket feed
- **Team**: WebSocket + 5 webhook endpoints
- **Enterprise**: WebSocket + 50 webhook endpoints + Protocol watchlists

---

## 2. API Endpoint Inventory

### Public Endpoints (No Auth Required)
```
GET  /api/health          - Health check
GET  /api/chains          - List supported chains
```

### Free Tier Endpoints
```
GET  /api/exploits        - List exploits (delayed 24h, limited to 7 days)
GET  /api/stats           - Basic statistics
GET  /api/subscription/status - Check subscription status
```

### Pro Tier Endpoints
```
All Free tier +
GET  /api/exploits        - Real-time data (no delay, 90-day history)
WS   /api/websocket       - Real-time WebSocket feed
GET  /api/v2/features/*   - Feature extraction APIs
  - /bytecode             - Bytecode analysis
  - /transactions         - Transaction analysis
  - /contracts            - Contract analysis
```

### Team Tier Endpoints
```
All Pro tier +
POST /api/webhooks        - Create webhook
GET  /api/webhooks        - List webhooks (max 5)
PUT  /api/webhooks/:id    - Update webhook
DEL  /api/webhooks/:id    - Delete webhook

GET  /api/slack/authorize - Slack OAuth
POST /api/slack/webhook   - Slack notifications

GET  /api/v2/analysis/fork-detection/:id    - Analyze exploit forks
GET  /api/v2/analysis/fork-families         - List fork families
GET  /api/v2/analysis/fork-family/:id       - Get fork family details
GET  /api/v2/analysis/pattern-cluster/:id   - Pattern clustering analysis
```

### Enterprise Tier Endpoints
```
All Team tier +
POST /api/watchlists      - Create watchlist
GET  /api/watchlists      - List watchlists
PUT  /api/watchlists/:id  - Update watchlist
DEL  /api/watchlists/:id  - Delete watchlist

POST /api/webhooks        - Create webhook (max 50)
GET  /api/webhooks        - List webhooks (max 50)

GET  /api/v2/analysis/fork-graph            - Fork graph visualization data
GET  /api/v2/analysis/pattern-anomalies     - Anomaly detection
GET  /api/v2/analysis/clusters              - All pattern clusters
```

---

## 3. Identified Issues

### Critical Issues

#### Issue #1: Inconsistent Tier Checking
**Location**: Multiple API endpoints
**Problem**: Some endpoints check `tier in ['enterprise', 'team']` while others check `tier.toLowerCase() === 'enterprise'`
**Impact**: Potential authorization bypass
**Fix**: Standardize tier checking to use lowercase comparison with array inclusion

#### Issue #2: Missing Tier Validation in Frontend
**Location**: Pages: `/fork-analysis`, `/anomaly-detection`, `/pattern-clustering`
**Problem**: Pages check tier after loading, should redirect immediately
**Impact**: Poor UX, unnecessary API calls
**Fix**: Add `getServerSideProps` for tier checking before page render

#### Issue #3: Webhook Limit Not Enforced
**Location**: `/api/webhooks/index.js`
**Problem**: No check for webhook count limits (5 for Team, 50 for Enterprise)
**Impact**: Users could exceed their tier limits
**Fix**: Add webhook count check before creation

### Medium Issues

#### Issue #4: Subscription Status API Missing Email
**Location**: `/api/subscription/status`
**Problem**: Requires email parameter but dashboard wasn't passing it
**Status**: ✅ **FIXED** - Dashboard now passes email parameter

#### Issue #5: FastAPI Connection Using Wrong Protocol
**Location**: `/api/exploits.js`
**Problem**: Used `localhost` (IPv6) instead of `127.0.0.1` (IPv4)
**Status**: ✅ **FIXED** - Now uses `127.0.0.1`

#### Issue #6: No Rate Limiting Implementation
**Location**: All API endpoints
**Problem**: Tier rate limits defined but not enforced
**Impact**: Users could exceed API request limits
**Fix**: Implement rate limiting middleware using tier definitions

### Low Issues

#### Issue #7: Inconsistent Tier Names
**Location**: Multiple files
**Problem**: Mix of "guide/architect/creator" (old) and "free/pro/team/enterprise" (new)
**Impact**: Confusion in codebase
**Fix**: Remove all references to old tier names

#### Issue #8: Missing Tier Feature Documentation
**Location**: `/api-docs` page
**Problem**: API docs don't clearly show tier requirements
**Impact**: Users don't know what they can access
**Fix**: Add tier badges to API documentation

---

## 4. Subscription Tier Source of Truth

### Primary Definition
**File**: `/api/subscriptions/tiers.py`

```python
# FREE Tier
TierName.FREE
- Price: $0/month
- API Requests: 100/day, 20/hour, 5/minute
- Historical Data: 7 days
- Real-time: NO
- Alerts: Email only
- Support: Community

# PRO Tier
TierName.PRO
- Price: $99/month
- API Requests: 50,000/day, 5,000/hour, 100/minute
- Historical Data: 90 days
- Real-time: YES
- Alerts: Email + Discord + Telegram
- WebSocket: YES
- Feature Extraction: YES
- Support: Email

# TEAM Tier
TierName.TEAM
- Price: $299/month
- API Requests: 200,000/day, 20,000/hour, 500/minute
- Historical Data: 365 days
- Real-time: YES
- Alerts: All Pro + Slack
- Webhooks: 5
- Seats: 5
- Fork Detection: YES
- Pattern Clustering: YES
- Support: Priority

# ENTERPRISE Tier
TierName.ENTERPRISE
- Price: $999/month
- API Requests: Unlimited (999,999/day)
- Historical Data: 2+ years (36,500 days)
- Real-time: YES
- Alerts: All channels
- Webhooks: 50
- Seats: Unlimited
- Watchlists: YES
- Fork Graph: YES
- Anomaly Detection: YES
- Custom Integrations: YES
- SLA: YES
- Support: Dedicated
```

### Frontend Definition
**File**: `/pages/pricing.js`
- ✅ Matches Python definitions
- ✅ Correctly displays features per tier
- ✅ Proper upgrade CTAs

---

## 5. Access Control Patterns

### Current Pattern (Inconsistent)

**Pattern A** - Used in some endpoints:
```javascript
if (tier === 'enterprise') {
  // Allow access
}
```

**Pattern B** - Used in other endpoints:
```javascript
if (tier in ['enterprise', 'team']) {
  // Allow access
}
```

**Pattern C** - Used in Python APIs:
```python
if user.tier not in ['enterprise', 'team']:
    raise HTTPException(status_code=403)
```

### Recommended Standard Pattern

**For JavaScript/TypeScript**:
```javascript
const TIER_HIERARCHY = {
  free: 0,
  pro: 1,
  team: 2,
  enterprise: 3
};

function hasMinimumTier(userTier, requiredTier) {
  return TIER_HIERARCHY[userTier.toLowerCase()] >= TIER_HIERARCHY[requiredTier.toLowerCase()];
}

// Usage
if (!hasMinimumTier(subscription.tier, 'team')) {
  return res.status(403).json({ error: 'Team tier or higher required' });
}
```

**For Python**:
```python
from api.subscriptions.tiers import TierName, compare_tiers

def require_tier(required_tier: TierName):
    if compare_tiers(user.tier, required_tier) < 0:
        raise HTTPException(status_code=403, detail=f"{required_tier.value} tier required")
```

---

## 6. Recommended Fixes

### Priority 1 (Critical - Security)
1. ✅ Fix subscription status API email parameter (COMPLETED)
2. ✅ Fix FastAPI IPv4/IPv6 connection issue (COMPLETED)
3. **TODO**: Implement tier hierarchy checking utility
4. **TODO**: Add webhook count limits
5. **TODO**: Implement rate limiting per tier

### Priority 2 (High - UX)
1. **TODO**: Add server-side tier checking on protected pages
2. **TODO**: Standardize all tier checks across codebase
3. **TODO**: Add tier requirement badges to API docs
4. **TODO**: Create middleware for automatic tier validation

### Priority 3 (Medium - Maintenance)
1. **TODO**: Remove old tier name references (guide/architect/creator)
2. **TODO**: Add tier feature tests
3. **TODO**: Document tier checking patterns
4. **TODO**: Create tier migration guide

---

## 7. Testing Recommendations

### Unit Tests Needed
```javascript
// Test tier hierarchy
describe('Tier Access Control', () => {
  it('should allow enterprise users to access team features', () => {
    expect(hasMinimumTier('enterprise', 'team')).toBe(true);
  });

  it('should deny free users from pro features', () => {
    expect(hasMinimumTier('free', 'pro')).toBe(false);
  });
});

// Test webhook limits
describe('Webhook Limits', () => {
  it('should enforce 5 webhook limit for team tier', async () => {
    // Create 5 webhooks
    // Attempt 6th webhook
    // Expect 403 error
  });
});
```

### Integration Tests Needed
1. Test full user journey from free -> pro -> team -> enterprise
2. Test tier downgrade scenarios
3. Test rate limiting per tier
4. Test feature access per tier

---

## 8. Next Steps

1. **Immediate**: Implement tier hierarchy checking utility
2. **Short-term**: Add webhook count validation
3. **Medium-term**: Implement rate limiting
4. **Long-term**: Build automated tier testing suite

---

## Appendix A: Tier Comparison Table

| Feature | Free | Pro | Team | Enterprise |
|---------|------|-----|------|------------|
| **Data & Alerts** ||||
| Real-time alerts | ❌ | ✅ | ✅ | ✅ |
| Email alerts | ✅ (10/mo) | ✅ (unlimited) | ✅ (unlimited) | ✅ (unlimited) |
| Discord/Telegram | ❌ | ✅ | ✅ | ✅ |
| Slack integration | ❌ | ❌ | ✅ | ✅ |
| Webhook endpoints | 0 | 0 | 5 | 50 |
| WebSocket feed | ❌ | ✅ | ✅ | ✅ |
| **API Access** ||||
| Requests/day | 1K | 50K | 200K | Unlimited |
| Historical data | 7 days | 90 days | 1 year | 2+ years |
| CSV/JSON export | ✅ | ✅ | ✅ | ✅ |
| **Analysis Features** ||||
| Feature extraction | ❌ | ✅ | ✅ | ✅ |
| Fork detection | ❌ | ❌ | ✅ | ✅ |
| Pattern clustering | ❌ | ❌ | ✅ | ✅ |
| Fork graph viz | ❌ | ❌ | ❌ | ✅ |
| Anomaly detection | ❌ | ❌ | ❌ | ✅ |
| Protocol watchlists | ❌ | ❌ | ❌ | ✅ |
| **Team & Support** ||||
| User seats | 1 | 1 | 5 | Unlimited |
| Support level | Community | Email | Priority | Dedicated |
| SLA guarantee | ❌ | ❌ | ❌ | ✅ |
| Custom integrations | ❌ | ❌ | ✅ | ✅ |

---

**Document Status**: Draft
**Last Updated**: 2025-10-10
**Next Review**: After implementing Priority 1 fixes
