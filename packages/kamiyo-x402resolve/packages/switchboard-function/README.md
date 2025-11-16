# x402Resolve Switchboard Function

Quality scoring function for x402Resolve dispute resolution, deployed on Switchboard On-Demand oracle network.

## Overview

This function calculates data quality scores using:
- **Semantic Similarity (40%)**: Jaccard similarity with keyword boosting
- **Completeness (40%)**: Criteria coverage and record count matching
- **Freshness (20%)**: Timestamp-based data recency

Returns quality score (0-100) and refund percentage (0-100).

## Algorithm Details

### Semantic Matching
Uses Jaccard similarity with domain-specific keyword boosting to approximate ML-based embeddings. Includes length penalty for minimal responses.

**Key terms**: exploit, protocol, amount, usd, solana, ethereum, hack, vulnerability, defi, uniswap, curve, aave, compound, attack, stolen, loss, breach

### Refund Thresholds
- **80-100**: No refund (0%)
- **50-79**: Sliding scale `((80 - score) / 80) * 100`
- **0-49**: Full refund (100%)

### Freshness Scoring
- **0-30 days**: 1.0 (fresh)
- **30-90 days**: 0.7 (medium)
- **90+ days**: 0.3 (old)

## Development

### Install Dependencies
```bash
npm install
```

### Build
```bash
npm run build
```

### Test Locally
```bash
npm run test:local
```

Expected output: All 5 tests passing
- Perfect Match: 80-100 score
- Poor Match: 30-60 score
- Partial Match: 40-70 score
- Old Data: 40-70 score
- Empty Response: 0-30 score

## Deployment to Switchboard

### Prerequisites
- Switchboard CLI installed: `npm install -g @switchboard-xyz/cli`
- Solana wallet with devnet SOL
- Switchboard account created

### Deploy Steps

1. **Build the function**
   ```bash
   npm run build
   ```

2. **Initialize Switchboard function**
   ```bash
   sb function init
   ```

3. **Deploy to Switchboard**
   ```bash
   sb function deploy
   ```

4. **Get function address**
   ```bash
   sb function list
   ```

5. **Update Anchor program with function address**
   - Copy the function address from step 4
   - Update `programs/x402-resolve/src/lib.rs` with the address
   - Redeploy Anchor program

### Testing on Devnet

```bash
# Test quality scoring via Switchboard
sb function invoke --address <FUNCTION_ADDRESS> --params '{
  "originalQuery": "Uniswap V3 exploits",
  "dataReceived": {"exploits": [{"protocol": "Uniswap V3", "amount_usd": 8000000}]},
  "expectedCriteria": ["Uniswap", "exploit"],
  "transactionId": "test-001"
}'
```

## Integration with x402-resolve

The Switchboard Function is called by the Anchor program during dispute resolution:

```rust
// In programs/x402-resolve/src/lib.rs
pub fn resolve_dispute_switchboard(
    ctx: Context<ResolveDisputeSwitchboard>,
    quality_score: u8,
) -> Result<()> {
    // Verify Switchboard attestation
    // Calculate refund based on quality score
    // Release funds according to refund percentage
}
```

## Comparison with Python Verifier

| Component | Python Verifier | Switchboard Function |
|-----------|----------------|---------------------|
| Semantic | SentenceTransformer ML (all-MiniLM-L6-v2) | Jaccard + keyword boost |
| Completeness | Identical | Identical |
| Freshness | Identical | Identical |
| Refund Formula | Identical | Identical |
| Execution | Centralized API | Decentralized oracle |

The Switchboard Function uses heuristic matching to approximate the Python verifier's ML approach while maintaining identical refund and freshness logic.

## Cost Analysis

**Switchboard On-Demand Costs (per dispute)**:
- Oracle fee: ~0.0001 SOL (~$0.000005 at $50/SOL)
- Transaction fee: ~0.000005 SOL
- Total: ~$0.00001 per quality assessment

**vs Python Verifier**:
- Server hosting: $20-50/month
- Per-request cost: Negligible after fixed costs
- Centralization risk: Single point of failure

## Monitoring

Track function health:
```bash
sb function logs --address <FUNCTION_ADDRESS>
```

View recent invocations:
```bash
sb function history --address <FUNCTION_ADDRESS>
```

## Next Steps (Day 2)

1. Deploy to Switchboard devnet
2. Integrate with Anchor program
3. Test end-to-end dispute flow
4. Add SDK support for Switchboard disputes

## References

- [Switchboard Documentation](https://docs.switchboard.xyz/)
- [x402Resolve Architecture](../../docs/ARCHITECTURE.md)
- [Python Verifier](../x402-verifier/verifier.py)
