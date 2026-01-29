# @kamiyo/settlement

Protocol-level settlement for x402 routers. Measurable SLA violations with oracle consensus.

## Philosophy

> "Don't bother with any framework but Claude SDK"

This package is not a framework. It's a minimal settlement hook for x402 payment routers. Your router handles payments, KAMIYO handles when things go wrong.

## Installation

```bash
pnpm add @kamiyo/settlement
```

## Quick Start

```typescript
import { SettlementClient, ViolationType, createViolation } from '@kamiyo/settlement';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.generate(); // Your agent's wallet

const settlement = new SettlementClient({ connection, wallet });

// On SLA violation, request settlement
const violation = createViolation(
  ViolationType.Latency,
  5000,   // expected: 5s
  15000,  // actual: 15s
  responseData // evidence (gets hashed)
);

const result = await settlement.requestSettlement({
  paymentRef: 'x402-payment-tx-signature',
  provider: providerPubkey,
  violation,
});

console.log(result.settlementId, result.refundPercent);
```

## Violation Types

All measurable at runtime. No subjective quality assessments.

| Type | Description | Default Refund |
|------|-------------|----------------|
| `Timeout` | No response | 100% |
| `ServerError` | 5xx response | 100% |
| `Latency` | Response > SLA | 25-75% (scaled) |
| `Malformed` | Invalid format | 75% |
| `Incomplete` | Partial response | 50% |
| `RateLimit` | 429 response | 25% |

### Latency Scaling

```
1-2x SLA → 25% refund
2-3x SLA → 50% refund
>3x SLA  → 75% refund
```

## Settlement Flow

### Fast Path (Provider Accepts)

```
Agent detects violation → requestSettlement()
                              ↓
                     Provider has 1 hour
                              ↓
              Provider accepts → Funds redistributed
```

### Contested Path (Oracle Resolution)

```
Agent detects violation → requestSettlement()
                              ↓
              Provider contests → escalateToOracles()
                              ↓
                   Oracle commit-reveal voting
                              ↓
               Median consensus → Funds redistributed
```

### Timeout Path

```
Agent detects violation → requestSettlement()
                              ↓
              No response in 1 hour
                              ↓
              Auto-resolve → Agent gets full refund
```

## Integration with x402 Router

```typescript
import { SettlementClient, ViolationType, createViolation } from '@kamiyo/settlement';

const settlement = new SettlementClient({ connection, wallet, programId });

async function handleInferenceRequest(req) {
  const startTime = Date.now();

  try {
    const response = await callGpuProvider(req);
    const latency = Date.now() - startTime;

    if (latency > req.sla.maxLatencyMs) {
      await settlement.requestSettlement({
        paymentRef: req.paymentTx,
        provider: req.provider,
        violation: createViolation(
          ViolationType.Latency,
          req.sla.maxLatencyMs,
          latency,
          JSON.stringify(response)
        ),
      });
    }

    return response;
  } catch (error) {
    if (error.code === 'TIMEOUT') {
      await settlement.requestSettlement({
        paymentRef: req.paymentTx,
        provider: req.provider,
        violation: createViolation(
          ViolationType.Timeout,
          req.sla.maxLatencyMs,
          -1,
          error.message
        ),
      });
    }
    throw error;
  }
}
```

## API

### SettlementClient

```typescript
const client = new SettlementClient({
  connection: Connection,     // Solana connection
  wallet?: Keypair,           // Agent wallet (required for requests)
  programId?: PublicKey,      // KAMIYO program (defaults to mainnet)
});

// Check if payment is eligible for settlement
await client.checkEligibility(paymentRef: string): Promise<EligibilityResult>

// Request settlement for SLA violation
await client.requestSettlement(request: SettlementRequest): Promise<SettlementResult>

// Check settlement status
await client.getStatus(settlementId: string): Promise<SettlementState | null>

// Provider: respond to settlement request
await client.respondToSettlement(settlementId: string, response: SettlementResponse): Promise<SettlementResult>

// Escalate contested settlement to oracle voting
await client.escalateToOracles(settlementId: string): Promise<SettlementResult>

// Resolve with oracle consensus score
await client.resolveWithOracleScore(settlementId: string, score: number): Promise<SettlementResult>
```

### Violation Helpers

```typescript
// Create violation with auto-hashed evidence
createViolation(type, expected, actual, evidenceData): Violation

// Calculate refund percentage
calculateRefund(violation): number

// Hash evidence data
hashEvidence(data): string

// Validate violation structure
validateViolation(violation): { valid: boolean; error?: string }
```

### Oracle Functions

```typescript
// Compute commitment hash for voting
computeCommitmentHash(settlementId, oracle, score, salt): Uint8Array

// Calculate consensus from oracle scores
calculateConsensus(scores): ConsensusResult
```

## Constants

```typescript
KAMIYO_PROGRAM_ID    // Mainnet program address
RESPONSE_TIMEOUT_MS  // 1 hour
MIN_ORACLES          // 3
MAX_SCORE_DEVIATION  // 15 points
COMMIT_PHASE_DURATION  // 5 minutes
REVEAL_PHASE_DURATION  // 30 minutes
```

## Why This Works

1. **Measurable** - Latency, timeout, error codes. Not "was the output good?"
2. **Fast path** - Provider can accept immediately, no oracle delay
3. **Escalation** - Contested disputes go to oracle consensus
4. **Timeout protection** - Agent always gets resolution
5. **Protocol-level** - Complements x402 routers, doesn't compete

Your router handles payments. KAMIYO handles trust.

## License

MIT
