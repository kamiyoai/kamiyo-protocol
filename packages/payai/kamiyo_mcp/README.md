# KAMIYO MCP Server

**Phase 1 Complete: MCP Foundation & Basic Server**

Model Context Protocol server for real-time crypto exploit intelligence, enabling AI agents (especially Claude Desktop) to access KAMIYO's security intelligence through subscriptions.

## 📁 Project Structure

```
kamiyo/
├── mcp/                          # MCP server implementation
│   ├── __init__.py              # Package initialization
│   ├── config.py                # Configuration management
│   ├── server.py                # Main MCP server (Phase 1 ✅)
│   ├── tools/                   # MCP tool implementations
│   │   └── __init__.py
│   ├── auth/                    # Authentication & subscriptions
│   │   └── __init__.py
│   └── utils/                   # Shared utilities
│       └── __init__.py
├── requirements-mcp.txt         # MCP-specific dependencies
└── scripts/mcp/
    ├── test_local.sh            # Local testing script
    └── validate_structure.py   # Structure validation
```

## 🚀 Phase 1 Deliverables (COMPLETE)

### ✅ 1. MCP Directory Structure
- Created `/mcp` with subdirectories: `tools/`, `auth/`, `utils/`
- All `__init__.py` files in place
- Proper Python package structure

### ✅ 2. Dependencies (requirements-mcp.txt)
```
fastmcp>=0.2.0          # MCP SDK for Python
pydantic>=2.5.0         # Data validation
pyjwt>=2.8.0            # JWT authentication
stripe>=7.0.0           # Subscription management
python-dotenv>=1.0.0    # Environment config
httpx>=0.25.0           # Async HTTP client
structlog>=24.1.0       # Structured logging
```

### ✅ 3. Configuration Management (mcp/config.py)
- Environment-based configuration
- Production validation
- Subscription tier settings
- Rate limiting configuration
- Feature flags

**Key Settings:**
- `MCP_JWT_SECRET`: JWT secret for token signing
- `KAMIYO_API_URL`: KAMIYO API endpoint
- `STRIPE_SECRET_KEY`: Stripe integration
- `DATABASE_URL`: Database connection
- Rate limits per tier (Personal/Team/Enterprise)

### ✅ 4. Basic MCP Server (mcp/server.py)
- FastMCP-based server implementation
- Startup/shutdown handlers
- Error handling
- Production configuration validation

**Implemented Tool:**
- `health_check`: Server health status (no auth required)

**Features:**
- stdio transport (Claude Desktop)
- SSE transport support (web agents)
- Graceful startup/shutdown
- Database connection testing
- API connection testing

### ✅ 5. Testing Infrastructure
- `scripts/mcp/test_local.sh`: Automated local testing
- `scripts/mcp/validate_structure.py`: Structure validation
- Executable permissions set

## 📦 Installation

### Prerequisites
- Python 3.11+ (required)
- KAMIYO API running (for integration tests)
- PostgreSQL or SQLite database

### Quick Start

1. **Install MCP dependencies:**
```bash
pip3.11 install -r requirements-mcp.txt
```

2. **Install main KAMIYO dependencies:**
```bash
pip3.11 install -r requirements.txt
```

3. **Set environment variables:**
```bash
# Development
export ENVIRONMENT="development"
export MCP_JWT_SECRET="dev_jwt_secret_change_in_production"
export KAMIYO_API_URL="http://localhost:8000"

# Production (example)
export ENVIRONMENT="production"
export MCP_JWT_SECRET="<generate-secure-secret>"
export KAMIYO_API_URL="https://api.kamiyo.ai"
export STRIPE_SECRET_KEY="sk_live_..."
export DATABASE_URL="postgresql://..."
```

4. **Validate structure:**
```bash
python3.11 scripts/mcp/validate_structure.py
```

5. **Test server startup:**
```bash
python3.11 -m mcp.server --help
```

## 🧪 Testing

### Validate Structure
```bash
python3.11 scripts/mcp/validate_structure.py
```

Checks:
- ✅ Directory structure
- ✅ Required files
- ✅ Python modules
- ✅ File permissions

### Test Health Check Tool
```bash
# Start server (stdio mode for Claude Desktop)
python3.11 -m mcp.server

# Or SSE mode for web agents
python3.11 -m mcp.server --transport sse --host 127.0.0.1 --port 8002
```

### Automated Testing
```bash
./scripts/mcp/test_local.sh
```

This script:
1. Checks Python 3.11+
2. Creates/activates venv
3. Installs dependencies
4. Starts MCP server
5. Tests health_check tool

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENVIRONMENT` | No | `development` | Environment mode |
| `MCP_SERVER_NAME` | No | `kamiyo-security` | Server name |
| `MCP_SERVER_VERSION` | No | `1.0.0` | Server version |
| `MCP_JWT_SECRET` | Yes (prod) | dev secret | JWT signing secret |
| `MCP_TOKEN_EXPIRY_DAYS` | No | `365` | Token expiration |
| `KAMIYO_API_URL` | No | localhost | KAMIYO API URL |
| `STRIPE_SECRET_KEY` | No | - | Stripe API key |
| `DATABASE_URL` | Yes (prod) | sqlite | Database URL |

### Rate Limiting

| Tier | RPM | Daily Limit |
|------|-----|-------------|
| Personal | 30 | 1,000 |
| Team | 100 | 10,000 |
| Enterprise | 500 | 100,000 |

Configured via environment variables:
- `RATE_LIMIT_PERSONAL_RPM`, `RATE_LIMIT_PERSONAL_DAILY`
- `RATE_LIMIT_TEAM_RPM`, `RATE_LIMIT_TEAM_DAILY`
- `RATE_LIMIT_ENTERPRISE_RPM`, `RATE_LIMIT_ENTERPRISE_DAILY`

### Feature Flags

- `ENABLE_WALLET_MONITORING` (default: true)
- `ENABLE_ADVANCED_ANALYTICS` (default: true)
- `ENABLE_REAL_TIME_ALERTS` (default: true)

## 🔌 MCP Server Usage

### Command Line

```bash
# Help
python3.11 -m mcp.server --help

# stdio transport (Claude Desktop)
python3.11 -m mcp.server --transport stdio

# SSE transport (web agents)
python3.11 -m mcp.server --transport sse --host 0.0.0.0 --port 8002

# With authentication token (testing)
python3.11 -m mcp.server --token <your-jwt-token>
```

### Claude Desktop Integration

1. Install MCP server (see Installation above)

2. Configure Claude Desktop:
```json
// ~/.config/claude/mcp_config.json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3.11",
      "args": [
        "/path/to/kamiyo/mcp/server.py",
        "--token",
        "YOUR_MCP_TOKEN_HERE"
      ],
      "env": {
        "KAMIYO_API_URL": "https://api.kamiyo.ai"
      }
    }
  }
}
```

3. Restart Claude Desktop

4. Test with: "Check KAMIYO MCP server health"

## 🛠️ Available Tools

### 1. health_check (Phase 1)
**No authentication required**

Check MCP server health and status.

**Returns:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 3600,
  "server_name": "kamiyo-security",
  "environment": "production",
  "subscription_service": "operational",
  "api_connection": "connected",
  "database": "connected",
  "timestamp": "2025-10-28T21:00:00"
}
```

---

### 2. search_crypto_exploits (Phase 2) ✨
**Tier-based access: Free (10 results, 24h delay) | Personal (50 results) | Team (200 results) | Enterprise (1000 results)**

Search cryptocurrency exploit database with subscription-tier-based feature gating.

**Parameters:**
- `query` (required): Search term (protocol name, vulnerability type, chain)
- `limit` (optional, default: 10): Maximum results to return (capped by tier)
- `since` (optional): ISO 8601 date filter (e.g., "2024-01-01T00:00:00Z")
- `chain` (optional): Filter by blockchain (Ethereum, BSC, Polygon, etc.)
- `subscription_tier` (internal): User's subscription tier

**Example Usage:**
```python
# Search for Uniswap exploits
result = await search_crypto_exploits(
    query="Uniswap",
    limit=20,
    chain="Ethereum"
)
```

**Returns:**
```json
{
  "exploits": [
    {
      "id": 123,
      "tx_hash": "0x...",
      "chain": "Ethereum",
      "protocol": "Uniswap V2",
      "amount_usd": 1500000.0,
      "timestamp": "2024-01-15T10:30:00Z",
      "source": "BlockSec",
      "category": "Flash Loan Attack",
      "description": "..."
    }
  ],
  "metadata": {
    "total_returned": 10,
    "total_matching": 45,
    "search_time_ms": 42
  },
  "tier_info": {
    "tier": "personal",
    "max_results": 50,
    "data_delay_hours": 0
  },
  "sources": ["BlockSec", "Rekt", "DeFiLlama"]
}
```

---

### 3. assess_defi_protocol_risk (Phase 2) ✨
**Tier-based features: Personal (basic) | Team (+ exploit summary) | Enterprise (+ recommendations)**

Assess security risk for DeFi protocols based on historical exploit data.

**Parameters:**
- `protocol_name` (required): Protocol to assess (e.g., "Uniswap", "Curve")
- `chain` (optional): Filter by blockchain
- `time_window_days` (optional, default: 90): Days of history to analyze (1-365)
- `subscription_tier` (internal): User's subscription tier

**Risk Levels:**
- `low` (0-29): Minimal risk, good security track record
- `medium` (30-59): Moderate risk, some concerns
- `high` (60-84): Significant risk, multiple issues
- `critical` (85-100): Severe risk, urgent action required

**Example Usage:**
```python
# Basic risk assessment
result = await assess_defi_protocol_risk(
    protocol_name="Curve",
    chain="Ethereum",
    time_window_days=180
)
```

**Returns (Personal tier):**
```json
{
  "protocol": "Curve",
  "risk_score": 45,
  "risk_level": "medium",
  "analysis_period_days": 90,
  "assessed_at": "2025-10-28T21:00:00Z"
}
```

**Returns (Team tier adds):**
```json
{
  "exploit_count": 3,
  "total_loss_usd": 2500000.0,
  "last_exploit_date": "2024-12-20",
  "recent_exploits": [...]
}
```

**Returns (Enterprise tier adds):**
```json
{
  "risk_factors": {
    "exploit_frequency_score": 20,
    "severity_score": 15,
    "recency_score": 8,
    "maturity_score": 2
  },
  "recommendations": [
    "Monitor protocol closely for unusual activity",
    "Review recent exploit patterns..."
  ],
  "audit_status": "medium_priority",
  "comparison_to_peers": {
    "percentile": 65,
    "message": "Better than most similar protocols"
  }
}
```

---

### 4. monitor_wallet (Phase 2) ✨
**Team+ Premium Feature Required**

Check if wallet has interacted with exploited protocols.

**Parameters:**
- `wallet_address` (required): Ethereum/EVM (0x...) or Solana address
- `chain` (optional, default: "ethereum"): Blockchain to scan
- `lookback_days` (optional, default: 90): Days to check (1-365)

**Access Control:**
- Returns upgrade prompt for Free/Personal tiers
- Full analysis for Team/Enterprise tiers

**Example Usage:**
```python
# Check Ethereum wallet
result = await monitor_wallet(
    wallet_address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    chain="ethereum",
    lookback_days=90
)
```

**Returns (Team+ tier):**
```json
{
  "wallet_address": "0x742d35...",
  "chain": "ethereum",
  "scan_date": "2025-10-28T21:00:00Z",
  "exploits_checked": 45,
  "interactions_found": [
    {
      "protocol": "Curve Finance",
      "chain": "Ethereum",
      "wallet_interaction_count": 3,
      "last_interaction": "2024-10-15T12:00:00Z",
      "amount_usd": 2500.0,
      "status": "at_risk"
    }
  ],
  "risk_assessment": {
    "risk_level": "medium",
    "score": 42.5,
    "total_at_risk_usd": 5000.0,
    "recommendations": [
      "Review all active positions with exploited protocols",
      "Consider reducing exposure..."
    ]
  }
}
```

**Returns (Free/Personal tier):**
```json
{
  "error": "premium_feature_required",
  "required_tier": "team",
  "upgrade_url": "https://kamiyo.ai/pricing",
  "feature_benefits": [
    "Monitor wallet interactions",
    "Get risk scores and recommendations",
    "Track exposure across chains"
  ],
  "upgrade_required": true
}
```

## 🔐 Security

### Production Deployment Checks

The server validates configuration on startup in production:

- ✅ `MCP_JWT_SECRET` must not be default value
- ✅ `STRIPE_SECRET_KEY` must not use test keys
- ✅ Database connection must be available
- ✅ API connection must be reachable

### Error Handling

- Graceful degradation if API unavailable
- Database connection retry logic
- Comprehensive error logging
- Production-safe error messages

## 📊 Monitoring

### Startup Checks
- Database connectivity
- API connectivity
- Configuration validation
- Environment verification

### Health Status
- `healthy`: All systems operational
- `degraded`: Some systems unavailable
- `unhealthy`: Critical systems down

## ✅ Phase 2: Core MCP Tools (COMPLETE)

### Days 3-4: Core MCP Tools
- [✅] `search_crypto_exploits`: Search exploit database with tier-based limits
- [✅] `assess_defi_protocol_risk`: DeFi protocol risk assessment
- [✅] `monitor_wallet`: Wallet monitoring (Team+ only)

### Days 5-6: Authentication & Subscriptions
- [ ] JWT token generation/verification
- [ ] Stripe webhook integration
- [ ] Subscription-based feature gating
- [ ] Usage tracking
- [ ] Rate limiting implementation

### Days 7-8: Claude Desktop Integration
- [ ] Installation script
- [ ] User documentation
- [ ] Testing suite
- [ ] Integration validation

## 📝 Development Notes

### Code Patterns
- Follows existing KAMIYO API patterns
- Uses Python 3.11+ type hints
- Async/await for I/O operations
- Structured logging with context
- Environment-based configuration

### Dependencies
- Wraps existing KAMIYO API (no duplication)
- Reuses database module from `database/`
- Integrates with existing auth from `api/auth_helpers.py`
- Compatible with x402 payment system

### Testing Strategy
- Structure validation before runtime
- Configuration validation on startup
- Health checks for dependencies
- Integration tests with existing API
- Manual testing with Claude Desktop

## 📖 Documentation

- Phase 1 Plan: `/MCP_DEVELOPMENT_PLAN.md`
- This README: `/mcp/README.md`
- Test Scripts: `/scripts/mcp/`
- Configuration: `mcp/config.py` docstrings
- Server: `mcp/server.py` docstrings

## 🐛 Troubleshooting

### "fastmcp not installed"
```bash
pip3.11 install -r requirements-mcp.txt
```

### "MCP_JWT_SECRET must be set"
```bash
export MCP_JWT_SECRET="your-secure-secret-here"
```

### "Database connection failed"
```bash
# Check database is running
# Verify DATABASE_URL is set correctly
export DATABASE_URL="postgresql://user:pass@localhost:5432/kamiyo"
```

### "API connection failed"
```bash
# Check KAMIYO API is running
# Verify KAMIYO_API_URL is correct
export KAMIYO_API_URL="http://localhost:8000"
```

## ✅ Phase 1 Status: COMPLETE

**Completed:**
- ✅ MCP directory structure
- ✅ Configuration management
- ✅ Basic MCP server
- ✅ Health check tool
- ✅ Testing infrastructure
- ✅ Documentation

**Ready for Phase 2:**
- Core tool implementations
- Authentication system
- Subscription management
- Claude Desktop integration

---

**Version:** 1.0.0
**Status:** Phase 1 Complete
**Last Updated:** 2025-10-28
