# Kagami

Production ERC-8004 agent identity registry with game-theoretic trust enforcement.

## Overview

Agent identity registry combining on-chain verification with Nash equilibrium mechanisms. Makes honest behavior economically rational and defection costly.

**Features:**
- ERC-8004 agent identity (ERC-721 NFTs)
- Payment attribution (x402 integration)
- Circular dependency detection
- MEV-resistant manifest system
- Multi-agent recursion controls
- Stake-weighted penalties

**Stack:** Solidity, PostgreSQL, FastAPI, Python

## Structure

```
kagami/
├── docs/                          # Documentation
│   ├── MANIFEST_VERIFICATION.md
│   ├── MEV_RECURSION_CONTROLS.md
│   └── PRODUCTION_GRADE.md
├── src/
│   ├── api/                       # FastAPI server
│   ├── config/                    # Configuration
│   ├── contracts/                 # Solidity contracts
│   ├── sdk/                       # Python SDK
│   └── requirements.txt
├── database/migrations/           # SQL migrations
└── tests/                         # Test suites
```

## Quick Start

```bash
# Database
createdb kagami
psql kagami < database/migrations/001_schema.sql
psql kagami < database/migrations/017_add_erc8004_tables_hardened.sql
psql kagami < database/migrations/018_endpoint_manifests.sql
psql kagami < database/migrations/019_mev_recursion_controls.sql

# Install
cd src
pip install -r requirements.txt

# Run
uvicorn api.main:app --reload
```

## API Endpoints

```
POST   /agents/register              Register agent
GET    /agents/{uuid}                Get agent
POST   /agents/feedback              Submit reputation
POST   /agents/verify-forward        Verify forward safety
POST   /agents/record-forward        Record forward
POST   /manifests/publish            Publish signed manifest
POST   /manifests/verify-forward     Verify with manifest
POST   /manifests/record-forward     Record with receipt
POST   /mev/report                   Report MEV incident
GET    /health                       Health check
```

## SDK

```python
from sdk.client import Client

client = Client(api_url="...", api_key="...")

# Register agent
agent = await client.register_agent(
    owner_address="0x...",
    chain="base",
    name="Trading Agent"
)

# Stake for trust tier
await client.stake_agent(agent.uuid, amount_usdc=1000, lock_days=30)

# Verify forward safety
safety = await client.verify_forward(
    root_tx="0x...",
    source_agent=agent.uuid,
    target_agent=other_agent.uuid
)
```

## Documentation

- **docs/MANIFEST_VERIFICATION.md** - Signed manifests and forward receipts
- **docs/MEV_RECURSION_CONTROLS.md** - MEV protections and hop limits
- **docs/PRODUCTION_GRADE.md** - Deployment checklist

## Contracts

- `src/contracts/AgentIdentityRegistry.sol` - ERC-8004 NFTs
- `src/contracts/AgentReputationRegistry.sol` - Stake and reputation

## Tests

```bash
pytest tests/
```

## License

MIT

---

Built by KAMIYO
