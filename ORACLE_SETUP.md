# Oracle Setup

Guide for running a Kamiyo oracle node.

## Requirements

- Solana wallet with SOL for stake and fees
- Server with stable internet connection
- Node.js 18+ or Rust toolchain

## Registration

### 1. Prepare stake

Oracles must stake collateral (minimum defined by registry admin).

```bash
# Check minimum stake
npx ts-node scripts/get-oracle-registry.ts

# Ensure wallet has sufficient SOL
solana balance
```

### 2. Register with registry

Contact registry admin or use governance process to request registration.

```bash
# Admin adds oracle
npx ts-node scripts/add-oracle.ts \
  --oracle <YOUR_PUBKEY> \
  --stake <AMOUNT_LAMPORTS>
```

### 3. Verify registration

```bash
npx ts-node scripts/get-oracle-registry.ts | grep <YOUR_PUBKEY>
```

## Running the Oracle

### Using TypeScript

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { OracleNode } from '@kamiyo/oracle';

const connection = new Connection(process.env.RPC_URL);
const keypair = Keypair.fromSecretKey(/* your key */);

const oracle = new OracleNode({
  connection,
  keypair,
  programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
});

// Start listening for disputes
await oracle.start();

// Oracle automatically:
// 1. Monitors for new disputes
// 2. Fetches dispute data
// 3. Computes quality score
// 4. Submits commit hash
// 5. Waits for reveal window
// 6. Reveals score with ZK proof
```

### Using Switchboard

Deploy the quality scorer as a Switchboard function:

```bash
cd packages/kamiyo-switchboard
npm run build

sb function create --name kamiyo-oracle \
  --container your-registry/kamiyo-oracle:latest
```

## Commit-Reveal Process

### Phase 1: Commit

When a dispute is created:

```typescript
import { OracleVoteProver } from '@kamiyo/zk';

const prover = await OracleVoteProver.setup();

// Compute quality score (0-100)
const score = await assessQuality(disputeData);

// Generate random blinding factor
const blinding = crypto.randomBytes(32);

// Create commitment
const commitment = prover.commit(score, blinding, escrowId, oraclePubkey);

// Submit to chain
await submitCommitment(escrowPda, commitment);
```

### Phase 2: Wait

5-minute delay between commit and reveal prevents vote copying.

### Phase 3: Reveal

```typescript
// Generate ZK proof
const proof = prover.prove(score, blinding, commitment);

// Submit reveal with proof
await submitReveal(escrowPda, score, proof);
```

## Quality Assessment

Oracles assess API response quality:

| Factor | Weight | Description |
|--------|--------|-------------|
| Semantic | 40% | Query-response relevance |
| Completeness | 40% | Expected fields present |
| Freshness | 20% | Data recency |

### Example

```typescript
async function assessQuality(dispute: DisputeData): Promise<number> {
  const semantic = computeSemanticSimilarity(
    dispute.originalQuery,
    dispute.responseData
  );

  const completeness = computeCompleteness(
    dispute.responseData,
    dispute.expectedFields
  );

  const freshness = computeFreshness(dispute.responseData);

  return Math.round(
    semantic * 0.4 + completeness * 0.4 + freshness * 0.2
  ) * 100;
}
```

## Slashing Conditions

Oracles lose 10% stake if vote deviates >20% from median.

```
median = 75
your_vote = 40
deviation = |75 - 40| = 35 > 20
→ 10% stake slashed
```

After 3 violations, oracle is removed from registry.

## Monitoring

### Check oracle status

```bash
npx ts-node scripts/get-oracle-status.ts --oracle <PUBKEY>
```

### View pending disputes

```bash
npx ts-node scripts/list-disputes.ts --status pending
```

### Check rewards

```bash
npx ts-node scripts/get-oracle-rewards.ts --oracle <PUBKEY>
```

## Best Practices

1. **Consistent scoring** - Use deterministic algorithms
2. **Timely reveals** - Submit before reveal window closes
3. **Monitor stake** - Keep sufficient balance for slashing buffer
4. **Backup keys** - Secure oracle keypair properly
5. **High availability** - Use reliable infrastructure

## Troubleshooting

### Commitment rejected

- Check oracle is registered in registry
- Verify escrow is in `Disputed` status
- Ensure not already committed

### Reveal failed

- Confirm within reveal window (5 min after commit)
- Verify commitment hash matches
- Check ZK proof validity

### Slashed unexpectedly

- Review vote history
- Compare scores with other oracles
- Adjust scoring algorithm if consistently deviating
