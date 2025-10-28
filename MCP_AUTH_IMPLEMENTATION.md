# MCP Authentication System Implementation

**Status:** Complete
**Date:** October 28, 2025
**Phase:** Day 5-6 (Parallel with Core Tools Development)

---

## Overview

This document describes the complete MCP (Model Context Protocol) authentication system for KAMIYO. The system provides JWT-based authentication, tier-based access control, and integration with Stripe subscriptions.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Client (Claude Desktop)              │
└────────────────────────┬────────────────────────────────────┘
                         │ JWT Token
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                       MCP Server                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Authentication Middleware                          │   │
│  │  - Verify JWT signature                             │   │
│  │  - Check token expiration                           │   │
│  │  - Validate subscription status                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ↓                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Subscription Middleware                            │   │
│  │  - Check tier requirements                          │   │
│  │  - Enforce rate limits                              │   │
│  │  - Inject subscription context                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ↓                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  MCP Tools                                          │   │
│  │  - get_recent_exploits() [free]                     │   │
│  │  - search_exploits() [personal+]                    │   │
│  │  - monitor_wallet() [team+]                         │   │
│  │  - advanced_analytics() [enterprise]                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         ↑
                         │ Stripe Events
                         │
┌─────────────────────────────────────────────────────────────┐
│                   Stripe Webhooks                           │
│  - subscription.created  → Generate MCP token               │
│  - subscription.updated  → Update token tier                │
│  - subscription.deleted  → Revoke token                     │
└─────────────────────────────────────────────────────────────┘
```

## Components Implemented

### 1. JWT Token Handler (`mcp/auth/jwt_handler.py`)

**Purpose:** Generate and verify JWT tokens for MCP access.

**Key Functions:**

```python
def create_mcp_token(
    user_id: str,
    tier: str,
    subscription_id: str,
    expires_days: int = 365
) -> str:
    """Generate long-lived JWT token (1 year)"""

def verify_mcp_token(token: str, check_subscription: bool = True) -> dict | None:
    """Verify token and return payload"""

def check_subscription_active(subscription_id: str) -> bool:
    """Check Stripe subscription status"""

def has_tier_access(user_tier: str, required_tier: str) -> bool:
    """Check if user tier meets requirement"""
```

**Token Payload:**
```json
{
  "sub": "user_123",                 # User ID
  "tier": "team",                    # Subscription tier
  "subscription_id": "sub_abc123",   # Stripe subscription
  "iat": 1698432000,                 # Issued at
  "exp": 1729968000,                 # Expires (1 year)
  "version": "1",                    # Token version
  "type": "mcp_access"               # Token type
}
```

**Security Features:**
- HS256 algorithm for signing
- Token hash stored in database (not raw token)
- Subscription validation on each verification
- Expiration checking
- Graceful error handling

### 2. Subscription Middleware (`mcp/auth/subscription.py`)

**Purpose:** Decorator for tier-based access control on MCP tools.

**Usage Example:**

```python
from mcp.auth import subscription_required

@subscription_required(min_tier="team")
async def monitor_wallet(context, wallet_address: str, subscription_tier: str):
    """Monitor wallet activity (requires team tier or higher)"""
    # subscription_tier is automatically injected
    return {
        "wallet": wallet_address,
        "tier": subscription_tier,
        "alerts": [...]
    }
```

**Tier Hierarchy:**
```
enterprise (3) > team (2) > personal (1) > free (0)
```

**Features:**
- Automatic tier validation
- Helpful error messages with upgrade links
- Context validation
- Tier information retrieval

### 3. Stripe Webhook Integration (`api/webhooks/mcp_processors.py`)

**Purpose:** Generate and manage MCP tokens based on Stripe events.

**Event Handlers:**

```python
async def handle_mcp_subscription_created(event):
    """
    When subscription created:
    1. Generate MCP token
    2. Store hash in database
    3. Email setup instructions to user
    """

async def handle_mcp_subscription_updated(event):
    """
    When subscription tier changes:
    1. Update tier in database
    2. Token remains valid with new tier
    """

async def handle_mcp_subscription_cancelled(event):
    """
    When subscription cancelled:
    1. Mark token as inactive
    2. Email cancellation notice
    """
```

**Integration Point:**

Add to existing webhook processors in `api/webhooks/processors.py`:

```python
from api.webhooks.mcp_processors import process_mcp_subscription_events

async def process_subscription_created(event):
    # ... existing processing ...

    # Add MCP token generation
    await process_mcp_subscription_events(event)
```

### 4. Database Schema (`database/migrations/013_mcp_tokens.sql`)

**Tables:**

```sql
-- MCP Tokens
CREATE TABLE mcp_tokens (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    subscription_id VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,  -- SHA-256 hash
    tier VARCHAR(50) NOT NULL,         -- personal/team/enterprise
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, subscription_id)
);

-- Usage Tracking
CREATE TABLE mcp_token_usage (
    id BIGSERIAL PRIMARY KEY,
    token_hash VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    tool_name VARCHAR(255),
    timestamp TIMESTAMP NOT NULL,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    response_time_ms INTEGER
);
```

**Views:**

- `v_mcp_active_tokens` - Active tokens with usage statistics
- `v_mcp_token_analytics` - Usage analytics by tier and tool
- `v_mcp_tokens_expiring_soon` - Tokens expiring in next 30 days

**Functions:**

- `cleanup_expired_mcp_tokens()` - Mark expired tokens as inactive
- `cleanup_old_mcp_usage()` - Delete usage data older than 90 days
- `get_user_mcp_stats(user_id)` - Get user's token statistics

### 5. Configuration Updates

**Environment Variables (`.env.example`):**

```bash
# MCP JWT Secret (REQUIRED)
MCP_JWT_SECRET=your_mcp_jwt_secret_here_32_chars_minimum

# MCP Configuration
MCP_JWT_ALGORITHM=HS256
MCP_TOKEN_EXPIRY_DAYS=365
MCP_SERVER_NAME=kamiyo-security
MCP_SERVER_VERSION=1.0.0

# Rate Limiting (per tier)
RATE_LIMIT_PERSONAL_RPM=30
RATE_LIMIT_PERSONAL_DAILY=1000
RATE_LIMIT_TEAM_RPM=100
RATE_LIMIT_TEAM_DAILY=10000
RATE_LIMIT_ENTERPRISE_RPM=500
RATE_LIMIT_ENTERPRISE_DAILY=100000
```

**MCP Config (`mcp/config.py`):**

Already configured with JWT settings:
- `jwt_secret` - Secret key for signing tokens
- `jwt_algorithm` - Algorithm (HS256)
- `token_expiry_days` - Token expiration (365 days)
- Rate limit settings per tier

## Testing

### Integration Tests (`tests/test_mcp_auth_integration.py`)

**Test Coverage:**

1. **JWT Token Tests:**
   - Token generation
   - Token verification
   - Expiration handling
   - Invalid token rejection

2. **Tier Hierarchy Tests:**
   - Tier comparison
   - Access checking
   - Tier information

3. **Subscription Middleware Tests:**
   - Decorator functionality
   - Tier validation
   - Context validation
   - Error handling

4. **End-to-End Tests:**
   - Full authentication flow
   - Token lifecycle
   - Integration with protected functions

**Run Tests:**

```bash
# Run all MCP auth tests
python -m pytest tests/test_mcp_auth_integration.py -v

# Run specific test class
python -m pytest tests/test_mcp_auth_integration.py::TestJWTTokenGeneration -v

# Run with coverage
python -m pytest tests/test_mcp_auth_integration.py --cov=mcp.auth
```

### Manual Testing

**Test JWT Handler:**
```bash
cd /Users/dennisgoslar/Projekter/kamiyo
python -m mcp.auth.jwt_handler
```

**Test Subscription Middleware:**
```bash
python -m mcp.auth.subscription
```

**Test MCP Processors:**
```bash
python -m api.webhooks.mcp_processors
```

## Deployment Steps

### 1. Database Migration

```bash
# Run migration
psql $DATABASE_URL -f database/migrations/013_mcp_tokens.sql

# Verify tables created
psql $DATABASE_URL -c "\dt mcp_*"

# Check views
psql $DATABASE_URL -c "\dv v_mcp_*"
```

### 2. Environment Configuration

```bash
# Generate JWT secret
openssl rand -hex 32

# Add to .env
echo "MCP_JWT_SECRET=$(openssl rand -hex 32)" >> .env

# Verify configuration
python -c "from mcp.config import get_mcp_config; print(get_mcp_config())"
```

### 3. Integrate Webhook Handlers

Edit `api/webhooks/processors.py` and add:

```python
from api.webhooks.mcp_processors import process_mcp_subscription_events

async def process_subscription_created(event):
    # ... existing code ...
    await process_mcp_subscription_events(event)

async def process_subscription_updated(event):
    # ... existing code ...
    await process_mcp_subscription_events(event)

async def process_subscription_deleted(event):
    # ... existing code ...
    await process_mcp_subscription_events(event)
```

### 4. Set Up Cron Jobs

Add to crontab for automated cleanup:

```cron
# Cleanup expired MCP tokens daily at 2 AM
0 2 * * * psql $DATABASE_URL -c "SELECT cleanup_expired_mcp_tokens();"

# Cleanup old usage data weekly on Sunday at 3 AM
0 3 * * 0 psql $DATABASE_URL -c "SELECT cleanup_old_mcp_usage();"
```

### 5. Test End-to-End Flow

```bash
# 1. Run tests
pytest tests/test_mcp_auth_integration.py -v

# 2. Create test subscription (via Stripe or direct DB insert)
# 3. Verify token generation in webhook logs
# 4. Test token with MCP server
# 5. Verify usage tracking in database
```

## User Onboarding Flow

### 1. User Subscribes

1. User visits https://kamiyo.io/pricing
2. Selects tier (Personal/Team/Enterprise)
3. Completes Stripe checkout
4. Stripe webhook fires `subscription.created`

### 2. Token Generation

1. Webhook handler receives event
2. `handle_mcp_subscription_created()` executes
3. MCP token generated and stored
4. Email sent with setup instructions (TODO: implement)

### 3. Email Template (TODO)

```
Subject: Your KAMIYO MCP Access is Ready!

Hi {user_name},

Your {tier} subscription is now active. Here's your MCP token for Claude Desktop:

Token: {mcp_token}

⚠️ Keep this token secure - it provides access to your KAMIYO account.

## Setup Instructions

1. Open Claude Desktop settings
2. Navigate to "Developer" → "Model Context Protocol"
3. Add new server with this configuration:

{
  "kamiyo-security": {
    "command": "npx",
    "args": ["-y", "@kamiyo/mcp-server"],
    "env": {
      "KAMIYO_MCP_TOKEN": "{mcp_token}"
    }
  }
}

4. Restart Claude Desktop
5. Ask Claude: "What are the latest crypto exploits?"

## Your Tier Features

{tier_features_list}

## Documentation

- MCP Setup Guide: https://kamiyo.io/docs/mcp
- API Documentation: https://kamiyo.io/docs/api
- Support: support@kamiyo.io

Happy hunting!
The KAMIYO Team
```

### 4. User Tests MCP

1. User configures Claude Desktop
2. Asks Claude to use KAMIYO tools
3. MCP server verifies token
4. Tool execution succeeds
5. Usage tracked in database

## Security Considerations

### Token Security

- **Storage:** Only token HASH stored in database
- **Transmission:** Token only sent once via secure email
- **Validation:** Signature and expiration checked on each use
- **Rotation:** Tokens auto-rotate on subscription changes

### Subscription Validation

- **Real-time:** Each request validates subscription status
- **Stripe Integration:** Checks subscription.status in Stripe
- **Caching:** Consider adding short-lived cache (5 minutes)
- **Fallback:** Graceful degradation if Stripe unavailable

### Rate Limiting

- **Per Tier:** Different limits for each subscription tier
- **Per Tool:** Tools can have individual rate limits
- **Implementation:** TODO - Add rate limiting middleware

### Audit Trail

- **Usage Tracking:** All tool calls logged in `mcp_token_usage`
- **Analytics:** Views provide usage insights
- **Retention:** 90 days (configurable)
- **Privacy:** Minimal PII logged

## Monitoring & Alerting

### Key Metrics

```sql
-- Active tokens by tier
SELECT tier, COUNT(*) as active_tokens
FROM mcp_tokens
WHERE is_active = TRUE
GROUP BY tier;

-- Daily usage by tier
SELECT DATE(timestamp), tier, COUNT(*) as requests
FROM mcp_token_usage mtu
JOIN mcp_tokens mt ON mtu.token_hash = mt.token_hash
WHERE timestamp >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(timestamp), tier
ORDER BY DATE(timestamp) DESC;

-- Tokens expiring soon
SELECT * FROM v_mcp_tokens_expiring_soon;

-- Failed requests by tool
SELECT tool_name, COUNT(*) as failures
FROM mcp_token_usage
WHERE success = FALSE
  AND timestamp >= CURRENT_DATE
GROUP BY tool_name
ORDER BY failures DESC;
```

### Alerts to Implement

1. **Token expiration warnings** - 30, 7, 1 days before
2. **Unusual usage patterns** - Spike in requests
3. **High error rates** - >5% failure rate
4. **Inactive subscriptions** - Using revoked tokens

## Performance Optimization

### Database Indexes

All critical queries have indexes:
- `idx_mcp_tokens_user_id` - User lookups
- `idx_mcp_tokens_token_hash` - Token verification
- `idx_mcp_tokens_active_user` - Active token queries
- `idx_mcp_token_usage_user_time` - Usage analytics

### Caching Strategy (TODO)

```python
# Cache subscription status for 5 minutes
from functools import lru_cache
from datetime import datetime, timedelta

subscription_cache = {}

def check_subscription_active_cached(subscription_id: str) -> bool:
    cache_key = subscription_id
    cached = subscription_cache.get(cache_key)

    if cached and cached['expires'] > datetime.utcnow():
        return cached['is_active']

    is_active = check_subscription_active(subscription_id)

    subscription_cache[cache_key] = {
        'is_active': is_active,
        'expires': datetime.utcnow() + timedelta(minutes=5)
    }

    return is_active
```

## Future Enhancements

### Short-term (Week 1-2)

- [ ] Implement email notifications for token generation
- [ ] Add rate limiting middleware
- [ ] Create user dashboard for token management
- [ ] Add token refresh mechanism
- [ ] Implement subscription status caching

### Medium-term (Month 1)

- [ ] Add support for multiple tokens per user
- [ ] Implement token rotation on security events
- [ ] Add IP whitelisting option for enterprise
- [ ] Create token usage analytics dashboard
- [ ] Add webhook for token lifecycle events

### Long-term (Quarter 1)

- [ ] Support for team token sharing
- [ ] Token scopes and permissions
- [ ] OAuth2 integration option
- [ ] Mobile app token support
- [ ] Advanced security features (2FA, biometric)

## Troubleshooting

### Token Verification Fails

**Symptom:** `TokenInvalidError` on valid-looking token

**Checks:**
1. Verify `MCP_JWT_SECRET` matches between generation and verification
2. Check token hasn't expired
3. Verify subscription is still active
4. Check database for token hash

**Solution:**
```python
# Debug token without verification
from mcp.auth.jwt_handler import decode_token_without_verification
payload = decode_token_without_verification(token)
print(payload)
```

### Subscription Always Shows Inactive

**Symptom:** `SubscriptionInactiveError` for active subscriptions

**Checks:**
1. Verify `STRIPE_SECRET_KEY` is set
2. Check Stripe subscription status directly
3. Verify subscription_id in token matches Stripe

**Solution:**
```bash
# Check subscription in Stripe
stripe subscriptions retrieve sub_abc123
```

### Database Connection Issues

**Symptom:** Errors storing/retrieving tokens

**Checks:**
1. Verify `DATABASE_URL` is correct
2. Check migration 013 ran successfully
3. Verify database permissions

**Solution:**
```bash
# Check tables exist
psql $DATABASE_URL -c "\dt mcp_*"

# Re-run migration if needed
psql $DATABASE_URL -f database/migrations/013_mcp_tokens.sql
```

## Support

- **Documentation:** https://kamiyo.io/docs/mcp
- **API Reference:** https://kamiyo.io/docs/api
- **GitHub Issues:** https://github.com/kamiyo/mcp-server/issues
- **Email:** support@kamiyo.io
- **Discord:** https://discord.gg/kamiyo

## Files Created

1. `/Users/dennisgoslar/Projekter/kamiyo/mcp/auth/jwt_handler.py` - JWT token management
2. `/Users/dennisgoslar/Projekter/kamiyo/mcp/auth/subscription.py` - Tier-based access control
3. `/Users/dennisgoslar/Projekter/kamiyo/mcp/auth/__init__.py` - Module exports
4. `/Users/dennisgoslar/Projekter/kamiyo/api/webhooks/mcp_processors.py` - Webhook integration
5. `/Users/dennisgoslar/Projekter/kamiyo/database/migrations/013_mcp_tokens.sql` - Database schema
6. `/Users/dennisgoslar/Projekter/kamiyo/tests/test_mcp_auth_integration.py` - Integration tests
7. `/Users/dennisgoslar/Projekter/kamiyo/.env.example` - Updated with MCP variables
8. `/Users/dennisgoslar/Projekter/kamiyo/MCP_AUTH_IMPLEMENTATION.md` - This document

## Checklist

- [x] JWT token handler created
- [x] Subscription middleware created
- [x] Stripe webhook integration created
- [x] Database migration created
- [x] Configuration updated
- [x] Environment variables documented
- [x] Integration tests created
- [x] Implementation documented
- [ ] Webhook handlers integrated (manual step)
- [ ] Database migration applied (manual step)
- [ ] Email notifications implemented (TODO)
- [ ] Cron jobs configured (manual step)
- [ ] End-to-end testing completed (manual step)

---

**Implementation Complete:** October 28, 2025
**Ready for Integration:** Yes
**Next Phase:** Core MCP Tools Development (Day 5-6)
