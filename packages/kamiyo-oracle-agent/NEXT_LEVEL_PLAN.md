# KAMIYO Oracle Agent: Next-Level Architecture

## Vision

Transform the Oracle Agent from a simple LLM-based evaluator into an **Adversarial Deliberation Engine** - a multi-agent system that debates, investigates, learns, and produces verifiable reasoning. This represents the frontier of autonomous AI agents applied to decentralized arbitration.

---

## Core Innovations

### 1. Adversarial Debate Protocol (ADP)

Instead of a single LLM call, implement a multi-perspective deliberation system:

```
┌─────────────────────────────────────────────────────────────┐
│                    DELIBERATION CHAMBER                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   AGENT     │    │  PROVIDER   │    │ INVESTIGATOR│    │
│   │  ADVOCATE   │    │  ADVOCATE   │    │             │    │
│   │             │    │             │    │             │    │
│   │ Argues for  │    │ Argues for  │    │ Challenges  │    │
│   │ full refund │    │ full payment│    │ both sides  │    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
│          │                  │                  │            │
│          └──────────────────┼──────────────────┘            │
│                             ▼                               │
│                    ┌─────────────┐                          │
│                    │   ARBITER   │                          │
│                    │             │                          │
│                    │ Synthesizes │                          │
│                    │ final score │                          │
│                    └─────────────┘                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
1. **Agent Advocate** receives the dispute context and constructs the strongest case for a full refund
2. **Provider Advocate** constructs the strongest case for full payment to provider
3. **Investigator** identifies weaknesses in both arguments, requests evidence, challenges assumptions
4. Each advocate responds to the investigator's challenges (2-3 rounds)
5. **Arbiter** reviews the entire debate transcript and renders a final score with detailed reasoning

**Why this is innovative:**
- Mimics adversarial legal systems proven over centuries
- Reduces single-point-of-failure in LLM reasoning
- Creates natural "red teaming" of conclusions
- Produces richer reasoning traces
- More defensible decisions

### 2. Autonomous Evidence Hunter (AEH)

The agent doesn't passively evaluate - it actively investigates:

```
┌────────────────────────────────────────────────────────────┐
│                    EVIDENCE HUNTER                          │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │  On-Chain     │  │   Off-Chain   │  │   Pattern     │  │
│  │  Analysis     │  │   Probing     │  │   Matching    │  │
│  │               │  │               │  │               │  │
│  │ • TX history  │  │ • API health  │  │ • Similar     │  │
│  │ • Token flows │  │ • Web search  │  │   disputes    │  │
│  │ • Account age │  │ • Domain WHOIS│  │ • Provider    │  │
│  │ • Past escrows│  │ • SSL certs   │  │   patterns    │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Evidence Sources:**
1. **On-Chain Analysis**
   - Full transaction history for both parties
   - Token flows and timing patterns
   - Account age and activity patterns
   - Previous escrow outcomes
   - Oracle registry participation

2. **Off-Chain Probing** (when applicable)
   - Ping API endpoints mentioned in service agreements
   - Check domain registration and SSL certificates
   - Web search for provider reputation
   - Social media presence verification
   - GitHub/code repository activity

3. **Pattern Matching**
   - Compare to historical disputes with similar characteristics
   - Identify common fraud patterns
   - Detect coordinated dispute attacks
   - Recognize legitimate grievance patterns

### 3. Outcome Learning System (OLS)

Build a local knowledge base that improves over time:

```
┌────────────────────────────────────────────────────────────┐
│                   LEARNING SYSTEM                           │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 OUTCOME TRACKER                      │   │
│  │                                                      │   │
│  │  Dispute: ABC123                                     │   │
│  │  Our Vote: 72                                        │   │
│  │  Consensus: 68                                       │   │
│  │  Deviation: 4 (within threshold)                     │   │
│  │  Result: Rewarded ✓                                  │   │
│  │  Reasoning Quality: Validated                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              CALIBRATION UPDATER                     │   │
│  │                                                      │   │
│  │  • Adjust confidence thresholds                      │   │
│  │  • Update risk models                                │   │
│  │  • Refine pattern weights                            │   │
│  │  • Tune advocate aggressiveness                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               KNOWLEDGE BASE                         │   │
│  │                                                      │   │
│  │  • Dispute patterns database                         │   │
│  │  • Provider reputation cache                         │   │
│  │  • Historical accuracy metrics                       │   │
│  │  • Successful reasoning templates                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Learning Mechanisms:**
1. **Outcome Tracking**
   - Monitor finalized disputes
   - Compare our vote to consensus
   - Track slash/reward events
   - Measure accuracy over time

2. **Calibration Updates**
   - Adjust confidence thresholds based on accuracy
   - Update risk models with real outcomes
   - Refine pattern recognition weights
   - Tune debate aggressiveness

3. **Knowledge Accumulation**
   - Build local database of dispute patterns
   - Cache provider/agent reputation insights
   - Store successful reasoning templates
   - Track emerging fraud vectors

### 4. Verifiable Reasoning Chain (VRC)

Make every decision auditable and verifiable:

```
┌────────────────────────────────────────────────────────────┐
│              VERIFIABLE REASONING CHAIN                     │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  1. PRE-COMMIT                                              │
│     hash(debate_transcript + evidence + score) → commitment │
│     Post commitment to IPFS/Arweave before submitting       │
│                                                             │
│  2. VOTE SUBMISSION                                         │
│     Submit score on-chain with commitment reference         │
│                                                             │
│  3. REVEAL (after consensus)                                │
│     Publish full reasoning chain                            │
│     Anyone can verify hash matches commitment               │
│                                                             │
│  4. REPUTATION                                              │
│     Build reputation for reasoning quality                  │
│     Not just accuracy, but defensibility                    │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Why this matters:**
- Creates accountability for reasoning, not just outcomes
- Enables meta-evaluation of oracle quality
- Deters lazy or arbitrary decisions
- Builds trust in the oracle network

### 5. Predictive Intelligence (PI)

Don't just react to disputes - anticipate them:

```
┌────────────────────────────────────────────────────────────┐
│              PREDICTIVE INTELLIGENCE                        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ESCROW RISK SCORING                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Escrow: XYZ789                                       │   │
│  │ Amount: 5.2 SOL                                      │   │
│  │ Expires: 2 hours                                     │   │
│  │ Provider dispute rate: 23%                           │   │
│  │ Agent dispute rate: 8%                               │   │
│  │ Similar escrow disputes: 4/10                        │   │
│  │                                                      │   │
│  │ DISPUTE PROBABILITY: 67% ████████████░░░░            │   │
│  │ ACTION: Pre-gather evidence, prepare evaluation      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  BENEFITS:                                                  │
│  • Reduced latency when disputes occur                      │
│  • Pre-cached evidence and context                          │
│  • Earlier detection of suspicious patterns                 │
│  • Proactive fraud prevention                               │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

## Implementation Architecture

### New Module Structure

```
src/
├── deliberation/
│   ├── chamber.ts           # Orchestrates the debate
│   ├── agentAdvocate.ts     # Argues for refund
│   ├── providerAdvocate.ts  # Argues for payment
│   ├── investigator.ts      # Challenges both sides
│   ├── arbiter.ts           # Renders final judgment
│   └── transcript.ts        # Records debate history
│
├── evidence/
│   ├── hunter.ts            # Coordinates evidence gathering
│   ├── onChainAnalyzer.ts   # Blockchain data analysis
│   ├── offChainProber.ts    # API/web probing
│   ├── patternMatcher.ts    # Historical pattern matching
│   └── evidenceStore.ts     # Caches gathered evidence
│
├── learning/
│   ├── outcomeTracker.ts    # Monitors dispute outcomes
│   ├── calibrationEngine.ts # Updates decision parameters
│   ├── knowledgeBase.ts     # Persistent learning storage
│   └── patternLearner.ts    # Identifies new patterns
│
├── verification/
│   ├── reasoningChain.ts    # Builds verifiable chain
│   ├── commitmentService.ts # Pre-commit hashing
│   ├── ipfsPublisher.ts     # Publishes to IPFS
│   └── verifier.ts          # Allows verification
│
├── prediction/
│   ├── riskScorer.ts        # Scores escrow risk
│   ├── preGatherer.ts       # Pre-gathers for risky escrows
│   └── alertService.ts      # Alerts on suspicious patterns
│
└── lib/                     # Existing utilities
```

### Data Flow

```
                    ┌─────────────┐
                    │   DISPUTE   │
                    │   DETECTED  │
                    └──────┬──────┘
                           │
                           ▼
              ┌────────────────────────┐
              │    EVIDENCE HUNTER     │
              │  Gather all available  │
              │  on-chain & off-chain  │
              │      evidence          │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   PATTERN MATCHER      │
              │  Compare to historical │
              │  disputes and known    │
              │  fraud patterns        │
              └───────────┬────────────┘
                          │
                          ▼
    ┌─────────────────────────────────────────────┐
    │           DELIBERATION CHAMBER              │
    │                                             │
    │  Agent      Provider     Investigator       │
    │  Advocate   Advocate                        │
    │     │          │              │             │
    │     └──────────┼──────────────┘             │
    │                ▼                            │
    │           ARBITER                           │
    │         Final Score                         │
    └───────────────────┬─────────────────────────┘
                        │
                        ▼
              ┌────────────────────────┐
              │  REASONING CHAIN       │
              │  Build verifiable      │
              │  audit trail           │
              └───────────┬────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
   ┌─────────────────┐        ┌─────────────────┐
   │  IPFS/ARWEAVE   │        │   CONFIDENCE    │
   │  COMMITMENT     │        │   CALIBRATION   │
   └────────┬────────┘        └────────┬────────┘
            │                          │
            └──────────┬───────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  VOTE SUBMISSION│
              │  (on-chain)     │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  OUTCOME        │
              │  TRACKING       │
              │  (learn from    │
              │   result)       │
              └─────────────────┘
```

---

## Technical Specifications

### Deliberation Chamber

```typescript
interface DebateRound {
  round: number;
  agentArgument: string;
  providerArgument: string;
  investigatorChallenges: string[];
  agentResponse: string;
  providerResponse: string;
}

interface DeliberationResult {
  transcript: DebateRound[];
  finalScore: number;
  confidence: 'low' | 'medium' | 'high';
  arbiterReasoning: string;
  keyFactors: string[];
  dissent?: {
    advocate: 'agent' | 'provider';
    argument: string;
  };
}

async function deliberate(
  context: EvaluationContext,
  evidence: GatheredEvidence,
  patterns: MatchedPatterns
): Promise<DeliberationResult>;
```

### Evidence Hunter

```typescript
interface GatheredEvidence {
  onChain: {
    agentHistory: TransactionSummary;
    providerHistory: TransactionSummary;
    escrowDetails: EscrowAnalysis;
    previousDisputes: DisputeRecord[];
  };
  offChain: {
    apiHealth?: APIHealthCheck;
    domainInfo?: DomainAnalysis;
    webPresence?: WebPresenceSummary;
    socialSignals?: SocialAnalysis;
  };
  patterns: {
    similarDisputes: SimilarDispute[];
    fraudIndicators: FraudIndicator[];
    legitimacySignals: LegitimacySignal[];
  };
  confidence: number;
  gatheringTime: number;
}

async function gatherEvidence(
  dispute: DisputeEvent,
  maxTimeMs: number
): Promise<GatheredEvidence>;
```

### Learning System

```typescript
interface OutcomeRecord {
  escrowPda: string;
  ourVote: number;
  consensusScore: number;
  deviation: number;
  wasSlashed: boolean;
  rewardAmount: number;
  deliberationHash: string;
  timestamp: number;
}

interface CalibrationUpdate {
  confidenceThresholds: Record<string, number>;
  riskWeights: Record<string, number>;
  patternWeights: Record<string, number>;
  advocateAggressiveness: number;
}

class LearningSystem {
  async recordOutcome(record: OutcomeRecord): Promise<void>;
  async updateCalibration(): Promise<CalibrationUpdate>;
  async getPatternInsights(dispute: DisputeEvent): Promise<PatternInsight[]>;
}
```

### Verifiable Reasoning

```typescript
interface ReasoningCommitment {
  hash: string;
  ipfsUrl: string;
  timestamp: number;
}

interface VerifiableReasoning {
  deliberationTranscript: DebateRound[];
  evidence: GatheredEvidence;
  patternMatches: MatchedPatterns;
  finalScore: number;
  arbiterReasoning: string;
  commitment: ReasoningCommitment;
}

async function commitReasoning(
  reasoning: VerifiableReasoning
): Promise<ReasoningCommitment>;

async function verifyReasoning(
  commitment: ReasoningCommitment,
  reasoning: VerifiableReasoning
): Promise<boolean>;
```

---

## Innovation Highlights

### 1. First Adversarial AI Arbiter
No other blockchain oracle uses multi-agent debate for decision-making. This brings centuries of legal system wisdom to decentralized arbitration.

### 2. Self-Improving Oracle
The learning system means the oracle gets smarter over time, building institutional knowledge that compound advantages.

### 3. Verifiable Reasoning
Not just accurate votes, but defensible reasoning. This creates a new standard for oracle accountability.

### 4. Predictive Intelligence
Moving from reactive to proactive dispute resolution, potentially preventing disputes before they happen.

### 5. Evidence-Driven Decisions
Active investigation rather than passive evaluation. The oracle becomes a true investigator, not just a judge.

---

## Implementation Phases

### Phase 1: Deliberation Chamber (2-3 days)
- Implement multi-agent debate system
- Create advocate and arbiter prompts
- Build transcript recording
- Integrate with existing evaluation flow

### Phase 2: Evidence Hunter (2-3 days)
- On-chain analysis with Helius
- Pattern matching from historical data
- Basic off-chain probing
- Evidence caching

### Phase 3: Learning System (2-3 days)
- Outcome tracking
- Calibration updates
- Knowledge base persistence
- Pattern learning

### Phase 4: Verifiable Reasoning (1-2 days)
- Commitment hashing
- IPFS/Arweave publishing
- Verification endpoint

### Phase 5: Predictive Intelligence (1-2 days)
- Risk scoring for active escrows
- Pre-gathering for high-risk escrows
- Alert system

---

## Questions for User

1. **Priority**: Which innovation is most important to implement first?
   - Adversarial Debate (more robust decisions)
   - Evidence Hunting (better information)
   - Learning System (continuous improvement)
   - All of them in order

2. **Off-Chain Probing**: Should we implement actual API health checks and web searches?
   - Full implementation with MCP tools
   - Simulated for now, real later
   - Skip this component

3. **Storage**: Where should we store learning data and reasoning commitments?
   - Local SQLite database
   - IPFS/Arweave (decentralized)
   - Both (local cache + decentralized backup)

4. **Compute Budget**: How aggressive should the deliberation be?
   - Quick (2 rounds, 3 LLM calls)
   - Standard (3 rounds, 5 LLM calls)
   - Thorough (5 rounds, 8+ LLM calls)
