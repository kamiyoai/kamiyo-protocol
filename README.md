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
npm install @mitama/core @mitama/sdk
```

## Quick Start

```typescript
import { MitamaSDK, AgentType } from '@mitama/sdk';
import { Keypair } from '@solana/web3.js';

const wallet = Keypair.generate();
const sdk = new MitamaSDK({
  solanaRpc: 'https://api.devnet.solana.com',
  wallet
});

const agent = await sdk.createAgent(
  wallet.publicKey,
  'MyTradingBot',
  AgentType.Trading,
  1_000_000_000  // 1 SOL stake
);

console.log('Agent created:', agent.pda.toString());
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

## Package Structure

### @mitama/core

Core interfaces and type definitions for the Mitama framework:

- Agent identity types
- Reputation system interfaces
- Strategy execution interfaces
- Payment provider abstractions

### @mitama/sdk

TypeScript SDK for interacting with Mitama agents:

- Agent creation and management
- Reputation queries
- Strategy execution
- Provider implementations

## Documentation

- [Quick Start Guide](docs/QUICKSTART.md)
- [API Reference](docs/API.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Contributing Guidelines](CONTRIBUTING.md)

## Examples

See the `examples/` directory for complete working examples:

- Basic agent creation
- Strategy implementation
- Reputation tracking

## License

MIT License - see [LICENSE](LICENSE) for details.

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
