# @kamiyo/eliza

Kamiyo plugin for ElizaOS. Escrow payments, dispute resolution, reputation.

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

| Action | Description |
|--------|-------------|
| `CREATE_KAMIYO_ESCROW` | Lock funds for provider |
| `RELEASE_KAMIYO_ESCROW` | Release after delivery |
| `FILE_KAMIYO_DISPUTE` | Dispute quality issues |
| `CONSUME_PAID_API` | x402 API with escrow |
| `CHECK_KAMIYO_REPUTATION` | Query reputation |

## Providers

| Provider | Context |
|----------|---------|
| `walletProvider` | Balance, escrow count |
| `escrowProvider` | Active escrows |
| `reputationProvider` | Payment history |

## Evaluators

| Evaluator | Purpose |
|-----------|---------|
| `qualityEvaluator` | Auto-dispute below threshold |
| `trustEvaluator` | Provider risk assessment |

## Config

| Setting | Default | Description |
|---------|---------|-------------|
| `KAMIYO_NETWORK` | `devnet` | Network |
| `SOLANA_PRIVATE_KEY` | - | Base64 private key |
| `KAMIYO_QUALITY_THRESHOLD` | `80` | Min quality % |
| `KAMIYO_MAX_PRICE` | `0.01` | Max SOL per request |
| `KAMIYO_AUTO_DISPUTE` | `true` | Auto-file disputes |
| `KAMIYO_MIN_REPUTATION` | `60` | Min provider rep |

## Dispute Settlement

| Quality | Agent Refund |
|---------|--------------|
| 80-100% | 0% |
| 65-79% | 35% |
| 50-64% | 75% |
| 0-49% | 100% |

## License

MIT
