# KAMIYO x402 Data Ingestion Extension - Multi-Agent Development Plan

**Version:** 1.0
**Created:** October 28, 2025
**Timeline:** 10-15 weeks (Launch: January-February 2026)
**Orchestrator:** Opus 4.1
**Execution Agents:** Sonnet 4.5 with extended thinking
**Work Schedule:** 1-2 days/week (~10-20 hours)
**Target:** ~1-2 tasks per session with built-in review weeks

---

## Executive Summary

### Vision
Extend KAMIYO's x402 payment facilitator with a **pay-per-use real-time data ingestion layer** that removes API complexity for AI agents. Inspired by Corbits' approach to Nansen API access, this creates a frictionless data gateway where agents pay $0.0001 per query—no keys, no subscriptions, no setup.

### Core Value Proposition
**"One payment, instant data access"** - AI agents send USDC, get real-time blockchain metrics, market prices, onchain analytics. Zero configuration.

### Strategic Fit
- ✅ Extends existing x402 infrastructure (no rewrite)
- ✅ Leverages current multi-chain USDC verification
- ✅ Integrates KAMIYO token staking (10-30% discounts)
- ✅ Adds 20-30% revenue stream from data transactions
- ✅ Positions KAMIYO as "Stripe for AI agent data access"

### Inspiration: Corbits/Nansen
**What we learned:**
- Remove credential management → x402 handles auth automatically
- Pay-per-use over subscriptions → Lower barrier to entry
- Agent-first design → One-line SDK calls
- High-quality data → Partner with Pyth, Chainlink, etc.
- Plugin architecture → Easy to extend

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Research and Design (Weeks 1-2)](#phase-1-research-and-design)
3. [Phase 2: Backend Extension (Weeks 3-6)](#phase-2-backend-extension)
4. [Phase 3: Frontend/SDK Updates (Weeks 7-9)](#phase-3-frontend-sdk-updates)
5. [Phase 4: Testing, Optimization, Launch (Weeks 10-15)](#phase-4-testing-optimization-launch)
6. [Agent Prompts Reference](#agent-prompts-reference)
7. [Integration Points](#integration-points)
8. [Success Metrics](#success-metrics)
9. [Risk Mitigation](#risk-mitigation)

---

## Architecture Overview

### Current State (Existing x402 Infrastructure)

```
┌─────────────────────────────────────────────────────────┐
│              KAMIYO x402 Payment Facilitator            │
│                     (Existing)                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  User Request → 402 Challenge → USDC Payment           │
│              → Verify on Base/Ethereum/Solana          │
│              → Issue JWT Token (24h validity)          │
│              → Access Gated API Endpoints              │
│                                                         │
│  Features:                                             │
│  • Multi-chain USDC verification                       │
│  • Staking tier discounts (10-30%)                     │
│  • No API keys required                                │
│  • Pay-per-request ($0.001 default)                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Target State (With Data Ingestion Extension)

```
┌─────────────────────────────────────────────────────────────────────┐
│              KAMIYO x402 + Data Ingestion Layer                     │
│                     (New Extension)                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────┐      ┌────────────────────────┐   │
│  │   Existing x402 Core       │      │   Data Ingestion Layer │   │
│  │                            │      │        (NEW)           │   │
│  │  • Payment verification    │  +   │  • Real-time feeds     │   │
│  │  • Token issuance          │      │  • Pyth oracles        │   │
│  │  • Tier discounts          │      │  • WebSocket streams   │   │
│  │  • Multi-chain support     │      │  • Batch queries       │   │
│  └────────────────────────────┘      │  • No API keys         │   │
│                                      └────────────────────────┘   │
│                                                                     │
│  New Flow:                                                         │
│  Agent Request → /ingest-data?feed=solana-price                   │
│              → 402 Challenge ($0.0001)                            │
│              → USDC Payment                                        │
│              → Real-Time Data Streamed                            │
│              → No keys, no setup, instant access                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Zero Configuration:** Agents don't manage API keys, subscriptions, or credentials
2. **Pay-Per-Use:** $0.0001 per query (1000x cheaper than subscriptions)
3. **High-Volume Ready:** Batch queries, WebSocket streams, caching
4. **Agent-Native:** One SDK call, automatic payment handling
5. **Extensible:** Plugin architecture for adding new data sources
6. **Token-Integrated:** KAMIYO stakers get 10-30% discounts on data queries

---

## Phase 1: Research and Design (Weeks 1-2)

**Timeline:** Oct 28 - Nov 11, 2025
**Focus:** Map extension architecture, design data sources, plan integration
**Agent Type:** Research Agent (Sonnet 4.5)
**Work Sessions:** 2 sessions (1 session per task)

### TASK 1.1: Feature Mapping and Architecture Design

**Estimated Time:** 8-10 hours
**Agent:** Research Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Research Agent analyzing KAMIYO's existing x402 payment infrastructure
and designing an extension for pay-per-use real-time data ingestion.

CONTEXT:
- KAMIYO has a working x402 payment facilitator (FastAPI backend)
- Current features: HTTP 402 challenges, multi-chain USDC verification,
  pay-per-request, JWT tokens, staking tier discounts (10-30%)
- Located at: /Users/dennisgoslar/Projekter/kamiyo/api/x402/
- Files: middleware.py, payment_verifier.py, payment_tracker.py, routes.py

TASK:
Design an extension that adds real-time data ingestion behind x402 payment gates.

REQUIREMENTS:
1. Analyze existing x402 middleware and identify extension points
2. Design data ingestion architecture inspired by Corbits (frictionless, agent-friendly)
3. Spec new endpoints (e.g., /ingest-data, /stream-data)
4. Define data feed types (blockchain prices, metrics, onchain analytics)
5. Plan integration with existing JWT token system
6. Design batch query support for high-volume use cases
7. Map staking tier discounts to data queries

DELIVERABLES:
1. Architecture document (Markdown)
   - UML diagrams (text-based using Mermaid or ASCII)
   - Extension points in current codebase
   - New API endpoint specifications (OpenAPI/YAML)
   - Data flow diagrams (request → payment → data)

2. Integration plan (Markdown)
   - Which existing files to modify (minimal changes)
   - New files to create
   - Database schema changes (if any)
   - Backwards compatibility strategy

3. Comparison table: x402 current vs extended
   - Features added
   - Pricing model
   - Agent experience improvements

CONSTRAINTS:
- NO major rewrites of existing x402 code
- Leverage current FastAPI/Python stack
- Maintain multi-chain payment support (Base, Ethereum, Solana)
- Keep API simple (one SDK call for agents)

OUTPUT FORMAT:
Create /Users/dennisgoslar/Projekter/kamiyo/docs/x402-data-extension/
├── ARCHITECTURE.md (architecture overview, UML diagrams)
├── API_SPECS.yaml (new endpoint specifications)
└── INTEGRATION_PLAN.md (step-by-step integration guide)

INSPIRATION:
Corbits/Nansen: "No key management, no manual setup, just instant access to data"
Make it that simple for AI agents using KAMIYO.

Begin implementation now. Use extended thinking to reason through architecture.
```

**Success Criteria:**
- ✅ Clear architecture diagrams (Mermaid/ASCII)
- ✅ API specs for 3-5 new endpoints
- ✅ Integration plan with minimal code changes
- ✅ Backwards compatibility maintained
- ✅ Agent-friendly design (1-line SDK usage)

**Estimated Output:**
- 3 documentation files (~2,000 lines total)
- UML diagrams showing request flow
- OpenAPI specs for new endpoints

---

### TASK 1.2: Data Source Integration Research

**Estimated Time:** 8-10 hours
**Agent:** Research Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Research Agent identifying real-time data sources for KAMIYO's
x402 data ingestion extension.

CONTEXT:
- KAMIYO will gate real-time data feeds behind x402 payment challenges
- Target price: $0.0001 per query (need low-cost or free data sources)
- Focus: Blockchain metrics, market prices, onchain analytics
- Must support high-volume agent queries (1000s/day)

TASK:
Research and plan integration with real-time data sources suitable for
pay-per-use gating.

DATA SOURCE CATEGORIES:
1. Blockchain Price Oracles
   - Pyth Network (Solana-native, low latency)
   - Chainlink Price Feeds (multi-chain)
   - DIA oracles (open-source)

2. Onchain Metrics
   - Public RPC nodes (free tier: Alchemy, Infura, QuickNode)
   - Blockchain explorers (Solscan, Etherscan APIs)
   - DeFi TVL/APY data (DefiLlama, CoinGecko)

3. Market Data
   - CoinGecko API (free tier: 50 calls/min)
   - CoinMarketCap API (free tier available)
   - Binance public WebSocket (real-time prices)

REQUIREMENTS:
1. Identify 5-10 free/low-cost data sources
2. Evaluate: Cost, latency, rate limits, reliability
3. Design ingestion architecture (pull vs push, polling vs WebSocket)
4. Plan caching strategy (reduce source API costs)
5. Code stubs for each source integration (Python/TypeScript)
6. Error handling for source downtime (fallback logic)

DELIVERABLES:
1. Data source comparison table (Markdown)
   - Source name, cost, latency, rate limits
   - Pros/cons for agent use cases
   - Recommended sources for MVP

2. Integration code stubs (Python)
   - pyth_oracle.py (Pyth Network integration)
   - chainlink_feeds.py (Chainlink price feeds)
   - coingecko_client.py (market data)
   - websocket_stream.py (real-time streaming)

3. Caching strategy document (Markdown)
   - Redis caching for frequently queried data
   - TTL recommendations per data type
   - Cost savings analysis

CONSTRAINTS:
- Prioritize free/low-cost sources (keep $0.0001 pricing viable)
- Low latency (<500ms query response)
- Solana-native sources preferred (faster, cheaper)
- Fallback options if primary source fails

OUTPUT FORMAT:
Create /Users/dennisgoslar/Projekter/kamiyo/docs/x402-data-extension/
├── DATA_SOURCES.md (comparison table, recommendations)
├── code-stubs/
│   ├── pyth_oracle.py
│   ├── chainlink_feeds.py
│   ├── coingecko_client.py
│   └── websocket_stream.py
└── CACHING_STRATEGY.md (caching design, cost analysis)

REFERENCE MATERIAL:
- Pyth Network: https://pyth.network/ (Solana oracle)
- Chainlink: https://chain.link/data-feeds
- CoinGecko API: https://www.coingecko.com/en/api

Begin research now. Prioritize sources that work well with Solana.
```

**Success Criteria:**
- ✅ 5-10 data sources researched and compared
- ✅ Code stubs for top 3 sources
- ✅ Caching strategy reduces costs by 80%+
- ✅ Latency under 500ms average
- ✅ Fallback logic for source failures

**Estimated Output:**
- 2 documentation files (~1,500 lines)
- 4 Python code stubs (~400 lines total)
- Cost analysis spreadsheet

---

### REVIEW WEEK (Week 2.5)

**Focus:** Test architecture on devnet, refine prompts if needed

**Checkpoint Questions:**
1. Does the architecture extend existing x402 cleanly?
2. Are data sources realistic (cost, latency)?
3. Is the agent experience truly frictionless?
4. Are API specs clear enough for implementation?

**Action:** Adjust Task 1.1/1.2 deliverables based on testing

---

## Phase 2: Backend Extension (Weeks 3-6)

**Timeline:** Nov 11 - Dec 9, 2025
**Focus:** Build ingestion endpoints, integrate data sources, implement caching
**Agent Type:** Backend Agent (Sonnet 4.5)
**Work Sessions:** 5 sessions (1 session per task + review)

### TASK 2.1: Ingestion Endpoint Implementation

**Estimated Time:** 10-12 hours
**Agent:** Backend Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Backend Agent extending KAMIYO's FastAPI middleware with
data ingestion endpoints.

CONTEXT:
- Existing x402 middleware at: /Users/dennisgoslar/Projekter/kamiyo/api/x402/
- Current flow: Request → 402 Challenge → USDC Payment → JWT Token → API Access
- Phase 1 deliverables:
  - /Users/dennisgoslar/Projekter/kamiyo/docs/x402-data-extension/ARCHITECTURE.md
  - /Users/dennisgoslar/Projekter/kamiyo/docs/x402-data-extension/API_SPECS.yaml

TASK:
Implement new /ingest-data endpoint that gates real-time data behind
x402 payment challenges.

REQUIREMENTS:
1. Read Phase 1 architecture docs (ARCHITECTURE.md, API_SPECS.yaml)
2. Create new route: POST /api/v1/ingest-data
   - Parameters: feed_type (e.g., "solana-price"), data_params (JSON)
   - Returns: 402 challenge if no token, or data if payment verified
3. Extend existing middleware.py (minimal changes)
4. Integrate JWT token validation from existing x402 system
5. Connect to data sources (use Phase 1 code stubs as starting point)
6. Price: $0.0001 per query (configurable by feed type)
7. Apply staking tier discounts (10-30% off for KAMIYO stakers)

IMPLEMENTATION DETAILS:
# File: /Users/dennisgoslar/Projekter/kamiyo/api/x402/ingestion.py

from fastapi import APIRouter, HTTPException, Header
from .middleware import verify_x402_token, create_x402_challenge
from .payment_tracker import track_payment
from ..data_sources import pyth_oracle, coingecko_client
import redis

router = APIRouter()
cache = redis.Redis(host='localhost', port=6379, db=1)

@router.post("/ingest-data")
async def ingest_data(
    feed_type: str,
    data_params: dict,
    authorization: str = Header(None)
):
    # 1. Check if user has valid x402 token
    token = verify_x402_token(authorization)

    if not token:
        # Return 402 challenge
        challenge = create_x402_challenge(
            amount_usd=0.0001,
            description=f"Access {feed_type} data feed"
        )
        raise HTTPException(status_code=402, detail=challenge)

    # 2. Fetch data from source (with caching)
    cache_key = f"feed:{feed_type}:{hash(str(data_params))}"
    cached_data = cache.get(cache_key)

    if cached_data:
        return {"data": cached_data, "cached": True}

    # 3. Query data source
    if feed_type == "solana-price":
        data = await pyth_oracle.get_solana_price()
    elif feed_type == "market-overview":
        data = await coingecko_client.get_market_overview()
    else:
        raise HTTPException(status_code=400, detail="Unknown feed type")

    # 4. Cache for 60 seconds
    cache.setex(cache_key, 60, data)

    # 5. Track usage (for analytics)
    await track_payment(token.user_id, feed_type, 0.0001)

    return {"data": data, "cached": False}

DELIVERABLES:
1. New file: /Users/dennisgoslar/Projekter/kamiyo/api/x402/ingestion.py
   - Complete implementation of /ingest-data endpoint
   - Integration with existing x402 middleware
   - Connection to data sources from Phase 1

2. Updated file: /Users/dennisgoslar/Projekter/kamiyo/api/main.py
   - Register new ingestion router
   - Add /ingest-data to API docs

3. Configuration: /Users/dennisgoslar/Projekter/kamiyo/api/x402/config.py
   - Add FEED_PRICES = {"solana-price": 0.0001, "market-overview": 0.0002}
   - Add CACHE_TTL_SECONDS = 60

4. Tests: /Users/dennisgoslar/Projekter/kamiyo/tests/x402/test_ingestion.py
   - Test 402 challenge returned when no token
   - Test data returned when valid token
   - Test caching works correctly
   - Test staking tier discounts applied

CONSTRAINTS:
- Extend existing x402 code (don't rewrite)
- Maintain backwards compatibility
- Use existing payment verification logic
- Follow FastAPI best practices

OUTPUT:
4 files created/updated, fully functional /ingest-data endpoint

Begin implementation now.
```

**Success Criteria:**
- ✅ /ingest-data endpoint works end-to-end
- ✅ 402 challenge issued when no payment
- ✅ Data returned after payment verification
- ✅ Caching reduces source API calls by 80%+
- ✅ Staking discounts applied correctly
- ✅ 90%+ test coverage

**Estimated Output:**
- 1 new file (ingestion.py, ~200 lines)
- 2 updated files (main.py, config.py, ~50 lines changes)
- 1 test file (test_ingestion.py, ~150 lines)

---

### TASK 2.2: Real-Time Streaming and Batch Support

**Estimated Time:** 10-12 hours
**Agent:** Backend Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Backend Agent implementing real-time streaming and batch query
support for KAMIYO's data ingestion layer.

CONTEXT:
- Task 2.1 completed: /ingest-data endpoint working
- Need to add: WebSocket streaming, batch queries for high-volume use
- Inspired by Corbits: Make high-volume queries easy for agents

TASK:
Extend data ingestion with real-time streaming and batch query support.

REQUIREMENTS:

1. WebSocket Streaming Endpoint
   - Endpoint: ws://api.kamiyo.ai/stream-data
   - Agent connects, sends x402 token in first message
   - Server streams real-time data (e.g., price updates every 1 second)
   - Pricing: $0.01 per 24-hour stream (much cheaper than per-query)

2. Batch Query Support
   - Endpoint: POST /api/v1/ingest-data/batch
   - Agent sends array of queries: [
       {"feed_type": "solana-price"},
       {"feed_type": "ethereum-price"},
       {"feed_type": "bitcoin-price"}
     ]
   - Server processes in parallel, returns array of results
   - Pricing: $0.0001 × num_queries, with bulk discount (10+ queries: 20% off)

3. Extended Token Validity
   - 24-hour x402 tokens cover unlimited streaming (once paid)
   - Batch queries deduct from token balance incrementally

IMPLEMENTATION:

# File: /Users/dennisgoslar/Projekter/kamiyo/api/x402/streaming.py

from fastapi import WebSocket, WebSocketDisconnect
from .middleware import verify_x402_token
from ..data_sources import pyth_oracle
import asyncio

@router.websocket("/stream-data")
async def stream_data(websocket: WebSocket):
    await websocket.accept()

    try:
        # 1. Receive x402 token from client
        token_msg = await websocket.receive_json()
        token = verify_x402_token(token_msg.get("token"))

        if not token:
            await websocket.send_json({"error": "Invalid x402 token"})
            await websocket.close()
            return

        # 2. Check token paid for streaming ($0.01)
        if token.amount_paid < 0.01:
            await websocket.send_json({
                "error": "Insufficient payment for streaming",
                "required": 0.01,
                "paid": token.amount_paid
            })
            await websocket.close()
            return

        # 3. Stream data every 1 second for 24 hours
        start_time = time.time()
        while time.time() - start_time < 86400:  # 24 hours
            # Fetch latest price
            price_data = await pyth_oracle.get_solana_price()

            await websocket.send_json({
                "timestamp": time.time(),
                "data": price_data
            })

            await asyncio.sleep(1)

        await websocket.close()

    except WebSocketDisconnect:
        print(f"Client disconnected")

# File: /Users/dennisgoslar/Projekter/kamiyo/api/x402/batch.py

@router.post("/ingest-data/batch")
async def batch_ingest(
    queries: List[dict],
    authorization: str = Header(None)
):
    token = verify_x402_token(authorization)

    if not token:
        # Batch requires upfront payment
        total_cost = len(queries) * 0.0001
        if len(queries) >= 10:
            total_cost *= 0.8  # 20% bulk discount

        challenge = create_x402_challenge(
            amount_usd=total_cost,
            description=f"Batch query: {len(queries)} requests"
        )
        raise HTTPException(status_code=402, detail=challenge)

    # Process queries in parallel
    results = await asyncio.gather(*[
        ingest_single_query(q) for q in queries
    ])

    return {"results": results, "count": len(results)}

DELIVERABLES:
1. streaming.py - WebSocket streaming implementation
2. batch.py - Batch query implementation
3. Updated config.py - Add STREAM_PRICE=0.01, BATCH_DISCOUNT=0.2
4. Tests - test_streaming.py, test_batch.py

CONSTRAINTS:
- WebSocket connections must be stable (handle reconnects)
- Batch queries process in parallel (use asyncio)
- Extend 24-hour x402 tokens (don't require new payment each query)

OUTPUT:
3 new files, fully functional streaming + batch support

Begin implementation now.
```

**Success Criteria:**
- ✅ WebSocket streaming works for 24 hours
- ✅ Batch queries process in parallel
- ✅ Bulk discount (20%) applied for 10+ queries
- ✅ 24-hour token covers unlimited streaming
- ✅ Graceful handling of disconnects/errors

**Estimated Output:**
- 2 new files (streaming.py, batch.py, ~300 lines total)
- 2 test files (test_streaming.py, test_batch.py, ~200 lines)
- Updated config.py (~20 lines changes)

---

### TASK 2.3: Agent SDK Error Handling and Simplification

**Estimated Time:** 8-10 hours
**Agent:** Backend Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Backend Agent simplifying KAMIYO's data ingestion layer for AI agents,
inspired by Corbits' "no setup, just instant access" philosophy.

CONTEXT:
- Tasks 2.1-2.2 completed: /ingest-data, streaming, batch endpoints working
- Goal: Make it so easy an agent can use it with ONE LINE of code
- Inspired by Corbits: Remove all complexity, auto-handle payments

TASK:
Implement automatic retry, fallback, and error simplification logic so agents
never have to handle 402 challenges manually.

REQUIREMENTS:

1. SDK Auto-Payment Handling
   - Agent calls: data = kamiyo.ingest("solana-price")
   - SDK automatically:
     a) Detects 402 challenge
     b) Sends USDC payment
     c) Waits for confirmation
     d) Retries with token
     e) Returns data
   - Agent never sees 402 error (all handled internally)

2. Automatic Retries
   - If data source fails → try fallback source
   - If payment fails → retry with exponential backoff
   - If network error → retry up to 3 times

3. Intelligent Fallbacks
   - Primary: Pyth oracle (fast, Solana-native)
   - Fallback 1: Chainlink (if Pyth down)
   - Fallback 2: CoinGecko API (if both oracles down)
   - Agent never knows which source was used (transparent)

4. Error Simplification
   - Technical errors → friendly messages
   - Example: "RPC node timeout" → "Data temporarily unavailable, retrying..."
   - Never expose internal implementation details

IMPLEMENTATION:

# File: /Users/dennisgoslar/Projekter/kamiyo/api/x402/error_handler.py

from tenacity import retry, stop_after_attempt, wait_exponential
import logging

class DataIngestError(Exception):
    """Friendly error messages for agents"""
    pass

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
async def fetch_with_fallback(feed_type: str):
    """
    Tries multiple data sources in order of preference.
    Agent never knows which source was used.
    """
    sources = [
        ("Pyth", pyth_oracle.get_price),
        ("Chainlink", chainlink_feeds.get_price),
        ("CoinGecko", coingecko_client.get_price)
    ]

    errors = []
    for source_name, fetch_func in sources:
        try:
            data = await fetch_func(feed_type)
            logging.info(f"Data fetched from {source_name}")
            return data
        except Exception as e:
            errors.append(f"{source_name}: {str(e)}")
            continue

    # All sources failed
    raise DataIngestError(
        "Data temporarily unavailable. All sources failed. "
        f"Please try again in a few seconds. Details: {'; '.join(errors)}"
    )

def simplify_error(error: Exception) -> str:
    """
    Convert technical errors to friendly messages.
    """
    error_str = str(error).lower()

    if "timeout" in error_str or "connection" in error_str:
        return "Network connection issue. Retrying automatically..."

    if "rate limit" in error_str:
        return "Too many requests. Please wait a few seconds and try again."

    if "unauthorized" in error_str or "403" in error_str:
        return "Payment verification failed. Please ensure USDC payment was sent correctly."

    if "404" in error_str:
        return "Data feed not found. Check feed_type parameter."

    # Generic fallback
    return f"Something went wrong: {error_str}"

# File: /Users/dennisgoslar/Projekter/kamiyo/api/x402/auto_payment.py

async def auto_handle_402(response, wallet):
    """
    Automatically handle 402 challenges (used by SDK).
    Agent never manually handles 402 - SDK does it transparently.
    """
    if response.status_code != 402:
        return response

    # 1. Extract payment details from 402 challenge
    challenge = response.json()
    amount = challenge["amount_usd"]
    payment_address = challenge["payment_address"]

    # 2. Send USDC payment automatically
    tx_hash = await wallet.send_usdc(
        to=payment_address,
        amount=amount,
        network="solana"  # or Base/Ethereum based on user preference
    )

    # 3. Wait for confirmation (max 30 seconds)
    await wait_for_confirmation(tx_hash, timeout=30)

    # 4. Retry original request with payment proof
    response = await retry_with_token(
        original_url=response.url,
        tx_hash=tx_hash
    )

    return response

DELIVERABLES:
1. error_handler.py - Retry logic, fallbacks, error simplification
2. auto_payment.py - Automatic 402 challenge handling (for SDK)
3. Updated ingestion.py - Use fetch_with_fallback() instead of direct source calls
4. Tests - test_error_handling.py (test all failure scenarios)

INSPIRATION:
Corbits: "No credential management, no setup, just instant access"
Make KAMIYO equally frictionless.

OUTPUT:
3 new files, bulletproof error handling that agents never have to think about

Begin implementation now.
```

**Success Criteria:**
- ✅ Agents use SDK with 1 line: `data = kamiyo.ingest("solana-price")`
- ✅ Automatic retry on failure (3 attempts)
- ✅ Fallback to 2nd/3rd data sources if primary fails
- ✅ 402 payments handled automatically by SDK
- ✅ Friendly error messages (no technical jargon)
- ✅ 99.9% uptime via multi-source fallbacks

**Estimated Output:**
- 2 new files (error_handler.py, auto_payment.py, ~250 lines)
- Updated ingestion.py (~50 lines changes)
- 1 test file (test_error_handling.py, ~180 lines)

---

### REVIEW WEEK (Week 5.5)

**Focus:** Simulate agent requests, test error scenarios, debug edge cases

**Checkpoint Questions:**
1. Can an agent truly use the API with 1 line of code?
2. Do automatic retries/fallbacks work in practice?
3. Is error handling graceful (no crashes)?
4. Does caching significantly reduce costs?

**Action:** Debug issues found during testing, refine error messages

---

## Phase 3: Frontend/SDK Updates and Token Tie-In (Weeks 7-9)

**Timeline:** Dec 9 - Dec 30, 2025
**Focus:** Developer SDK, dashboard UI, KAMIYO token integration
**Agent Types:** Frontend Agent, SDK Agent (Sonnet 4.5)
**Work Sessions:** 4 sessions (1 per task + review)

### TASK 3.1: Developer SDK Extension (Python + JavaScript)

**Estimated Time:** 10-12 hours
**Agent:** SDK Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are an SDK Agent creating a developer-friendly SDK for KAMIYO's
data ingestion layer.

CONTEXT:
- Backend endpoints complete: /ingest-data, /stream-data, /batch
- Goal: One-line SDK usage for AI agents (Python + JavaScript)
- Inspired by Corbits: Make it so simple agents can use it autonomously

TASK:
Create Python and JavaScript SDKs that abstract all x402 payment complexity.

REQUIREMENTS:

1. Python SDK (for AI agents, backend services)
   - Installation: pip install kamiyo-sdk
   - Usage:
     ```python
     from kamiyo import KamiyoClient

     client = KamiyoClient(wallet="your_solana_address")

     # One-line data access
     price = client.ingest("solana-price")

     # Streaming
     for data in client.stream("solana-price"):
         print(data)

     # Batch
     results = client.batch([
         {"feed": "solana-price"},
         {"feed": "ethereum-price"}
     ])
     ```

2. JavaScript SDK (for web apps, Node.js agents)
   - Installation: npm install @kamiyo/sdk
   - Usage:
     ```javascript
     import { KamiyoClient } from '@kamiyo/sdk';

     const client = new KamiyoClient({ wallet: 'your_address' });

     // One-line data access
     const price = await client.ingest('solana-price');

     // Streaming
     client.stream('solana-price', (data) => {
         console.log(data);
     });

     // Batch
     const results = await client.batch([
         {feed: 'solana-price'},
         {feed: 'ethereum-price'}
     ]);
     ```

3. Automatic Payment Handling
   - SDK detects 402 challenges
   - SDK sends USDC payment automatically
   - SDK retries with token
   - Developer never handles 402 manually

4. Wallet Integration
   - Support Phantom wallet (Solana)
   - Support MetaMask (Ethereum/Base)
   - Auto-detect network and use correct chain

5. Caching (Client-Side)
   - SDK caches data for 60 seconds
   - Reduces API calls (saves money)
   - Agent doesn't re-query same data repeatedly

IMPLEMENTATION:

# Python SDK: /Users/dennisgoslar/Projekter/kamiyo/sdk/python/kamiyo_sdk/client.py

import requests
import websocket
from typing import List, Dict, Generator
from .wallet import SolanaWallet

class KamiyoClient:
    def __init__(self, wallet_address: str, api_url: str = "https://api.kamiyo.ai"):
        self.api_url = api_url
        self.wallet = SolanaWallet(wallet_address)
        self.token = None
        self.cache = {}

    def ingest(self, feed_type: str, **params) -> dict:
        """
        One-line data ingestion with automatic payment handling.

        Example:
            price = client.ingest("solana-price")
        """
        # Check cache first
        cache_key = f"{feed_type}:{params}"
        if cache_key in self.cache:
            cached_time, cached_data = self.cache[cache_key]
            if time.time() - cached_time < 60:  # 60 second TTL
                return cached_data

        # Make request
        response = requests.post(
            f"{self.api_url}/api/v1/ingest-data",
            json={"feed_type": feed_type, "data_params": params},
            headers={"Authorization": f"Bearer {self.token}"} if self.token else {}
        )

        # Handle 402 challenge automatically
        if response.status_code == 402:
            challenge = response.json()
            self.token = self._handle_payment(challenge)

            # Retry with token
            response = requests.post(
                f"{self.api_url}/api/v1/ingest-data",
                json={"feed_type": feed_type, "data_params": params},
                headers={"Authorization": f"Bearer {self.token}"}
            )

        data = response.json()["data"]

        # Cache result
        self.cache[cache_key] = (time.time(), data)

        return data

    def _handle_payment(self, challenge: dict) -> str:
        """
        Automatically send USDC payment and get x402 token.
        Agent never has to call this manually.
        """
        # Send USDC via Solana
        tx_hash = self.wallet.send_usdc(
            to=challenge["payment_address"],
            amount=challenge["amount_usd"]
        )

        # Submit payment proof and get token
        token_response = requests.post(
            f"{self.api_url}/api/v1/x402/verify-payment",
            json={"tx_hash": tx_hash, "network": "solana"}
        )

        return token_response.json()["token"]

    def stream(self, feed_type: str) -> Generator:
        """
        Stream real-time data for 24 hours (one payment).

        Example:
            for data in client.stream("solana-price"):
                print(data)
        """
        ws = websocket.WebSocketApp(
            f"wss://api.kamiyo.ai/stream-data",
            on_open=lambda ws: ws.send(json.dumps({"token": self.token})),
            on_message=lambda ws, msg: yield json.loads(msg)
        )
        ws.run_forever()

# JavaScript SDK: /Users/dennisgoslar/Projekter/kamiyo/sdk/javascript/src/client.ts

export class KamiyoClient {
  private wallet: any;
  private token: string | null = null;
  private cache: Map<string, {time: number, data: any}> = new Map();

  constructor(config: {wallet: string, apiUrl?: string}) {
    this.wallet = new SolanaWallet(config.wallet);
    this.apiUrl = config.apiUrl || 'https://api.kamiyo.ai';
  }

  async ingest(feedType: string, params: any = {}): Promise<any> {
    // Check cache
    const cacheKey = `${feedType}:${JSON.stringify(params)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < 60000) {
      return cached.data;
    }

    // Make request
    let response = await fetch(`${this.apiUrl}/api/v1/ingest-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && {'Authorization': `Bearer ${this.token}`})
      },
      body: JSON.stringify({feed_type: feedType, data_params: params})
    });

    // Handle 402 automatically
    if (response.status === 402) {
      const challenge = await response.json();
      this.token = await this.handlePayment(challenge);

      // Retry with token
      response = await fetch(`${this.apiUrl}/api/v1/ingest-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({feed_type: feedType, data_params: params})
      });
    }

    const data = (await response.json()).data;

    // Cache
    this.cache.set(cacheKey, {time: Date.now(), data});

    return data;
  }

  stream(feedType: string, callback: (data: any) => void): void {
    const ws = new WebSocket(`wss://api.kamiyo.ai/stream-data`);

    ws.onopen = () => {
      ws.send(JSON.stringify({token: this.token}));
    };

    ws.onmessage = (event) => {
      callback(JSON.parse(event.data));
    };
  }
}

DELIVERABLES:
1. Python SDK
   - /sdk/python/kamiyo_sdk/ (package structure)
   - client.py, wallet.py, __init__.py
   - setup.py, README.md

2. JavaScript SDK
   - /sdk/javascript/src/ (TypeScript source)
   - client.ts, wallet.ts, index.ts
   - package.json, README.md

3. Documentation
   - /sdk/QUICKSTART.md (getting started guide)
   - /sdk/API_REFERENCE.md (full API docs)
   - Code examples for common use cases

4. Tests
   - Python: tests/test_client.py
   - JavaScript: tests/client.test.ts

CONSTRAINTS:
- SDK must work with Solana, Ethereum, Base wallets
- Automatic payment handling (no manual 402 handling)
- Client-side caching (60 second TTL)
- TypeScript for JS SDK (type safety)

OUTPUT:
2 complete SDKs (Python + JavaScript), fully documented and tested

Begin implementation now.
```

**Success Criteria:**
- ✅ One-line usage: `data = client.ingest("solana-price")`
- ✅ Automatic 402 payment handling (transparent)
- ✅ Works with Phantom (Solana) and MetaMask (EVM)
- ✅ Client-side caching reduces API calls by 80%
- ✅ Comprehensive documentation with examples
- ✅ 90%+ test coverage

**Estimated Output:**
- Python SDK (~600 lines across 5 files)
- JavaScript SDK (~500 lines across 5 files)
- Documentation (~1,500 lines)
- Tests (~400 lines)

---

### TASK 3.2: Dashboard Analytics and KAMIYO Token Integration

**Estimated Time:** 10-12 hours
**Agent:** Frontend Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Frontend Agent adding data ingestion analytics to KAMIYO's
React dashboard and integrating KAMIYO token staking discounts.

CONTEXT:
- Existing dashboard at: /Users/dennisgoslar/Projekter/kamiyo/pages/dashboard/
- New feature: Show data ingestion usage, apply KAMIYO staking discounts
- Goal: Visualize usage, encourage KAMIYO staking for cheaper data access

TASK:
Create dashboard components for data ingestion analytics and integrate
KAMIYO token staking discounts.

REQUIREMENTS:

1. Usage Analytics Component
   - Show user's data ingestion stats:
     * Total queries this month
     * Total spent (USD)
     * Most queried feeds
     * Average query latency
   - Chart: Queries over time (last 30 days)
   - Chart: Spending over time

2. Pricing Calculator Component
   - Show current pricing based on staking tier:
     * Free tier: $0.0001/query (no discount)
     * Pro tier (1K KAMIYO): $0.00009/query (10% off)
     * Team tier (10K KAMIYO): $0.00008/query (20% off)
     * Enterprise tier (100K KAMIYO): $0.00007/query (30% off)
   - Calculator: "If you stake X KAMIYO, you save $Y per month"
   - Call-to-action: "Stake KAMIYO to save 30%"

3. Staking Integration
   - Check user's staking status via Solana RPC
   - Display current tier (Free/Pro/Team/Enterprise)
   - Show "Stake more to upgrade" prompt with tier benefits
   - Link to staking page

4. Real-Time Usage Display
   - Live counter: "Queries today: X"
   - Live spending: "Spent today: $X"
   - Refresh every 10 seconds

IMPLEMENTATION:

# File: /Users/dennisgoslar/Projekter/kamiyo/components/dashboard/DataIngestionAnalytics.jsx

import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { useWallet } from '@solana/wallet-adapter-react';

export default function DataIngestionAnalytics() {
  const { publicKey } = useWallet();
  const [analytics, setAnalytics] = useState(null);
  const [stakingTier, setStakingTier] = useState('Free');

  useEffect(() => {
    // Fetch analytics from backend
    fetch(`/api/v1/analytics/data-ingestion?wallet=${publicKey}`)
      .then(res => res.json())
      .then(data => setAnalytics(data));

    // Check staking tier
    fetch(`/api/v1/staking/tier?wallet=${publicKey}`)
      .then(res => res.json())
      .then(data => setStakingTier(data.tier));
  }, [publicKey]);

  if (!analytics) return <div>Loading...</div>;

  const discounts = {
    'Free': 0,
    'Pro': 10,
    'Team': 20,
    'Enterprise': 30
  };

  const discount = discounts[stakingTier];

  return (
    <div className="analytics-container">
      <h2>Data Ingestion Analytics</h2>

      {/* Current Tier Banner */}
      <div className="tier-banner">
        <h3>Current Tier: {stakingTier}</h3>
        <p>Discount: {discount}% off data queries</p>
        {stakingTier !== 'Enterprise' && (
          <button onClick={() => window.location.href = '/dashboard/staking'}>
            Stake More to Upgrade
          </button>
        )}
      </div>

      {/* Usage Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <h4>Total Queries</h4>
          <p className="stat-value">{analytics.total_queries}</p>
          <span className="stat-change">+{analytics.queries_change_pct}% from last month</span>
        </div>

        <div className="stat-card">
          <h4>Total Spent</h4>
          <p className="stat-value">${analytics.total_spent.toFixed(4)}</p>
          <span className="stat-savings">Saved ${analytics.discount_savings.toFixed(4)} with staking</span>
        </div>

        <div className="stat-card">
          <h4>Avg Latency</h4>
          <p className="stat-value">{analytics.avg_latency_ms}ms</p>
        </div>

        <div className="stat-card">
          <h4>Most Queried Feed</h4>
          <p className="stat-value">{analytics.top_feed}</p>
        </div>
      </div>

      {/* Query Chart */}
      <div className="chart-container">
        <h3>Queries Over Time (Last 30 Days)</h3>
        <Line
          data={{
            labels: analytics.dates,
            datasets: [{
              label: 'Queries',
              data: analytics.queries_per_day,
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1
            }]
          }}
        />
      </div>

      {/* Pricing Calculator */}
      <div className="pricing-calculator">
        <h3>Savings Calculator</h3>
        <p>Your current tier ({stakingTier}) gets {discount}% off all queries.</p>

        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Stake Required</th>
              <th>Discount</th>
              <th>Price per Query</th>
              <th>Monthly Savings*</th>
            </tr>
          </thead>
          <tbody>
            <tr className={stakingTier === 'Free' ? 'current' : ''}>
              <td>Free</td>
              <td>0 KAMIYO</td>
              <td>0%</td>
              <td>$0.0001</td>
              <td>$0</td>
            </tr>
            <tr className={stakingTier === 'Pro' ? 'current' : ''}>
              <td>Pro</td>
              <td>1,000 KAMIYO</td>
              <td>10%</td>
              <td>$0.00009</td>
              <td>${(analytics.total_queries * 0.0001 * 0.1).toFixed(2)}</td>
            </tr>
            <tr className={stakingTier === 'Team' ? 'current' : ''}>
              <td>Team</td>
              <td>10,000 KAMIYO</td>
              <td>20%</td>
              <td>$0.00008</td>
              <td>${(analytics.total_queries * 0.0001 * 0.2).toFixed(2)}</td>
            </tr>
            <tr className={stakingTier === 'Enterprise' ? 'current' : ''}>
              <td>Enterprise</td>
              <td>100,000 KAMIYO</td>
              <td>30%</td>
              <td>$0.00007</td>
              <td>${(analytics.total_queries * 0.0001 * 0.3).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <p className="calculator-note">*Based on your current usage ({analytics.total_queries} queries/month)</p>
      </div>
    </div>
  );
}

# File: /Users/dennisgoslar/Projekter/kamiyo/api/analytics/data_ingestion.py

@router.get("/analytics/data-ingestion")
async def get_data_ingestion_analytics(wallet: str):
    """
    Return analytics for data ingestion usage.
    Used by dashboard to show usage stats.
    """
    # Query database for user's data ingestion history
    queries = db.query(DataIngestionLog).filter_by(wallet=wallet)

    total_queries = queries.count()
    total_spent = sum(q.amount_paid for q in queries)
    avg_latency = sum(q.latency_ms for q in queries) / total_queries if total_queries > 0 else 0

    # Top feed
    feed_counts = {}
    for q in queries:
        feed_counts[q.feed_type] = feed_counts.get(q.feed_type, 0) + 1
    top_feed = max(feed_counts, key=feed_counts.get) if feed_counts else "N/A"

    # Queries per day (last 30 days)
    dates = []
    queries_per_day = []
    for i in range(30):
        date = datetime.now() - timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")
        count = queries.filter(
            func.date(DataIngestionLog.timestamp) == date.date()
        ).count()
        dates.append(date_str)
        queries_per_day.append(count)

    # Calculate discount savings
    tier = get_staking_tier(wallet)
    discount_pct = {'Free': 0, 'Pro': 0.1, 'Team': 0.2, 'Enterprise': 0.3}[tier]
    discount_savings = total_spent * discount_pct

    return {
        "total_queries": total_queries,
        "total_spent": total_spent,
        "avg_latency_ms": round(avg_latency, 2),
        "top_feed": top_feed,
        "dates": dates[::-1],
        "queries_per_day": queries_per_day[::-1],
        "discount_savings": discount_savings
    }

DELIVERABLES:
1. React component: DataIngestionAnalytics.jsx
2. Backend endpoint: api/analytics/data_ingestion.py
3. Styles: styles/DataIngestionAnalytics.module.css
4. Database model: api/models/data_ingestion_log.py (if not exists)
5. Tests: tests/test_analytics_ui.test.jsx

CONSTRAINTS:
- Use existing React/Next.js stack
- Integrate with existing staking tier system
- Show real-time updates (10-second refresh)
- Mobile-responsive design

OUTPUT:
Dashboard analytics component, fully integrated with KAMIYO staking

Begin implementation now.
```

**Success Criteria:**
- ✅ Dashboard shows data ingestion analytics
- ✅ Real-time usage counter (updates every 10 seconds)
- ✅ Pricing calculator shows potential savings from staking
- ✅ Staking tier displayed prominently
- ✅ Charts render correctly (queries and spending over time)
- ✅ Mobile-responsive design

**Estimated Output:**
- 1 React component (DataIngestionAnalytics.jsx, ~300 lines)
- 1 backend endpoint (data_ingestion.py, ~150 lines)
- 1 CSS file (DataIngestionAnalytics.module.css, ~200 lines)
- 1 test file (test_analytics_ui.test.jsx, ~150 lines)

---

### TASK 3.3: Airdrop Points for Beta Testers

**Estimated Time:** 6-8 hours
**Agent:** Backend Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Backend Agent integrating KAMIYO's existing points system
with the new data ingestion layer to reward beta testers.

CONTEXT:
- Existing points system at: /Users/dennisgoslar/Projekter/kamiyo/docs/phase1/points_system_design.md
- Data ingestion layer launching in beta (Phase 4)
- Goal: Reward early adopters with KAMIYO airdrops

TASK:
Award points to users who test data ingestion during beta period.

REQUIREMENTS:

1. Beta Tester Points Awards
   - First 100 data queries: 100 points
   - First stream session: 50 points
   - First batch query: 25 points
   - Referral (bring another beta tester): 50 points
   - Report bug (verified): 100 points

2. Leaderboard
   - Show top 10 beta testers by points earned
   - Display on dashboard: "Data Ingestion Beta Leaderboard"
   - Top 3 get bonus KAMIYO airdrops

3. Airdrop Conversion
   - 1000 points = 10,000 KAMIYO airdrop
   - Distribute after beta ends (Week 15)
   - Use existing airdrop merkle tree system (Task 2.4)

4. Tracking
   - Log all data ingestion events
   - Award points automatically on milestone completion
   - Email notification when points awarded

IMPLEMENTATION:

# File: /Users/dennisgoslar/Projekter/kamiyo/api/points/data_ingestion_rewards.py

from ..models import User, PointsLog, DataIngestionLog
from datetime import datetime

class DataIngestionRewards:
    def __init__(self, user_wallet: str):
        self.user = User.get_by_wallet(user_wallet)

    async def award_first_query_milestone(self):
        """Award 100 points for first 100 data queries"""
        query_count = DataIngestionLog.count(wallet=self.user.wallet)

        if query_count == 100:
            await self.award_points(
                amount=100,
                reason="Completed 100 data queries (Beta Milestone)",
                category="data_ingestion_milestone"
            )

    async def award_first_stream(self):
        """Award 50 points for first stream session"""
        stream_count = DataIngestionLog.count(
            wallet=self.user.wallet,
            feed_type="stream"
        )

        if stream_count == 1:  # First time
            await self.award_points(
                amount=50,
                reason="First streaming session (Beta Milestone)",
                category="data_ingestion_milestone"
            )

    async def award_first_batch(self):
        """Award 25 points for first batch query"""
        batch_count = DataIngestionLog.count(
            wallet=self.user.wallet,
            is_batch=True
        )

        if batch_count == 1:  # First time
            await self.award_points(
                amount=25,
                reason="First batch query (Beta Milestone)",
                category="data_ingestion_milestone"
            )

    async def award_bug_report(self, bug_id: str):
        """Award 100 points for verified bug reports"""
        # Admin manually calls this after verifying bug
        await self.award_points(
            amount=100,
            reason=f"Verified bug report #{bug_id}",
            category="bug_report"
        )

    async def award_points(self, amount: int, reason: str, category: str):
        """Generic point awarding with logging"""
        # Add to points log
        PointsLog.create(
            user_wallet=self.user.wallet,
            amount=amount,
            reason=reason,
            category=category,
            timestamp=datetime.now()
        )

        # Update user's total points
        self.user.points_balance += amount
        self.user.save()

        # Send email notification
        await send_email(
            to=self.user.email,
            subject=f"You earned {amount} KAMIYO points!",
            body=f"Congratulations! You earned {amount} points for: {reason}"
        )

# Hook into data ingestion events
@router.post("/ingest-data")
async def ingest_data_with_rewards(...):
    # ... existing ingestion logic ...

    # Award points for milestones
    rewards = DataIngestionRewards(user_wallet)
    await rewards.award_first_query_milestone()
    await rewards.award_first_stream()
    await rewards.award_first_batch()

    return data

# Leaderboard endpoint
@router.get("/beta-leaderboard")
async def get_beta_leaderboard():
    """Show top 10 beta testers by data ingestion points"""
    top_users = (
        db.query(User)
        .order_by(User.points_balance.desc())
        .limit(10)
        .all()
    )

    leaderboard = [
        {
            "rank": i + 1,
            "wallet": user.wallet[:8] + "...",  # Anonymize
            "points": user.points_balance,
            "queries": DataIngestionLog.count(wallet=user.wallet),
            "airdrop_estimate": user.points_balance / 1000 * 10000  # 1000 points = 10K KAMIYO
        }
        for i, user in enumerate(top_users)
    ]

    return {"leaderboard": leaderboard}

DELIVERABLES:
1. data_ingestion_rewards.py - Points awarding logic
2. Updated ingestion.py - Hook point awards into existing endpoints
3. Leaderboard endpoint - /beta-leaderboard
4. Email templates - beta_milestone_email.html
5. Tests - test_data_ingestion_rewards.py

CONSTRAINTS:
- Use existing points system infrastructure
- Integrate with existing airdrop merkle tree (Task 2.4)
- Email notifications for point awards
- Leaderboard updates in real-time

OUTPUT:
Points system integrated with data ingestion, leaderboard live

Begin implementation now.
```

**Success Criteria:**
- ✅ Points automatically awarded on milestones
- ✅ Leaderboard shows top 10 beta testers
- ✅ Email notifications sent when points awarded
- ✅ 1000 points = 10,000 KAMIYO airdrop conversion
- ✅ Integration with existing points/airdrop systems

**Estimated Output:**
- 1 new file (data_ingestion_rewards.py, ~200 lines)
- Updated ingestion.py (~30 lines changes)
- 1 leaderboard endpoint (~80 lines)
- Email templates (~100 lines HTML)
- Tests (~120 lines)

---

### REVIEW WEEK (Week 9.5)

**Focus:** End-to-end testing with real user flows

**Checkpoint Questions:**
1. Does the SDK truly simplify development (1 line of code)?
2. Are dashboard analytics helpful and accurate?
3. Do points awards work automatically?
4. Is the leaderboard motivating beta testers?

**Action:** Polish UI, fix any bugs found during user testing

---

## Phase 4: Testing, Optimization, and Launch (Weeks 10-15)

**Timeline:** Dec 30, 2025 - Feb 10, 2026
**Focus:** Comprehensive testing, security hardening, launch prep
**Agent Types:** Testing Agent, Security Agent, DevOps Agent (Sonnet 4.5)
**Work Sessions:** 6 sessions (1 per task) + 2 buffer weeks

### TASK 4.1: Comprehensive Testing Suite

**Estimated Time:** 10-12 hours
**Agent:** Testing Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Testing Agent writing comprehensive tests for KAMIYO's
data ingestion extension.

CONTEXT:
- All features implemented: API endpoints, SDK, dashboard, points
- Goal: 80%+ test coverage before launch

TASK:
Write Jest/Pytest tests covering all ingestion flows.

REQUIREMENTS:

1. Backend API Tests (Pytest)
   - Test /ingest-data endpoint (402 flow, payment, data returned)
   - Test /stream-data WebSocket (connection, streaming, disconnection)
   - Test /batch endpoint (multiple queries, bulk discount)
   - Test error handling (invalid feed, source failure, retry logic)
   - Test caching (data cached correctly, TTL expires)
   - Test staking tier discounts (10-30% applied correctly)

2. SDK Tests (Jest for JS, Pytest for Python)
   - Test one-line usage: client.ingest("solana-price")
   - Test automatic 402 handling (SDK sends payment transparently)
   - Test client-side caching (reduces API calls)
   - Test wallet integration (Phantom, MetaMask)
   - Test error handling (graceful failures)

3. Frontend Tests (Jest + React Testing Library)
   - Test DataIngestionAnalytics component (renders correctly)
   - Test pricing calculator (calculates savings correctly)
   - Test leaderboard (shows top 10 users)
   - Test real-time updates (counter increments every 10 seconds)

4. Integration Tests (End-to-End)
   - Full user flow: Agent calls SDK → 402 challenge → Payment → Data returned
   - Stream flow: Agent connects → Streams for 1 minute → Disconnects cleanly
   - Batch flow: Agent sends 20 queries → All processed in parallel

5. Load Testing (Locust or k6)
   - Simulate 1000 concurrent agents querying data
   - Ensure latency stays <500ms under load
   - Verify no database bottlenecks
   - Test caching reduces backend load by 80%

IMPLEMENTATION:

# File: /Users/dennisgoslar/Projekter/kamiyo/tests/x402/test_ingestion_api.py

import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_ingest_data_returns_402_without_token():
    """Test that 402 challenge is returned when no payment"""
    response = client.post("/api/v1/ingest-data", json={
        "feed_type": "solana-price",
        "data_params": {}
    })

    assert response.status_code == 402
    assert "payment_address" in response.json()
    assert "amount_usd" in response.json()

def test_ingest_data_returns_data_with_valid_token():
    """Test that data is returned with valid x402 token"""
    # First, pay and get token
    token = make_payment_and_get_token(amount=0.0001)

    # Then request data with token
    response = client.post("/api/v1/ingest-data",
        json={"feed_type": "solana-price"},
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert "data" in response.json()
    assert "price" in response.json()["data"]

def test_caching_works():
    """Test that data is cached for 60 seconds"""
    token = make_payment_and_get_token()

    # First request (should hit data source)
    response1 = client.post("/api/v1/ingest-data",
        json={"feed_type": "solana-price"},
        headers={"Authorization": f"Bearer {token}"}
    )

    # Second request within 60 seconds (should hit cache)
    response2 = client.post("/api/v1/ingest-data",
        json={"feed_type": "solana-price"},
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response1.json()["data"] == response2.json()["data"]
    assert response2.json()["cached"] == True

def test_staking_tier_discount():
    """Test that Pro tier gets 10% discount"""
    # Create user with Pro tier staking
    user_wallet = create_test_user_with_staking(tier="Pro")
    token = get_token_for_user(user_wallet)

    # Check pricing
    response = client.post("/api/v1/ingest-data",
        json={"feed_type": "solana-price"},
        headers={"Authorization": f"Bearer {token}"}
    )

    # Verify payment amount was discounted
    payment_log = get_payment_log(token)
    assert payment_log.amount_paid == 0.00009  # 10% off 0.0001

# File: /Users/dennisgoslar/Projekter/kamiyo/tests/sdk/test_python_sdk.py

import pytest
from kamiyo_sdk import KamiyoClient

def test_one_line_usage():
    """Test that SDK works with one line of code"""
    client = KamiyoClient(wallet="test_wallet")

    # This should work without any manual 402 handling
    price = client.ingest("solana-price")

    assert isinstance(price, dict)
    assert "price" in price

def test_automatic_402_handling(mock_wallet):
    """Test that SDK automatically handles 402 challenges"""
    client = KamiyoClient(wallet=mock_wallet)

    # SDK should:
    # 1. Receive 402 challenge
    # 2. Send USDC payment automatically
    # 3. Retry with token
    # 4. Return data
    # All without developer intervention

    price = client.ingest("solana-price")

    # Verify payment was sent
    assert mock_wallet.usdc_sent == True
    assert price is not None

# File: /Users/dennisgoslar/Projekter/kamiyo/tests/load/test_load.py

from locust import HttpUser, task, between

class DataIngestionUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        # Get token once at start
        self.token = self.get_token()

    @task(10)
    def ingest_solana_price(self):
        """Most common query"""
        self.client.post("/api/v1/ingest-data",
            json={"feed_type": "solana-price"},
            headers={"Authorization": f"Bearer {self.token}"}
        )

    @task(5)
    def ingest_ethereum_price(self):
        """Less common query"""
        self.client.post("/api/v1/ingest-data",
            json={"feed_type": "ethereum-price"},
            headers={"Authorization": f"Bearer {self.token}"}
        )

    @task(1)
    def batch_query(self):
        """Occasional batch query"""
        self.client.post("/api/v1/ingest-data/batch",
            json={"queries": [
                {"feed_type": "solana-price"},
                {"feed_type": "ethereum-price"}
            ]},
            headers={"Authorization": f"Bearer {self.token}"}
        )

# Run with: locust -f test_load.py --host https://api.kamiyo.ai --users 1000 --spawn-rate 50

DELIVERABLES:
1. Backend tests: tests/x402/test_ingestion_api.py (~400 lines)
2. SDK tests: tests/sdk/test_python_sdk.py, tests/sdk/test_js_sdk.test.ts (~300 lines each)
3. Frontend tests: tests/components/test_analytics.test.jsx (~200 lines)
4. Load tests: tests/load/test_load.py (~150 lines)
5. Test coverage report: pytest --cov=api --cov-report=html

CONSTRAINTS:
- Aim for 80%+ code coverage
- All tests must pass before launch
- Load tests simulate 1000 concurrent users
- Integration tests cover full user flows

OUTPUT:
Comprehensive test suite covering all features, 80%+ coverage

Begin implementation now.
```

**Success Criteria:**
- ✅ 80%+ code coverage (backend + SDK)
- ✅ All unit tests pass
- ✅ Integration tests cover full user flows
- ✅ Load tests pass with 1000 concurrent users
- ✅ Latency <500ms under load
- ✅ No critical bugs found

**Estimated Output:**
- 4 test files (~1,400 lines total)
- Coverage report (HTML)
- Load test results (metrics, graphs)

---

### TASK 4.2: Security Audit and Optimization

**Estimated Time:** 8-10 hours
**Agent:** Security Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Security Agent performing a security audit and optimization
pass on KAMIYO's data ingestion extension.

CONTEXT:
- New attack surface: Real-time data endpoints, streaming, batch queries
- Critical: x402 payment verification must be secure
- Goal: Find and fix vulnerabilities before launch

TASK:
Manual security audit and performance optimization.

SECURITY CHECKLIST:

1. Payment Verification
   - [ ] USDC payment verification cannot be bypassed
   - [ ] Token expiry enforced (24 hours)
   - [ ] No token replay attacks possible
   - [ ] Payment amounts match pricing (no price manipulation)
   - [ ] Multi-chain payment verification secure (Base, Ethereum, Solana)

2. Rate Limiting
   - [ ] Prevent abuse of free-tier endpoints
   - [ ] Limit concurrent WebSocket connections per user
   - [ ] Batch query size capped (max 100 queries per batch)
   - [ ] Implement exponential backoff for failed payments

3. Data Source Security
   - [ ] API keys for data sources (Pyth, Chainlink) stored securely (env vars, not code)
   - [ ] Fallback sources don't expose internal IPs
   - [ ] No sensitive data logged (user wallets, tokens)

4. Caching Security
   - [ ] Redis cache doesn't leak data between users
   - [ ] Cache keys include user identifier (prevent cross-user cache hits)
   - [ ] Sensitive data not cached (only public price data)

5. Input Validation
   - [ ] feed_type parameter validated (whitelist approach)
   - [ ] data_params sanitized (no SQL injection, XSS)
   - [ ] Batch query size validated (max 100)
   - [ ] WebSocket messages validated

6. DDoS Protection
   - [ ] Rate limiting on all endpoints (10 req/sec for free tier)
   - [ ] Cloudflare DDoS protection enabled
   - [ ] Backend can handle 1000 concurrent connections

OPTIMIZATION CHECKLIST:

1. Database Queries
   - [ ] Add indexes on wallet, timestamp columns
   - [ ] Optimize slow queries (>100ms)
   - [ ] Use connection pooling (max 50 connections)

2. Caching Strategy
   - [ ] Redis cache hit rate >80%
   - [ ] Cache TTL tuned (60 seconds for prices, 300 seconds for metrics)
   - [ ] Cache warming for popular feeds

3. API Latency
   - [ ] Average response time <200ms (p50)
   - [ ] p95 response time <500ms
   - [ ] p99 response time <1000ms
   - [ ] WebSocket latency <100ms

4. Data Source Optimization
   - [ ] Pyth oracle queries batched (reduce RPC calls)
   - [ ] Fallback sources only used when primary fails
   - [ ] Implement circuit breaker pattern (don't spam failing sources)

IMPLEMENTATION:

# File: /Users/dennisgoslar/Projekter/kamiyo/api/x402/security_audit.md

# Security Audit Report - Data Ingestion Extension
Date: January 2026

## Vulnerabilities Found

### CRITICAL: None found ✅

### HIGH:
1. **Rate Limiting Bypass** (FIXED)
   - Issue: Free tier users could spam endpoints by changing wallet addresses
   - Fix: Implement IP-based rate limiting (10 req/sec per IP)
   - Code: Added `slowapi` middleware in main.py

2. **Cache Key Collision** (FIXED)
   - Issue: Cache keys didn't include user wallet, possible cross-user data leak
   - Fix: Include wallet hash in cache key: f"feed:{feed_type}:{wallet_hash}"
   - Code: Updated ingestion.py:L45

### MEDIUM:
1. **Token Replay Window**
   - Issue: 24-hour tokens could be replayed if stolen
   - Mitigation: Shortened token validity to 12 hours, added token revocation API
   - Code: Updated config.py TOKEN_EXPIRY_HOURS = 12

### LOW:
1. **Verbose Error Messages**
   - Issue: Error messages expose internal implementation details
   - Fix: Simplified error messages, moved details to logs
   - Code: Updated error_handler.py

## Optimizations Applied

1. **Database Indexing**
   ```sql
   CREATE INDEX idx_wallet ON data_ingestion_log(wallet);
   CREATE INDEX idx_timestamp ON data_ingestion_log(timestamp);
   CREATE INDEX idx_feed_type ON data_ingestion_log(feed_type);
   ```

2. **Connection Pooling**
   ```python
   # Updated database.py
   engine = create_engine(DATABASE_URL, pool_size=50, max_overflow=100)
   ```

3. **Cache Warming**
   ```python
   # New cron job: warm_cache.py
   # Runs every 5 minutes, pre-fetches top 10 most queried feeds
   ```

## Performance Benchmarks

Before Optimization:
- p50 latency: 350ms
- p95 latency: 850ms
- Cache hit rate: 60%

After Optimization:
- p50 latency: 180ms ✅
- p95 latency: 420ms ✅
- Cache hit rate: 85% ✅

## Security Score: 9.5/10 ✅

Remaining TODO:
- Professional penetration test ($5K-10K, optional)
- Bug bounty program (launch after mainnet)

DELIVERABLES:
1. security_audit.md - Audit report with findings
2. Patched code files (ingestion.py, main.py, config.py, error_handler.py)
3. Database migration: add_indexes.sql
4. Performance benchmark report: performance_report.md
5. Security scorecard: security_checklist.md (all items checked)

CONSTRAINTS:
- Fix all HIGH and CRITICAL vulnerabilities before launch
- Performance must meet <500ms p95 latency SLA
- No major architecture changes (quick patches only)

OUTPUT:
Security audit complete, all vulnerabilities patched, optimizations applied

Begin audit now.
```

**Success Criteria:**
- ✅ Zero CRITICAL vulnerabilities
- ✅ Zero HIGH vulnerabilities
- ✅ MEDIUM/LOW vulnerabilities mitigated or accepted
- ✅ Performance meets SLA (p95 <500ms)
- ✅ Cache hit rate >80%
- ✅ Database queries optimized
- ✅ Security scorecard 9/10+

**Estimated Output:**
- Security audit report (~1,500 lines)
- Code patches (4-5 files, ~200 lines changes)
- Database migration script (~50 lines SQL)
- Performance benchmark report (~500 lines)

---

### TASK 4.3: Launch Content and Documentation

**Estimated Time:** 8-10 hours
**Agent:** Content Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a Content Agent creating launch materials for KAMIYO's
data ingestion extension.

CONTEXT:
- Launch date: ~February 2026 (after testing complete)
- Goal: Generate hype, onboard developers, attract AI agents

TASK:
Draft announcement content, documentation, and marketing materials.

REQUIREMENTS:

1. Launch Announcement (X/Twitter Thread)
   - 10-tweet thread explaining the feature
   - Highlight: Pay-per-use, no API keys, agent-friendly
   - Include code examples
   - Call-to-action: Try the beta

2. Technical Documentation
   - Getting started guide (5 minutes to first query)
   - API reference (all endpoints documented)
   - SDK documentation (Python + JavaScript)
   - Code examples (10+ use cases)
   - Pricing page

3. Blog Post
   - "Introducing KAMIYO Data Ingestion: Frictionless Real-Time Data for AI Agents"
   - 2000-word deep dive
   - Technical details, use cases, comparison to competitors
   - Inspired by Corbits case study

4. Developer Onboarding
   - Interactive tutorial (step-by-step)
   - Video walkthrough (script + storyboard)
   - FAQ (20+ questions)

5. Marketing Assets
   - Landing page copy
   - Feature comparison table (KAMIYO vs CoinGecko vs Nansen)
   - Pricing calculator
   - Social media graphics (text-based designs)

IMPLEMENTATION:

# File: /Users/dennisgoslar/Projekter/kamiyo/docs/launch/ANNOUNCEMENT_THREAD.md

# X/Twitter Launch Thread

**Tweet 1/10** 🧵
Introducing KAMIYO Data Ingestion: The first pay-per-use real-time data layer for AI agents.

No API keys. No subscriptions. No setup.

Just send $0.0001 in USDC, get instant data.

Here's how it works 👇

**Tweet 2/10**
AI agents need data to make decisions:
• Token prices
• DeFi metrics
• On-chain analytics

But current APIs require:
❌ Manual key management
❌ Monthly subscriptions
❌ Complex setup

KAMIYO removes all friction.

**Tweet 3/10**
How it works (agent perspective):

```python
from kamiyo import KamiyoClient

client = KamiyoClient(wallet="your_address")

# ONE LINE
price = client.ingest("solana-price")

# That's it. No keys, no config.
```

The SDK handles x402 payment automatically. 🤯

**Tweet 4/10**
Pricing: $0.0001 per query

That's 1000x cheaper than most API subscriptions.

Example:
• 10,000 queries/month = $1
• Subscription APIs = $50-500/month

Save 50-500x. 💰

**Tweet 5/10**
But wait, there's more...

Stake $KAMIYO to get 10-30% discounts:

Free tier: $0.0001/query
Pro (1K $KAMIYO): $0.00009 (10% off)
Team (10K): $0.00008 (20% off)
Enterprise (100K): $0.00007 (30% off)

More stake = cheaper data.

**Tweet 6/10**
Real-time streaming:

```python
# Stream live price updates
for data in client.stream("solana-price"):
    print(data)

# $0.01 for 24 hours of streaming
# vs $0.0001 × 86,400 queries = $8.64
```

99% savings for high-frequency use. 📊

**Tweet 7/10**
Batch queries for efficiency:

```python
results = client.batch([
    {"feed": "solana-price"},
    {"feed": "ethereum-price"},
    {"feed": "bitcoin-price"}
])

# 10+ queries? Get 20% bulk discount.
```

Built for agents that query multiple feeds. 🤖

**Tweet 8/10**
Data sources:
• Pyth Network (Solana-native oracles)
• Chainlink Price Feeds (multi-chain)
• DeFi Llama (TVL, APY)
• CoinGecko (market data)

Automatic fallbacks. If Pyth is down, Chainlink takes over. You never notice. 💪

**Tweet 9/10**
Beta launch: NOW

First 100 beta testers get:
• 100 KAMIYO points (10,000 $KAMIYO airdrop)
• 1,000 free queries
• Lifetime Pro tier (10% discount forever)

Try it: https://kamiyo.ai/data-ingestion

**Tweet 10/10**
KAMIYO is extending x402 (HTTP 402 Payment Required) to real-time data access.

Inspired by @Corbits_io unlocking @nansen_ai data for agents.

We're making it even simpler.

Docs: https://docs.kamiyo.ai/data-ingestion
SDK: https://github.com/kamiyo-ai/sdk

LFG 🚀

# File: /Users/dennisgoslar/Projekter/kamiyo/docs/launch/BLOG_POST.md

# Introducing KAMIYO Data Ingestion: Frictionless Real-Time Data for AI Agents

**By the KAMIYO Team | February 2026**

## The Problem

AI agents are eating the world. From autonomous trading bots to AI-powered research assistants, agents are increasingly making decisions that require real-time data.

But there's a problem: Accessing data is still painfully manual.

Traditional APIs require:
- **API key management** - Agents must securely store and rotate keys
- **Monthly subscriptions** - $50-500/month, paid regardless of usage
- **Complex setup** - OAuth flows, SDK configuration, error handling
- **Rate limits** - Arbitrary caps that throttle agent performance

This made sense for human developers. But for autonomous agents? It's friction they can't afford.

## The Solution: KAMIYO Data Ingestion

Today, we're launching **KAMIYO Data Ingestion** - the first pay-per-use real-time data layer built specifically for AI agents.

Inspired by [Corbits' work unlocking Nansen's API](https://www.nansen.ai/post/how-corbits-unlocks-nansens-api-and-mcp-to-power-the-next-wave-of-intelligent-agent), we're taking it further:

**No API keys. No subscriptions. No setup. Just pay $0.0001 per query in USDC.**

That's it.

### How It Works

KAMIYO uses the **x402 protocol** (HTTP 402 "Payment Required") to gate data behind micropayments.

Here's what an agent experiences:

```python
from kamiyo import KamiyoClient

client = KamiyoClient(wallet="your_solana_address")

# One line of code
price = client.ingest("solana-price")

# Behind the scenes:
# 1. Agent requests data
# 2. KAMIYO returns 402 challenge
# 3. Agent sends $0.0001 USDC
# 4. KAMIYO verifies payment
# 5. Agent receives data
# All in <200ms, fully automated
```

The agent never manually handles the 402 challenge. The SDK does it transparently.

### Why This Matters

**1. Cost Efficiency**

Traditional API: $99/month subscription → $1,188/year
KAMIYO: $0.0001/query × 10,000 queries/month → $12/year

**99% cost savings.**

[... continue blog post for 2000 words covering:
- Technical architecture
- Data sources (Pyth, Chainlink, etc.)
- Use cases (trading bots, analytics agents, DeFi monitoring)
- Comparison to competitors
- Future roadmap
- Call to action ...]

DELIVERABLES:
1. Announcement thread: ANNOUNCEMENT_THREAD.md (10 tweets)
2. Blog post: BLOG_POST.md (2000 words)
3. Technical docs: /docs/data-ingestion/
   - GETTING_STARTED.md
   - API_REFERENCE.md
   - SDK_DOCS.md
   - PRICING.md
   - FAQ.md
4. Marketing assets: /assets/launch/
   - landing_page_copy.md
   - feature_comparison_table.md
   - pricing_calculator_copy.md
5. Tutorial script: VIDEO_TUTORIAL_SCRIPT.md

CONSTRAINTS:
- Content must be accurate (no exaggeration)
- Code examples must be real (tested)
- Pricing must match actual implementation
- Comparisons must be fair

OUTPUT:
Complete launch content package ready for February 2026 launch

Begin writing now.
```

**Success Criteria:**
- ✅ 10-tweet announcement thread (punchy, technical, exciting)
- ✅ 2000-word blog post (deep dive)
- ✅ Complete technical documentation (getting started, API ref, SDK docs)
- ✅ 20+ FAQ questions answered
- ✅ Feature comparison table (KAMIYO vs competitors)
- ✅ Video tutorial script (5-7 minutes)

**Estimated Output:**
- 1 announcement thread (~700 words)
- 1 blog post (~2,000 words)
- 5 documentation files (~3,000 words total)
- Marketing assets (~1,500 words)
- Tutorial script (~800 words)
- **Total:** ~8,000 words of launch content

---

### TASK 4.4: Deployment Pipeline and Monitoring

**Estimated Time:** 8-10 hours
**Agent:** DevOps Agent (Sonnet 4.5)

**Autonomous Prompt:**
```
You are a DevOps Agent setting up deployment pipeline and monitoring
for KAMIYO's data ingestion extension.

CONTEXT:
- Current deployment: Render.com (FastAPI backend)
- New feature: Data ingestion endpoints, WebSocket streaming
- Goal: Deploy safely with monitoring

TASK:
Update deployment pipeline, add monitoring, and prepare rollback plan.

REQUIREMENTS:

1. Render.com Configuration
   - Update render.yaml to include new services
   - WebSocket support (sticky sessions)
   - Environment variables for data source API keys
   - Auto-scaling rules (scale to 5 instances under load)

2. Database Migration
   - Add new tables: data_ingestion_log, beta_leaderboard
   - Run migration on production (zero downtime)
   - Backup before migration

3. Monitoring (Datadog or New Relic)
   - API latency metrics (p50, p95, p99)
   - Error rate tracking (4xx, 5xx)
   - Cache hit rate monitoring
   - WebSocket connection count
   - Data source availability (Pyth, Chainlink uptime)
   - Custom metrics: queries/minute, revenue/hour

4. Alerts
   - Alert if p95 latency > 500ms
   - Alert if error rate > 1%
   - Alert if cache hit rate < 70%
   - Alert if WebSocket connections > 1000 (scale up)
   - Alert if data source down (failover to backup)

5. Rollback Plan
   - Blue-green deployment (new version alongside old)
   - Test new version with 10% of traffic (canary deployment)
   - If error rate spikes, rollback to old version (1-click)
   - Feature flags to disable ingestion without full rollback

IMPLEMENTATION:

# File: /Users/dennisgoslar/Projekter/kamiyo/render.yaml

services:
  # Existing FastAPI backend
  - type: web
    name: kamiyo-api
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn api.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: REDIS_URL
        sync: false
      - key: PYTH_API_KEY
        sync: false
      - key: CHAINLINK_RPC_URL
        sync: false

    # Auto-scaling for data ingestion load
    scaling:
      minInstances: 2
      maxInstances: 10
      targetCPUPercent: 70

    # Health check
    healthCheckPath: /health

    # WebSocket support
    stickySession: true

  # Redis cache (new)
  - type: redis
    name: kamiyo-cache
    ipAllowList: []
    plan: starter

  # Cron jobs (new)
  - type: cron
    name: warm-cache
    schedule: "*/5 * * * *"  # Every 5 minutes
    buildCommand: pip install -r requirements.txt
    startCommand: python scripts/warm_cache.py

# File: /Users/dennisgoslar/Projekter/kamiyo/database/migrations/004_data_ingestion_tables.sql

-- Data ingestion log (for analytics)
CREATE TABLE IF NOT EXISTS data_ingestion_log (
    id SERIAL PRIMARY KEY,
    wallet VARCHAR(64) NOT NULL,
    feed_type VARCHAR(64) NOT NULL,
    data_params JSONB,
    amount_paid DECIMAL(10, 6) NOT NULL,
    latency_ms INTEGER NOT NULL,
    cached BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_timestamp ON data_ingestion_log(wallet, timestamp);
CREATE INDEX idx_feed_type ON data_ingestion_log(feed_type);

-- Beta leaderboard (for points tracking)
CREATE TABLE IF NOT EXISTS beta_leaderboard (
    wallet VARCHAR(64) PRIMARY KEY,
    total_points INTEGER DEFAULT 0,
    total_queries INTEGER DEFAULT 0,
    milestones_completed TEXT[] DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Migration script
#!/bin/bash
# Run with: bash database/migrations/run_migration.sh 004

set -e

echo "Backing up database..."
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

echo "Running migration 004..."
psql $DATABASE_URL < database/migrations/004_data_ingestion_tables.sql

echo "Migration complete!"

# File: /Users/dennisgoslar/Projekter/kamiyo/monitoring/datadog_config.yaml

# Datadog APM configuration

init_config:

instances:
  - prometheus_url: http://localhost:8000/metrics
    namespace: "kamiyo"
    metrics:
      # API Latency
      - latency_p50:
          name: "kamiyo.api.latency.p50"
          type: gauge

      - latency_p95:
          name: "kamiyo.api.latency.p95"
          type: gauge

      - latency_p99:
          name: "kamiyo.api.latency.p99"
          type: gauge

      # Cache Metrics
      - cache_hit_rate:
          name: "kamiyo.cache.hit_rate"
          type: gauge

      # Revenue Metrics
      - revenue_per_hour:
          name: "kamiyo.revenue.per_hour"
          type: gauge

      # WebSocket Metrics
      - websocket_connections:
          name: "kamiyo.websocket.connections"
          type: gauge

      # Error Rate
      - error_rate:
          name: "kamiyo.api.error_rate"
          type: gauge

# Alerts
monitors:
  - name: "High API Latency"
    type: metric alert
    query: "avg(last_5m):avg:kamiyo.api.latency.p95{*} > 500"
    message: "p95 latency is above 500ms. Check backend performance."

  - name: "Cache Hit Rate Low"
    type: metric alert
    query: "avg(last_10m):avg:kamiyo.cache.hit_rate{*} < 70"
    message: "Cache hit rate below 70%. Check Redis or cache TTL."

  - name: "Data Source Down"
    type: service check
    query: "pyth_oracle_health".check({*}).last(3).count_by_status()"
    message: "Pyth oracle is down. Failover to Chainlink."

# File: /Users/dennisgoslar/Projekter/kamiyo/scripts/deploy.sh

#!/bin/bash
# Deployment script with canary release

set -e

echo "Step 1: Run tests"
pytest --cov=api --cov-fail-under=80

echo "Step 2: Build Docker image"
docker build -t kamiyo-api:latest .

echo "Step 3: Deploy to Render (blue-green)"
render deploy --service kamiyo-api --image kamiyo-api:latest --canary 10%

echo "Step 4: Monitor error rate for 10 minutes"
sleep 600

ERROR_RATE=$(curl https://api.kamiyo.ai/metrics | grep error_rate | awk '{print $2}')

if [ "$ERROR_RATE" > "0.01" ]; then
    echo "ERROR: Error rate too high ($ERROR_RATE). Rolling back..."
    render rollback --service kamiyo-api
    exit 1
fi

echo "Step 5: Promote to 100% traffic"
render deploy --service kamiyo-api --promote

echo "Deployment successful! 🚀"

DELIVERABLES:
1. render.yaml - Updated with new services, auto-scaling
2. Database migration: 004_data_ingestion_tables.sql + run script
3. Monitoring config: datadog_config.yaml (or newrelic.yml)
4. Deployment script: scripts/deploy.sh (with canary release)
5. Rollback script: scripts/rollback.sh
6. Runbook: docs/RUNBOOK.md (what to do if things break)

CONSTRAINTS:
- Zero-downtime deployment (blue-green)
- Canary release (test with 10% traffic first)
- Rollback in <5 minutes if needed
- Monitoring alerts within 1 minute of incident

OUTPUT:
Production-ready deployment pipeline with monitoring and rollback

Begin implementation now.
```

**Success Criteria:**
- ✅ Render.yaml updated for new services
- ✅ Database migration runs without downtime
- ✅ Monitoring dashboards show all key metrics
- ✅ Alerts fire within 1 minute of issues
- ✅ Canary deployment works (10% → 100%)
- ✅ Rollback tested and functional (<5 minutes)
- ✅ Runbook written (how to respond to incidents)

**Estimated Output:**
- Updated render.yaml (~100 lines)
- Database migration script (~80 lines SQL)
- Monitoring config (~200 lines YAML)
- Deployment script (~80 lines Bash)
- Rollback script (~40 lines Bash)
- Runbook (~1,500 lines Markdown)

---

### BUFFER WEEKS (Weeks 14-15)

**Focus:** Final polish, fix any last-minute issues, prepare for launch

**Activities:**
1. Final QA testing (manual + automated)
2. Security review (one last pass)
3. Performance tuning (optimize any bottlenecks)
4. Documentation review (fix typos, update examples)
5. Pre-launch checklist (ensure everything is ready)

**Launch Date:** ~February 10, 2026 🚀

---

## Agent Prompts Reference

All agent prompts are **self-contained** and can be executed autonomously by Claude Code (Sonnet 4.5 agents with extended thinking).

### How to Use Prompts

1. **Orchestrator (Opus 4.1) initiates:**
   ```
   "Execute TASK X.Y from the multi-agent plan"
   ```

2. **Orchestrator delegates to Sonnet 4.5 agent:**
   - Passes full prompt from plan
   - Agent reads context, requirements, implementation details
   - Agent produces deliverables autonomously

3. **Agent reports back to orchestrator:**
   - Summary of what was built
   - File paths created/updated
   - Success criteria verified
   - Any blockers or issues

4. **Orchestrator marks task complete, moves to next task**

### Prompt Design Philosophy

Each prompt includes:
- **Context:** What's been done, what's needed
- **Task:** Clear objective (one task per prompt)
- **Requirements:** Specific features to implement
- **Implementation:** Code stubs, architecture guidance
- **Deliverables:** Exact files to create
- **Constraints:** What NOT to do (no rewrites, maintain backwards compat)
- **Success Criteria:** How to verify completion

This allows **autonomous execution** without constant human oversight.

---

## Integration Points

### With Existing KAMIYO Infrastructure

**1. x402 Middleware** (`/api/x402/middleware.py`)
- **Extension point:** Add data ingestion route to existing router
- **Minimal changes:** ~20 lines to register new endpoints
- **Backwards compat:** All existing x402 features unchanged

**2. Payment Verifier** (`/api/x402/payment_verifier.py`)
- **Reuse:** Use existing multi-chain USDC verification
- **No changes needed:** Data ingestion uses same payment flow
- **Benefit:** Proven, battle-tested code

**3. Staking System** (`/api/staking/`)
- **Integration:** Query user's staking tier via RPC
- **Discount application:** 10-30% off data queries based on tier
- **Synergy:** Incentivizes KAMIYO staking for cheaper data access

**4. Database** (`/data/kamiyo.db`)
- **New tables:** data_ingestion_log, beta_leaderboard
- **Migration:** Add tables without disrupting existing schemas
- **Analytics:** Existing dashboard can query new tables

**5. Frontend** (`/pages/dashboard/`)
- **New component:** DataIngestionAnalytics.jsx
- **Integration:** Uses existing wallet connection, user auth
- **Consistency:** Matches existing dashboard UI/UX

### With External Services

**1. Pyth Network** (Solana oracle)
- **API:** Free WebSocket + HTTP API
- **Latency:** <100ms average
- **Reliability:** 99.9% uptime
- **Cost:** Free for read queries

**2. Chainlink Price Feeds** (fallback)
- **API:** On-chain price feeds (Ethereum, Base, etc.)
- **Latency:** ~200ms (depends on RPC)
- **Reliability:** 99.95% uptime
- **Cost:** Gas fees (small, covered by cache savings)

**3. CoinGecko API** (secondary fallback)
- **API:** Free tier (50 calls/min)
- **Latency:** ~300ms average
- **Reliability:** 99% uptime
- **Cost:** Free tier sufficient (with caching)

**4. Redis Cache**
- **Service:** Render.com Redis (starter plan, $7/month)
- **Purpose:** Cache frequently queried data (80%+ hit rate)
- **TTL:** 60 seconds for prices, 300 seconds for metrics
- **Benefit:** Reduces data source API calls by 80%+

---

## Success Metrics

### Technical Metrics

**Performance:**
- ✅ p50 latency: <200ms
- ✅ p95 latency: <500ms
- ✅ p99 latency: <1000ms
- ✅ Cache hit rate: >80%
- ✅ Error rate: <1%
- ✅ Uptime: 99.9%+

**Scalability:**
- ✅ Handle 1000 concurrent users
- ✅ 10,000 queries/minute throughput
- ✅ WebSocket supports 500 concurrent connections
- ✅ Database query time: <100ms average

### Business Metrics

**Revenue:**
- Target: $1,000/month by Month 3 (10M queries @ $0.0001)
- Projection: 20-30% additional revenue stream
- Pricing: $0.0001 per query, $0.01 per 24h stream

**User Adoption:**
- Target: 100 beta testers in first month
- Target: 500 active users by Month 3
- Target: 1,000 active users by Month 6

**Retention:**
- Target: 50% monthly retention (users query again next month)
- Target: 80% satisfaction score (user surveys)

### Community Metrics

**Points/Airdrop:**
- Target: 100 beta testers earn points
- Target: 50% claim airdrop (vs 30% typical)
- Target: 20% of beta testers become Pro/Team tier stakers

**Developer Experience:**
- Target: <5 minutes to first query (docs → working code)
- Target: 1-line SDK usage (no manual 402 handling)
- Target: 90%+ satisfaction with developer experience

---

## Risk Mitigation

### Technical Risks

**Risk 1: Data Source Downtime**
- **Mitigation:** Multi-source fallbacks (Pyth → Chainlink → CoinGecko)
- **Impact:** Low (3 independent sources)
- **Monitoring:** Alert if all 3 sources down

**Risk 2: High Latency Under Load**
- **Mitigation:** Redis caching (80%+ cache hit rate), auto-scaling
- **Impact:** Medium (users notice if >500ms)
- **Monitoring:** Alert if p95 >500ms

**Risk 3: Payment Verification Bugs**
- **Mitigation:** Reuse existing x402 code (battle-tested)
- **Impact:** Critical (users lose money if incorrect)
- **Testing:** 100% coverage on payment logic

**Risk 4: Cache Poisoning**
- **Mitigation:** Cache keys include user wallet hash
- **Impact:** High (data leak between users)
- **Security:** Audit cache key generation

### Business Risks

**Risk 1: Low Adoption**
- **Mitigation:** Beta program with free queries, airdrop incentives
- **Impact:** High (no revenue if no users)
- **Metrics:** Track sign-ups, query count weekly

**Risk 2: Pricing Too High/Low**
- **Mitigation:** A/B test pricing ($0.0001 vs $0.0002), adjust post-launch
- **Impact:** Medium (revenue vs adoption tradeoff)
- **Flexibility:** Easy to adjust pricing in config

**Risk 3: Competition**
- **Mitigation:** Focus on agent-friendliness (1-line SDK), KAMIYO token integration
- **Impact:** Medium (CoinGecko, Nansen, etc. exist)
- **Differentiation:** Pay-per-use + crypto-native (no credit cards)

### Operational Risks

**Risk 1: Team Bandwidth**
- **Mitigation:** Multi-agent autonomous execution, 1-2 tasks per week
- **Impact:** High (project stalls if too complex)
- **Solution:** Modular phases, review weeks, buffer time

**Risk 2: Scope Creep**
- **Mitigation:** Strict phase boundaries, no new features mid-phase
- **Impact:** Medium (delays launch)
- **Process:** Feature requests go into "Phase 5" backlog

**Risk 3: Integration Breakage**
- **Mitigation:** Backwards compatibility tests, feature flags, canary deployment
- **Impact:** Critical (breaks existing users)
- **Testing:** Integration tests cover existing x402 features

---

## Timeline Summary

```
Phase 1: Research and Design (Weeks 1-2) [Oct 28 - Nov 11]
├─ Task 1.1: Architecture Design (8-10 hours)
├─ Task 1.2: Data Source Research (8-10 hours)
└─ Review Week (buffer)

Phase 2: Backend Extension (Weeks 3-6) [Nov 11 - Dec 9]
├─ Task 2.1: Ingestion Endpoint (10-12 hours)
├─ Task 2.2: Streaming + Batch (10-12 hours)
├─ Task 2.3: Error Handling (8-10 hours)
└─ Review Week (buffer)

Phase 3: Frontend/SDK Updates (Weeks 7-9) [Dec 9 - Dec 30]
├─ Task 3.1: SDK Extension (10-12 hours)
├─ Task 3.2: Dashboard Analytics (10-12 hours)
├─ Task 3.3: Airdrop Points (6-8 hours)
└─ Review Week (buffer)

Phase 4: Testing, Optimization, Launch (Weeks 10-15) [Dec 30 - Feb 10]
├─ Task 4.1: Testing Suite (10-12 hours)
├─ Task 4.2: Security + Optimization (8-10 hours)
├─ Task 4.3: Launch Content (8-10 hours)
├─ Task 4.4: Deployment Pipeline (8-10 hours)
└─ Buffer Weeks (final polish)

LAUNCH: ~February 10, 2026 🚀
```

**Total:** 10-15 weeks, ~80-120 hours of work
**Pace:** 1-2 tasks per week (8-12 hours/week)
**Fits:** 1-2 days/week schedule

---

## Conclusion

This multi-agent development plan extends KAMIYO's existing x402 payment infrastructure with a seamless, agent-friendly data ingestion layer. Inspired by Corbits' approach to simplifying API access, we're building:

**For AI Agents:**
- One-line SDK usage (`data = client.ingest("solana-price")`)
- No API keys, no subscriptions, no setup
- Pay $0.0001 per query (1000x cheaper than subscriptions)

**For Developers:**
- Complete documentation, code examples, video tutorials
- Python + JavaScript SDKs
- High-quality data from Pyth, Chainlink, CoinGecko

**For KAMIYO:**
- 20-30% additional revenue stream
- Increased utility for $KAMIYO token (staking discounts)
- Positions KAMIYO as infrastructure for agent economies

**Execution:**
- Autonomous multi-agent development (Opus 4.1 orchestrator, Sonnet 4.5 agents)
- Self-contained prompts for each task
- Built-in review weeks and buffer time
- Modular phases build on existing infrastructure

**Ready to launch February 2026.** 🚀

---

END OF MULTI-AGENT DEVELOPMENT PLAN
