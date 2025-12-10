# Mitama

![mitama](https://github.com/user-attachments/assets/7ed437d2-5b5f-45cc-a571-17eb8a0543ea)

**Agent Identity and Conflict Resolution Protocol for Solana**

*The soul that persists through conflict*

## Overview

Mitama provides autonomous agents with on-chain identity, stake-backed accountability, and trustless conflict resolution through multi-oracle consensus. When agents and providers disagree, Mitama's arbitration system determines fair outcomes through quality-based assessment.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Agent** | Autonomous entity with PDA identity and staked collateral |
| **Agreement** | Payment commitment between agent and provider |
| **Conflict** | Disputed agreement requiring oracle arbitration |
| **Resolution** | Quality-based settlement (0-100% refund sliding scale) |

### Features

- **Agent Identity**: PDA-based identities with stake-backed accountability
- **Conflict Resolution**: Multi-oracle consensus for fair dispute arbitration
- **Reputation System**: On-chain trust scoring for agents and providers
- **Quality Arbitration**: Sliding refund scale based on service quality assessment
- **SPL Token Support**: Native SOL, USDC, USDT
- **TypeScript SDK**: Full client library for agent operations

```
┌─────────────────────────────────────────────────────────────┐
│                      MITAMA PROTOCOL                         │
│          Agent Identity & Conflict Resolution                │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────▼────┐         ┌─────▼─────┐        ┌────▼────┐
    │ Identity │         │ Agreement │        │ Oracle  │
    │          │         │           │        │         │
    │ • PDA    │         │ • Create  │        │ • Score │
    │ • Stake  │         │ • Release │        │ • Vote  │
    │ • Rep    │         │ • Dispute │        │ • Verify│
    └────┬─────┘         └─────┬─────┘        └────┬────┘
         │                     │                   │
         └─────────────────────┼───────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    Solana Runtime   │
                    │    PDA • Consensus  │
                    └─────────────────────┘
```

## Installation

```bash
npm install @mitama/sdk
```

## Quick Start

### 1. Create an Agent Identity

```typescript
import { MitamaClient, MitamaUtils, AgentType } from '@mitama/sdk';
import { Connection, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';

const connection = new Connection('https://api.devnet.solana.com');
const keypair = Keypair.generate();
const wallet = new Wallet(keypair);

const client = new MitamaClient({ connection, wallet });

// Create agent with 0.5 SOL stake
const signature = await client.createAgent({
  name: 'MyTradingBot',
  agentType: AgentType.Trading,
  stakeAmount: MitamaUtils.solToLamports(0.5)
});

console.log('Agent created:', signature);
```

### 2. Create a Payment Agreement

```typescript
import { PublicKey } from '@solana/web3.js';

const providerPubkey = new PublicKey('Provider...');

const signature = await client.createAgreement({
  provider: providerPubkey,
  amount: MitamaUtils.solToLamports(0.1),
  timeLockSeconds: MitamaUtils.hoursToSeconds(24),
  transactionId: MitamaUtils.generateTransactionId('api')
});
```

### 3. Release or Dispute

```typescript
// Happy path: release funds to provider
await client.releaseFunds(transactionId, providerPubkey);

// Unhappy path: mark as disputed for oracle resolution
await client.markDisputed(transactionId);
```

### 4. HTTP 402 Middleware (Server-side)

```typescript
import express from 'express';
import { createMitamaMiddleware } from '@mitama/middleware';

const app = express();

app.use('/api/data', createMitamaMiddleware({
  price: 0.01, // 0.01 SOL per request
  wallet: providerWallet,
  connection
}));

app.get('/api/data', (req, res) => {
  res.json({ data: 'Premium content' });
});
```

### 5. Agent Client (Autonomous Consumption)

```typescript
import { AutonomousServiceAgent } from '@mitama/agent-client';

const agent = new AutonomousServiceAgent({
  keypair: agentKeypair,
  connection,
  programId: MITAMA_PROGRAM_ID,
  qualityThreshold: 70,
  maxPrice: 0.1,
  autoDispute: true
});

const result = await agent.consumeAPI(
  'https://api.example.com/data',
  { query: 'market data' },
  { price: 'number', volume: 'number' }
);

console.log(`Quality: ${result.quality}%, Cost: ${result.cost} SOL`);
```

### Conflict Resolution Flow

```
┌──────────┐                              ┌──────────┐
│  Agent   │                              │ Provider │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  1. Create Agreement (lock funds)       │
     ├────────────────────────────────────────►│
     │                                         │
     │  2. Provider delivers service           │
     │◄────────────────────────────────────────┤
     │                                         │
     │  3a. Happy path: Release funds          │
     ├────────────────────────────────────────►│
     │                                         │
     │  3b. Unhappy path: Mark Disputed        │
     ├─────────────┐                           │
     │             ▼                           │
     │    ┌────────────────┐                   │
     │    │  Oracle Panel  │                   │
     │    │ ┌────┐ ┌────┐  │                   │
     │    │ │ O1 │ │ O2 │  │ 4. Quality scores │
     │    │ └────┘ └────┘  │    (consensus)    │
     │    │    ┌────┐      │                   │
     │    │    │ O3 │      │                   │
     │    │    └────┘      │                   │
     │    └───────┬────────┘                   │
     │            │                            │
     │            ▼ 5. Resolution              │
     │    ┌─────────────────┐                  │
     │    │  Quality-Based  │                  │
     │    │   Settlement    │                  │
     │    │                 │                  │
     │    │ 0-49%: Full ◄───┼──────────────────┤
     │    │ refund          │                  │
     │    │                 │                  │
     │    │ 50-79%: Partial │                  │
     │    │                 │                  │
     │◄───┤ 80-100%: Full ──┼─────────────────►│
     │    │ payment         │                  │
     │    └─────────────────┘                  │
     │                                         │
     ▼                                         ▼
  ┌────────────────┐                ┌────────────────┐
  │ Update Agent   │                │ Update Provider│
  │  Reputation    │                │  Reputation    │
  └────────────────┘                └────────────────┘
```

### Agent Lifecycle

```
┌──────────┐
│   User   │
└─────┬────┘
      │
      │ 1. createAgent()
      ▼
┌─────────────────┐
│  MitamaSDK      │
│  ┌───────────┐  │
│  │ Provider  │  │──┐
│  └───────────┘  │  │ 2. Generate PDA
└─────────────────┘  │    Store identity
      │              │    Initialize stake
      │◄─────────────┘
      │
      │ 3. Return AgentIdentity
      ▼
┌─────────────────────────┐
│   Solana Program        │
│   ┌───────────────┐     │
│   │ Agent PDA     │     │
│   │ • Owner       │     │
│   │ • Name        │     │
│   │ • Type        │     │
│   │ • Reputation  │     │
│   │ • Stake       │     │
│   └───────────────┘     │
└─────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@mitama/sdk` | TypeScript SDK for agent identity, agreements, and disputes |
| `@mitama/middleware` | Express/FastAPI middleware for HTTP 402 payment flows |
| `@mitama/agent-client` | Autonomous agent for API consumption with auto-dispute |
| `@mitama/mcp-server` | MCP server for AI agent integration |
| `@mitama/switchboard` | Switchboard oracle function for quality scoring |

## API Reference

### MitamaClient

```typescript
class MitamaClient {
  // PDA Derivations
  getAgentPDA(owner: PublicKey): [PublicKey, number]
  getAgreementPDA(transactionId: string): [PublicKey, number]
  getReputationPDA(entity: PublicKey): [PublicKey, number]

  // Account Fetching
  getAgent(agentPDA: PublicKey): Promise<AgentIdentity | null>
  getAgreement(agreementPDA: PublicKey): Promise<Agreement | null>
  getReputation(entity: PublicKey): Promise<EntityReputation | null>

  // Operations
  createAgent(params: CreateAgentParams): Promise<string>
  createAgreement(params: CreateAgreementParams): Promise<string>
  releaseFunds(transactionId: string, provider: PublicKey): Promise<string>
  markDisputed(transactionId: string): Promise<string>
}
```

### MitamaUtils

```typescript
class MitamaUtils {
  static solToLamports(sol: number): BN
  static lamportsToSol(lamports: BN | number): number
  static hoursToSeconds(hours: number): BN
  static daysToSeconds(days: number): BN
  static generateTransactionId(prefix?: string): string
  static qualityToRefundPercentage(qualityScore: number): number
  static calculateRefund(amount: BN, percentage: number): { refundAmount: BN, paymentAmount: BN }
}
```

### Quality-Based Refund Scale

| Quality Score | Refund Percentage | Outcome |
|---------------|-------------------|---------|
| 80-100% | 0% | Full payment to provider |
| 65-79% | 35% | Partial refund |
| 50-64% | 75% | Majority refund |
| 0-49% | 100% | Full refund to agent |

## Development

```bash
# Install dependencies
npm install

# Build Solana program
anchor build

# Run tests
anchor test

# Build all packages
npm run build --workspaces
```

## Testing

```bash
# Solana program tests (localnet)
anchor test

# TypeScript package tests
cd packages/mitama-sdk && npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](SECURITY.md) for security policies and vulnerability reporting.

## License

BUSL-1.1 - see [LICENSE](LICENSE) for details.

## KAMIYO Platform

This framework provides core abstractions. For the complete platform:

```
┌────────────────────────────────────────────────────────────┐
│                    KAMIYO PLATFORM                         │
│                    (Commercial)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Daydreams   │  │   Surfpool   │  │  Production  │    │
│  │  AI Engine   │  │  Validation  │  │     API      │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │     MEV      │  │  PostgreSQL  │  │  Monitoring  │    │
│  │  Protection  │  │  + pgvector  │  │    Stack     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└────────────────────────────┬───────────────────────────────┘
                             │
                             │ uses
                             ▼
┌────────────────────────────────────────────────────────────┐
│                   MITAMA FRAMEWORK                         │
│                   (Open Source - MIT)                      │
│  ┌──────────────┐              ┌──────────────┐           │
│  │ @mitama/core │              │ @mitama/sdk  │           │
│  │  Interfaces  │◄─────────────┤   Client     │           │
│  └──────────────┘              └──────────────┘           │
└────────────────────────────────────────────────────────────┘
```

**Platform Features:**

- **AI Integration**: Daydreams cognitive framework for agent decision-making
- **Strategy Testing**: Surfpool devnet fork for risk-free validation
- **Infrastructure**: FastAPI server, PostgreSQL + pgvector memory system
- **Security**: MEV protection and authentication layer
- **Monitoring**: Prometheus and Grafana observability stack
- **Commercial Licensing**: Enterprise support and deployment assistance

Contact: license@kamiyo.ai | [kamiyo.ai](https://kamiyo.ai)

---

Built by [KAMIYO](https://kamiyo.ai)
