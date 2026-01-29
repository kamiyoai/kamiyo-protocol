# @kamiyo/settlement

Settlement hook for x402 routers.

## Installation

```bash
pnpm add @kamiyo/settlement
```

## Quick Start

```typescript
import { SettlementClient, ViolationType, createViolation } from '@kamiyo/settlement';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.generate();

const settlement = new SettlementClient({ connection, wallet });

const violation = createViolation(
  ViolationType.Latency,
  5000,
  15000,
  responseData
);

const result = await settlement.requestSettlement({
  paymentRef: 'x402-payment-tx-signature',
  provider: providerPubkey,
  violation,
});

console.log(result.settlementId, result.refundPercent);
```

## Violation Types

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

1. Agent calls `requestSettlement()` with violation evidence
2. Provider has 1 hour to respond
3. Provider accepts → funds redistributed
4. Provider contests → escalates to oracle voting
5. No response → auto-resolves in agent's favor

## Usage

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
  connection: Connection,
  wallet?: Keypair,
  programId?: PublicKey,
});

await client.checkEligibility(paymentRef: string): Promise<EligibilityResult>
await client.requestSettlement(request: SettlementRequest): Promise<SettlementResult>
await client.getStatus(settlementId: string): Promise<SettlementState | null>
await client.respondToSettlement(settlementId: string, response: SettlementResponse): Promise<SettlementResult>
await client.escalateToOracles(settlementId: string): Promise<SettlementResult>
await client.resolveWithOracleScore(settlementId: string, score: number): Promise<SettlementResult>
```

### Violation Helpers

```typescript
createViolation(type, expected, actual, evidenceData): Violation
calculateRefund(violation): number
hashEvidence(data): string
validateViolation(violation): { valid: boolean; error?: string }
```

### Oracle Functions

```typescript
computeCommitmentHash(settlementId, oracle, score, salt): Uint8Array
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

## License

MIT
