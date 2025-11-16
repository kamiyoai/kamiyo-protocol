# Kagami

![kagami](https://github.com/user-attachments/assets/10e1df02-7869-4d3a-9370-8acda277a88d)

Production ERC-8004 implementation with game-theoretic trust mechanisms for AI agent networks.

## Overview

Agent identity registry combining on-chain verification with Nash equilibrium enforcement. Designed to make honest behavior economically rational and defection costly.

**Core Features:**
- ERC-8004 compliant agent identity (ERC-721 NFTs)
- Payment attribution (x402 integration)
- Circular dependency detection
- Stake-weighted penalty system
- Cooperation rewards
- Sybil resistance scoring
- Reputation decay mechanisms

**Stack:**
- Solidity contracts (Base/Ethereum)
- PostgreSQL with game theory functions
- FastAPI REST endpoints
- Python SDK

## Quick Start

```bash
# Database
createdb kagami
psql kagami < database/migrations/001_schema.sql

# Environment
cp .env.example .env
# Edit .env with your configuration

# Install
pip install -r requirements.txt

# Run
uvicorn api.main:app --reload
```

## API Endpoints

```
POST   /agents/register                  Register agent
GET    /agents/{uuid}                    Get agent
GET    /agents                           Search agents
POST   /agents/feedback                  Submit reputation feedback
GET    /agents/{uuid}/stats              Get statistics
POST   /agents/link-payment              Link payment to agent
POST   /agents/verify-forward            Verify forward safety (cycle detection)
POST   /agents/record-forward            Record payment forward
GET    /agents/cycle-history             Get cycle detection history
POST   /agents/stake                     Stake USDC for trust tier
POST   /agents/unstake                   Unstake USDC (after lock)
GET    /agents/{uuid}/game-theory        Get game theory metrics
GET    /agents/{uuid}/sybil-score        Get Sybil resistance score
GET    /agents/{uuid}/cooperation-rewards Get cooperation rewards
GET    /health                           Health check
GET    /metrics                          Prometheus metrics
```

## SDK Usage

```python
from erc8004 import Client

client = Client(api_url="https://api.kamiyo.ai", api_key="...")

# Register agent
agent = await client.register_agent(
    owner_address="0x...",
    chain="base",
    name="Trading Agent",
    description="Automated DeFi trading",
    endpoints=[{"name": "MCP", "endpoint": "https://..."}]
)

# Stake for trust tier
await client.stake_agent(agent.uuid, amount_usdc=1000, lock_days=30)

# Verify forward safety before executing
safety = await client.verify_forward(
    root_tx="0x...",
    source_agent=agent.uuid,
    target_agent=other_agent.uuid
)

if safety['safe']:
    await client.record_forward(root_tx, agent.uuid, other_agent.uuid, hop=1)
```

## License

Commercial use requires license. Contact enterprise@kamiyo.ai

Non-commercial use permitted for personal, academic, and open source projects.

See [LICENSE](./LICENSE) for details.

## Architecture

```
API (FastAPI)
├── PostgreSQL (identity, reputation, payments, cycle detection)
├── Redis (cache, rate limits)
└── Smart Contracts (Base/Ethereum)
```

Performance: 1000 req/min sustained, <500ms p99 latency

## Game Theory

**Problem:** AI agents forwarding x402 payments create accidental cycles (A → B → A)

**Solution:** Nash equilibrium makes honest behavior economically rational

**Mechanisms:**

1. **Stake-Weighted Penalties**
   - Cycle violations: 10-50% stake slash
   - Root initiator: 2x reputation penalty
   - Slashed funds unrecoverable

2. **Cooperation Rewards**
   - Honest forward: +10 points/tx
   - Cycle reporting: +15 points/violator
   - Long-term reliability bonuses

3. **Sybil Resistance**
   - Network topology: Unique counterparties (40%)
   - Time-weighted: Account age (30%)
   - Economic: Transaction value (30%)
   - Score <20 = "sybil_risk"

4. **Reputation Decay**
   - Inactive >30 days: Decay snapshot
   - Recovery: New positive feedback
   - Incentivizes continuous participation

5. **Stake Tiers**
   - Bronze: $100+ | Silver: $1k+ | Gold: $5k+ | Platinum: $10k+
   - Higher tier = reduced penalty impact + "excellent" trust eligibility

## Development

```bash
# Tests
pytest tests/

# Lint
black api/ tests/
flake8 api/ tests/
mypy api/

# Contracts
cd contracts && npm test
```

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

Built by [KAMIYO](https://kamiyo.ai)
