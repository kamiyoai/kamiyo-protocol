# KAMIYO Oracle Agent - Technical Design

An autonomous oracle agent built on ElizaOS that participates in dispute resolution for the KAMIYO protocol.

## Overview

The Oracle Agent monitors disputed escrows, evaluates service quality using LLM reasoning, and submits cryptographically signed votes to the KAMIYO protocol. It earns rewards for accurate voting and risks slashing for deviation from consensus.

## Architecture

```
                                    ORACLE AGENT
    ┌──────────────────────────────────────────────────────────────────┐
    │                                                                  │
    │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
    │  │  LISTENER   │───►│  EVALUATOR  │───►│  VOTE SUBMITTER     │  │
    │  │  SERVICE    │    │  (LLM)      │    │  (Ed25519 + ZK)     │  │
    │  └─────────────┘    └─────────────┘    └─────────────────────┘  │
    │         │                  │                      │              │
    │         ▼                  ▼                      ▼              │
    │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
    │  │  CONTEXT    │    │  CONFIDENCE │    │  REWARD TRACKER     │  │
    │  │  GATHERER   │    │  CALIBRATOR │    │  & RISK MANAGER     │  │
    │  └─────────────┘    └─────────────┘    └─────────────────────┘  │
    │                                                                  │
    └──────────────────────────────────────────────────────────────────┘
                    │                              │
                    ▼                              ▼
            ┌──────────────┐              ┌──────────────┐
            │   SOLANA     │              │   HELIUS     │
            │   MAINNET    │              │   WEBHOOKS   │
            └──────────────┘              └──────────────┘
```

## Components

### 1. Dispute Listener Service

Long-running service that monitors the blockchain for disputed escrows.

```typescript
interface DisputeEvent {
  escrowPda: PublicKey;
  agent: PublicKey;
  provider: PublicKey;
  amount: number;
  transactionId: string;
  disputedAt: number;
  expiresAt: number;
  metadata?: {
    serviceType?: string;
    slaTerms?: string;
    deliveryProof?: string;
  };
}
```

**Detection Methods:**
1. **Helius Webhooks** - Real-time notifications on escrow status changes
2. **Polling Fallback** - Periodic RPC queries for disputed escrows
3. **Event Subscription** - WebSocket subscription to program logs

### 2. Context Gatherer

Collects all relevant information for quality evaluation.

**On-Chain Data:**
- Escrow account details (amount, timelock, terms)
- Agent identity and reputation history
- Provider identity and past dispute rate
- Transaction history between parties

**Off-Chain Data:**
- API response logs (if x402 payment)
- SLA violation evidence
- Provider's service description
- Historical quality scores for similar services

```typescript
interface EvaluationContext {
  // Escrow details
  escrow: {
    amount: number;
    createdAt: number;
    expiresAt: number;
    transactionId: string;
  };

  // Parties
  agent: {
    pubkey: string;
    reputation: number;
    totalEscrows: number;
    disputeRate: number;
  };
  provider: {
    pubkey: string;
    reputation: number;
    totalEscrows: number;
    disputeRate: number;
    averageQualityScore: number;
  };

  // Service details
  service: {
    type: string;           // "api_call", "data_delivery", "compute", etc.
    description: string;
    slaTerms: string[];
    deliveryProof?: string;
    responseTime?: number;
    errorRate?: number;
  };

  // Evidence
  evidence: {
    agentClaim: string;
    providerClaim?: string;
    thirdPartyData?: string[];
  };
}
```

### 3. LLM Quality Evaluator

The core intelligence - uses LLM to assess service quality.

**Evaluation Prompt Template:**
```
You are an impartial oracle evaluating service quality for a blockchain escrow dispute.

## Context
- Service Type: {service.type}
- Service Description: {service.description}
- Amount at Stake: {escrow.amount} SOL
- SLA Terms: {service.slaTerms}

## Provider History
- Reputation Score: {provider.reputation}/1000
- Past Dispute Rate: {provider.disputeRate}%
- Average Quality Score: {provider.averageQualityScore}/100

## Agent History
- Reputation Score: {agent.reputation}/1000
- Past Dispute Rate: {agent.disputeRate}%

## Evidence
Agent's Claim: {evidence.agentClaim}
Provider's Claim: {evidence.providerClaim}
Delivery Proof: {service.deliveryProof}

## Your Task
Evaluate the quality of service delivered on a scale of 0-100:
- 80-100: Service met or exceeded expectations
- 65-79: Minor issues but acceptable
- 50-64: Significant problems
- 0-49: Service failed or was not delivered

Consider:
1. Did the provider deliver what was promised?
2. Were SLA terms met (latency, uptime, accuracy)?
3. Is the agent's dispute claim reasonable?
4. What does the evidence support?

Respond with:
SCORE: [0-100]
CONFIDENCE: [low/medium/high]
REASONING: [2-3 sentences explaining your assessment]
```

**Output:**
```typescript
interface QualityAssessment {
  score: number;           // 0-100
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  factors: {
    deliveryComplete: boolean;
    slaCompliant: boolean;
    evidenceStrength: 'weak' | 'moderate' | 'strong';
    providerHistory: 'poor' | 'average' | 'good';
    agentHistory: 'frivolous' | 'average' | 'legitimate';
  };
}
```

### 4. Confidence Calibrator

Adjusts voting strategy based on confidence and economic risk.

**Low Confidence Strategy:**
- If evidence is unclear, lean toward median historical score
- Consider abstaining if stake at risk exceeds expected reward
- Weight provider's historical average more heavily

**High Confidence Strategy:**
- Vote based on LLM assessment
- Accept higher deviation risk for clear-cut cases
- Build reputation for accurate edge-case voting

```typescript
interface VotingStrategy {
  shouldVote: boolean;
  adjustedScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  expectedReward: number;
  maxLoss: number;  // 10% of stake if slashed
  reasoning: string;
}

function calibrateVote(
  assessment: QualityAssessment,
  oracleStake: number,
  escrowAmount: number,
  otherOracleCount: number
): VotingStrategy {
  const expectedReward = (escrowAmount * 0.01) / (otherOracleCount + 1);
  const maxLoss = oracleStake * 0.10;

  // Risk-adjusted decision
  if (assessment.confidence === 'low' && maxLoss > expectedReward * 10) {
    return {
      shouldVote: false,
      adjustedScore: assessment.score,
      riskLevel: 'high',
      expectedReward,
      maxLoss,
      reasoning: 'Low confidence + high stake risk. Abstaining.'
    };
  }

  // Confidence-based score adjustment
  let adjustedScore = assessment.score;
  if (assessment.confidence === 'low') {
    // Regress toward historical median (typically ~72)
    adjustedScore = Math.round(assessment.score * 0.7 + 72 * 0.3);
  }

  return {
    shouldVote: true,
    adjustedScore,
    riskLevel: assessment.confidence === 'high' ? 'low' : 'medium',
    expectedReward,
    maxLoss,
    reasoning: `Voting ${adjustedScore} with ${assessment.confidence} confidence`
  };
}
```

### 5. Vote Submitter

Handles cryptographic signing and on-chain submission.

**Ed25519 Signature:**
```typescript
async function signVote(
  keypair: Keypair,
  transactionId: string,
  qualityScore: number
): Promise<Uint8Array> {
  const message = `${transactionId}:${qualityScore}`;
  const messageBytes = new TextEncoder().encode(message);
  return nacl.sign.detached(messageBytes, keypair.secretKey);
}
```

**Poseidon Commitment (for ZK voting):**
```typescript
async function generateCommitment(
  score: number,
  blinding: bigint,
  escrowId: bigint,
  oraclePk: bigint
): Promise<bigint> {
  return poseidon2Hash([
    BigInt(score),
    blinding,
    escrowId,
    oraclePk
  ]);
}
```

**Submission Flow:**
```typescript
async function submitOracleVote(
  client: KamiyoClient,
  escrowPda: PublicKey,
  assessment: QualityAssessment,
  strategy: VotingStrategy
): Promise<string> {
  if (!strategy.shouldVote) {
    return 'ABSTAINED';
  }

  const signature = await signVote(
    client.wallet.keypair,
    escrowPda.toBase58(),
    strategy.adjustedScore
  );

  const tx = await client.submitOracleScore({
    escrowPda,
    qualityScore: strategy.adjustedScore,
    signature: Array.from(signature)
  });

  return tx;
}
```

### 6. Reward Tracker & Risk Manager

Monitors oracle performance and manages economic exposure.

```typescript
interface OraclePerformance {
  totalVotes: number;
  accurateVotes: number;      // Within consensus deviation
  slashEvents: number;
  totalRewardsEarned: number;
  totalSlashLoss: number;
  currentStake: number;
  violationCount: number;     // 3 = auto-removal

  // Calculated metrics
  accuracyRate: number;
  profitLoss: number;
  riskScore: number;
}

function calculateRiskExposure(
  performance: OraclePerformance,
  pendingDisputes: number
): RiskAssessment {
  const maxPotentialLoss = performance.currentStake * 0.10 * pendingDisputes;
  const violationsUntilRemoval = 3 - performance.violationCount;

  return {
    maxPotentialLoss,
    violationsUntilRemoval,
    shouldReduceExposure: violationsUntilRemoval <= 1,
    recommendedAction: violationsUntilRemoval <= 1
      ? 'CONSERVATIVE_VOTING'
      : 'NORMAL_OPERATION'
  };
}
```

## ElizaOS Integration

### Character Definition

```json
{
  "name": "KAMIYO Oracle",
  "username": "kamiyo-oracle",
  "bio": "Autonomous dispute resolution oracle for the KAMIYO protocol. Evaluates service quality using AI reasoning and votes on-chain.",

  "plugins": ["kamiyo-oracle"],

  "settings": {
    "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com",
    "HELIUS_API_KEY": "",
    "ORACLE_PRIVATE_KEY": "",
    "MIN_CONFIDENCE_TO_VOTE": "medium",
    "MAX_PENDING_DISPUTES": "5",
    "EVALUATION_MODEL": "claude-3-5-sonnet",
    "RISK_TOLERANCE": "medium"
  },

  "topics": [
    "dispute resolution",
    "quality assessment",
    "oracle voting",
    "escrow arbitration"
  ],

  "adjectives": [
    "impartial",
    "analytical",
    "consistent",
    "economically rational"
  ],

  "style": {
    "all": [
      "Be precise and data-driven",
      "Explain reasoning clearly",
      "Acknowledge uncertainty",
      "Never take bribes or show bias"
    ]
  }
}
```

### Plugin Structure

```
packages/kamiyo-oracle-agent/
├── src/
│   ├── index.ts                 # Plugin export
│   ├── types.ts                 # Type definitions
│   ├── config.ts                # Configuration validation
│   │
│   ├── actions/
│   │   ├── evaluateDispute.ts   # Manual dispute evaluation
│   │   ├── submitVote.ts        # Manual vote submission
│   │   ├── checkPerformance.ts  # Check oracle stats
│   │   └── claimRewards.ts      # Claim accumulated rewards
│   │
│   ├── providers/
│   │   ├── oracleStatus.ts      # Oracle registration status
│   │   ├── pendingDisputes.ts   # List of pending disputes
│   │   └── performance.ts       # Performance metrics
│   │
│   ├── evaluators/
│   │   ├── voteQuality.ts       # Post-vote accuracy check
│   │   └── riskAssessment.ts    # Continuous risk monitoring
│   │
│   ├── services/
│   │   ├── disputeListener.ts   # Monitor for new disputes
│   │   ├── autoVoter.ts         # Autonomous voting service
│   │   └── rewardClaimer.ts     # Periodic reward claiming
│   │
│   └── lib/
│       ├── contextGatherer.ts   # Fetch evaluation context
│       ├── llmEvaluator.ts      # LLM-based quality assessment
│       ├── confidenceCalibrator.ts
│       ├── voteSubmitter.ts
│       └── poseidon.ts          # Poseidon hash utilities
│
├── character.json               # Oracle agent character
├── package.json
└── README.md
```

### Key Actions

**EVALUATE_DISPUTE** - Manually trigger evaluation
```typescript
export const evaluateDisputeAction: Action = {
  name: 'EVALUATE_DISPUTE',
  description: 'Evaluate a disputed escrow and determine quality score',
  similes: ['evaluate', 'assess', 'judge', 'review dispute'],

  async validate(runtime, message) {
    return message.content.text?.toLowerCase().includes('evaluate') ||
           message.content.text?.toLowerCase().includes('dispute');
  },

  async handler(runtime, message, state, options, callback) {
    const escrowId = parseEscrowId(message.content.text);

    callback?.({ text: `Evaluating dispute ${escrowId}...` });

    // 1. Gather context
    const context = await gatherEvaluationContext(runtime, escrowId);

    // 2. LLM evaluation
    const assessment = await evaluateWithLLM(runtime, context);

    // 3. Calibrate
    const strategy = calibrateVote(assessment, context);

    callback?.({
      text: `Assessment complete.
Score: ${assessment.score}/100
Confidence: ${assessment.confidence}
Recommendation: ${strategy.shouldVote ? `Vote ${strategy.adjustedScore}` : 'Abstain'}
Reasoning: ${assessment.reasoning}`
    });

    return { assessment, strategy };
  }
};
```

**SUBMIT_VOTE** - Submit vote to blockchain
```typescript
export const submitVoteAction: Action = {
  name: 'SUBMIT_ORACLE_VOTE',
  description: 'Submit quality score vote to the KAMIYO protocol',

  async handler(runtime, message, state, options, callback) {
    const { escrowId, score } = parseVoteParams(message.content.text);

    callback?.({ text: `Signing and submitting vote...` });

    const client = getKamiyoClient(runtime);
    const signature = await signVote(client.wallet, escrowId, score);

    const tx = await client.submitOracleScore({
      escrowPda: new PublicKey(escrowId),
      qualityScore: score,
      signature: Array.from(signature)
    });

    callback?.({
      text: `Vote submitted!
Escrow: ${escrowId}
Score: ${score}/100
Transaction: ${tx}`
    });

    return { success: true, tx };
  }
};
```

### Key Services

**Dispute Listener Service**
```typescript
export const disputeListenerService: Service = {
  name: 'kamiyo-dispute-listener',

  async start(runtime) {
    const heliusKey = runtime.getSetting('HELIUS_API_KEY');
    const programId = KAMIYO_PROGRAM_ID;

    // Set up webhook listener
    const webhook = new HeliusWebhook(heliusKey, {
      accountAddresses: [programId.toBase58()],
      transactionTypes: ['DISPUTE'],
    });

    webhook.on('dispute', async (event: DisputeEvent) => {
      console.log(`New dispute detected: ${event.escrowPda}`);

      // Store in state for processing
      const pending = await runtime.getState('pending_disputes') || [];
      pending.push(event);
      await runtime.setState('pending_disputes', pending);
    });

    await webhook.start();
    (this as any)._webhook = webhook;
  },

  async stop() {
    await (this as any)._webhook?.stop();
  }
};
```

**Auto Voter Service**
```typescript
export const autoVoterService: Service = {
  name: 'kamiyo-auto-voter',

  async start(runtime) {
    const interval = 30000; // Check every 30 seconds

    const processDisputes = async () => {
      const pending = await runtime.getState('pending_disputes') || [];
      const maxPending = parseInt(runtime.getSetting('MAX_PENDING_DISPUTES') || '5');

      // Process up to maxPending disputes
      for (const dispute of pending.slice(0, maxPending)) {
        try {
          // Check if already voted
          if (await hasVoted(runtime, dispute.escrowPda)) continue;

          // Gather context
          const context = await gatherEvaluationContext(runtime, dispute);

          // Evaluate
          const assessment = await evaluateWithLLM(runtime, context);

          // Calibrate and decide
          const strategy = calibrateVote(assessment, context);

          if (strategy.shouldVote) {
            // Submit vote
            await submitOracleVote(runtime, dispute.escrowPda, strategy);
            console.log(`Voted ${strategy.adjustedScore} on ${dispute.escrowPda}`);
          } else {
            console.log(`Abstaining from ${dispute.escrowPda}: ${strategy.reasoning}`);
          }

          // Remove from pending
          await removeFromPending(runtime, dispute.escrowPda);

        } catch (err) {
          console.error(`Failed to process dispute ${dispute.escrowPda}:`, err);
        }
      }
    };

    const timer = setInterval(processDisputes, interval);
    (this as any)._timer = timer;

    // Initial run
    processDisputes();
  },

  async stop() {
    clearInterval((this as any)._timer);
  }
};
```

## Security Considerations

### Key Management
- Oracle private key stored in encrypted environment variable
- Never logged or exposed in responses
- Consider HSM/KMS for production deployments

### Vote Integrity
- Ed25519 signatures prevent vote tampering
- Poseidon commitments enable ZK voting (future)
- 5-minute reveal delay prevents vote copying

### Economic Attacks
- Sybil resistance: 1 SOL minimum stake per oracle
- Collusion resistance: Median-based consensus, deviation slashing
- Griefing resistance: Dispute cost scales with history

### LLM Safety
- Prompt injection protection in evaluation prompts
- Structured output parsing to prevent manipulation
- Confidence calibration reduces impact of adversarial inputs

## Deployment

### Prerequisites
1. Register agent identity with KAMIYO (0.1 SOL stake)
2. Get added to oracle registry by admin (1 SOL stake)
3. Configure Helius webhook for real-time monitoring
4. Set up monitoring/alerting for slash events

### Environment Variables
```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
HELIUS_API_KEY=your-helius-key
ORACLE_PRIVATE_KEY=base58-encoded-private-key
ANTHROPIC_API_KEY=your-claude-key
MIN_CONFIDENCE_TO_VOTE=medium
MAX_PENDING_DISPUTES=5
RISK_TOLERANCE=medium
```

### Running
```bash
# Install dependencies
npm install

# Build
npm run build

# Start agent
npx eliza start --character=./character.json
```

## Economics

### Revenue Model
- 1% of each disputed escrow split among participating oracles
- Example: 10 SOL escrow = 0.1 SOL total oracle rewards
- With 5 oracles = 0.02 SOL per oracle per dispute

### Cost Model
- 1 SOL stake (at risk of 10% slashing)
- ~0.001 SOL per vote transaction
- LLM API costs (~$0.01-0.05 per evaluation)

### Break-Even Analysis
```
Assumptions:
- 1 SOL stake
- 10% slash risk per violation
- Average escrow: 5 SOL
- Oracle reward: 0.01 SOL per dispute

Break-even after slashing event:
- Need 10 accurate votes to recover 0.1 SOL slash
- With 5 disputes/day = 2 days to break even
- Net profitable if accuracy > 90%
```

## Future Enhancements

### Phase 2: ZK Voting
- Implement commit-reveal with Poseidon commitments
- Generate Noir proofs for vote validity
- On-chain verification via Groth16

### Phase 3: Specialization
- Domain-specific evaluation models (API, data, compute)
- Fine-tuned LLMs on historical dispute data
- Reputation-weighted voting power

### Phase 4: Oracle Networks
- Peer discovery and coordination
- Shared evaluation context caching
- Decentralized oracle registry
