# KAMIYO MCP Server - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Desktop / AI Agent                 │
│                        (MCP Client)                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ MCP Protocol
                         │ (stdio or SSE)
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   KAMIYO MCP Server                          │
│                   (Phase 1: COMPLETE)                        │
├─────────────────────────────────────────────────────────────┤
│  Startup/Shutdown Handlers                                   │
│  ├─ Configuration Validation                                 │
│  ├─ Database Connection Test                                 │
│  └─ API Connection Test                                      │
│                                                              │
│  Tools (Phase 1)                                             │
│  └─ health_check (no auth)                                   │
│     ├─ Server status                                         │
│     ├─ API connection status                                 │
│     └─ Database status                                       │
│                                                              │
│  Tools (Phase 2) [NOT YET IMPLEMENTED]                       │
│  ├─ search_exploits (auth required)                          │
│  ├─ assess_protocol_risk (auth required)                     │
│  └─ check_wallet_interactions (Team+ auth)                   │
│                                                              │
│  Configuration (config.py)                                   │
│  ├─ Environment variables                                    │
│  ├─ Rate limiting per tier                                   │
│  ├─ Feature flags                                            │
│  └─ Security validation                                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Internal API Calls
                         │ (httpx async client)
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Existing KAMIYO API (FastAPI)                   │
├─────────────────────────────────────────────────────────────┤
│  Endpoints:                                                  │
│  ├─ /exploits (search exploits)                              │
│  ├─ /health (health check)                                   │
│  ├─ /stats (statistics)                                      │
│  └─ ... (other endpoints)                                    │
│                                                              │
│  Authentication:                                             │
│  ├─ api/auth_helpers.py                                      │
│  └─ JWT token validation                                     │
│                                                              │
│  Payment System:                                             │
│  └─ api/x402/ (payment verification)                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Database Queries
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Database Layer                             │
├─────────────────────────────────────────────────────────────┤
│  database/                                                   │
│  ├─ manager.py (connection management)                       │
│  ├─ postgres_manager.py (PostgreSQL)                         │
│  └─ query_optimizer.py (performance)                         │
│                                                              │
│  Tables:                                                     │
│  ├─ exploits (historical data)                               │
│  ├─ users (authentication)                                   │
│  ├─ subscriptions (Stripe data)                              │
│  └─ mcp_usage (Phase 2: usage tracking)                      │
└─────────────────────────────────────────────────────────────┘
```

## MCP Server Internal Architecture

```
mcp/
│
├── server.py (Main Entry Point)
│   │
│   ├─ FastMCP Instance
│   │  ├─ Name: "kamiyo-security"
│   │  ├─ Version: "1.0.0"
│   │  └─ Description: "Crypto exploit intelligence"
│   │
│   ├─ Event Handlers
│   │  ├─ @mcp.on_startup()
│   │  │  ├─ Load configuration
│   │  │  ├─ Validate production settings
│   │  │  ├─ Test database connection
│   │  │  ├─ Test API connection
│   │  │  └─ Initialize logging
│   │  │
│   │  └─ @mcp.on_shutdown()
│   │     └─ Cleanup resources
│   │
│   └─ Tools
│      └─ @mcp.tool() health_check
│         ├─ Calculate uptime
│         ├─ Check API status
│         ├─ Check database status
│         └─ Return health object
│
├── config.py (Configuration Management)
│   │
│   ├─ MCPConfig (Dataclass)
│   │  ├─ Server info (name, version, description)
│   │  ├─ API integration (URL, timeout)
│   │  ├─ Authentication (JWT secret, algorithm, expiry)
│   │  ├─ Stripe (keys, webhooks)
│   │  ├─ Database (connection URL)
│   │  ├─ Rate limits (Personal/Team/Enterprise)
│   │  ├─ Feature flags (wallet, analytics, alerts)
│   │  └─ Logging (level, environment)
│   │
│   ├─ load_mcp_config()
│   │  ├─ Load from environment variables
│   │  ├─ Apply defaults
│   │  ├─ Validate production settings
│   │  └─ Return MCPConfig instance
│   │
│   └─ get_mcp_config()
│      └─ Singleton pattern
│
├── tools/ (MCP Tools - Phase 2)
│   ├─ __init__.py
│   ├─ exploits.py [NOT YET]
│   │  └─ search_exploits(query, limit, since)
│   ├─ risk.py [NOT YET]
│   │  └─ assess_protocol_risk(protocol, chain)
│   └─ monitoring.py [NOT YET]
│      └─ check_wallet_interactions(wallet_address)
│
├── auth/ (Authentication - Phase 2)
│   ├─ __init__.py
│   ├─ jwt_handler.py [NOT YET]
│   │  ├─ create_mcp_token()
│   │  └─ verify_mcp_token()
│   └─ subscription.py [NOT YET]
│      └─ verify_subscription()
│
└── utils/ (Utilities - Phase 2)
    ├─ __init__.py
    ├─ usage_tracker.py [NOT YET]
    │  └─ track_tool_call()
    └─ rate_limiter.py [NOT YET]
       └─ check_rate_limit()
```

## Data Flow: health_check Tool

```
1. Claude Desktop
   │
   ├─ User asks: "Check KAMIYO MCP server health"
   │
   └─ MCP Client calls health_check tool
      │
      ▼

2. MCP Server (mcp/server.py)
   │
   ├─ @mcp.tool() health_check()
   │
   ├─ Calculate uptime
   │  └─ server_start_time → uptime_seconds
   │
   ├─ Check API Connection
   │  ├─ httpx.AsyncClient()
   │  ├─ GET {KAMIYO_API_URL}/health
   │  └─ api_status: connected/degraded/disconnected
   │
   ├─ Check Database Connection
   │  ├─ from database import get_db
   │  ├─ db.execute_with_retry("SELECT 1")
   │  └─ db_status: connected/disconnected
   │
   └─ Return Health Object
      │
      {
        "status": "healthy",
        "version": "1.0.0",
        "uptime_seconds": 3600,
        "api_connection": "connected",
        "database": "connected",
        ...
      }
      │
      ▼

3. Claude Desktop
   │
   └─ Displays health status to user
```

## Configuration Loading Flow

```
1. Server Startup
   │
   └─ python3.11 -m mcp.server
      │
      ▼

2. Import Chain
   │
   ├─ from mcp.config import get_mcp_config
   │
   └─ get_mcp_config()
      │
      ├─ Check if _mcp_config exists
      │  └─ No → call load_mcp_config()
      │
      └─ load_mcp_config()
         │
         ├─ Load .env file (python-dotenv)
         │
         ├─ Read environment variables
         │  ├─ ENVIRONMENT
         │  ├─ MCP_JWT_SECRET
         │  ├─ KAMIYO_API_URL
         │  ├─ DATABASE_URL
         │  ├─ STRIPE_SECRET_KEY
         │  └─ ... (25+ variables)
         │
         ├─ Apply defaults (if dev environment)
         │
         ├─ Validate (if production)
         │  ├─ MCP_JWT_SECRET not default?
         │  ├─ STRIPE_SECRET_KEY not test key?
         │  └─ DATABASE_URL set?
         │
         └─ Return MCPConfig instance
            │
            ▼

3. Configuration Available
   │
   └─ Used throughout server:
      ├─ Rate limiting
      ├─ API calls
      ├─ Database connections
      └─ Feature flags
```

## Transport Protocols

### stdio (Claude Desktop)

```
┌─────────────────┐
│ Claude Desktop  │
└────────┬────────┘
         │
         │ stdin/stdout
         │ (JSON-RPC over stdio)
         │
┌────────▼────────┐
│  MCP Server     │
│  (stdio mode)   │
└─────────────────┘

Usage:
  python3.11 -m mcp.server
  python3.11 -m mcp.server --transport stdio
```

### SSE (Web Agents)

```
┌─────────────────┐
│  Web Browser    │
│  AI Agent       │
└────────┬────────┘
         │
         │ HTTP/SSE
         │ (Server-Sent Events)
         │
┌────────▼────────┐
│  MCP Server     │
│  (SSE mode)     │
│  Port: 8002     │
└─────────────────┘

Usage:
  python3.11 -m mcp.server --transport sse --port 8002
```

## Security Architecture

### Production Validation (Startup)

```
Server Start (Production)
│
├─ Check Environment
│  └─ ENVIRONMENT == "production"
│     │
│     └─ YES → Run security checks
│        │
│        ├─ 1. Validate MCP_JWT_SECRET
│        │  ├─ Not empty?
│        │  └─ Not default value?
│        │     └─ FAIL → raise ValueError("Insecure secret")
│        │
│        ├─ 2. Validate STRIPE_SECRET_KEY
│        │  ├─ If set, not test key?
│        │  └─ Not starts with "sk_test_"?
│        │     └─ FAIL → raise ValueError("Test key in prod")
│        │
│        ├─ 3. Check DATABASE_URL
│        │  └─ Is set?
│        │     └─ FAIL → raise ValueError("DB URL required")
│        │
│        ├─ 4. Test Database Connection
│        │  └─ Can connect and query?
│        │     └─ FAIL → raise ConnectionError
│        │
│        └─ 5. Test API Connection
│           └─ Can reach KAMIYO API?
│              └─ FAIL → raise ConnectionError
│
└─ All checks pass → Server starts
```

### Authentication Flow (Phase 2)

```
[NOT YET IMPLEMENTED]

1. User Subscribes (Stripe)
   │
   └─ Stripe webhook fires
      │
      └─ Generate MCP JWT token
         ├─ user_id
         ├─ subscription_tier
         ├─ subscription_id
         └─ expiry (365 days)

2. User Configures Claude Desktop
   │
   └─ Adds token to mcp_config.json

3. Claude Calls MCP Tool
   │
   └─ MCP Server validates token
      ├─ JWT signature valid?
      ├─ Token not expired?
      └─ Subscription active?
         │
         └─ YES → Execute tool with tier permissions
            NO  → Return 401 Unauthorized
```

## Rate Limiting Architecture (Phase 2)

```
[NOT YET IMPLEMENTED]

Tool Call
│
├─ Extract user_id from JWT
│
├─ Get subscription tier
│  ├─ Personal:   30 RPM,  1,000/day
│  ├─ Team:      100 RPM, 10,000/day
│  └─ Enterprise: 500 RPM, 100,000/day
│
├─ Check Rate Limit
│  ├─ Redis counter: user:{id}:minute
│  └─ Redis counter: user:{id}:day
│
├─ Within limit?
│  │
│  ├─ YES → Execute tool
│  │        ├─ Increment counters
│  │        └─ Track usage for analytics
│  │
│  └─ NO  → Return 429 Too Many Requests
│           └─ {error: "Rate limit exceeded"}
```

## Error Handling Strategy

```
Error Occurs
│
├─ Type: ImportError (fastmcp missing)
│  └─ Graceful: Only config available
│     └─ Message: "pip install -r requirements-mcp.txt"
│
├─ Type: ValueError (config invalid)
│  └─ Production: Prevent startup
│     └─ Development: Warning + continue
│
├─ Type: ConnectionError (database)
│  └─ Production: Prevent startup
│     └─ Development: Warning + degraded mode
│
├─ Type: HTTPError (API unreachable)
│  └─ Graceful: Degraded status
│     └─ health_check: api_connection: "disconnected"
│
└─ Type: Exception (unknown)
   └─ Log error
      ├─ Development: Full traceback
      └─ Production: Safe error message
```

## Deployment Architecture (Future)

```
Production Environment
│
├─ Load Balancer (nginx)
│  └─ SSL termination
│
├─ MCP Servers (multiple instances)
│  ├─ Instance 1 (stdio)  → Claude Desktop users
│  ├─ Instance 2 (SSE)    → Web agents
│  └─ Instance 3 (SSE)    → Web agents
│
├─ Redis (shared state)
│  ├─ Rate limiting counters
│  ├─ Session storage
│  └─ Cache
│
├─ KAMIYO API (existing)
│  └─ Exploit data + authentication
│
└─ Database (PostgreSQL)
   ├─ Exploits
   ├─ Users
   ├─ Subscriptions
   └─ MCP usage logs
```

## Technology Stack

### MCP Server (New)
- Python 3.11+
- FastMCP (MCP SDK)
- Pydantic (validation)
- python-dotenv (config)
- httpx (async HTTP)
- PyJWT (authentication)
- Stripe (subscriptions)

### Existing KAMIYO (Integration)
- FastAPI (REST API)
- PostgreSQL/SQLite (database)
- Redis (caching)
- Stripe (payments)
- x402 (crypto payments)

### Infrastructure (Future)
- Docker (containerization)
- nginx (reverse proxy)
- systemd (process management)
- Prometheus (metrics)
- Sentry (error tracking)

---

## Phase Implementation Status

### Phase 1 (Complete) ✅
- ✅ Directory structure
- ✅ Configuration system
- ✅ Basic MCP server
- ✅ Health check tool
- ✅ Testing infrastructure

### Phase 2 (Not Started) 🚧
- 🚧 Core MCP tools
- 🚧 Feature gating
- 🚧 API integration

### Phase 3 (Not Started) ⏳
- ⏳ Authentication
- ⏳ Subscriptions
- ⏳ Rate limiting

### Phase 4 (Not Started) ⏳
- ⏳ Production deployment
- ⏳ Monitoring
- ⏳ Documentation

---

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Status:** Phase 1 Complete
