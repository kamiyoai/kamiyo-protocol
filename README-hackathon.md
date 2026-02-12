# Hive: Private Reputation Proofs for AI Agents

**Solana Privacy Hackathon Submission**

> Agents prove they're trustworthy without revealing who they are.

## The Problem

AI agents need to access services, APIs, and payment rails. Service providers need to know agents are trustworthy. But revealing transaction history exposes:

- Competitive intelligence (trading strategies, API usage patterns)
- Identity linkage (wallet → agent → owner)
- Historical positions and behaviors

**Current tradeoff**: Reveal your history to prove reputation, or stay anonymous and be untrusted.

## The Solution

Hive lets agents generate ZK proofs of on-chain reputation:

```
"I have >90% success rate across 50+ transactions"
```

Without revealing:
- Which transactions
- Which wallets
- Which agent

High reputation unlocks private payment rails through ShadowWire and Blindfold.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  1. REGISTER                                                     │
│                                                                  │
│  Agent creates identity commitment:                              │
│  commitment = Poseidon(owner_secret, agent_id, reg_secret)      │
│                                                                  │
│  Registers on-chain with stake. Identity remains private.        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. BUILD HISTORY                                                │
│                                                                  │
│  Agent completes escrow agreements through KAMIYO Protocol:      │
│  - Successful releases recorded on-chain                         │
│  - Disputes and resolutions tracked                              │
│  - Reputation score computed from outcomes                       │
│                                                                  │
│  History is public, but not linked to agent identity.            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. GENERATE PROOF                                               │
│                                                                  │
│  Agent generates Groth16 ZK proof:                               │
│                                                                  │
│  Public: threshold (e.g., 85%), min_transactions (e.g., 50)     │
│  Private: actual reputation, transaction list, identity         │
│                                                                  │
│  Proof says: "I meet the threshold" without revealing details.   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. UNLOCK PRIVATE PAYMENTS                                      │
│                                                                  │
│  Reputation Threshold    Payment Rail         Daily Limit        │
│  ────────────────────    ────────────         ───────────        │
│  Any registered agent    Standard transfer    $100               │
│  > 70% success rate      ShadowWire basic     $500               │
│  > 85% success rate      ShadowWire + card    $2,000             │
│  > 95% success rate      Elite private rail   $10,000            │
│                                                                  │
│  Agent pays for services through private rails.                  │
│  Service knows: agent is reputable.                              │
│  Service doesn't know: which agent, which history.               │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  KAMIYO Protocol │     │   Hive     │     │  Payment Rails   │
│  (Reputation)    │     │  (ZK Proofs)     │     │                  │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ Agent Identity   │────►│ Proof Generation │────►│ ShadowWire       │
│ Escrow History   │     │ On-chain Verify  │     │ Blindfold Cards  │
│ Dispute Records  │     │ Threshold Gates  │     │ Private Transfer │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

## Privacy Guarantees

| Data | Visibility |
|------|------------|
| Agent's wallet address | Never revealed |
| Transaction history | Never revealed |
| Exact reputation score | Never revealed |
| Reputation threshold met | Public (that's the point) |
| Payment activity | Private (ShadowWire/Blindfold) |

## Zero-Knowledge Circuit

**`reputation_threshold.circom`**

```
Public Inputs:
  - agents_root          // Merkle root of registered agents
  - min_reputation       // Required threshold (e.g., 85)
  - min_transactions     // Minimum transaction count
  - nullifier            // Prevents proof replay

Private Inputs:
  - owner_secret         // Agent's identity secret
  - agent_id             // Agent identifier
  - registration_secret  // Registration secret
  - merkle_path[20]      // Proof of registration
  - reputation_score     // Actual score (hidden)
  - transaction_count    // Actual count (hidden)
  - epoch                // Current epoch

Constraints:
  1. Merkle membership in agent registry
  2. reputation_score >= min_reputation
  3. transaction_count >= min_transactions
  4. nullifier = Poseidon(agent_id, epoch) // Prevents reuse
```

**Proof generation**: ~500ms
**On-chain verification**: ~400k compute units

## Integration

### For Agents

```typescript
import { HiveClient, ReputationProver } from '@kamiyo/hive';
import { ShadowWireClient } from '@kamiyo/radr';

// Generate reputation proof
const prover = new ReputationProver('/path/to/circuits');
const proof = await prover.proveReputationThreshold({
  ownerSecret,
  agentId,
  registrationSecret,
  merklePath,
  reputationScore: 92,      // Private - not revealed
  transactionCount: 127,    // Private - not revealed
  minReputation: 85,        // Public threshold
  minTransactions: 50,      // Public threshold
});

// Use proof to access private payment rail
const shadowWire = new ShadowWireClient();
const payment = await shadowWire.privateTransfer({
  amount: 100,
  token: 'USDC',
  recipient: serviceProvider,
  reputationProof: proof,   // Proves eligibility
});
// Service receives payment, knows agent is reputable, doesn't know which agent
```

### For Service Providers

```typescript
import { HiveClient } from '@kamiyo/hive';

const client = new HiveClient(provider);

// Verify agent meets reputation threshold
const isValid = await client.verifyReputationProof(proof, {
  minReputation: 85,
  minTransactions: 50,
});

if (isValid) {
  // Grant access - agent is trustworthy
  // You don't know which agent, just that they qualify
}
```

## Blindfold Card Integration

Reputation proofs unlock Blindfold privacy card tiers:

```typescript
import { BlindfoldClient } from '@kamiyo/blindfold';

const blindfold = new BlindfoldClient();

// Request card with reputation proof
const card = await blindfold.requestCard({
  reputationProof: proof,
  requestedTier: 'premium',  // Requires 85%+ reputation
});

// Card issued to agent
// Spending is private - not linked to agent identity
// Daily limit based on proven reputation tier
```

## ShadowWire Integration

Private transfers via Radr Labs ShadowWire:

```typescript
import { ShadowWireClient } from '@kamiyo/radr';

const shadowWire = new ShadowWireClient();

// Private transfer with reputation gate
const tx = await shadowWire.privateTransfer({
  amount: 500,
  token: 'USDC',
  recipient: apiProvider,
  reputationProof: proof,
  memo: 'API subscription',  // Encrypted
});

// Recipient sees: 500 USDC from verified agent (85%+ reputation)
// Recipient doesn't see: which agent, transaction history
```

## Use Cases

### 1. Anonymous API Access
Trading agent proves 90%+ success rate to access premium market data API. Provider knows agent is profitable, doesn't know its strategies.

### 2. Private Service Payments
Research agent pays for compute resources through ShadowWire. Compute provider knows agent is reputable, doesn't know what it's researching.

### 3. Reputation-Gated Collaboration
Agent joins private collaboration channel by proving reputation threshold. Other agents know it's trustworthy, don't know its identity.

### 4. Anonymous Credit
Agent accesses credit/lending based on proven track record. Lender knows repayment likelihood, doesn't know borrower identity.

## Deployment

**Solana Devnet Program**: `DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km`

## Running the Project

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Solana CLI 1.18+
- Anchor 0.31+
- circom 2.2+

### Setup

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol
cd kamiyo-protocol

pnpm install

# Build circuits
cd circuits/hive
./compile.sh reputation_threshold

# Build Solana program
anchor build -p hive

# Build SDK
pnpm --filter @kamiyo/kamiyo-hive run build
```

### Run Demo

```bash
# Terminal 1: Start API
cd services/api && pnpm dev

# Terminal 2: Run demo
pnpm tsx scripts/reputation-proof-demo.ts
```

## Key Files

| Path | Description |
|------|-------------|
| `circuits/hive/reputation_threshold.circom` | ZK circuit |
| `programs/hive/src/lib.rs` | Solana program |
| `packages/kamiyo-hive/src/reputation-prover.ts` | Proof generation |
| `packages/kamiyo-radr/src/shadowwire.ts` | ShadowWire integration |
| `packages/kamiyo-blindfold/src/reputation-gate.ts` | Blindfold integration |

## Why This Matters

The AI agent economy is growing. Agents will transact billions in value. They need:

1. **Trust** - Services need to know agents are reliable
2. **Privacy** - Agents need to protect competitive intelligence
3. **Interoperability** - Reputation should be portable across services

Hive solves all three with a single ZK proof.

## Links

- [KAMIYO Protocol](https://kamiyo.ai)
- [Radr ShadowWire](https://radr.com)
- [Blindfold Finance](https://blindfoldfinance.com)
- [Documentation](https://docs.kamiyo.ai/hive)

## License

MIT
