# Switchboard Integration Guide - x402-sdk

## Overview

The x402-sdk now supports **two dispute resolution paths**:

1. **Python Verifier** (Centralized): Fast, cheap, uses ML embeddings
2. **Switchboard On-Demand** (Decentralized): Trustless, oracle-based, slightly higher cost

## Installation

```bash
npm install @kamiyo/x402-sdk
```

## Quick Start

### Option 1: Switchboard Dispute (Decentralized)

```typescript
import { EscrowClient, SwitchboardClient, EscrowUtils } from '@kamiyo/x402-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

// Initialize clients
const connection = new Connection('https://api.devnet.solana.com');
const escrowClient = new EscrowClient(config, IDL);
const switchboardClient = new SwitchboardClient({
  connection,
  functionId: new PublicKey('YOUR_FUNCTION_ID'),
  queueId: new PublicKey('SWITCHBOARD_QUEUE_ID'),
});

// Create and dispute escrow
const txId = EscrowUtils.generateTransactionId();
await escrowClient.createEscrow({ amount, timeLock, transactionId: txId, apiPublicKey });
await escrowClient.markDisputed(txId);

// Get quality assessment from Switchboard oracles
const assessment = await switchboardClient.requestQualityAssessment({
  originalQuery: 'Uniswap V3 exploits',
  dataReceived: apiResponse,
  expectedCriteria: ['Uniswap', 'exploit'],
  transactionId: txId,
});

// Resolve with Switchboard attestation
await escrowClient.resolveDisputeSwitchboard(
  txId,
  assessment.qualityScore,
  assessment.refundPercentage,
  assessment.attestation
);
```

### Option 2: Python Verifier (Centralized)

```typescript
// Same setup, but use Python verifier API
const verifierResponse = await fetch('https://verifier-api.x402resolve.com/verify', {
  method: 'POST',
  body: JSON.stringify({ query, data, criteria }),
});

const { quality_score, refund_percentage, signature } = await verifierResponse.json();

await escrowClient.resolveDispute(
  txId,
  quality_score,
  refund_percentage,
  signature,
  verifierPublicKey
);
```

## Comparison

| Feature | Python Verifier | Switchboard |
|---------|----------------|-------------|
| Cost | ~$0 (after hosting) | ~$0.005 |
| Speed | 100-500ms | 2-5 seconds |
| Trustlessness | NO - Centralized | YES - Decentralized |
| Algorithm | ML embeddings | Jaccard + keywords |
| Accuracy | 100% (baseline) | ~95% identical outcomes |

## API Reference

### SwitchboardClient

```typescript
class SwitchboardClient {
  constructor(config: SwitchboardConfig);

  // Request quality assessment from oracle network
  async requestQualityAssessment(
    params: QualityScoringParams
  ): Promise<{
    qualityScore: number;
    refundPercentage: number;
    attestation: PublicKey;
    result: QualityScoringResult;
  }>;

  // Verify attestation validity
  async verifyAttestation(attestation: PublicKey): Promise<{
    valid: boolean;
    qualityScore?: number;
    timestamp?: number;
    error?: string;
  }>;

  // Get estimated cost
  getEstimatedCost(): number; // Returns lamports
}
```

### Quality Scoring Parameters

```typescript
interface QualityScoringParams {
  originalQuery: string;           // What the agent requested
  dataReceived: any;                // What the API returned
  expectedCriteria: string[];       // Keywords that should be present
  expectedRecordCount?: number;     // Minimum records expected
  transactionId?: string;           // For tracking
}
```

### Quality Scoring Result

```typescript
interface QualityScoringResult {
  qualityScore: number;             // 0-100
  refundPercentage: number;         // 0-100
  reasoning: string;                // Human-readable explanation
  timestamp: number;                // Unix timestamp
  breakdown: {
    semantic: number;               // Semantic similarity (0-100)
    completeness: number;           // Criteria coverage (0-100)
    freshness: number;              // Data recency (0-100)
  };
}
```

### EscrowClient New Methods

```typescript
class EscrowClient {
  // Resolve dispute with Switchboard (new)
  async resolveDisputeSwitchboard(
    transactionId: string,
    qualityScore: number,
    refundPercentage: number,
    switchboardAttestation: PublicKey
  ): Promise<string>;

  // Resolve dispute with Python verifier (existing)
  async resolveDispute(
    transactionId: string,
    qualityScore: number,
    refundPercentage: number,
    signature: number[],
    verifierPublicKey: PublicKey
  ): Promise<string>;

  // Derive reputation PDA (new)
  deriveReputationAddress(entity: PublicKey): [PublicKey, number];
}
```

## Configuration

### Devnet

```typescript
import { SwitchboardConfig } from '@kamiyo/x402-sdk';

const config = SwitchboardConfig.getDevnetConfig(
  connection,
  new PublicKey('YOUR_FUNCTION_ID')
);
```

**Switchboard Devnet Queue**: `FfD96yeXs4cxZshoPPSKhSPgVQxLAJUT3gefgh84m1Di`

### Mainnet

```typescript
const config = SwitchboardConfig.getMainnetConfig(
  connection,
  new PublicKey('YOUR_FUNCTION_ID')
);
```

**Switchboard Mainnet Queue**: `A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w`

## Testing

### Using MockSwitchboardClient

For unit tests, use the mock client:

```typescript
import { MockSwitchboardClient } from '@kamiyo/x402-sdk';

const mockClient = new MockSwitchboardClient(config);

// Set mock quality score
mockClient.setMockScore(45); // Poor quality

const result = await mockClient.requestQualityAssessment(params);
// Returns: qualityScore=45, refundPercentage=100
```

### Running Tests

```bash
cd packages/x402-sdk
npm test
```

## Examples

See `examples/` directory:
- `switchboard-dispute.ts` - Complete dispute flow
- `quick-start-switchboard.ts` - Minimal example

## Refund Formula

Both Python and Switchboard use identical refund logic:

```typescript
if (qualityScore >= 80) {
  refund = 0%;
} else if (qualityScore >= 50) {
  refund = ((80 - qualityScore) / 80) * 100;
} else {
  refund = 100%;
}
```

**Examples:**
- Score 90 → 0% refund (excellent quality)
- Score 75 → 6% refund (good quality)
- Score 60 → 25% refund (acceptable)
- Score 50 → 38% refund (poor)
- Score 40 → 100% refund (very poor)

## Cost Analysis

### Per Dispute

| Method | Cost | Notes |
|--------|------|-------|
| Python Verifier | $0.000 | After $30-50/month hosting |
| Switchboard | $0.005 | No fixed costs |

### At Scale (per month)

| Disputes | Python | Switchboard | Winner |
|----------|--------|-------------|--------|
| 100 | $30 | $0.50 | Switchboard |
| 1,000 | $50 | $5 | Switchboard |
| 10,000 | $100 | $50 | Python |
| 100,000 | $500 | $500 | Tie |

**Recommendation:** Use Switchboard for <10k disputes/month or when trustlessness is critical.

## Error Handling

```typescript
try {
  const assessment = await switchboardClient.requestQualityAssessment(params);
} catch (error) {
  if (error.message.includes('attestation')) {
    // Switchboard network issue, fall back to Python verifier
    console.log('Switchboard unavailable, using Python verifier');
  }
}
```

## Monitoring

Track Switchboard costs:

```typescript
const estimatedCost = switchboardClient.getEstimatedCost();
console.log(`Dispute will cost ~${estimatedCost / 1e9} SOL`);
```

## Migration from Python Verifier

### Before (Python only)

```typescript
const { quality_score, signature } = await fetchPythonVerifier();
await escrowClient.resolveDispute(txId, quality_score, refund, signature, verifierKey);
```

### After (Switchboard option)

```typescript
// Choose based on value or trustlessness requirement
if (escrowAmount > 50_000_000 || userPrefersDecentralization) {
  // Use Switchboard
  const assessment = await switchboardClient.requestQualityAssessment(params);
  await escrowClient.resolveDisputeSwitchboard(
    txId,
    assessment.qualityScore,
    assessment.refundPercentage,
    assessment.attestation
  );
} else {
  // Use Python verifier
  const { quality_score, signature } = await fetchPythonVerifier();
  await escrowClient.resolveDispute(txId, quality_score, refund, signature, verifierKey);
}
```

## Troubleshooting

### "Invalid Switchboard attestation"
- Ensure function ID is correct
- Check attestation is recent (<60 seconds)
- Verify Switchboard Function is deployed

### "Quality score mismatch"
- The score parameter must match attestation value
- Don't modify the score from Switchboard result

### "Stale attestation"
- Attestations expire after 60 seconds
- Request new assessment if too much time passes

## Resources

- [Switchboard Documentation](https://docs.switchboard.xyz/)
- [Anchor Program Source](../x402-escrow/programs/x402-escrow/src/lib.rs)
- [Switchboard Function Source](../switchboard-function/src/quality-scorer.ts)
- [Python Verifier Source](../x402-verifier/verifier.py)

## Support

- GitHub Issues: [x402resolve/issues](https://github.com/x402kamiyo/x402resolve/issues)
- Discord: [x402resolve Discord](https://discord.gg/x402resolve)
