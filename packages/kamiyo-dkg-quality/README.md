# @kamiyo/dkg-quality-oracle

Quality Oracles for OriginTrail DKG. Proof of Quality for Knowledge Assets.

**PoK (storage) + PoQ (accuracy) = Trustworthy AI Memory**

## Installation

```bash
npm install @kamiyo/dkg-quality-oracle
```

## Quick Start

```typescript
import { createQualityOracleSystem, DragQualityClient } from '@kamiyo/dkg-quality-oracle';
import { Keypair } from '@solana/web3.js';
import BN from 'bn.js';

// Initialize the system
const { stakingManager, oracleManager, provenanceTracker, disputeManager } =
  createQualityOracleSystem();

// 1. Publisher stakes on quality
const stake = await stakingManager.createQualityStake({
  assetUal: 'did:dkg:otp/0x.../1234',
  publisher: publisherKeypair.publicKey,
  stakeAmount: new BN(500_000_000), // 0.5 SOL
});

// 2. Oracles assess (commit-reveal)
const salt = oracleManager.generateSalt();
const scores = { factualAccuracy: 90, sourceQuality: 85, completeness: 80, consistency: 88 };
const commitment = oracleManager.computeCommitment(
  oracleManager.calculateOverallScore(scores),
  salt,
  assetUal,
  oracleId
);
await oracleManager.submitCommitment({ assetUal, oracleId, commitment });
// ... after commit window ...
await oracleManager.revealAssessment({ assetUal, oracleId, scores, salt });

// 3. Finalize and resolve stake
const { medianScore } = await oracleManager.finalizeAssessment(assetUal);
await stakingManager.resolveQualityAssessment({ assetUal, medianScore, oracleCount: 3 });

// 4. Query with quality filters
const client = new DragQualityClient(dkgClient);
const results = await client.queryWithQuality({
  sparql: 'SELECT ?asset WHERE { ?asset schema:about "climate" }',
  qualityRequirements: { minOverallScore: 80, excludeDisputed: true },
});
```

## API Reference

### QualityStakingManager

Manages quality stakes linking SOL escrow to DKG Knowledge Assets.

```typescript
class QualityStakingManager {
  // Create stake for asset
  createQualityStake(params: {
    assetUal: UAL;
    publisher: PublicKey;
    stakeAmount: BN;
    verificationDeadlineHours?: number;
  }): Promise<QualityStake>;

  // Resolve after oracle assessment
  resolveQualityAssessment(params: {
    assetUal: UAL;
    medianScore: number;
    oracleCount: number;
  }): Promise<{ stake: QualityStake; metadata: QualityMetadata }>;

  // Get stake info
  getStake(assetUal: UAL): QualityStake | undefined;
  getReputation(publisher: PublicKey): PublisherReputation | undefined;
  getPendingStakes(): QualityStake[];
}
```

### OracleProtocolManager

Handles multi-oracle commit/reveal for quality assessments.

```typescript
class OracleProtocolManager {
  // Register oracle with stake
  registerOracle(params: { oracleId: PublicKey; stake: BN }): Promise<OracleInfo>;

  // Commit phase
  submitCommitment(params: {
    assetUal: UAL;
    oracleId: PublicKey;
    commitment: string;
  }): Promise<OracleCommitment>;

  // Reveal phase
  revealAssessment(params: {
    assetUal: UAL;
    oracleId: PublicKey;
    scores: QualityScores;
    salt: string;
  }): Promise<QualityAssessment>;

  // Finalize - calculate median, distribute rewards/slashing
  finalizeAssessment(assetUal: UAL): Promise<{
    medianScore: number;
    oracleCount: number;
    rewards: Array<{ oracleId: PublicKey; reward: BN; slashed: BN }>;
  }>;

  // Utilities
  computeCommitment(score: number, salt: string, assetUal: UAL, oracleId: PublicKey): string;
  generateSalt(): string;
  calculateOverallScore(scores: QualityScores): number;
}
```

### DragQualityClient

Decentralized RAG with Quality Guarantees.

```typescript
class DragQualityClient {
  constructor(dkgClient: DKGClientInterface);

  // Query with quality filters
  queryWithQuality<T>(query: QualityQuery): Promise<QualityQueryResult<T>[]>;

  // Get single asset with quality metadata
  getWithQuality<T>(ual: UAL): Promise<QualityQueryResult<T> | null>;

  // Query by quality tier
  queryByQualityTier(params: {
    sparql: string;
    tier: 'verified' | 'unverified' | 'all';
    limit?: number;
  }): Promise<QualityQueryResult[]>;
}
```

### InferenceProvenanceTracker

Records which Knowledge Assets influenced AI decisions.

```typescript
class InferenceProvenanceTracker {
  // Start tracking inference
  startInference(agent: PublicKey): string;

  // Record asset usage
  recordAssetUsage(params: {
    inferenceId: string;
    assetUal: UAL;
    qualityScore: number;
    publisherReputation: number;
    weight?: number;
  }): void;

  // Finalize with confidence score
  finalizeInference(params: {
    inferenceId: string;
    confidence: number;
    escrowPda?: PublicKey;
  }): InferenceProvenance;

  // Calculate dispute refund
  calculateDisputeRefund(params: {
    inferenceId: string;
    disputedAssets: UAL[];
  }): number;

  // Build JSON-LD provenance
  buildProvenanceJsonLd(inferenceId: string): object | null;
}
```

### DisputeResolutionManager

Handles disputes for quality assessments.

```typescript
class DisputeResolutionManager {
  // File dispute
  fileDispute(params: {
    assetUal: UAL;
    challenger: PublicKey;
    reason: string;
    evidenceUal?: UAL;
  }): Promise<QualityDispute>;

  // Resolve with new assessment
  resolveDispute(params: {
    disputeId: string;
    newScore: number;
    oracleCount: number;
  }): Promise<QualityDispute>;

  // Get dispute info
  getDispute(disputeId: string): QualityDispute | undefined;
  getOpenDisputes(): QualityDispute[];
}
```

## Quality Score Thresholds

| Score Range | Status | Stake Outcome |
|-------------|--------|---------------|
| 80-100 | Verified | Full return (minus 1% fee) |
| 50-79 | Contested | Partial return |
| 0-49 | Disputed | Slashed (50% to oracles, 50% to treasury) |

## Score Components

| Component | Weight | Description |
|-----------|--------|-------------|
| Factual Accuracy | 40% | Are claims verifiable? |
| Source Quality | 25% | Are sources credible? |
| Completeness | 20% | Is context provided? |
| Consistency | 15% | Does it contradict known facts? |

## License

MIT
