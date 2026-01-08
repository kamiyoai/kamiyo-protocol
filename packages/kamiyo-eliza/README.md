# @kamiyo/eliza

ElizaOS plugin for escrow payments, dispute resolution, and reputation on Solana.

## Install

```bash
npm install @kamiyo/eliza
```

## Usage

```typescript
import { kamiyoPlugin } from '@kamiyo/eliza';

const agent = new AgentRuntime({
  plugins: [kamiyoPlugin],
  settings: {
    KAMIYO_NETWORK: 'mainnet',
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
  },
});
```

## Actions

| Action | Trigger | Description |
|--------|---------|-------------|
| `CREATE_KAMIYO_ESCROW` | "escrow", "lock funds" | Lock SOL in escrow for a provider |
| `RELEASE_KAMIYO_ESCROW` | "release", "approve payment" | Release funds after delivery |
| `FILE_KAMIYO_DISPUTE` | "dispute", "refund" | File dispute for oracle arbitration |
| `CONSUME_PAID_API` | "fetch", "api" | Call x402 API with auto-escrow |
| `CHECK_KAMIYO_REPUTATION` | "reputation", "trust" | Query on-chain reputation |

### Create Escrow

```
User: Create escrow for 0.1 SOL to provider 8xYz...
Agent: Escrow created: 0.1 SOL locked for 8xYz... (24h timelock)
```

### Release Funds

```
User: Release escrow tx_abc123 to provider
Agent: Released. Provider 8xYz... paid.
```

### File Dispute

```
User: Dispute tx_abc123 - quality was 40%
Agent: Dispute filed. Expected refund: 100%. Oracles will arbitrate.
```

### Check Reputation

```
User: Check reputation of 8xYz...
Agent: 8xYz...: 92% rep, 0.5 SOL staked, 150 agreements, 2% dispute rate, low risk
```

## Providers

| Provider | Context Added |
|----------|---------------|
| `walletProvider` | Balance, network, active escrow count |
| `escrowProvider` | Active/disputed escrows, locked amount |
| `reputationProvider` | Payment history, avg quality, disputes |

## Evaluators

| Evaluator | Purpose |
|-----------|---------|
| `qualityEvaluator` | Auto-dispute if quality < threshold |
| `trustEvaluator` | Risk assessment before payment |

## Services

| Service | Description |
|---------|-------------|
| `escrowMonitorService` | Monitors escrows, auto-disputes on expiry |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `KAMIYO_NETWORK` | `mainnet` | `mainnet`, `devnet`, or `localnet` |
| `SOLANA_PRIVATE_KEY` | — | Base64-encoded keypair |
| `KAMIYO_QUALITY_THRESHOLD` | `80` | Min quality % before auto-dispute |
| `KAMIYO_MAX_PRICE` | `0.01` | Max SOL per API request |
| `KAMIYO_AUTO_DISPUTE` | `true` | Auto-file disputes on quality failure |
| `KAMIYO_MIN_REPUTATION` | `60` | Min provider reputation to trust |
| `KAMIYO_MONITOR_INTERVAL` | `60000` | Escrow check interval (ms) |

## Dispute Resolution

Oracle votes determine refund percentage:

| Quality | Agent Refund | Provider |
|---------|--------------|----------|
| 80-100% | 0% | 100% |
| 65-79% | 35% | 65% |
| 50-64% | 75% | 25% |
| 0-49% | 100% | 0% |

## On-Chain Integration

All actions call the live Kamiyo program on Solana:

- **Program ID**: `8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM`
- **Dashboard**: https://protocol.kamiyo.ai
- **Solscan**: https://solscan.io/account/8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM

## Example: Autonomous Agent

```typescript
import { AgentRuntime } from '@elizaos/core';
import { kamiyoPlugin } from '@kamiyo/eliza';

const agent = new AgentRuntime({
  plugins: [kamiyoPlugin],
  settings: {
    KAMIYO_NETWORK: 'mainnet',
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
    KAMIYO_QUALITY_THRESHOLD: '75',
    KAMIYO_AUTO_DISPUTE: 'true',
  },
});

// Agent can now:
// 1. Evaluate provider trust before payment
// 2. Create escrows with timelocks
// 3. Auto-dispute low-quality responses
// 4. Release funds on successful delivery
// 5. Track reputation and payment history
```

## License

MIT
