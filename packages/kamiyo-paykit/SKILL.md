# KAMIYO Paykit

Payment toolkit for autonomous AI agents.

## Skill: Pay for Premium APIs

Automatically pay for x402-protected API endpoints.

### Triggers
- "fetch premium data"
- "pay for this API"
- "get data with payment"

### Example Prompts
- "Fetch premium market data from this x402 endpoint"
- "Get the latest analysis, I'll pay up to $0.05"

### What It Does
1. Checks if endpoint requires payment (HTTP 402)
2. Validates price is within budget
3. Signs payment with your wallet
4. Fetches the data
5. Optionally assesses response quality

---

## Skill: Create Job Escrow

Lock payment for a job until work is delivered.

### Triggers
- "create escrow"
- "lock payment"
- "secure this job"

### Example Prompts
- "Create an escrow for 0.1 SOL for job-123"
- "Lock payment for this task"

### What It Does
1. Creates on-chain escrow account
2. Locks funds for specified time period
3. Returns escrow address for verification
4. Funds release on quality verification

---

## Skill: Check Provider Reputation

Verify trustworthiness before transacting.

### Triggers
- "check reputation"
- "is this provider trustworthy"
- "should I use this service"

### Example Prompts
- "What's the reputation of this wallet?"
- "Is this API provider reliable?"

### What It Does
- Returns reputation score (0-1000)
- Shows trust tier: trusted/standard/caution/avoid
- Displays dispute rate and transaction history

---

## Skill: File Quality Dispute

Request refund for poor quality response.

### Triggers
- "file dispute"
- "request refund"
- "quality was poor"

### Example Prompts
- "This response was missing half the fields, dispute it"
- "The data quality was 25%, I want a refund"

### What It Does
1. Records quality evidence on-chain
2. Submits dispute to oracle network
3. Returns dispute ID for tracking
4. Refund processed after arbitration

---

## Configuration

```bash
# Required
AGENT_PRIVATE_KEY=<base58 Solana private key>

# Optional
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
MAX_PRICE_USD=1.0
```

## Quick Start

```typescript
import { createPaykitFromEnv } from '@kamiyo/paykit';

const paykit = createPaykitFromEnv();

// Fetch paid content
const result = await paykit.fetch('https://api.example.com/premium', {
  maxPriceUsd: 0.01,
});

// Check balance
const balance = await paykit.getBalance();
console.log(`Balance: ${balance.sol} SOL`);
```
