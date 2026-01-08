# @kamiyo/eliza

Trust layer plugin for ElizaOS agents. Escrow payments, dispute resolution, and reputation tracking on Solana.

## Installation

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
    KAMIYO_QUALITY_THRESHOLD: '80',
    KAMIYO_MAX_PRICE: '0.01',
    KAMIYO_AUTO_DISPUTE: 'true',
  },
});
```

## Actions

| Action | Description |
|--------|-------------|
| `CREATE_KAMIYO_ESCROW` | Lock funds in escrow for a provider |
| `RELEASE_KAMIYO_ESCROW` | Release funds after service delivery |
| `FILE_KAMIYO_DISPUTE` | File dispute for quality issues |
| `CONSUME_PAID_API` | Call x402 API with payment and quality verification |
| `CHECK_KAMIYO_REPUTATION` | Check agent/provider reputation |

## Providers

| Provider | Context |
|----------|---------|
| `walletProvider` | Wallet balance and active escrows |
| `escrowProvider` | Active escrow status |
| `reputationProvider` | Payment history and quality stats |

## Evaluators

| Evaluator | Purpose |
|-----------|---------|
| `qualityEvaluator` | Triggers disputes when quality < threshold |
| `trustEvaluator` | Assesses provider risk before payment |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `KAMIYO_NETWORK` | `devnet` | `mainnet`, `devnet`, or `localnet` |
| `SOLANA_PRIVATE_KEY` | - | Base64-encoded private key |
| `KAMIYO_QUALITY_THRESHOLD` | `80` | Minimum quality (0-100) |
| `KAMIYO_MAX_PRICE` | `0.01` | Max price per request in SOL |
| `KAMIYO_AUTO_DISPUTE` | `true` | Auto-file disputes below threshold |
| `KAMIYO_MIN_REPUTATION` | `60` | Min provider reputation to trust |

## Dispute Resolution

When quality falls below threshold:

| Quality | Agent Refund | Provider Payment |
|---------|--------------|------------------|
| 80-100% | 0% | 100% |
| 65-79% | 35% | 65% |
| 50-64% | 75% | 25% |
| 0-49% | 100% | 0% |

Oracle consensus determines final settlement.

## License

MIT
