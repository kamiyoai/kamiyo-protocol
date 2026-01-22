# @kamiyo/radr

Radr ShadowWire integration for Kamiyo Protocol. Private payments with trust infrastructure.

## Overview

This package bridges Radr's privacy layer (ShadowWire, ShadowPay, ShadowID) with Kamiyo's trust infrastructure (escrow, reputation, dispute resolution). It enables autonomous agents to send and receive private payments while maintaining quality guarantees and dispute protection.

### What This Enables

| Radr Capability | Kamiyo Addition |
|-----------------|-----------------|
| Hidden payment amounts | Escrow with dispute resolution |
| Anonymous transfers | Reputation-gated pool access |
| ShadowID identity | ZK reputation proofs |
| Relayer network | Quality-based settlement |

## Installation

```bash
npm install @kamiyo/radr @radr/shadowwire
```

## Quick Start

### Private Transfer

```typescript
import { createShadowWireClient } from '@kamiyo/radr';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const client = await createShadowWireClient(connection);

// Transfer SOL privately
const result = await client.transfer({
  sender: wallet.publicKey.toBase58(),
  recipient: provider,
  amount: 1.0,
  token: 'SOL',
  type: 'internal', // Fully private - both parties in ShadowWire
});
```

### Private Escrow with Dispute Protection

```typescript
import { createPrivateEscrowHandler } from '@kamiyo/radr';

const escrow = await createPrivateEscrowHandler(connection, KAMIYO_PROGRAM_ID);

// Create escrow - amount hidden on-chain
const result = await escrow.createPrivateEscrow({
  wallet,
  provider: '8xYz...',
  amount: 5.0,
  token: 'USDC',
  transactionId: 'job_123',
  config: {
    privateDeposit: true,
    privateSettlement: true,
    timeLockSeconds: 86400,
    qualityThreshold: 80,
  },
});

// On service delivery - release privately
await escrow.releasePrivate({
  wallet,
  escrowPda: result.escrowPda,
  provider: '8xYz...',
  amount: 5.0,
  token: 'USDC',
  commitment: result.shadowProof,
});

// On dispute - oracles evaluate without seeing amount
await escrow.fileDispute({
  escrowPda: result.escrowPda,
  transactionId: 'job_123',
  reason: 'Service not delivered as specified',
  revealAmount: false,
});
```

### Reputation-Gated Pool Access

```typescript
import { createShadowIdReputationGate } from '@kamiyo/radr';

const gate = createShadowIdReputationGate(connection, KAMIYO_PROGRAM_ID);

// Check if wallet can access premium pools
const { eligible, tier, proof } = await gate.checkReputationGate(wallet, 50);

if (eligible) {
  console.log(`Access granted: ${tier} tier`);
  // proof contains ZK proof for verification
}
```

## ElizaOS Integration

```typescript
import { radrPlugin } from '@kamiyo/radr/eliza';

const agent = new AgentRuntime({
  plugins: [radrPlugin],
  // ...
});
```

Available actions:
- `SHADOW_PRIVATE_TRANSFER` - Send tokens privately
- `SHADOW_CHECK_BALANCE` - Check shielded balance
- `SHADOW_CREATE_ESCROW` - Create private escrow
- `SHADOW_CHECK_REPUTATION` - Check reputation gate
- `SHADOW_FILE_DISPUTE` - File private dispute
- `SHADOW_DEPOSIT` - Deposit to shielded pool

## LangChain Integration

```typescript
import { createRadrTools } from '@kamiyo/radr/langchain';
import { ChatOpenAI } from '@langchain/openai';

const tools = createRadrTools({
  connection,
  wallet,
  programId: KAMIYO_PROGRAM_ID,
});

const agent = createToolCallingAgent({
  llm: new ChatOpenAI({ model: 'gpt-4' }),
  tools,
  prompt,
});
```

Available tools:
- `radr_private_transfer`
- `radr_check_shielded_balance`
- `radr_create_private_escrow`
- `radr_check_reputation_gate`
- `radr_file_private_dispute`
- `radr_deposit_to_pool`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Frameworks                         │
│   ElizaOS Plugin    │    LangChain Tools    │    Direct SDK  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    @kamiyo/radr                              │
├─────────────────────────────────────────────────────────────┤
│  ShadowWireWrapper     │  PrivateEscrowHandler               │
│  - Private transfers   │  - Amount commitments               │
│  - Pool management     │  - Escrow creation                  │
│  - Balance queries     │  - Private settlement               │
├─────────────────────────────────────────────────────────────┤
│  ShadowIdReputationGate                                      │
│  - ZK reputation proofs                                      │
│  - Pool access gating                                        │
│  - Tier-based rate limits                                    │
└─────────────────────────────────────────────────────────────┘
         │                              │
┌────────────────────┐    ┌────────────────────────────────────┐
│  @radr/shadowwire  │    │         Kamiyo Protocol            │
│  - Bulletproofs    │    │  - Escrow PDAs                     │
│  - Relayers        │    │  - Oracle consensus                │
│  - Shielded pools  │    │  - Reputation system               │
└────────────────────┘    └────────────────────────────────────┘
```

## Supported Tokens

SOL, RADR, USDC, USDT, ORE, BONK, GODL, ZEC, JUP, PYTH, WIF, POPCAT, FARTCOIN, AI16Z, GRIFFAIN, PENGU, USD1

## Dispute Resolution

Private escrows support dispute resolution without revealing payment amounts:

1. **Agent creates escrow** with amount commitment (not plaintext)
2. **Provider delivers service**
3. **On success**: Private settlement via ShadowWire
4. **On dispute**: Oracles receive commitment, evaluate quality
5. **Settlement**: Funds distributed based on quality score

Quality-based refund schedule:
| Quality Score | Agent Refund | Provider Payout |
|---------------|--------------|-----------------|
| 80-100% | 0% | 100% |
| 65-79% | 35% | 65% |
| 50-64% | 75% | 25% |
| 0-49% | 100% | 0% |

## Reputation Tiers

| Tier | Score | Benefits |
|------|-------|----------|
| Platinum | 86-100 | Full access, 3x rate limits, priority relayer |
| Gold | 66-85 | Full access, 2x rate limits |
| Silver | 41-65 | Full access, 1.5x rate limits |
| Bronze | 1-40 | Basic access, standard rate limits |
| None | 0 | Limited access, reduced rate limits |

## Environment Variables

```bash
SOLANA_PRIVATE_KEY=<base64 or JSON array>
RPC_URL=https://api.mainnet-beta.solana.com
KAMIYO_PROGRAM_ID=8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM
```

## API Reference

### ShadowWireWrapper

```typescript
interface ShadowWireWrapper {
  initialize(): Promise<void>;
  getBalance(wallet: string, token: ShadowToken): Promise<ShieldedBalance>;
  deposit(params: DepositParams): Promise<{ transaction: unknown }>;
  withdraw(params: WithdrawParams): Promise<{ transaction: unknown }>;
  transfer(params: TransferParams): Promise<TransferResult>;
  canReceiveInternal(recipient: string): Promise<boolean>;
  calculateRelayerFee(amount: number): number;
  getSupportedTokens(): ShadowToken[];
}
```

### PrivateEscrowHandler

```typescript
interface PrivateEscrowHandler {
  initialize(debug?: boolean): Promise<void>;
  createPrivateEscrow(params: CreateParams): Promise<PrivateEscrowResult>;
  releasePrivate(params: ReleaseParams): Promise<ReleaseResult>;
  fileDispute(params: DisputeParams): Promise<PrivateDisputeResult>;
  settleDispute(params: SettleParams): Promise<SettleResult>;
  calculateSettlement(qualityScore: number, amount: number): DisputeSettlement;
}
```

### ShadowIdReputationGate

```typescript
interface ShadowIdReputationGate {
  checkReputationGate(wallet: WalletAdapter, threshold: number): Promise<ReputationGateResult>;
  verifyReputationProof(proof: ReputationProof): Promise<VerifyResult>;
  generateCombinedCredential(wallet, shadowId, threshold): Promise<CredentialResult>;
  calculateEffectiveRateLimit(shadowTier, reputationTier): number;
  canAccessPool(wallet, token, shadowTier): Promise<AccessResult>;
}
```

## License

MIT
