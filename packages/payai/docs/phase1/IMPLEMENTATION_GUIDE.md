# KAMIYO "Invisible Harmony" Implementation Guide

## Overview

This guide provides quick-start instructions for implementing the 5 alignment features designed in Phase 1.

**Documents Created:**
1. ✅ **alignment_features_architecture.md** (3,064 lines) - Complete technical architecture
2. ✅ **database_schema_extensions.sql** (1,034 lines) - All database tables, indexes, views
3. ✅ **api_endpoint_specs.yaml** (1,655 lines) - OpenAPI 3.0 specifications

**Total Documentation:** 5,753 lines of production-ready technical specifications

---

## Quick Reference: The 5 Alignment Features

### 1. Auto-Negotiation Escrows
**Purpose:** Trustless work agreements between AI agents
**Key Tables:** `harmony_escrows`, `escrow_negotiations`
**Key Endpoints:** `/harmony/escrow/create`, `/harmony/escrow/accept`, `/harmony/escrow/submit`
**Complexity:** HIGH
**MVP Time:** 2 weeks

**Key Benefits:**
- Automated payment release on quality verification
- Multi-party dispute resolution
- KAMIYO staking priority queue

### 2. Cross-Chain Harmony Bridges
**Purpose:** Pay on one chain, receive on another (Wormhole-powered)
**Key Tables:** `harmony_bridges`, `bridge_routes`
**Key Endpoints:** `/harmony/bridge/quote`, `/harmony/bridge/create`, `/harmony/bridge/{id}/status`
**Complexity:** MEDIUM
**MVP Time:** 1.5 weeks

**Key Benefits:**
- Solana → Base, Base → Ethereum, Ethereum → Solana
- 1.5-2% total fees (0.5% KAMIYO + Wormhole relay)
- KAMIYO staking discounts (50-100% off fees)

### 3. Silent Verifier Oracles
**Purpose:** AI-powered quality verification (Claude/GPT-4)
**Key Tables:** `harmony_verifications`, `verifier_templates`
**Key Endpoints:** `/harmony/verifier/create`, `/harmony/verifier/{id}/status`
**Complexity:** MEDIUM
**MVP Time:** 1 week

**Key Benefits:**
- Automated escrow release if score ≥ 80
- $0.10-1.00 per verification
- Human override for disputes

### 4. Balance Whisperers
**Purpose:** Off-chain shadow balances for microtransactions
**Key Tables:** `shadow_deposits`, `shadow_settlements`, `shadow_transactions`
**Key Endpoints:** `/harmony/whisperer/deposit`, `/harmony/whisperer/balance`, `/harmony/whisperer/withdraw`
**Complexity:** LOW
**MVP Time:** 0.5 weeks

**Key Benefits:**
- 98% gas savings vs on-chain microtransactions
- Redis-backed real-time balances
- Periodic batch settlements

### 5. Harmony Analytics Dashboard
**Purpose:** Real-time metrics for all agent interactions
**Key Tables:** `harmony_analytics_cache`, `harmony_analytics_hourly`
**Key Views:** `v_harmony_user_reputation`, `v_harmony_escrow_stats`
**Key Endpoints:** `/harmony/analytics/overview`, `/harmony/analytics/user`, `/harmony/analytics/leaderboard`
**Complexity:** LOW
**MVP Time:** 0.5 weeks

**Key Benefits:**
- Network-wide escrow success rates
- User reputation scores (0-100)
- Leaderboard rankings

---

## Phase 3 MVP Implementation Checklist

### Week 1: Escrows Foundation
- [ ] Deploy escrow smart contracts (Base testnet)
  - Contract: `/contracts/HarmonyEscrow.sol`
  - Use OpenZeppelin ReentrancyGuard
  - Multi-sig admin for production
- [ ] Run database migration: `002_harmony_features.sql`
  - Tables: `harmony_escrows`, `escrow_negotiations`
  - Triggers: `trg_calculate_escrow_priority`
- [ ] Implement backend endpoints:
  - `POST /api/v1/harmony/escrow/create`
  - `POST /api/v1/harmony/escrow/accept`
  - `GET /api/v1/harmony/escrow/{id}`
- [ ] Build frontend:
  - Page: `/pages/dashboard/escrows.js`
  - Components: `EscrowList.js`, `CreateEscrowForm.js`

### Week 2: Escrows Completion
- [ ] Implement submission + dispute flow:
  - `POST /api/v1/harmony/escrow/submit`
  - `POST /api/v1/harmony/escrow/dispute`
- [ ] Manual dispute resolution (admin endpoint)
- [ ] Frontend:
  - Page: `/pages/escrow/[id].js` (detail view)
  - Component: `NegotiationThread.js`
- [ ] Integration tests for full escrow lifecycle

### Week 3: Bridges & Verifiers (Parallel Teams)

**Bridge Team:**
- [ ] Install Wormhole SDK: `npm install @certusone/wormhole-sdk`
- [ ] Implement bridge endpoints:
  - `POST /api/v1/harmony/bridge/quote`
  - `POST /api/v1/harmony/bridge/create`
  - `GET /api/v1/harmony/bridge/{id}/status`
- [ ] Frontend: `/pages/dashboard/bridges.js`

**Verifier Team:**
- [ ] Install AI SDKs: `pip install anthropic openai`
- [ ] Implement verifier endpoints:
  - `POST /api/v1/harmony/verifier/create`
  - `GET /api/v1/harmony/verifier/{id}/status`
- [ ] Pre-populate verifier templates (SQL INSERT statements in migration)
- [ ] Frontend: `VerificationResults.js` component (inline in escrow detail)

### Week 4: Whisperers + Analytics
- [ ] Redis setup for shadow balances
- [ ] Implement shadow balance endpoints:
  - `POST /api/v1/harmony/whisperer/deposit`
  - `GET /api/v1/harmony/whisperer/balance`
  - `POST /api/v1/harmony/whisperer/withdraw`
- [ ] Manual settlement endpoint (admin only)
- [ ] Basic analytics dashboard:
  - `GET /api/v1/harmony/analytics/overview`
  - Frontend: `/pages/dashboard/harmony-analytics.js`
- [ ] Materialized views for performance

### Week 5: Integration + Testing
- [ ] KAMIYO staking integration:
  - Table: `kamiyo_stakes`
  - Discount logic in all endpoints
- [ ] End-to-end testing (Playwright/Cypress)
- [ ] Load testing (100 concurrent agents)
- [ ] Security review (pre-audit)

### Week 6: Buffer + Polish
- [ ] Bug fixes
- [ ] UI/UX polish
- [ ] Documentation updates
- [ ] Deploy to staging

---

## Database Migration Instructions

### Step 1: Review Schema
```bash
# Read the SQL file
cat docs/phase1/database_schema_extensions.sql
```

### Step 2: Apply to Development Database
```bash
# PostgreSQL
psql -U kamiyo -d kamiyo_dev -f docs/phase1/database_schema_extensions.sql

# Or use Alembic migration
alembic upgrade head
```

### Step 3: Verify Tables Created
```sql
-- Check tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'harmony_%';

-- Check views
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
AND table_name LIKE 'v_harmony_%';

-- Check functions
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_type = 'FUNCTION';
```

### Step 4: Populate Static Data
```sql
-- Bridge routes and verifier templates are auto-populated in migration
-- Verify they exist:
SELECT * FROM bridge_routes;
SELECT * FROM verifier_templates;
```

---

## API Development Instructions

### Step 1: Create FastAPI Routers

**File Structure:**
```
api/
├── harmony/
│   ├── __init__.py
│   ├── escrow_routes.py      # Escrow endpoints
│   ├── bridge_routes.py      # Bridge endpoints
│   ├── verifier_routes.py    # Verifier endpoints
│   ├── whisperer_routes.py   # Shadow balance endpoints
│   ├── analytics_routes.py   # Analytics endpoints
│   └── models.py              # Pydantic models
```

### Step 2: Import OpenAPI Specs

The `api_endpoint_specs.yaml` file provides:
- Request/response schemas
- Authentication requirements
- Endpoint descriptions
- Error handling

Use it as a reference for:
1. Pydantic model definitions
2. FastAPI route decorators
3. Response status codes
4. Request validation

### Step 3: Follow Existing Patterns

**Example: Escrow Create Endpoint**
```python
# api/harmony/escrow_routes.py
from fastapi import APIRouter, Depends, HTTPException
from api.auth_helpers import get_current_user
from api.harmony.models import CreateEscrowRequest, EscrowResponse
from api.x402.middleware import X402Middleware

router = APIRouter(prefix="/harmony/escrow", tags=["Escrows"])

@router.post("/create", response_model=EscrowResponse, status_code=201)
async def create_escrow(
    request: CreateEscrowRequest,
    user = Depends(get_current_user)
):
    # 1. Verify payment transaction
    payment_verified = await verify_payment(
        request.payment_tx_hash,
        request.chain,
        request.amount_usdc
    )

    if not payment_verified:
        raise HTTPException(status_code=402, detail="Payment verification failed")

    # 2. Deploy escrow contract (or create DB record for now)
    escrow = await deploy_escrow_contract(
        buyer=request.buyer_address,
        amount=request.amount_usdc,
        terms=request.terms,
        chain=request.chain
    )

    # 3. Record in database
    db_escrow = await db.create_escrow(
        escrow_address=escrow.address,
        buyer_address=request.buyer_address,
        amount_usdc=request.amount_usdc,
        terms_json=request.terms.dict(),
        chain=request.chain,
        kamiyo_stake=request.kamiyo_stake or 0
    )

    # 4. Return response
    return EscrowResponse(
        escrow_id=db_escrow.id,
        escrow_address=db_escrow.escrow_address,
        status=db_escrow.status,
        invitation_link=f"https://kamiyo.ai/escrow/accept/{db_escrow.id}",
        priority_score=db_escrow.priority_score
    )
```

### Step 4: Register Routers in main.py

```python
# api/main.py
from api.harmony import escrow_routes, bridge_routes, verifier_routes, whisperer_routes, analytics_routes

app.include_router(escrow_routes.router, prefix="/api/v1", tags=["Harmony Escrows"])
app.include_router(bridge_routes.router, prefix="/api/v1", tags=["Harmony Bridges"])
app.include_router(verifier_routes.router, prefix="/api/v1", tags=["Harmony Verifiers"])
app.include_router(whisperer_routes.router, prefix="/api/v1", tags=["Harmony Whisperers"])
app.include_router(analytics_routes.router, prefix="/api/v1", tags=["Harmony Analytics"])
```

---

## Frontend Development Instructions

### Step 1: Create Page Structure

```
pages/
├── dashboard/
│   ├── escrows.js          # Escrow management dashboard
│   ├── bridges.js          # Bridge transfer dashboard
│   ├── harmony-analytics.js # Analytics dashboard
└── escrow/
    ├── create.js           # Create new escrow form
    └── [id].js             # Escrow detail view
```

### Step 2: Build React Components

**Component Structure:**
```
components/
├── escrow/
│   ├── EscrowList.js
│   ├── EscrowCard.js
│   ├── CreateEscrowForm.js
│   ├── NegotiationThread.js
│   ├── StatusBadge.js
│   └── DeadlineTimer.js
├── bridge/
│   ├── BridgeQuoteCard.js
│   ├── ChainSelector.js
│   ├── BridgeProgressTracker.js
│   └── RouteVisualization.js
├── verifier/
│   ├── VerificationResults.js
│   ├── CriteriaBuilder.js
│   ├── ScoreGauge.js
│   └── FeedbackPanel.js
├── whisperer/
│   ├── ShadowBalanceWidget.js
│   ├── DepositModal.js
│   ├── WithdrawModal.js
│   └── TransactionHistory.js
└── analytics/
    ├── MetricCard.js
    ├── PerformanceChart.js
    ├── ReputationBadge.js
    └── LeaderboardTable.js
```

### Step 3: State Management

Use React Context API for each feature:

```typescript
// contexts/EscrowContext.js
import { createContext, useContext, useState } from 'react';

const EscrowContext = createContext();

export const EscrowProvider = ({ children }) => {
  const [escrows, setEscrows] = useState([]);
  const [loading, setLoading] = useState(false);

  const createEscrow = async (params) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/harmony/escrow/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await response.json();
      setEscrows([...escrows, data]);
      return data;
    } finally {
      setLoading(false);
    }
  };

  return (
    <EscrowContext.Provider value={{ escrows, loading, createEscrow }}>
      {children}
    </EscrowContext.Provider>
  );
};

export const useEscrow = () => useContext(EscrowContext);
```

### Step 4: Wallet Integration

Use existing wallet adapters:

```typescript
// For EVM chains (Base, Ethereum)
import { useAccount, useSignMessage } from 'wagmi';

// For Solana
import { useWallet } from '@solana/wallet-adapter-react';

// Example: Sign escrow creation
const { signMessageAsync } = useSignMessage();
const signature = await signMessageAsync({ message: escrowHash });
```

---

## Smart Contract Development

### Escrow Contract (Solidity)

**File:** `contracts/HarmonyEscrow.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract HarmonyEscrow is ReentrancyGuard {
    IERC20 public immutable USDC;

    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        bool released;
        bool refunded;
        uint256 createdAt;
    }

    mapping(uint256 => Escrow) public escrows;
    uint256 public escrowCount;

    event EscrowCreated(uint256 indexed escrowId, address buyer, uint256 amount);
    event EscrowAccepted(uint256 indexed escrowId, address seller);
    event EscrowReleased(uint256 indexed escrowId);
    event EscrowRefunded(uint256 indexed escrowId);

    constructor(address _usdc) {
        USDC = IERC20(_usdc);
    }

    function createEscrow(uint256 amount) external nonReentrant returns (uint256) {
        require(amount > 0, "Amount must be greater than 0");
        require(USDC.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        uint256 escrowId = escrowCount++;
        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            seller: address(0),
            amount: amount,
            released: false,
            refunded: false,
            createdAt: block.timestamp
        });

        emit EscrowCreated(escrowId, msg.sender, amount);
        return escrowId;
    }

    function acceptEscrow(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.seller == address(0), "Already accepted");
        require(!escrow.released && !escrow.refunded, "Escrow closed");

        escrow.seller = msg.sender;
        emit EscrowAccepted(escrowId, msg.sender);
    }

    function releaseEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.buyer, "Only buyer can release");
        require(escrow.seller != address(0), "No seller");
        require(!escrow.released && !escrow.refunded, "Already closed");

        escrow.released = true;
        require(USDC.transfer(escrow.seller, escrow.amount), "Transfer failed");

        emit EscrowReleased(escrowId);
    }

    function refundEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.buyer, "Only buyer can refund");
        require(!escrow.released && !escrow.refunded, "Already closed");

        escrow.refunded = true;
        require(USDC.transfer(escrow.buyer, escrow.amount), "Transfer failed");

        emit EscrowRefunded(escrowId);
    }
}
```

**Deployment:**
```bash
# Install dependencies
npm install --save-dev hardhat @nomiclabs/hardhat-ethers ethers

# Deploy to Base testnet
npx hardhat run scripts/deploy_escrow.js --network base-goerli
```

---

## External Dependencies Setup

### 1. Wormhole SDK (Bridges)
```bash
npm install @certusone/wormhole-sdk
npm install @wormhole-foundation/connect-sdk
```

**Configuration:**
```typescript
// config/wormhole.ts
import { WormholeConnect } from '@wormhole-foundation/connect-sdk';

export const wormholeConfig = {
  networks: {
    base: {
      rpc: process.env.BASE_RPC_URL,
      chainId: 8453
    },
    solana: {
      rpc: process.env.SOLANA_RPC_URL
    }
  }
};
```

### 2. Anthropic Claude (Verifiers)
```bash
pip install anthropic
```

**Configuration:**
```python
# config/ai_verifier.py
import anthropic
import os

client = anthropic.Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY")
)

async def verify_deliverable(deliverable_text, criteria):
    message = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": f"Evaluate this deliverable:\n\n{deliverable_text}\n\nCriteria:\n{criteria}"
        }]
    )
    return parse_verification_result(message.content)
```

### 3. Redis (Shadow Balances)
```bash
pip install redis
```

**Configuration:**
```python
# config/redis_config.py
import redis
import os

redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    db=int(os.getenv('REDIS_SHADOW_BALANCE_DB', 2)),
    decode_responses=True
)

async def get_shadow_balance(wallet_address):
    key = f"shadow_balance:{wallet_address}"
    balance = redis_client.get(key)
    return float(balance) if balance else 0.0
```

---

## Testing Strategy

### Unit Tests
```bash
# Backend (pytest)
pytest tests/harmony/test_escrow_routes.py
pytest tests/harmony/test_bridge_routes.py
pytest tests/harmony/test_verifier_routes.py

# Frontend (Jest)
npm test -- components/escrow/EscrowList.test.js
```

### Integration Tests
```bash
# Full escrow lifecycle
pytest tests/harmony/test_escrow_integration.py

# Bridge transfer flow
pytest tests/harmony/test_bridge_integration.py
```

### Load Testing
```bash
# Locust (100 concurrent agents)
locust -f tests/load/harmony_load_test.py --users 100 --spawn-rate 10
```

---

## Deployment Checklist

### Pre-Production
- [ ] All tests passing (unit, integration, e2e)
- [ ] Load testing completed (100+ concurrent users)
- [ ] Security audit booked (Certik/Quantstamp)
- [ ] Smart contracts audited
- [ ] Environment variables configured
- [ ] Database backups enabled
- [ ] Redis persistence configured (AOF)
- [ ] Monitoring setup (Datadog, Sentry)

### Production
- [ ] Deploy smart contracts to mainnet
- [ ] Run database migration on production DB
- [ ] Deploy backend to production
- [ ] Deploy frontend to Vercel/Netlify
- [ ] Configure HTTPS certificates
- [ ] Enable rate limiting (Redis-backed)
- [ ] Set up cron jobs:
  - `cleanup_expired_escrows()` - Hourly
  - `refresh_harmony_analytics()` - Hourly
  - Batch shadow settlements - Daily
- [ ] Monitor error rates (target: <1%)
- [ ] Monitor API latency (target: <200ms p95)

---

## Success Metrics

### Phase 3 MVP Goals

**Week 1-2: Escrows**
- [ ] 50+ escrows created
- [ ] 90%+ escrow success rate
- [ ] <5% dispute rate
- [ ] Average completion time: <5 days

**Week 3: Bridges**
- [ ] 100+ bridge transfers
- [ ] <2 minute average completion time
- [ ] 99%+ success rate
- [ ] $10k+ total bridge volume

**Week 3: Verifiers**
- [ ] 80+ verifications completed
- [ ] 90%+ accuracy (vs human review)
- [ ] <5% human override rate
- [ ] Average cost: $0.15/verification

**Week 4: Whisperers**
- [ ] 1000+ shadow balance users
- [ ] $50k+ total deposits
- [ ] 98%+ gas savings vs on-chain
- [ ] <1% settlement failures

**Week 4: Analytics**
- [ ] Real-time metrics (<5 min delay)
- [ ] User reputation system live
- [ ] Leaderboard rankings
- [ ] 50+ daily active users viewing analytics

---

## Support & Resources

**Documentation:**
- Main Architecture: `alignment_features_architecture.md`
- Database Schema: `database_schema_extensions.sql`
- API Specs: `api_endpoint_specs.yaml`

**External Links:**
- Wormhole Docs: https://docs.wormhole.com
- Anthropic API: https://docs.anthropic.com
- OpenZeppelin Contracts: https://docs.openzeppelin.com

**Community:**
- Discord: https://discord.gg/kamiyo (get #dev-harmony channel)
- GitHub: https://github.com/kamiyo/kamiyo-harmony
- Email: dev@kamiyo.ai

---

## Estimated Costs

**Development (Phase 3):**
- 5 developers x 6 weeks = $180,000
- Security audit: $25,000
- Infrastructure (staging): $5,000
- **Total: $210,000**

**Monthly Operating Costs:**
- PostgreSQL (AWS RDS): $200/month
- Redis (AWS ElastiCache): $100/month
- Anthropic API (verifications): $500/month
- Wormhole relay fees: Variable (user-paid)
- Infrastructure (servers): $300/month
- **Total: ~$1,100/month**

**Projected Revenue (Year 1):**
- Escrow fees (0.5%): $50k
- Bridge fees (0.5%): $30k
- Verifier costs: $10k
- Shadow settlements: $5k
- **Total: $95k/year** (ROI: 45% in Year 1)

By Year 2: **$500k/year** (ROI: 238%)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Prepared By:** KAMIYO Engineering Team
