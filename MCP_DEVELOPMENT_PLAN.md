# KAMIYO MCP Server Development Plan
**Status:** Ready to Execute
**Timeline:** 2 weeks (10 working days)
**Architecture:** Opus 4.1 orchestrator + Sonnet 4.5 agents with extended thinking

---

## Executive Summary

Build MCP (Model Context Protocol) server that wraps existing KAMIYO x402 API to enable AI agents (especially Claude Desktop) to access real-time crypto exploit intelligence through subscriptions.

**What's Already Built:**
- ✅ x402 API ($0.01/query, USDC payment)
- ✅ Exploit aggregation from 20+ sources
- ✅ Database with historical exploits
- ✅ Frontend with pricing pages
- ✅ Basic subscription system (needs Stripe alignment)

**What Needs Building:**
- 🔨 MCP server implementation
- 🔨 Subscription authentication & feature gating
- 🔨 MCP tools for security intelligence
- 🔨 Stripe integration refinement
- 🔨 Usage tracking & rate limiting
- 🔨 Claude Desktop configuration
- 🔨 Documentation & marketplace listing

---

## Technical Architecture

### MCP Server Stack

```
┌─────────────────────────────────────────┐
│   Claude Desktop / AI Agent             │
│   (MCP Client)                          │
└──────────────┬──────────────────────────┘
               │ MCP Protocol (stdio/SSE)
               ▼
┌─────────────────────────────────────────┐
│   KAMIYO MCP Server                     │
│   - Authentication Layer                │
│   - Subscription Verification           │
│   - Rate Limiting                       │
│   - Tool Implementations                │
└──────────────┬──────────────────────────┘
               │ Internal API Calls
               ▼
┌─────────────────────────────────────────┐
│   Existing KAMIYO API                   │
│   - Exploit aggregation                 │
│   - Database queries                    │
│   - x402 payment handling               │
└─────────────────────────────────────────┘
```

### Technology Choices

**MCP Server Implementation:**
- **Language:** Python 3.11+ (matches existing API)
- **Framework:** FastMCP or @modelcontextprotocol/sdk (Python)
- **Transport:** stdio (Claude Desktop) + SSE (web agents)
- **Auth:** JWT tokens tied to Stripe subscription IDs

**Why Python:**
- ✅ Existing KAMIYO API is Python (FastAPI)
- ✅ Easy integration with current codebase
- ✅ FastMCP provides excellent Python MCP implementation
- ✅ Team familiarity

---

## Phase 1: MCP Core Infrastructure (Days 1-4)

### Day 1-2: MCP Server Foundation

**Task 1.1: Set up MCP project structure**
```
kamiyo/
├── api/                    # Existing FastAPI
├── mcp/                    # New MCP server
│   ├── __init__.py
│   ├── server.py          # Main MCP server
│   ├── tools/             # MCP tool implementations
│   │   ├── __init__.py
│   │   ├── exploits.py   # Exploit search tools
│   │   ├── risk.py       # Risk assessment tools
│   │   └── monitoring.py # Real-time monitoring
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── subscription.py # Subscription verification
│   │   └── jwt_handler.py  # JWT management
│   ├── config.py          # MCP configuration
│   └── utils.py           # Shared utilities
├── requirements-mcp.txt   # MCP dependencies
└── scripts/
    └── mcp/
        ├── install_claude.sh  # Claude Desktop setup
        └── test_local.sh      # Local testing script
```

**Task 1.2: Install MCP SDK and dependencies**
```bash
# requirements-mcp.txt
fastmcp>=0.2.0
anthropic-mcp>=1.0.0
pydantic>=2.5.0
pyjwt>=2.8.0
stripe>=7.0.0
python-dotenv>=1.0.0
httpx>=0.25.0
```

**Task 1.3: Create basic MCP server**
```python
# mcp/server.py
from fastmcp import FastMCP
from fastmcp.resources import Resource
from fastmcp.tools import Tool
from .auth.subscription import verify_subscription
from .config import MCPConfig

# Initialize MCP server
mcp = FastMCP(
    name="kamiyo-security",
    version="1.0.0",
    description="Real-time crypto exploit intelligence for AI agents"
)

# Server initialization
@mcp.startup
async def startup():
    """Initialize server resources"""
    # Load config
    # Connect to database
    # Verify Stripe connection
    pass

# Health check
@mcp.tool()
async def health_check() -> dict:
    """Check MCP server health"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "subscription_service": "operational"
    }
```

**Deliverables:**
- ✅ MCP project structure created
- ✅ Dependencies installed
- ✅ Basic MCP server running locally
- ✅ Health check tool working

---

### Day 3-4: Core MCP Tools

**Task 2.1: Implement exploit search tool**
```python
# mcp/tools/exploits.py
from fastmcp import FastMCP
from pydantic import BaseModel, Field
from datetime import datetime

class ExploitSearchParams(BaseModel):
    query: str = Field(description="Search query (protocol name, token, vulnerability type)")
    limit: int = Field(default=10, description="Maximum results to return")
    since: str | None = Field(default=None, description="ISO date to search from")

@mcp.tool()
async def search_exploits(
    params: ExploitSearchParams,
    subscription_tier: str  # Injected by auth middleware
) -> dict:
    """
    Search crypto exploit database for security incidents.

    Returns real-time and historical exploit data from 20+ sources
    including CertiK, PeckShield, BlockSec, and more.
    """
    # Feature gating based on subscription
    max_results = {
        "personal": 50,
        "team": 200,
        "enterprise": 1000
    }.get(subscription_tier, 10)

    limit = min(params.limit, max_results)

    # Call existing KAMIYO API
    from api.exploits import search_exploits_internal
    results = await search_exploits_internal(
        query=params.query,
        limit=limit,
        since=params.since
    )

    return {
        "exploits": results,
        "count": len(results),
        "subscription_tier": subscription_tier,
        "sources": ["CertiK", "PeckShield", "BlockSec", ...]
    }
```

**Task 2.2: Implement risk assessment tool**
```python
# mcp/tools/risk.py
@mcp.tool()
async def assess_protocol_risk(
    protocol_name: str,
    chain: str | None = None,
    subscription_tier: str = "personal"
) -> dict:
    """
    Assess security risk for a DeFi protocol.

    Analyzes historical exploits, audit status, TVL, and recent
    suspicious activity to provide risk score.
    """
    # Enterprise only: detailed risk breakdown
    include_details = subscription_tier == "enterprise"

    from api.risk_assessment import assess_risk_internal
    risk_data = await assess_risk_internal(
        protocol=protocol_name,
        chain=chain,
        detailed=include_details
    )

    return {
        "protocol": protocol_name,
        "risk_score": risk_data["score"],  # 0-100
        "risk_level": risk_data["level"],  # low/medium/high/critical
        "factors": risk_data["factors"],
        "recent_exploits": risk_data["exploits"],
        "recommendations": risk_data["recommendations"] if include_details else None
    }
```

**Task 2.3: Implement wallet monitoring tool**
```python
# mcp/tools/monitoring.py
@mcp.tool()
async def check_wallet_interactions(
    wallet_address: str,
    subscription_tier: str = "personal"
) -> dict:
    """
    Check if wallet has interacted with exploited protocols.

    Scans wallet transaction history for interactions with
    protocols that have been exploited.
    """
    # Team+ only feature
    if subscription_tier not in ["team", "enterprise"]:
        return {
            "error": "Wallet monitoring requires Team or Enterprise subscription",
            "upgrade_url": "https://kamiyo.io/pricing"
        }

    from api.wallet_scanner import scan_wallet_internal
    interactions = await scan_wallet_internal(wallet_address)

    return {
        "wallet": wallet_address,
        "risky_interactions": interactions,
        "risk_level": calculate_wallet_risk(interactions),
        "recommendation": "Review and potentially migrate funds"
    }
```

**Deliverables:**
- ✅ 3 core MCP tools implemented
- ✅ Feature gating by subscription tier
- ✅ Integration with existing API
- ✅ Error handling & validation

---

## Phase 2: Authentication & Subscriptions (Days 5-6)

### Day 5: Stripe Integration & Subscription Management

**Task 3.1: Set up Stripe webhook handler**
```python
# api/billing/stripe_webhooks.py (enhance existing)
import stripe
from fastapi import APIRouter, Request, HTTPException

router = APIRouter()

@router.post("/stripe/webhook")
async def handle_stripe_webhook(request: Request):
    """Handle Stripe subscription events"""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, os.getenv("STRIPE_WEBHOOK_SECRET")
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Handle events
    if event["type"] == "customer.subscription.created":
        await handle_subscription_created(event["data"]["object"])
    elif event["type"] == "customer.subscription.updated":
        await handle_subscription_updated(event["data"]["object"])
    elif event["type"] == "customer.subscription.deleted":
        await handle_subscription_cancelled(event["data"]["object"])

    return {"status": "success"}

async def handle_subscription_created(subscription):
    """Create MCP access token when subscription starts"""
    user_id = subscription["metadata"]["user_id"]
    tier = subscription["metadata"]["tier"]  # personal/team/enterprise

    # Generate MCP access token
    from mcp.auth.jwt_handler import create_mcp_token
    token = create_mcp_token(
        user_id=user_id,
        tier=tier,
        subscription_id=subscription["id"]
    )

    # Store in database
    await store_mcp_token(user_id, token, tier)

    # Send email with Claude Desktop setup instructions
    await send_setup_email(user_id, token)
```

**Task 3.2: Implement JWT-based MCP authentication**
```python
# mcp/auth/jwt_handler.py
import jwt
from datetime import datetime, timedelta
from typing import Optional

SECRET_KEY = os.getenv("MCP_JWT_SECRET")
ALGORITHM = "HS256"

def create_mcp_token(
    user_id: str,
    tier: str,
    subscription_id: str,
    expires_days: int = 365
) -> str:
    """Create long-lived JWT for MCP access"""
    payload = {
        "sub": user_id,
        "tier": tier,
        "subscription_id": subscription_id,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=expires_days),
        "type": "mcp_access"
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_mcp_token(token: str) -> Optional[dict]:
    """Verify and decode MCP token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Verify subscription is still active
        from api.billing.subscription import check_subscription_status
        is_active = await check_subscription_status(payload["subscription_id"])

        if not is_active:
            return None

        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
```

**Task 3.3: Implement subscription verification middleware**
```python
# mcp/auth/subscription.py
from functools import wraps
from .jwt_handler import verify_mcp_token

class SubscriptionRequired:
    """Decorator for tools requiring subscription"""

    def __init__(self, min_tier: str = "personal"):
        self.min_tier = min_tier
        self.tier_levels = {
            "personal": 1,
            "team": 2,
            "enterprise": 3
        }

    def __call__(self, func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract token from MCP context
            token = get_mcp_token_from_context()

            # Verify token
            payload = verify_mcp_token(token)
            if not payload:
                raise MCPAuthenticationError("Invalid or expired token")

            # Check tier access
            user_tier = payload["tier"]
            if self.tier_levels[user_tier] < self.tier_levels[self.min_tier]:
                raise MCPAuthorizationError(
                    f"This feature requires {self.min_tier} tier or higher"
                )

            # Inject subscription info into kwargs
            kwargs["subscription_tier"] = user_tier
            kwargs["user_id"] = payload["sub"]

            return await func(*args, **kwargs)

        return wrapper

# Usage in tools
@mcp.tool()
@SubscriptionRequired(min_tier="team")
async def advanced_analytics(subscription_tier: str, user_id: str):
    """Team+ only feature"""
    pass
```

**Deliverables:**
- ✅ Stripe webhooks handling subscription events
- ✅ JWT token generation/verification
- ✅ Subscription-based feature gating
- ✅ Auto-email with Claude Desktop setup

---

### Day 6: Usage Tracking & Rate Limiting

**Task 4.1: Implement usage tracking**
```python
# mcp/utils/usage_tracker.py
from datetime import datetime
from collections import defaultdict

class UsageTracker:
    """Track MCP tool usage per user/subscription"""

    def __init__(self):
        self.usage_db = {}  # In production: use Redis

    async def track_tool_call(
        self,
        user_id: str,
        tool_name: str,
        subscription_tier: str
    ):
        """Record tool usage"""
        timestamp = datetime.utcnow()

        usage_record = {
            "user_id": user_id,
            "tool_name": tool_name,
            "tier": subscription_tier,
            "timestamp": timestamp.isoformat()
        }

        # Store in database
        await store_usage_record(usage_record)

        # Update metrics (for dashboard)
        await increment_usage_counter(user_id, tool_name)

    async def get_user_usage(
        self,
        user_id: str,
        period: str = "month"
    ) -> dict:
        """Get usage stats for user"""
        return await query_usage_stats(user_id, period)

# Decorator to auto-track usage
def track_usage(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        result = await func(*args, **kwargs)

        # Extract context
        user_id = kwargs.get("user_id")
        tier = kwargs.get("subscription_tier")

        # Track
        tracker = UsageTracker()
        await tracker.track_tool_call(user_id, func.__name__, tier)

        return result

    return wrapper
```

**Task 4.2: Implement rate limiting**
```python
# mcp/utils/rate_limiter.py
from datetime import datetime, timedelta

class RateLimiter:
    """Rate limit MCP tool calls by tier"""

    LIMITS = {
        "personal": {"rpm": 30, "daily": 1000},
        "team": {"rpm": 100, "daily": 10000},
        "enterprise": {"rpm": 500, "daily": 100000}
    }

    async def check_rate_limit(
        self,
        user_id: str,
        tier: str
    ) -> tuple[bool, str | None]:
        """
        Check if user is within rate limits.
        Returns (allowed: bool, error_message: str | None)
        """
        limits = self.LIMITS[tier]

        # Check requests per minute
        recent_calls = await count_recent_calls(user_id, minutes=1)
        if recent_calls >= limits["rpm"]:
            return False, f"Rate limit exceeded: {limits['rpm']} requests/minute"

        # Check daily limit
        daily_calls = await count_recent_calls(user_id, hours=24)
        if daily_calls >= limits["daily"]:
            return False, f"Daily limit exceeded: {limits['daily']} requests/day"

        return True, None

# Decorator
def rate_limit(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        user_id = kwargs.get("user_id")
        tier = kwargs.get("subscription_tier")

        limiter = RateLimiter()
        allowed, error = await limiter.check_rate_limit(user_id, tier)

        if not allowed:
            raise MCPRateLimitError(error)

        return await func(*args, **kwargs)

    return wrapper
```

**Deliverables:**
- ✅ Usage tracking for analytics
- ✅ Rate limiting by tier
- ✅ Dashboard data collection
- ✅ Error handling for limits

---

## Phase 3: Claude Desktop Integration (Days 7-8)

### Day 7: Claude Desktop Configuration

**Task 5.1: Create Claude Desktop config template**
```json
// ~/.config/claude/mcp_config.json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python",
      "args": [
        "/path/to/kamiyo/mcp/server.py",
        "--token",
        "YOUR_MCP_TOKEN_HERE"
      ],
      "env": {
        "KAMIYO_API_URL": "https://api.kamiyo.io",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

**Task 5.2: Create installation script**
```bash
#!/bin/bash
# scripts/mcp/install_claude.sh

echo "🔧 Installing KAMIYO MCP Server for Claude Desktop"

# Check if Claude Desktop is installed
if [ ! -d "$HOME/.config/claude" ]; then
    echo "❌ Claude Desktop not found. Please install from https://claude.ai/download"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
if (( $(echo "$PYTHON_VERSION < 3.11" | bc -l) )); then
    echo "❌ Python 3.11+ required. Current: $PYTHON_VERSION"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pip3 install -r requirements-mcp.txt

# Get MCP token
echo ""
echo "Please enter your KAMIYO MCP token:"
echo "(Get it from: https://kamiyo.io/dashboard/api-keys)"
read -r MCP_TOKEN

# Create config
echo "📝 Configuring Claude Desktop..."
cat > ~/.config/claude/mcp_config.json <<EOF
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3",
      "args": [
        "$(pwd)/mcp/server.py",
        "--token",
        "$MCP_TOKEN"
      ],
      "env": {
        "KAMIYO_API_URL": "https://api.kamiyo.io"
      }
    }
  }
}
EOF

echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop"
echo "2. Type: 'Search for recent crypto exploits'"
echo "3. Claude will use KAMIYO MCP tools automatically"
```

**Task 5.3: Create user documentation**
```markdown
# Setting Up KAMIYO with Claude Desktop

## Prerequisites
- Claude Desktop installed
- KAMIYO MCP subscription (Personal/Team/Enterprise)
- Python 3.11+

## Installation

### Option 1: Automated Setup (Recommended)
bash
cd /path/to/kamiyo
./scripts/mcp/install_claude.sh


### Option 2: Manual Setup

1. Install dependencies:
bash
pip install -r requirements-mcp.txt


2. Get your MCP token from [dashboard](https://kamiyo.io/dashboard/api-keys)

3. Configure Claude Desktop:
bash
# Open Claude config
nano ~/.config/claude/mcp_config.json

# Add KAMIYO server
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3",
      "args": ["/path/to/kamiyo/mcp/server.py", "--token", "YOUR_TOKEN"]
    }
  }
}


4. Restart Claude Desktop

## Usage Examples

### Search Recent Exploits
"Show me crypto exploits from the last 7 days"

### Assess Protocol Risk
"What's the security risk of Uniswap?"

### Monitor Wallet
"Has this wallet (0x123...) interacted with any exploited protocols?"

## Troubleshooting

### MCP Server Not Connecting
- Check token is valid: https://kamiyo.io/dashboard/api-keys
- Verify Python 3.11+ installed: `python3 --version`
- Check logs: `~/.config/claude/logs/`

### Rate Limits
- Personal: 30 requests/min, 1,000/day
- Team: 100 requests/min, 10,000/day
- Enterprise: 500 requests/min, 100,000/day
```

**Deliverables:**
- ✅ Claude Desktop config template
- ✅ Automated installation script
- ✅ User documentation
- ✅ Troubleshooting guide

---

### Day 8: Testing & Validation

**Task 6.1: Create MCP test suite**
```python
# tests/mcp/test_mcp_tools.py
import pytest
from mcp.server import mcp
from mcp.auth.jwt_handler import create_mcp_token

@pytest.fixture
def personal_token():
    return create_mcp_token("test_user", "personal", "sub_123")

@pytest.fixture
def team_token():
    return create_mcp_token("test_user", "team", "sub_456")

@pytest.mark.asyncio
async def test_search_exploits(personal_token):
    """Test exploit search with Personal tier"""
    result = await mcp.call_tool(
        "search_exploits",
        {"query": "Uniswap", "limit": 10},
        token=personal_token
    )

    assert result["count"] > 0
    assert result["subscription_tier"] == "personal"
    assert len(result["exploits"]) <= 50  # Personal limit

@pytest.mark.asyncio
async def test_rate_limiting(personal_token):
    """Test rate limits enforce correctly"""
    # Make 31 requests (Personal limit is 30/min)
    for i in range(31):
        if i < 30:
            result = await mcp.call_tool("health_check", {}, token=personal_token)
            assert result["status"] == "healthy"
        else:
            with pytest.raises(MCPRateLimitError):
                await mcp.call_tool("health_check", {}, token=personal_token)

@pytest.mark.asyncio
async def test_feature_gating(personal_token, team_token):
    """Test Team features blocked for Personal tier"""
    # Personal tier can't access wallet monitoring
    with pytest.raises(MCPAuthorizationError):
        await mcp.call_tool(
            "check_wallet_interactions",
            {"wallet_address": "0x123..."},
            token=personal_token
        )

    # Team tier can access it
    result = await mcp.call_tool(
        "check_wallet_interactions",
        {"wallet_address": "0x123..."},
        token=team_token
    )
    assert "risky_interactions" in result
```

**Task 6.2: Manual testing checklist**
```markdown
# MCP Testing Checklist

## Local Testing (Day 8)
- [ ] MCP server starts without errors
- [ ] Health check tool responds
- [ ] All 3 core tools execute successfully
- [ ] Personal tier: search limited to 50 results
- [ ] Team tier: wallet monitoring works
- [ ] Enterprise tier: detailed risk analysis works
- [ ] Invalid token rejected
- [ ] Expired token rejected
- [ ] Rate limiting enforces at 30/min
- [ ] Usage tracked in database

## Claude Desktop Integration (Day 8)
- [ ] Claude Desktop detects MCP server
- [ ] Can call tools through natural language
- [ ] Results display correctly in chat
- [ ] Multiple tool calls in sequence work
- [ ] Error messages shown to user
- [ ] Token refresh works (if expired)

## Subscription Flow (Day 8)
- [ ] Subscribe to Personal → receive email with token
- [ ] Add token to Claude → tools work
- [ ] Upgrade to Team → new features unlock
- [ ] Cancel subscription → tools stop working
- [ ] Resubscribe → tools work again
```

**Deliverables:**
- ✅ Automated test suite
- ✅ Manual testing checklist
- ✅ All tests passing
- ✅ Claude Desktop integration verified

---

## Phase 4: Production Deployment (Days 9-10)

### Day 9: Production Setup

**Task 7.1: Set up MCP server hosting**
```yaml
# docker-compose.yml (add MCP service)
services:
  mcp:
    build:
      context: .
      dockerfile: Dockerfile.mcp
    environment:
      - KAMIYO_API_URL=https://api.kamiyo.io
      - MCP_JWT_SECRET=${MCP_JWT_SECRET}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - DATABASE_URL=${DATABASE_URL}
    ports:
      - "8002:8002"  # MCP SSE endpoint (for web agents)
    depends_on:
      - api
      - postgres
    restart: unless-stopped
```

```dockerfile
# Dockerfile.mcp
FROM python:3.11-slim

WORKDIR /app

COPY requirements-mcp.txt .
RUN pip install --no-cache-dir -r requirements-mcp.txt

COPY mcp/ ./mcp/
COPY api/ ./api/

CMD ["python", "-m", "mcp.server", "--host", "0.0.0.0", "--port", "8002"]
```

**Task 7.2: Set up monitoring**
```python
# mcp/monitoring.py
from prometheus_client import Counter, Histogram, Gauge
import logging

# Metrics
mcp_tool_calls = Counter(
    'mcp_tool_calls_total',
    'Total MCP tool calls',
    ['tool_name', 'tier', 'status']
)

mcp_tool_duration = Histogram(
    'mcp_tool_duration_seconds',
    'MCP tool execution time',
    ['tool_name', 'tier']
)

active_subscriptions = Gauge(
    'mcp_active_subscriptions',
    'Number of active MCP subscriptions',
    ['tier']
)

# Logging
logger = logging.getLogger('kamiyo.mcp')
logger.setLevel(logging.INFO)

# Middleware to track metrics
@mcp.middleware
async def metrics_middleware(call_next, tool_name, params, context):
    tier = context.get('subscription_tier', 'unknown')

    with mcp_tool_duration.labels(tool_name=tool_name, tier=tier).time():
        try:
            result = await call_next()
            mcp_tool_calls.labels(tool_name=tool_name, tier=tier, status='success').inc()
            logger.info(f"Tool call: {tool_name} (tier={tier}) - success")
            return result
        except Exception as e:
            mcp_tool_calls.labels(tool_name=tool_name, tier=tier, status='error').inc()
            logger.error(f"Tool call: {tool_name} (tier={tier}) - error: {str(e)}")
            raise
```

**Task 7.3: Environment configuration**
```bash
# .env.mcp (production)
MCP_JWT_SECRET=your-super-secret-jwt-key-here
MCP_TOKEN_EXPIRY_DAYS=365
KAMIYO_API_URL=https://api.kamiyo.io
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://user:pass@host:5432/kamiyo

# Rate limits (per tier)
RATE_LIMIT_PERSONAL_RPM=30
RATE_LIMIT_PERSONAL_DAILY=1000
RATE_LIMIT_TEAM_RPM=100
RATE_LIMIT_TEAM_DAILY=10000
RATE_LIMIT_ENTERPRISE_RPM=500
RATE_LIMIT_ENTERPRISE_DAILY=100000

# Feature flags
ENABLE_WALLET_MONITORING=true
ENABLE_ADVANCED_ANALYTICS=true
ENABLE_REAL_TIME_ALERTS=true

# Logging
LOG_LEVEL=INFO
SENTRY_DSN=https://...  # Error tracking
```

**Deliverables:**
- ✅ Production Docker setup
- ✅ Monitoring & metrics
- ✅ Environment configuration
- ✅ Error tracking (Sentry)

---

### Day 10: Launch & Documentation

**Task 8.1: Create Anthropic marketplace listing**
```json
// mcp_marketplace_listing.json
{
  "name": "KAMIYO Security Intelligence",
  "slug": "kamiyo-security",
  "description": "Real-time crypto exploit intelligence for AI agents. Access security data from 20+ sources including CertiK, PeckShield, BlockSec.",
  "version": "1.0.0",
  "author": {
    "name": "KAMIYO",
    "url": "https://kamiyo.io",
    "email": "support@kamiyo.io"
  },
  "repository": "https://github.com/kamiyo/mcp-server",
  "license": "MIT",
  "tools": [
    {
      "name": "search_exploits",
      "description": "Search database of crypto exploits and security incidents",
      "parameters": {
        "query": "string",
        "limit": "integer",
        "since": "string (ISO date)"
      }
    },
    {
      "name": "assess_protocol_risk",
      "description": "Assess security risk of DeFi protocols",
      "parameters": {
        "protocol_name": "string",
        "chain": "string (optional)"
      }
    },
    {
      "name": "check_wallet_interactions",
      "description": "Check if wallet interacted with exploited protocols (Team+)",
      "parameters": {
        "wallet_address": "string"
      }
    }
  ],
  "pricing": {
    "model": "subscription",
    "tiers": [
      {
        "name": "Personal",
        "price": 19,
        "currency": "USD",
        "period": "month",
        "limits": {
          "rpm": 30,
          "daily": 1000
        }
      },
      {
        "name": "Team",
        "price": 99,
        "currency": "USD",
        "period": "month",
        "limits": {
          "rpm": 100,
          "daily": 10000
        }
      },
      {
        "name": "Enterprise",
        "price": 299,
        "currency": "USD",
        "period": "month",
        "limits": {
          "rpm": 500,
          "daily": 100000
        }
      }
    ]
  },
  "setup_url": "https://kamiyo.io/mcp/setup",
  "support_url": "https://kamiyo.io/support",
  "categories": ["security", "crypto", "defi", "blockchain"],
  "tags": ["security", "exploits", "risk-assessment", "defi", "crypto"]
}
```

**Task 8.2: Create comprehensive documentation**
```markdown
# KAMIYO MCP Server Documentation

## Overview
KAMIYO provides real-time crypto exploit intelligence for AI agents via MCP.

## Features
- 🔍 Search 10,000+ exploits from 20+ sources
- ⚠️ Assess protocol security risk
- 👛 Monitor wallet interactions (Team+)
- 📊 Real-time data updates
- 🔒 Subscription-based access control

## Quick Start

### 1. Subscribe
Choose a tier at [kamiyo.io/pricing](https://kamiyo.io/pricing):
- **Personal:** $19/mo - Individual developers
- **Team:** $99/mo - Small teams (5 agents)
- **Enterprise:** $299/mo - Unlimited agents

### 2. Get Token
1. Log in to [dashboard](https://kamiyo.io/dashboard)
2. Go to API Keys
3. Copy your MCP token

### 3. Install
bash
curl -sSL https://kamiyo.io/install-mcp.sh | bash


### 4. Configure Claude Desktop
The installer will prompt for your token and configure automatically.

### 5. Use
Open Claude Desktop and say:
- "Search for recent crypto exploits"
- "What's the risk level of Aave?"
- "Check if 0x123... interacted with exploited protocols"

## API Reference

### search_exploits
Search crypto exploit database.

**Parameters:**
- `query` (string): Search query
- `limit` (int, optional): Max results (default: 10)
- `since` (string, optional): ISO date

**Returns:**
json
{
  "exploits": [...],
  "count": 15,
  "subscription_tier": "personal"
}


### assess_protocol_risk
Assess DeFi protocol security.

**Parameters:**
- `protocol_name` (string): Protocol name
- `chain` (string, optional): Blockchain

**Returns:**
json
{
  "protocol": "Uniswap",
  "risk_score": 25,
  "risk_level": "low",
  "factors": [...]
}


### check_wallet_interactions (Team+)
Check wallet for risky interactions.

**Parameters:**
- `wallet_address` (string): Ethereum address

**Returns:**
json
{
  "wallet": "0x123...",
  "risky_interactions": [...],
  "risk_level": "medium"
}


## Rate Limits

| Tier | Requests/Min | Daily Limit |
|------|--------------|-------------|
| Personal | 30 | 1,000 |
| Team | 100 | 10,000 |
| Enterprise | 500 | 100,000 |

## Support
- 📧 Email: support@kamiyo.io
- 💬 Discord: discord.gg/kamiyo
- 📚 Docs: docs.kamiyo.io
```

**Task 8.3: Launch checklist**
```markdown
# MCP Launch Checklist

## Pre-Launch (Day 10 Morning)
- [ ] All tests passing
- [ ] Production environment configured
- [ ] MCP server deployed
- [ ] Stripe webhooks configured
- [ ] Monitoring dashboards set up
- [ ] Documentation published
- [ ] Support email configured

## Launch (Day 10 Afternoon)
- [ ] Submit to Anthropic MCP marketplace
- [ ] Announce on Twitter/X
- [ ] Post in relevant Discord servers
- [ ] Email existing x402 users
- [ ] Update kamiyo.io homepage
- [ ] Publish launch blog post

## Post-Launch (Week 3)
- [ ] Monitor error rates
- [ ] Track signup conversions
- [ ] Gather user feedback
- [ ] Fix any reported bugs
- [ ] Write case studies
- [ ] Reach out to DeFi protocols
```

**Deliverables:**
- ✅ Anthropic marketplace listing
- ✅ Complete documentation
- ✅ Launch checklist
- ✅ Marketing materials

---

## Technical Specifications

### MCP Protocol Support

**Transport Layers:**
1. **stdio** (Primary - Claude Desktop)
   - Direct process communication
   - Lowest latency
   - Best for desktop apps

2. **SSE** (Secondary - Web agents)
   - Server-Sent Events over HTTP
   - For browser-based AI agents
   - Enables web integration

### Authentication Flow

```
1. User subscribes → Stripe webhook fired
2. Backend generates JWT with subscription info
3. Email sent with token + setup instructions
4. User adds token to Claude Desktop config
5. Claude calls MCP server with token
6. Server verifies JWT + checks subscription status
7. Tool executes with tier-based permissions
8. Usage tracked for analytics
```

### Database Schema Additions

```sql
-- MCP tokens table
CREATE TABLE mcp_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    token_hash VARCHAR(255) NOT NULL,  -- Hashed JWT
    subscription_id VARCHAR(255) NOT NULL,  -- Stripe subscription ID
    tier VARCHAR(50) NOT NULL,  -- personal/team/enterprise
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- MCP usage tracking
CREATE TABLE mcp_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    tool_name VARCHAR(100) NOT NULL,
    tier VARCHAR(50) NOT NULL,
    execution_time_ms INTEGER,
    status VARCHAR(20) NOT NULL,  -- success/error/rate_limited
    timestamp TIMESTAMP DEFAULT NOW(),
    INDEX idx_user_timestamp (user_id, timestamp),
    INDEX idx_tool_timestamp (tool_name, timestamp)
);
```

---

## Success Metrics

### Week 1 (Days 11-17)
- **Target:** 10 MCP subscriptions
  - 7 Personal ($19)
  - 2 Team ($99)
  - 1 Enterprise ($299)
- **Revenue:** ~$530/month ($6,360/year ARR)

### Month 1 (Days 11-40)
- **Target:** 50 MCP subscriptions
- **Revenue:** ~$2,500/month ($30K/year ARR)

### Quarter 1 (3 months)
- **Target:** 200 MCP subscriptions
- **Revenue:** ~$10K/month ($120K/year ARR)

### KPIs to Track
- Daily active MCP users
- Tool calls per user
- Conversion rate (trial → paid)
- Churn rate
- NPS score
- Support tickets
- Average tool execution time
- Error rate

---

## Risk Mitigation

### Technical Risks

**Risk: MCP protocol changes**
- Mitigation: Use official Anthropic SDK, monitor changelog
- Contingency: Quick update cycle (< 48 hours)

**Risk: High server costs at scale**
- Mitigation: Existing API costs $0.00012/query (98.8% margin)
- Contingency: Optimize queries, add caching

**Risk: Stripe webhook failures**
- Mitigation: Retry logic, manual reconciliation script
- Contingency: Email notification on webhook failure

### Business Risks

**Risk: Chainalysis builds competing MCP**
- Mitigation: First-mover advantage, better UX
- Contingency: Focus on AI-agent specific features

**Risk: Low adoption of Claude Desktop + MCP**
- Mitigation: Also offer via x402 API (already built)
- Contingency: Pivot to SSE for web agents

**Risk: Users churn after 1 month**
- Mitigation: Show value (exploit alerts, risk reports)
- Contingency: Add more tools, improve accuracy

---

## Next Steps After Launch

### Week 3-4: Iteration
1. Gather user feedback
2. Fix bugs and UX issues
3. Add 2-3 more MCP tools
4. Improve documentation
5. Build case studies

### Month 2-3: Growth
1. Marketing campaigns
2. Partnership with DeFi protocols
3. Integration guides for popular AI agents
4. API for programmatic MCP access
5. Expanded data sources

### Month 4-6: Scale
1. Hire first engineer
2. Build advanced analytics tools
3. Add real-time alert system
4. Expand beyond crypto (tradfi, supply chain)
5. Enterprise white-glove service

---

## Execution Summary

**Total Development Time:** 10 days

**Week 1 (Days 1-5):**
- Days 1-2: MCP server foundation
- Days 3-4: Core tools implementation
- Days 5-6: Authentication & subscriptions

**Week 2 (Days 6-10):**
- Days 7-8: Claude Desktop integration & testing
- Days 9-10: Production deployment & launch

**Team Structure:**
- Orchestrator: Opus 4.1 (planning, architecture, coordination)
- Agents: Sonnet 4.5 with extended thinking (implementation)

**Confidence Level:** HIGH
- x402 API already built (reduces risk)
- MCP is standard protocol (good docs)
- Subscription system mostly done (just Stripe polish)
- Team has Python expertise

---

## Appendix: Code Repository Structure

```
kamiyo/
├── api/                           # Existing FastAPI (x402)
│   ├── exploits.py
│   ├── risk_assessment.py
│   └── billing/
│       ├── routes.py
│       └── stripe_webhooks.py
├── mcp/                           # NEW: MCP server
│   ├── __init__.py
│   ├── server.py                  # Main MCP server
│   ├── config.py
│   ├── tools/
│   │   ├── exploits.py
│   │   ├── risk.py
│   │   └── monitoring.py
│   ├── auth/
│   │   ├── subscription.py
│   │   └── jwt_handler.py
│   └── utils/
│       ├── usage_tracker.py
│       └── rate_limiter.py
├── tests/
│   └── mcp/
│       ├── test_tools.py
│       ├── test_auth.py
│       └── test_rate_limiting.py
├── scripts/
│   └── mcp/
│       ├── install_claude.sh
│       └── test_local.sh
├── docs/
│   └── mcp/
│       ├── README.md
│       ├── api-reference.md
│       └── troubleshooting.md
├── requirements-mcp.txt
├── Dockerfile.mcp
└── docker-compose.yml
```

---

## Ready to Execute?

This plan is ready for immediate execution with:
- ✅ Opus 4.1 orchestrator for planning & coordination
- ✅ Sonnet 4.5 agents with extended thinking for implementation
- ✅ Clear deliverables and success criteria
- ✅ Risk mitigation strategies
- ✅ Realistic timeline (10 days)

Should we proceed with implementation?
