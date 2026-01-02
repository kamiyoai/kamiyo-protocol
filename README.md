# Mitama

![mitama](https://github.com/user-attachments/assets/7ed437d2-5b5f-45cc-a571-17eb8a0543ea)

[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-green.svg)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.31-purple.svg)](https://anchor-lang.com)

**On-chain agent identity and conflict resolution for Solana.**

Mitama enables autonomous agents to transact with accountability through stake-backed identities and trustless dispute arbitration via multi-oracle consensus.

## Features

- **Agent Identity** - PDA-based identities with stake collateral
- **Escrow Agreements** - Time-locked payments between agents and providers
- **Dispute Resolution** - Multi-oracle consensus with quality-based settlement
- **Reputation Tracking** - On-chain trust scores for all parties
- **SPL Token Support** - SOL, USDC, USDT

## Installation

```bash
npm install @mitama/sdk
```

## Quick Start

```typescript
import { MitamaClient, AgentType } from '@mitama/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.generate();
const client = new MitamaClient({ connection, wallet });

// Create agent with 0.5 SOL stake
const tx = await client.createAgent({
  name: 'TradingBot',
  agentType: AgentType.Trading,
  stakeAmount: 500_000_000 // lamports
});

// Create payment agreement
await client.createAgreement({
  provider: providerPubkey,
  amount: 100_000_000,
  timeLockSeconds: 86400,
  transactionId: 'order-123'
});

// Release on success, or dispute for arbitration
await client.releaseFunds('order-123', providerPubkey);
// or: await client.markDisputed('order-123');
```

## How It Works

```
Agent                          Provider
  │                               │
  │  1. Create Agreement          │
  ├──────────────────────────────►│
  │     (funds locked)            │
  │                               │
  │  2. Service Delivered         │
  │◄──────────────────────────────┤
  │                               │
  ├─── 3a. Release ──────────────►│  Happy path
  │                               │
  └─── 3b. Dispute ───┐           │  Unhappy path
                      ▼
              ┌──────────────┐
              │  Oracles     │
              │  (consensus) │
              └──────┬───────┘
                     │
              ┌──────▼───────┐
              │  Settlement  │
              │  0-100%      │
              └──────────────┘
```

**Settlement Scale:**

| Quality Score | Agent Refund | Provider Payment |
|--------------|--------------|------------------|
| 80-100% | 0% | 100% |
| 65-79% | 35% | 65% |
| 50-64% | 75% | 25% |
| 0-49% | 100% | 0% |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Mitama Program                       │
├─────────────────┬─────────────────┬────────────────────┤
│  Agent Identity │    Escrow       │   Oracle Registry  │
│  - PDA          │  - Create       │   - Register       │
│  - Stake        │  - Release      │   - Consensus      │
│  - Reputation   │  - Dispute      │   - Verify         │
└─────────────────┴─────────────────┴────────────────────┘
                          │
                    ┌─────▼─────┐
                    │  Solana   │
                    └───────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@mitama/sdk` | TypeScript client for agents, agreements, disputes |
| `@mitama/surfpool` | Strategy simulation and pre-flight validation |
| `@mitama/middleware` | Express middleware for HTTP 402 payment flows |
| `@mitama/agent-client` | Autonomous agent with auto-dispute |

## API Reference

### MitamaClient

```typescript
// PDA derivation
getAgentPDA(owner: PublicKey): [PublicKey, number]
getAgreementPDA(agent: PublicKey, txId: string): [PublicKey, number]

// Account fetching
getAgent(pda: PublicKey): Promise<AgentIdentity | null>
getAgreement(pda: PublicKey): Promise<Agreement | null>

// Operations
createAgent(params: CreateAgentParams): Promise<string>
createAgreement(params: CreateAgreementParams): Promise<string>
releaseFunds(txId: string, provider: PublicKey): Promise<string>
markDisputed(txId: string): Promise<string>
```

## Development

```bash
# Install dependencies
npm install

# Build program
anchor build

# Run tests
anchor test

# Build SDK
npm run build --workspaces
```

## Program Addresses

| Network | Program ID |
|---------|------------|
| Mainnet | `8z97gUtmy43FXLs5kWvqDAA6BjsHYDwKXFoM6LsngXoC` |
| Devnet | `8z97gUtmy43FXLs5kWvqDAA6BjsHYDwKXFoM6LsngXoC` |

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

**Security Features:**
- Emergency pause mechanism for protocol-wide halts
- Oracle registry with admin controls
- Stake-backed accountability
- Time-locked escrows with expiration

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[BUSL-1.1](LICENSE) - Free for non-commercial use. Commercial license: license@kamiyo.ai

---

Built by [KAMIYO](https://kamiyo.ai)
