# ERC-8004 Agent Identity Integration

KAMIYO now supports ERC-8004 agent identities, enabling AI agents to build portable on-chain reputation through x402 payment verification.

## Overview

ERC-8004 provides a standard for trustless agent identities on Ethereum. Each agent receives an ERC-721 NFT representing their identity, with associated reputation data tracking payment reliability, service quality, and trustworthiness.

### Key Features

- **Portable Identity**: ERC-721 NFT identity transferable across platforms
- **On-Chain Reputation**: Feedback and validation stored on-chain
- **Payment Reliability Tracking**: Automatic reputation updates based on x402 payments
- **Trust Scoring**: Composite trust scores combining reputation and payment success rate
- **Multi-Chain Support**: Works across Base, Ethereum, and other EVM chains

## Architecture

### Smart Contracts

**AgentIdentityRegistry** (`contracts/AgentIdentityRegistry.sol`)
- ERC-721 contract for agent identity NFTs
- Stores registration URIs pointing to agent metadata
- Key-value metadata storage

**AgentReputationRegistry** (`contracts/AgentReputationRegistry.sol`)
- Linked to identity registry
- Stores feedback from clients (0-100 scores)
- Tracks feedback history and revocations
- Supports agent responses to feedback

### Database Schema

**erc8004_agents**: Agent identity records
**erc8004_reputation**: Reputation feedback
**erc8004_agent_payments**: Payment history linked to agents
**erc8004_validations**: Independent validation records

**Views:**
- `v_erc8004_agent_stats`: Combined reputation and payment statistics
- `v_erc8004_agent_reputation`: Reputation summary
- `v_erc8004_agent_payment_stats`: Payment success metrics

### API Endpoints

All endpoints are prefixed with `/api/v1/agents`

#### Agent Registration

```bash
POST /api/v1/agents/register
```

**Request:**
```json
{
  "owner_address": "0x742d35Cc6634C0532925a3b844b5e3A3A3b7b7b7",
  "chain": "base",
  "registration_file": {
    "name": "Trading Agent Alpha",
    "description": "Automated DeFi trading agent",
    "endpoints": [
      {
        "name": "agentWallet",
        "endpoint": "0x123...",
        "version": "1.0.0"
      }
    ]
  }
}
```

**Response:**
```json
{
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "agent_id": 1,
  "chain": "base",
  "owner_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
  "token_uri": "https://kamiyo.ai/api/v1/agents/550e8400.../registration",
  "status": "active",
  "created_at": "2025-01-13T12:00:00Z"
}
```

#### Get Agent Details

```bash
GET /api/v1/agents/{agent_uuid}
```

#### Get Agent Statistics

```bash
GET /api/v1/agents/{agent_uuid}/stats
```

**Response:**
```json
{
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "agent_id": 1,
  "reputation_score": 87.5,
  "total_payments": 150,
  "payment_success_rate": 94.7,
  "trust_level": "excellent",
  "total_amount_usdc": "1250.50"
}
```

#### Submit Reputation Feedback

```bash
POST /api/v1/agents/feedback
```

**Request:**
```json
{
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "client_address": "0x456...",
  "score": 95,
  "tag1": "payment_success",
  "tag2": "fast_response"
}
```

#### Link Payment to Agent

```bash
POST /api/v1/agents/link-payment
```

**Request:**
```json
{
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "tx_hash": "0xabc123...",
  "chain": "base"
}
```

#### Search Agents

```bash
GET /api/v1/agents/?min_reputation_score=80&trust_level=excellent
```

## Python SDK Usage

```python
from sdk.erc8004_client import ERC8004Client

# Initialize client
async with ERC8004Client(api_key="x402_live_...") as client:
    # Register new agent
    agent = await client.register_agent(
        owner_address="0x742d35Cc6634C0532925a3b844b5e3A3A3b7b7b7",
        name="My Trading Agent",
        description="Automated trading strategy",
        endpoints=[
            {
                "name": "agentWallet",
                "endpoint": "0x123...",
                "version": "1.0.0"
            }
        ],
        image="https://example.com/agent-avatar.png"
    )

    print(f"Agent registered: {agent['agent_uuid']}")

    # Get agent stats
    stats = await client.get_agent_stats(agent['agent_uuid'])
    print(f"Trust level: {stats['trust_level']}")
    print(f"Reputation score: {stats['reputation_score']}")

    # Link payment to agent
    await client.link_payment(
        agent_uuid=agent['agent_uuid'],
        tx_hash="0xabc123...",
        chain="base"
    )

    # Submit feedback
    await client.submit_feedback(
        agent_uuid=agent['agent_uuid'],
        client_address="0x456...",
        score=95,
        tag1="payment_success"
    )

    # Search for high-trust agents
    results = await client.search_agents(
        min_reputation_score=80,
        trust_level="excellent",
        limit=10
    )

    for agent in results['agents']:
        print(f"{agent['name']}: {agent['trust_level']}")
```

## Integration with x402 Payments

### Automatic Reputation Tracking

When an agent makes a payment through x402, reputation is automatically updated:

1. **Successful Payment**: Agent receives 95/100 reputation score with tag `payment_success`
2. **Failed Payment**: Agent receives 30/100 reputation score with tag `payment_failure`

### Payment Verification with Agent Identity

```python
from api.erc8004.integration import get_reputation_tracker

tracker = get_reputation_tracker()

# Record successful payment
await tracker.record_payment_success(
    agent_uuid="550e8400-e29b-41d4-a716-446655440000",
    tx_hash="0xabc123...",
    chain="base",
    amount_usdc=Decimal("10.00"),
    endpoint="/api/v1/data"
)

# Check if agent is trusted
is_trusted = await tracker.is_agent_trusted(
    agent_uuid="550e8400-e29b-41d4-a716-446655440000",
    min_trust_score=70.0
)
```

### Trust Levels

Agents are automatically assigned trust levels based on reputation and payment metrics:

- **Excellent**: ≥95% payment success + ≥80 reputation score
- **Good**: ≥85% payment success + ≥70 reputation score
- **Fair**: ≥75% payment success + ≥60 reputation score
- **Poor**: Below fair thresholds

## Contract Deployment

### Prerequisites

```bash
cd contracts
npm install
```

### Deploy to Base Sepolia (Testnet)

```bash
# Set environment variables
export DEPLOYER_PRIVATE_KEY="0x..."
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export BASESCAN_API_KEY="your-api-key"

# Deploy
npm run deploy:base-sepolia
```

### Deploy to Base Mainnet

```bash
export DEPLOYER_PRIVATE_KEY="0x..."
export BASE_RPC_URL="https://mainnet.base.org"
export BASESCAN_API_KEY="your-api-key"

npm run deploy:base
```

Deployment addresses are saved to `./deployments/{network}-deployment.json`

## Database Migration

Run the ERC-8004 migration to create required tables:

```bash
# PostgreSQL
psql -U postgres -d kamiyo < website/database/migrations/017_add_erc8004_tables.sql
```

## Agent Registration File Format

Following ERC-8004 specification:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Agent Name",
  "description": "Agent description",
  "image": "https://example.com/avatar.png",
  "endpoints": [
    {
      "name": "agentWallet",
      "endpoint": "0x742d35Cc6634C0532925a3b844b5e3A3A3b7b7b7",
      "version": "1.0.0"
    },
    {
      "name": "MCP",
      "endpoint": "https://mcp.example.com",
      "version": "2025-06-18"
    }
  ],
  "registrations": [
    {
      "agentId": 1,
      "agentRegistry": "eip155:8453:0x..."
    }
  ],
  "supportedTrust": ["reputation", "crypto-economic", "tee-attestation"]
}
```

## Use Cases

### 1. AI Agent Micropayments

AI agents can pay for API access with USDC and build reputation over time, enabling them to access premium services.

### 2. Agent Marketplace

Discover and filter agents by trust level, reputation score, and payment reliability.

### 3. Trustless Agent-to-Agent Transactions

Agents can verify each other's reputation before engaging in transactions.

### 4. Payment Collateralization

High-reputation agents may receive preferential rates or access to premium features.

## Security Considerations

- Agent ownership verified via ERC-721 ownership
- Reputation feedback can be revoked by submitter
- Payment linking requires valid x402 payment record
- All operations logged for audit trail
- Trust scores recalculated in real-time

## References

- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [KAMIYO x402 Documentation](https://kamiyo.ai/docs)
- [Agent Registration API](https://kamiyo.ai/docs/api/agents)
