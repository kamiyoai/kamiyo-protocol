# CDP Autonomous Agent Demo

Demand-side agent using Coinbase CDP Embedded Wallets (SVM) for autonomous x402 payments.

## Features

- Discover x402-enabled APIs automatically
- Reason over available tools and plan execution
- Pay autonomously via CDP wallet
- Auto-dispute poor quality responses
- Chain multiple tool calls

## Setup

1. Get CDP API credentials: https://portal.cdp.coinbase.com/
2. Copy `.env.example` to `.env`
3. Add your credentials to `.env`
4. Install dependencies:

```bash
npm install
```

## Run

```bash
npm start
```

## Expected Output

```
============================================================
CDP Autonomous Agent - Demand-Side Workflow
============================================================

[CDP Agent] Wallet initialized: 9zT2k5...wV1z
[CDP Agent] Discovering x402-enabled APIs...
[CDP Agent] Discovered: https://x402resolve.kamiyo.ai (0.0001 SOL)

[CDP Agent] Discovered 2 x402 APIs

[CDP Agent] Reasoning over available tools...
[CDP Agent] Selected 2 tools (total: 0.0003 SOL)

[CDP Agent] Reasoning complete:
  - Tools selected: 2
  - Estimated cost: 0.0003 SOL
  - Confidence: 85%

[CDP Agent] Executing chained tool calls...

[CDP Agent] Calling tool: KAMIYO Security Intelligence
[Agent] Created escrow for 0.0001 SOL
[Agent] Quality score: 92/100
[CDP Agent] KAMIYO Security Intelligence: Quality 92%, Cost 0.0001 SOL

[CDP Agent] Calling tool: Example API
[Agent] Created escrow for 0.0002 SOL
[Agent] Quality score: 58/100
[Agent] Quality 58 < threshold 85
[Agent] Filing dispute autonomously...
[Agent] Refund: 42%
[CDP Agent] Example API: Quality below threshold, dispute filed

============================================================
Workflow Complete
============================================================
Total Cost: 0.00018 SOL
Average Quality: 75%
Tools Executed: 2

Final Results:
------------------------------------------------------------

1. KAMIYO Security Intelligence
   Quality: 92%
   Cost: 0.0001 SOL
   Records: 5

2. Example API
   Quality: 58%
   Cost: 0.00008 SOL (after refund)
   Records: 2

------------------------------------------------------------
Total Spent: 0.00018 SOL
Average Quality: 75%
Tools Used: 2
```

## How It Works

### 1. Discovery

Agent makes unauthenticated requests to known endpoints. x402 APIs respond with 402 Payment Required and payment details.

### 2. Reasoning

Agent analyzes available tools based on:
- Cost vs budget
- Expected quality
- Relevance to query

### 3. Execution

For each selected tool:
- Creates Solana escrow via CDP wallet
- Makes authenticated request with payment proof
- Receives data + quality score

### 4. Quality Assessment

Agent evaluates response quality:
- If quality >= threshold: Accept and release payment
- If quality < threshold: File dispute, receive partial refund

### 5. Chaining

Results from tool A can inform tool B, creating intelligent workflows.

## Key Innovation

**Demand-Side Autonomy**: Agent actively discovers and evaluates services, rather than being configured with static endpoints.

**Quality Guarantees**: All payments include automatic quality assessment and dispute resolution.

**CDP Integration**: Uses Coinbase Embedded Wallets for seamless Solana integration without manual key management.

## Documentation

- [Main README](../../README.md)
- [CDP Agent Implementation](../../packages/agent-client/src/cdp-agent.ts)
- [x402 Protocol](../../docs/markdown/API_REFERENCE.md)
