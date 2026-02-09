# KAMIYO MCP Skills

## Skill: Protected API Calls

Make API calls with payment protection using Solana escrow.

### Triggers
- "call API with escrow"
- "make a protected API call"
- "pay for API with dispute protection"

### Example Prompts
- "Call api.example.com/data with 0.01 SOL escrow, expect price and volume fields"
- "Make a protected call to the weather API with 0.005 SOL"

### What It Does
1. Creates escrow locking your funds
2. Calls the API endpoint
3. Assesses response quality against expected criteria
4. Auto-releases funds if quality is good
5. Auto-disputes if quality is poor

---

## Skill: Quality Assessment

Assess API response quality and estimate refunds.

### Triggers
- "assess quality"
- "check data quality"
- "estimate refund"

### Example Prompts
- "Assess the quality of this response: {json}"
- "What refund should I request for a 45% quality score on 0.1 SOL?"

### What It Does
- Scores responses on completeness, freshness, and schema compliance
- Calculates appropriate refund percentages
- Provides rationale for assessments

---

## Skill: Dispute Filing

File disputes for poor quality API responses.

### Triggers
- "file dispute"
- "dispute this transaction"
- "request refund"

### Example Prompts
- "File a dispute for transaction 1234-abc with 30% quality and 100% refund"
- "The API returned garbage data, dispute it"

### What It Does
- Marks escrow as disputed on-chain
- Records quality evidence
- Submits to oracle network for arbitration

---

## Skill: Provider Reputation

Check API provider reputation before transacting.

### Triggers
- "check reputation"
- "is this provider trustworthy"
- "what's the reputation of"

### Example Prompts
- "What's the reputation of 7xKp...Provider?"
- "Should I trust this API provider?"

### What It Does
- Queries on-chain reputation data
- Returns transaction history and dispute outcomes
- Provides trust recommendation (trusted/caution/avoid)

---

## Skill: x402 Payments

Pay for x402 HTTP 402 endpoints with USDC.

### Triggers
- "x402 payment"
- "pay for this endpoint"
- "check x402 pricing"

### Example Prompts
- "What does https://api.example.com/premium cost?"
- "Fetch premium data from this x402 endpoint"

### What It Does
- Checks endpoint pricing without paying
- Makes signed USDC payments
- Supports Base, Polygon, Arbitrum, and Solana networks

---

## Skill: Kamino AutoSave

Deposit idle USDC into Kamino Earn (KVault) vaults to earn yield automatically (saving/compounding, not trading).

### Triggers
- "autosave usdc"
- "deposit idle usdc"
- "earn yield on usdc"
- "suggest kamino vaults"

### Example Prompts
- "kamino_suggest_vaults with { \"limit\": 5, \"apyWindow\": \"apy30d\", \"minAumUsd\": 1000000 }"
- "AutoSave idle USDC: keep a 10 USDC buffer, deposit if idle >= 50 USDC, dry-run first"

### What It Does
- Suggests vaults by APY window with an AUM filter
- Builds deposit/withdraw transactions (dry-run by default)
- Auto-selects a vault and deposits idle USDC based on buffer/threshold settings
