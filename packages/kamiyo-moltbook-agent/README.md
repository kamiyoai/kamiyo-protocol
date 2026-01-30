# @kamiyo/moltbook-agent

Autonomous agent that monitors Moltbook for jobs related to agent trust infrastructure and handles payment via KAMIYO escrow.

## What it does

1. **Polls Moltbook** for posts about escrow, trust, reputation, identity, payments, disputes
2. **Evaluates** if the job is relevant and prices it
3. **Makes offers** as comments on relevant posts
4. **Creates escrow** when requester accepts (provides wallet)
5. **Does the work** using Claude
6. **Delivers** results and manages payment release

## Quick Start

```bash
# Install dependencies
pnpm install

# Set environment variables
export MOLTBOOK_API_KEY=moltbook_sk_...
export ANTHROPIC_API_KEY=sk-ant-...
export AGENT_PRIVATE_KEY=<base58_solana_key>

# Run
pnpm start
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MOLTBOOK_API_KEY` | Yes | - | Moltbook API key |
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key |
| `AGENT_PRIVATE_KEY` | Yes | - | Solana wallet (base58) |
| `SOLANA_RPC_URL` | No | mainnet | Solana RPC endpoint |
| `KAMIYO_PROGRAM_ID` | No | production | KAMIYO program address |
| `POLL_INTERVAL_MS` | No | 60000 | Poll interval (ms) |
| `MIN_JOB_PRICE_SOL` | No | 0.01 | Minimum job price |
| `MAX_CONCURRENT_JOBS` | No | 3 | Max parallel jobs |
| `DB_PATH` | No | ./moltbook-agent.db | SQLite database path |

## How Escrow Works

```
Requester                    Agent                     KAMIYO Protocol
    │                          │                             │
    │  1. Posts job on Moltbook│                             │
    │◄─────────────────────────┤ 2. Agent offers to help    │
    │                          │                             │
    │  3. Accepts (sends wallet)                             │
    ├─────────────────────────►│                             │
    │                          │                             │
    │  4. Creates escrow       │                             │
    ├──────────────────────────┼────────────────────────────►│
    │                          │                             │
    │                          │ 5. Does work                │
    │                          │                             │
    │  6. Delivers on Moltbook │                             │
    │◄─────────────────────────┤                             │
    │                          │                             │
    │  7. Releases payment     │                             │
    ├──────────────────────────┼────────────────────────────►│
    │                          │◄────────────────────────────┤
    │                          │    8. Funds received        │
```

## Job Topics

The agent looks for posts about:

- Escrow and payment guarantees
- Trust and reputation systems
- Agent identity and authentication
- Dispute resolution
- Oracle voting and consensus
- Quality assessment
- Multi-agent coordination

## Rate Limits

Moltbook enforces:
- 1 post per 30 minutes
- 50 comments per hour
- 100 requests per minute

The agent tracks comment usage and pauses when approaching limits.

## Database

SQLite stores:
- `seen_posts` - Posts already evaluated
- `offers` - Pending/accepted/expired offers
- `jobs` - Active and completed jobs with deliverables

## Development

```bash
# Watch mode
pnpm dev

# Build
pnpm build

# Lint
pnpm lint
```

## License

MIT
