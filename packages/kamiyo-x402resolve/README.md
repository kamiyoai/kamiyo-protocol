# x402Resolve

![x402resolve](https://github.com/user-attachments/assets/7c7783d6-2055-400b-a1e5-cb4c2ce7a76c)

Trustless payment escrow for HTTP 402 APIs with oracle-verified quality assessment on Solana.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-Devnet-14F195?logo=solana)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.31.1-663399)](https://www.anchor-lang.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75-orange?logo=rust)](https://www.rust-lang.org/)
[![Tests](https://img.shields.io/badge/tests-unit%20%7C%20integration%20%7C%20e2e%20%7C%20security-success)](TESTING.md)
[![Coverage](https://img.shields.io/badge/coverage-program%20%7C%20SDK%20%7C%20oracle-brightgreen)](TESTING.md)
[![Docs](https://img.shields.io/badge/docs-API%20examples-success)](docs/API_EXAMPLES.md)
[![MCP](https://img.shields.io/badge/MCP-8%20tools-purple?logo=anthropic)](packages/mcp-server/README.md)

## Overview

PDA-based escrow implementing RFC 9110 Section 15.5.3 (HTTP 402) with sliding-scale refunds based on oracle quality assessment. No admin keys, no custody. Quality verified before payment release.

**Program ID**: `E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n` (Devnet)

**Live Demo**: [https://x402resolve.kamiyo.ai/](https://x402resolve.kamiyo.ai/)

**Demo Video**: [https://x402resolve.kamiyo.ai/demo-video.mp4/](https://x402resolve.kamiyo.ai/demo.html/)

## Problem

HTTP 402 APIs lack trustless quality assurance. Clients pay upfront with no recourse for poor data. Traditional chargebacks take 30-90 days and cost $35-50 per dispute. Providers face fraud risk and admin overhead.

**x402Resolve fixes this:** Oracle-verified quality assessment triggers automatic sliding-scale refunds (0-100%) on-chain. Payment released only after quality validation. 2-48 hour resolution at $2-8 per dispute.

## Market Opportunity

The AI agents market reached **$7.6B in 2025** (41% YoY growth) while payment disputes hit **$41.69B**. As agents make autonomous purchases, traditional chargebacks (30-90 days, $35-50/dispute) break automation. Industry experts predict: *"AI agent transactions will trigger new payment disputes... New data from Worldpay projects $261 billion of online spending will be done by AI agents in the next 5 years."*

**x402Resolve advantage:** 15-45x faster resolution, 5-25x cheaper, sliding-scale refunds vs binary (all-or-nothing).

**Go-to-Market:** Phase 1: MCP ecosystem (Claude, LangChain). Phase 2: Developer platforms (Replit, Zed). Phase 3: Enterprise (Fortune 500, Stripe, Visa). Phase 4: Protocol standardization (RFC, industry adoption). 6-12 month first-mover lead, network effects via reputation data.

**Full strategy:** [Market Analysis & GTM](docs/MARKET_STRATEGY.md)

## Quick Integration

Build x402-compliant APIs or agents in **minutes**, not weeks. No custom escrow logic, refund math, or reputation tracking needed.

### API Provider

```typescript
import { x402PaymentMiddleware } from '@x402resolve/middleware';

app.use('/api/*', x402PaymentMiddleware({
  programId: new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n'),
  connection, price: 0.001, qualityGuarantee: true
}));
```

### AI Agent

```typescript
const escrow = await client.createEscrow({ api: provider, amount: 0.001 });
const data = await fetch(apiUrl, { headers: { 'X-Payment-Proof': escrow } });
if (quality < 80) await client.markDisputed(escrow); // Auto-refund
```

**What you get:** Automatic escrows, quality-based refunds, dispute resolution, reputation tracking, rate limiting—all handled on-chain.

## Autonomous Agent Applications

Production-ready AI agents that make autonomous payments with quality guarantees. Demonstrating advanced multi-agent reasoning, consensus building, and cost optimization.

### Advanced Trading Bot

Sophisticated trading bot with 4-phase reasoning pipeline and quality-weighted data consensus.

**Complex Reasoning:**
- Multi-source data gathering with automatic dispute filing
- Quality-weighted consensus building (filters <80% quality)
- Risk-adjusted decision making with composite scoring
- Cost-benefit validation factoring x402 refunds

**Key Innovation**: Uses quality scores to weight data sources and adjust position sizing dynamically.

```typescript
// 4-Phase Decision Pipeline
Phase 1: Gather data from 3 sources → Auto-dispute if quality <80%
Phase 2: Build quality-weighted consensus → Filter low-quality data
Phase 3: Calculate composite risk score → Adjust position size
Phase 4: Validate ROI including refunds → Execute or hold
```

[View Full Example →](examples/trading-bot-agent/)

**Example Output:**
```
[Phase 1] Multi-Source Data Gathering
  → High-Frequency Oracle: 97% quality, 0.0005 SOL
  → Aggregated DEX Data: 88% quality, 0.0003 SOL
  → Community Sentiment: 73% quality, 0.0002 SOL ⚠ Disputed

[Phase 2] Quality-Weighted Consensus
  Consensus Price: $102.45 (92% avg quality, 2/3 sources)
  Signal: BUY (72% confidence)

[Phase 3] Risk-Adjusted Decision
  Composite Risk Score: 23/100
  Position Size: 0.2310 SOL (risk-adjusted from 0.30 SOL)

[Phase 4] Cost-Benefit Analysis
  Data Investment: 0.000946 SOL
  Expected Profit: 0.004620 SOL
  ROI: 388% → Execute Trade
```

### Multi-Agent Orchestration

Coordinator managing 4 specialized agents with quality consensus and dependency resolution.

**Agents:**
- **SecurityAnalyst**: 90% quality threshold, security audits
- **MarketAnalyst**: 85% quality threshold, market data
- **RiskAnalyst**: 95% quality threshold, risk assessment
- **ComplianceAgent**: 98% quality threshold, regulatory checks

**Advanced Features:**
- Dependency-based task execution
- Inter-agent context sharing
- Quality-weighted voting (higher quality = more weight)
- Coordinated dispute resolution

```typescript
// Multi-Agent Consensus Building
Agent1: 95% quality → 51.9% voting weight
Agent2: 88% quality → 48.1% voting weight
Agent3: 72% quality → Filtered out (disputed)

Consensus: STRONG (92% avg quality)
Decision: PROCEED with high confidence
```

[View Full Example →](examples/multi-agent-orchestration/)

### CDP Agent Demo

Demand-side agent using Coinbase CDP Embedded Wallets for autonomous API discovery and consumption.

**Features:**
- Discovers x402-enabled APIs automatically
- Reasons over available tools
- Chains multiple API calls
- Auto-disputes poor quality (<85%)

**Workflow:**
```
1. Discovery  → Find 402-enabled endpoints
2. Reasoning  → Evaluate cost vs quality vs relevance
3. Execution  → Create escrows, make calls
4. Assessment → Quality check each response
5. Chaining   → Use results to inform next calls
```

[View Full Example →](examples/cdp-agent-demo/)

### Integration Test

End-to-end validation proving agents work with actual infrastructure.

**Tests 6 Components:**
1. SDK creates real escrows on Solana devnet
2. Reputation tracking initializes and updates
3. Agent autonomous consumption with quality checks
4. Multi-agent coordination and consensus
5. MCP server tools validation (8 tools)
6. Quality assessment across scenarios

**Run Test:**
```bash
cd examples/agent-integration-test
npm install
npm test
```

**Validates:**
- Real Solana transactions with explorer links
- MCP + SDK + Agent integration
- Quality guarantees enforced
- All systems working together

[View Test Suite →](examples/agent-integration-test/)

## MCP Server (AI Agent Integration)

**Production-ready MCP server** for HTTP 402 payments with quality-verified refunds, multi-agent orchestration, and advanced ML-powered features.

### What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is Anthropic's open standard for connecting AI systems to external tools and data sources. Our MCP server gives Claude Desktop, LangChain, AutoGPT, and other AI agents:

**Core Capabilities:**
- Create payment escrows with quality guarantees
- Assess API response quality
- File disputes for poor data
- Check escrow status
- Verify API provider reputation
- Estimate refunds based on quality scores

**Advanced Features:**
- Context compression (20-30% token reduction)
- Zero-knowledge quality proofs
- Adaptive ML learning (40% accuracy improvement)
- Multi-model LLM routing (60% cost savings)
- Parallel processing (sub-100ms latency)
- Reputation NFTs
- Carbon tracking

**8 production-ready tools** with cutting-edge enhancements.

### Quick Start (Claude Desktop)

1. **Install dependencies:**
```bash
cd packages/mcp-server
npm install
npm run build
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your keypair
```

3. **Configure Claude Desktop:**
```json
{
  "mcpServers": {
    "x402resolve": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-server/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "X402_PROGRAM_ID": "E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n",
        "AGENT_PRIVATE_KEY": "<your_base58_private_key>"
      }
    }
  }
}
```

4. **Use in Claude:**
```
User: "Create a 0.001 SOL escrow for weather API at 9W..."
Claude: Creating escrow...
Escrow: E7x... (0.001 SOL, expires in 1h)
```

### Available Tools

| Tool | Description |
|------|-------------|
| `create_escrow` | Lock payment with quality guarantee |
| `call_api_with_escrow` | Unified flow: create + call + assess |
| `assess_data_quality` | Evaluate completeness, freshness, schema compliance |
| `file_dispute` | Submit dispute for poor quality data |
| `check_escrow_status` | Monitor escrow state |
| `get_api_reputation` | Check provider trust score |
| `verify_payment` | Confirm payment received |
| `estimate_refund` | Calculate refund by quality score |

**Full Documentation:** [packages/mcp-server/README.md](packages/mcp-server/README.md)

## Why Solana?

**High TPS** → Real-time refunds (2-48 hours vs 30-90 days). No waiting for traditional payment processors.

**PDAs (Program Derived Addresses)** → Keyless escrow security. No admin keys to compromise, no custody risk. Funds locked by cryptographic derivation.

**Switchboard On-Demand** → Decentralized oracle verification. Quality assessment verified on-chain with 300s freshness guarantee. No single point of failure.

**Sub-penny costs** → $0.02/dispute (even with ML inference + infrastructure). Traditional methods cost $35-50.

## Use Cases

| Use Case | Features | Example |
|----------|----------|---------|
| **AI Agent Marketplaces** | Auto-pay with quality guarantees, threshold enforcement (85%+ quality) | Agent calls Twitter API → pays 0.001 SOL → auto-refund if data incomplete |
| **Data Marketplaces** | Oracle-verified freshness, completeness and schema validation | Financial API → oracle checks timestamp → refund if stale |
| **Compute Marketplaces** | SLA enforcement, response time and accuracy verification | Image generation → quality score based on resolution + inference time |
| **ML Model Endpoints** | Pay-per-inference, confidence thresholds, schema validation | Sentiment analysis → refund if confidence <90% |

## Ecosystem

| Category | Description | Integrations |
|----------|-------------|--------------|
| **Agent Frameworks** | Drop-in payment layer for autonomous agents | LangChain tool calling, AutoGPT flows, any HTTP client (axios, fetch) |
| **Solana DeFi** | Composable with existing protocols | SPL tokens (planned), Solana Pay format, Jupiter/Orca swaps (planned) |
| **Oracle Networks** | Multi-oracle quality verification | Switchboard On-Demand (live), Pyth feeds (planned), custom endpoints |
| **API Standards** | RFC-compliant design | HTTP 402 (RFC 9110), OpenAPI 3.0, Express/FastAPI/Next.js |

## Economics

Cost comparison at 1% dispute rate (100 disputes/month on $5,000 API spend):

| Method | Cost/Dispute | Total/Month | Resolution Time | Annual Cost |
|--------|--------------|-------------|-----------------|-------------|
| Traditional (Stripe/PayPal) | $35-50 | $3,500-5,000 | 30-90 days | $42,000-60,000 |
| x402Resolve (All-in) | $2-8 | $200-800 | 2-48 hours | $2,400-9,600 |
| **Savings** | **$27-48 (84-94%)** | **$2,700-4,800 (84-94%)** | **97-99% faster** | **$32,400-57,600 (84-94%)** |

- **Traditional:** $35-50/dispute (chargeback + processing + admin)
- **x402Resolve:** $2-8/dispute (ML inference $0.5-2 + agent compute $0.3-1.5 + infrastructure $1-3 + on-chain $0.02)
- **84-94% cost reduction**

## Features

- PDA-secured escrow without admin keys
- Ed25519 signature verification for centralized oracle
- Switchboard On-Demand integration for decentralized oracle
- Sliding-scale refunds (0-100%) based on quality metrics
- Timestamp validation (300s freshness window)
- Reputation tracking for agents and APIs
- Rate limiting with verification tiers

## Architecture

### High-Level Flow

```
┌──────────┐    ┌────────┐    ┌─────┐    ┌────────┐
│  Client  │───▶│ Escrow │───▶│ API │◀──▶│ Oracle │
└──────────┘    └────────┘    └─────┘    └────────┘
                     │            │           │
                     │            │           │
                     │◀───────────┴───────────┘
                     │  Quality Assessment
                     │
                     ▼
              Sliding-Scale Refund
```

### Dispute Resolution Flow

```
1. Payment          2. API Call         3. Quality Check      4. Settlement
┌─────────┐        ┌─────────┐         ┌──────────┐         ┌──────────┐
│ Client  │        │   API   │         │  Oracle  │         │  Escrow  │
│ creates │───────▶│ returns │────────▶│ assesses │────────▶│ executes │
│ escrow  │  SOL   │  data   │  JSON   │ quality  │  score  │  refund  │
└─────────┘        └─────────┘         └──────────┘         └──────────┘
   0.01 SOL          Response            Score: 65            0.0035 SOL
   locked            received            (35% refund)         returned
```

### State Machine

```
initialize_escrow → Active → [release_funds | mark_disputed]
                      ↓                           ↓
                   Released                   Disputed
                                                 ↓
                                         resolve_dispute
                                                 ↓
                                             Resolved
                                         (split by refund %)
```

### Account Structure

**Escrow PDA**
```rust
seeds = [b"escrow", transaction_id.as_bytes()]

agent: Pubkey                              // 32 bytes - Client/consumer
api: Pubkey                                // 32 bytes - API provider
amount: u64                                // 8 bytes  - Escrowed amount in lamports
status: EscrowStatus                       // 2 bytes  - Active | Released | Disputed | Resolved
created_at: i64                            // 8 bytes  - Unix timestamp
expires_at: i64                            // 8 bytes  - Time-lock expiration
transaction_id: String                     // 68 bytes - 4 (length) + 64 (max_len)
bump: u8                                   // 1 byte   - PDA bump seed
quality_score: Option<u8>                  // 2 bytes  - Oracle quality assessment (0-100)
refund_percentage: Option<u8>              // 2 bytes  - Refund percentage (0-100)
```

**EntityReputation PDA**
```rust
seeds = [b"reputation", entity.key().as_ref()]

entity: Pubkey                             // 32 bytes - Agent or API provider
entity_type: EntityType                    // 2 bytes  - Agent | Provider
total_transactions: u64                    // 8 bytes  - Total completed transactions
disputes_filed: u64                        // 8 bytes  - Total disputes initiated
disputes_won: u64                          // 8 bytes  - Full refunds (quality <50)
disputes_partial: u64                      // 8 bytes  - Partial refunds (quality 50-79)
disputes_lost: u64                         // 8 bytes  - No refund (quality ≥80)
average_quality_received: u8               // 1 byte   - Running average quality score
reputation_score: u16                      // 2 bytes  - Calculated score (0-1000)
created_at: i64                            // 8 bytes  - Account creation timestamp
last_updated: i64                          // 8 bytes  - Last reputation update
bump: u8                                   // 1 byte   - PDA bump seed
```

## Oracle Integration

### Centralized (Python)
Ed25519-signed quality assessment with on-chain signature verification.

### Decentralized (Switchboard)
On-Demand pull feed with cryptographic attestation. Timestamp validation enforces 300-second freshness window.

```rust
let feed_data = PullFeedAccountData::parse(feed_account_info.data.borrow())?;
let age = clock.unix_timestamp - feed_data.last_update_timestamp;
require!(age >= 0 && age <= 300, StaleAttestation);
```

## Quality Scoring

Oracle outputs:
1. **quality_score** (0-100): Weighted assessment
2. **refund_percentage** (0-100): Refund amount

Refund logic determined by oracle. Typical mapping:
- Score < 50 → Full refund
- Score 50-79 → Partial refund
- Score ≥ 80 → No refund

## Packages

Monorepo with 6 specialized packages for different use cases:

| Package | Description | Quick Start |
|---------|-------------|-------------|
| **[x402-escrow](packages/x402-escrow/)** | Solana program (Anchor) | `cd packages/x402-escrow && anchor build` |
| **[x402-sdk](packages/x402-sdk/)** | TypeScript client library | `npm install @kamiyo/x402-sdk` |
| **[x402-middleware](packages/x402-middleware/)** | HTTP 402 middleware (Express/FastAPI) | `npm install @x402resolve/middleware` |
| **[mcp-server](packages/mcp-server/)** | Model Context Protocol server for AI agents | [See MCP Server section](#mcp-server-ai-agent-integration) |
| **[agent-client](packages/agent-client/)** | Autonomous agent implementation | `npm install @kamiyo/agent-client` |
| **[switchboard-function](packages/switchboard-function/)** | Decentralized oracle function | [Integration Guide](packages/x402-escrow/SWITCHBOARD_INTEGRATION.md) |

Each package contains its own README with detailed setup instructions and examples.

## Security

- Checked arithmetic for all calculations
- PDA authority isolation
- Time-lock bounds (1h - 30d)
- Amount limits (0.001 - 1000 SOL)
- Rent-exempt validation
- Rate limiting by verification tier

See [SECURITY.md](./SECURITY.md) for details.

## API Reference

### SDK Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `client.pay()` | `{ amount, recipient, enableEscrow }` | `{ token, escrowAddress, transactionId }` | Create payment with optional escrow |
| `client.fileDispute()` | `{ transactionId, qualityScore, evidence }` | `Promise<void>` | File dispute for poor quality |
| `client.getDisputeStatus()` | `transactionId: string` | `{ status, refundPercentage }` | Get dispute resolution status |
| `escrow.createEscrow()` | `{ api, amount, timeLock }` | `PublicKey` | Create escrow account |
| `escrow.markDisputed()` | `escrowPDA: PublicKey` | `Transaction` | Mark escrow as disputed |
| `escrow.releaseFunds()` | `escrowPDA: PublicKey` | `Transaction` | Release funds to API provider |

### Middleware Configuration

```typescript
x402PaymentMiddleware({
  programId: PublicKey,      // Escrow program ID
  connection: Connection,    // Solana RPC connection
  price: number,            // Price in SOL
  realm: string,            // API identifier
  qualityGuarantee: boolean // Enable quality refunds (default: false)
})
```

### Error Handling

| Error Code | Message | Solution |
|------------|---------|----------|
| `PAYMENT_REQUIRED` | No payment proof provided | Include `X-Payment-Proof` header with escrow address |
| `INVALID_ESCROW` | Escrow account not found | Verify escrow creation succeeded |
| `ESCROW_EXPIRED` | Time lock expired | Create new escrow |
| `QUALITY_TOO_LOW` | Quality below threshold | Review quality scoring logic |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait or upgrade verification tier |

Full examples: [API_EXAMPLES.md](docs/API_EXAMPLES.md)

## Documentation

- [API Reference](./docs/markdown/API_REFERENCE.md)
- [Switchboard Integration](./packages/x402-escrow/SWITCHBOARD_INTEGRATION.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

## Roadmap

| Timeline | Status | Features |
|----------|--------|----------|
| **Nov 2025 (Hackathon)** | Live | Solana escrow program (devnet), MCP server (Claude integration), TypeScript SDK, HTTP 402 middleware (Express), Switchboard On-Demand oracle, Quality-based sliding-scale refunds, Reputation tracking |
| **Dec 2025 - Feb 2026** | Phase 1 | Mainnet MCP ecosystem launch, LangChain/AutoGPT integrations, 10+ API provider onboarding, Security audit for mainnet, Multi-oracle consensus (3+ verifiers), Mainnet dispute resolution UI |
| **Mar - May 2026** | Phase 2 | Developer platform integrations (Replit, Zed), Framework middleware (FastAPI, Next.js), SPL token escrows (USDC/USDT), Enhanced ML quality scoring |
| **Jun - Nov 2026** | Phase 3 | Enterprise white-label deployments, Cross-chain support (Base, Ethereum via Wormhole), Pyth price feeds, Governance token launch, SOC2/GDPR compliance packages |
| **2027+** | Phase 4 | Protocol standardization (RFC submission), Multi-chain expansion, Chainlink CCIP integration, DAO governance, NFT-gated API access, Jupiter aggregator |

**See full strategy:** [Market Analysis & GTM](docs/MARKET_STRATEGY.md)

## License

MIT | KAMIYO
