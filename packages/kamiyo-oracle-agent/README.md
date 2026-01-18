# @kamiyo/oracle-agent

Autonomous oracle agent for KAMIYO dispute resolution, built on ElizaOS.

## Overview

The Oracle Agent monitors disputed escrows on the KAMIYO protocol, evaluates service quality using LLM reasoning, and submits cryptographically signed votes to the blockchain. It earns rewards for accurate voting and manages economic risk automatically.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        ORACLE AGENT                              │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │  LISTENER   │───►│  EVALUATOR  │───►│  VOTE SUBMITTER     │  │
│  │  SERVICE    │    │  (LLM)      │    │  (Ed25519 + ZK)     │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                │                              │
                ▼                              ▼
        ┌──────────────┐              ┌──────────────┐
        │   SOLANA     │              │   HELIUS     │
        │   MAINNET    │              │   WEBHOOKS   │
        └──────────────┘              └──────────────┘
```

## Features

- **Dispute Monitoring**: Watches blockchain for disputed escrows
- **LLM Evaluation**: Uses Claude/GPT to assess service quality
- **Confidence Calibration**: Adjusts votes based on evidence strength
- **Risk Management**: Tracks violations and manages exposure
- **Auto-Voting**: Autonomous operation with configurable thresholds
- **Reward Claiming**: Periodically claims accumulated rewards

## Installation

```bash
npm install @kamiyo/oracle-agent
```

## Configuration

Required environment variables:

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
ORACLE_PRIVATE_KEY=<base64-encoded-private-key>
ANTHROPIC_API_KEY=<your-claude-api-key>
```

Optional:

```bash
HELIUS_API_KEY=<for-real-time-webhooks>
MIN_CONFIDENCE_TO_VOTE=medium  # low|medium|high
MAX_PENDING_DISPUTES=5
RISK_TOLERANCE=medium  # low|medium|high
AUTO_VOTE_ENABLED=true
POLL_INTERVAL_MS=30000
```

## Usage with ElizaOS

```typescript
import { kamiyoOraclePlugin } from '@kamiyo/oracle-agent';

// Add to your ElizaOS agent
const agent = createAgent({
  character: require('./character.json'),
  plugins: [kamiyoOraclePlugin],
});
```

## Actions

| Action | Description |
|--------|-------------|
| `EVALUATE_DISPUTE` | Manually evaluate a disputed escrow |
| `SUBMIT_ORACLE_VOTE` | Submit a quality score vote |
| `CHECK_ORACLE_PERFORMANCE` | View performance metrics |
| `CLAIM_ORACLE_REWARDS` | Claim accumulated rewards |

## Services

| Service | Description |
|---------|-------------|
| `disputeListenerService` | Monitors blockchain for disputes |
| `autoVoterService` | Autonomous voting on pending disputes |
| `rewardClaimerService` | Periodic reward claiming |

## Economics

- **Oracle Stake**: 1 SOL minimum
- **Rewards**: 1% of escrow amount, split among oracles
- **Slashing**: 10% of stake for deviating >15 points from consensus
- **Violations**: 3 violations = automatic removal

## Quality Score Mapping

| Score | Agent Refund | Provider Payment |
|-------|--------------|------------------|
| 80-100 | 0% | 100% |
| 65-79 | 35% | 65% |
| 50-64 | 75% | 25% |
| 0-49 | 100% | 0% |

## License

MIT
