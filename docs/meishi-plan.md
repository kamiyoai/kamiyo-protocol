# Meishi Protocol — Agent Compliance Passports

> "Every agent needs a Meishi."

## Vision

Meishi is a verifiable compliance passport system for autonomous AI agents operating in e-commerce. Just as the EU mandates Digital Product Passports for physical products, Meishi creates the standard for **Agent Compliance Passports** — cryptographic credentials that prove an agent's identity, authorization scope, compliance status, and transaction history before it's allowed to transact.

The agent economy is exploding. Shopify Agentic Storefronts, ChatGPT checkout, Amazon Auto Buy — AI agents are making purchases autonomously. Traffic from AI platforms to e-commerce surged 4,700% YoY. But nobody has solved the accountability layer:

- **Who is liable** when an agent buys the wrong thing? Courts haven't settled it.
- **Who proves authorization** — that a consumer actually delegated this purchase?
- **Who audits compliance** — is this agent operating within EU AI Act requirements?
- **Who scores trust** — should a merchant accept transactions from this agent?

Mastercard has Agent Tokens. Visa has TAP. Google has AP2. OpenAI/Stripe have ACP. These are all **payment pipes**. None of them answer: *"Who is accountable, and how do you prove it?"*

Kamiyo Meishi answers that question.

---

## Core Concept: The Meishi

A **Meishi** is an on-chain verifiable credential issued to an AI agent. It contains:

| Field | Description | Source |
|-------|-------------|--------|
| **Identity** | Who built this agent, who deployed it, cryptographic chain of custody | Kamiyo PDA identity |
| **Kamon** | Generated visual crest derived from on-chain state — the agent's unique mark | Deterministic from identity hash |
| **Authorization Mandate** | What this agent is allowed to do: spending limits, categories, merchant whitelist, time bounds | Signed by delegating principal |
| **Compliance Classification** | EU AI Act risk level, required oversight checkpoints, regulatory jurisdiction tags | Meishi compliance oracle |
| **Decision Audit Trail** | Every transaction decision recorded as a verifiable knowledge asset | OriginTrail DKG |
| **Compliance Score** | Real-time reputation/compliance rating, updated after every transaction | Kamiyo oracle consensus |
| **Liability Allocation** | Pre-agreed responsibility split between consumer, agent developer, and merchant | Stored in Meishi escrow |

A Meishi is **presented** before any transaction — like the Japanese business card ritual. Both parties verify each other's credentials. No Meishi, no deal.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MEISHI PROTOCOL                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   Meishi     │  │   Meishi     │  │    Meishi             │ │
│  │   Registry   │  │   Exchange   │  │    Compliance Engine  │ │
│  │   (Solana)   │  │   Protocol   │  │    (Off-chain)        │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
│         │                 │                       │             │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌───────────┴───────────┐ │
│  │   Kamiyo     │  │   x402       │  │    DKG Audit Trail    │ │
│  │   Identity   │  │   Payment    │  │    (OriginTrail)      │ │
│  │   + Escrow   │  │   Layer      │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   ZK Proof   │  │   Oracle     │  │    Kamon Generator    │ │
│  │   Engine     │  │   Consensus  │  │    (Visual Identity)  │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                      INTEGRATION LAYER                          │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│  Shopify │  OpenAI  │  Google  │   Visa   │   Any Agent         │
│  Agentic │  ACP     │  UCP/AP2 │  TAP     │   Framework         │
│  Store   │  Checkout│          │          │   (MCP/A2A/etc)     │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
```

### Component Breakdown

#### 1. Meishi Registry (On-Chain — Solana Program)

A new Solana program (`meishi`) or extension of the existing `kamiyo` program that manages agent passport state on-chain.

**Accounts:**

```
MeishiPassport (PDA: ["meishi", agent_identity_pubkey])
├── agent_identity: PublicKey        // Link to existing Kamiyo AgentIdentity PDA
├── issuer: PublicKey                // Who created/deployed this agent
├── principal: PublicKey             // Human/entity who delegated authority
├── kamon_hash: [u8; 32]            // Deterministic hash for visual crest generation
├── compliance_class: u8            // 0=Unclassified, 1=Minimal, 2=Limited, 3=High, 4=Unacceptable
├── compliance_score: i16           // -1000 to 1000 (mirrors Kamiyo reputation range)
├── jurisdiction: u8                // 0=Global, 1=EU, 2=US, 3=UK, 4=APAC
├── mandate_hash: [u8; 32]          // Hash of off-chain authorization mandate document
├── mandate_expires: i64            // When delegation authority expires
├── total_transactions: u64         // Lifetime transaction count
├── total_volume_usd: u64           // Lifetime volume in micro-USD
├── disputes_filed: u32             // Disputes initiated against this agent
├── disputes_lost: u32              // Disputes this agent lost
├── last_audit: i64                 // Timestamp of last compliance audit
├── suspended: bool                 // Emergency suspension flag
├── suspension_reason: u8           // 0=None, 1=ComplianceFailure, 2=FraudDetected, 3=MandateExpired, 4=OracleConsensus
├── created_at: i64
├── updated_at: i64
├── bump: u8
```

```
MeishiMandate (PDA: ["mandate", meishi_pubkey, mandate_version])
├── meishi: PublicKey               // Parent Meishi passport
├── version: u32                    // Mandate version (incremental)
├── principal_signature: [u8; 64]   // Ed25519 signature from delegating human
├── spending_limit_usd: u64        // Max per-transaction in micro-USD
├── daily_limit_usd: u64           // Max daily spend in micro-USD
├── monthly_limit_usd: u64         // Max monthly spend in micro-USD
├── category_whitelist: [u8; 32]   // Bitmap of allowed product categories (up to 256)
├── merchant_whitelist_hash: [u8; 32] // Merkle root of allowed merchants (off-chain list)
├── requires_human_approval_above: u64 // Threshold for human-in-the-loop (micro-USD)
├── geo_restrictions: u8            // Bitmap: EU, US, UK, APAC, etc.
├── valid_from: i64
├── valid_until: i64
├── revoked: bool
├── revoked_at: i64
├── bump: u8
```

```
MeishiAudit (PDA: ["audit", meishi_pubkey, audit_nonce])
├── meishi: PublicKey
├── auditor: PublicKey              // Oracle that performed audit
├── audit_type: u8                  // 0=Initial, 1=Periodic, 2=Triggered, 3=Dispute
├── compliance_score_before: i16
├── compliance_score_after: i16
├── findings_hash: [u8; 32]        // Hash of detailed findings (stored on DKG)
├── findings_ual: String            // OriginTrail UAL for full audit report
├── passed: bool
├── timestamp: i64
├── bump: u8
```

```
LiabilityAllocation (PDA: ["liability", meishi_pubkey, counterparty_pubkey])
├── meishi: PublicKey               // The agent's Meishi
├── counterparty: PublicKey         // Merchant/platform being transacted with
├── consumer_liability_bps: u16    // Basis points (0-10000) — consumer's share
├── developer_liability_bps: u16   // Agent developer's share
├── merchant_liability_bps: u16    // Merchant's share
├── platform_liability_bps: u16    // Platform's share (Shopify, ChatGPT, etc.)
├── max_liability_usd: u64         // Cap in micro-USD
├── arbitration_oracle: PublicKey   // Designated dispute resolver
├── agreed_at: i64
├── expires_at: i64
├── bump: u8
```

**Instructions:**

| Instruction | Description | Authority |
|-------------|-------------|-----------|
| `create_meishi` | Issue new passport for an agent | Agent owner (must have Kamiyo AgentIdentity) |
| `update_mandate` | Set/update authorization scope | Principal (delegating human) |
| `revoke_mandate` | Revoke agent's authorization | Principal |
| `record_audit` | Store compliance audit result | Registered oracle only |
| `update_compliance_score` | Update score after oracle consensus | Oracle consensus (multi-sig) |
| `suspend_meishi` | Emergency suspension | Oracle consensus OR protocol multisig |
| `unsuspend_meishi` | Lift suspension after remediation | Oracle consensus |
| `set_liability_allocation` | Pre-agree liability split | Both parties must sign |
| `record_transaction` | Increment counters after verified tx | Escrow program (CPI) |
| `verify_meishi` | On-chain verification of passport validity | Anyone (permissionless read) |

#### 2. Meishi Exchange Protocol (The Handshake)

Before any agent-to-merchant or agent-to-agent transaction, both parties perform a **Meishi Exchange** — a mutual credential verification step.

**Flow:**

```
Agent A (buyer)                    Merchant M (seller)
     │                                    │
     │  1. Present Meishi                 │
     │  ─────────────────────────────►    │
     │  (passport PDA + mandate proof     │
     │   + ZK compliance proof)           │
     │                                    │
     │  2. Verify Meishi                  │
     │    ◄─────────────────────────────  │
     │  (check: active, not suspended,    │
     │   mandate valid, score threshold,  │
     │   spending within limits,          │
     │   category authorized)             │
     │                                    │
     │  3. Present Merchant Meishi        │
     │    ◄─────────────────────────────  │
     │  (merchant's own passport +        │
     │   acceptance policies)             │
     │                                    │
     │  4. Verify Merchant                │
     │  ─────────────────────────────►    │
     │  (check: legitimate merchant,      │
     │   not blacklisted, liability       │
     │   terms acceptable)                │
     │                                    │
     │  5. Agree Liability Terms          │
     │  ◄────────────────────────────►    │
     │  (create LiabilityAllocation PDA   │
     │   — both sign)                     │
     │                                    │
     │  6. Create Escrowed Transaction    │
     │  ─────────────────────────────►    │
     │  (funds locked with Meishi         │
     │   references + mandate proof)      │
     │                                    │
```

**Implementation approach:** This exchange can happen in two modes:

- **On-chain mode** (high-value): Full PDA verification via CPI calls. Used for transactions above a configurable threshold or when either party requires maximum assurance.
- **Lightweight mode** (micro-transactions): Off-chain signature verification with on-chain settlement. The agent presents a signed Meishi proof (Ed25519), the merchant verifies locally, and only the final transaction hits chain. This avoids per-transaction on-chain costs for high-frequency low-value commerce.

**HTTP Integration (x402 Extension):**

Meishi integrates with the existing x402 payment protocol by adding Meishi-specific headers:

```
x-meishi-passport: <base58 PDA address>
x-meishi-mandate-version: <u32>
x-meishi-compliance-proof: <base64 ZK proof>
x-meishi-signature: <base64 Ed25519 signature of request body>
x-meishi-liability-ref: <base58 LiabilityAllocation PDA>
```

Merchants running Meishi-aware middleware can verify these headers before accepting payment. This slots directly into the existing `@kamiyo/middleware` Express integration.

#### 3. Meishi Compliance Engine (Off-Chain Service)

A new service (`services/meishi-compliance/`) that performs continuous compliance assessment of registered agents.

**Compliance Rules Engine:**

Adapted from TraceHub's ESPR validator pattern — modular rule sets per jurisdiction:

```
rules/
├── eu-ai-act/
│   ├── risk-classification.ts      // Determine if agent is high-risk per EU AI Act Article 6
│   ├── transparency-requirements.ts // Check disclosure obligations (Article 52)
│   ├── human-oversight.ts          // Verify human-in-the-loop checkpoints (Article 14)
│   ├── data-governance.ts          // Training data quality requirements (Article 10)
│   └── record-keeping.ts          // Logging/audit trail requirements (Article 12)
├── us-state/
│   ├── utah-ai-policy.ts          // Utah disclosure requirements
│   ├── texas-raiga.ts             // Texas RAIGA compliance
│   ├── colorado-ai-act.ts         // Colorado SB24-205
│   └── california-ab2013.ts       // California AI transparency
├── consumer-protection/
│   ├── authorization-verification.ts // Prove consumer delegated authority
│   ├── spending-limit-enforcement.ts // Mandate limit checking
│   ├── purchase-intent-validation.ts // Did the agent buy what was asked?
│   └── refund-eligibility.ts       // Determine refund rights per jurisdiction
├── commerce/
│   ├── merchant-legitimacy.ts      // Is this a real merchant? (anti-phishing)
│   ├── price-manipulation.ts       // Detect if agent is being price-manipulated
│   ├── counterfeit-detection.ts    // Product authenticity scoring
│   └── category-restrictions.ts    // Age-restricted, regulated goods checks
└── index.ts                        // Rule registry and execution engine
```

**Scoring Algorithm:**

Adapted from TraceHub's ESPR completeness scoring, but applied to agent compliance dimensions:

```typescript
interface ComplianceDimension {
  name: string;
  weight: number;         // 0-100, all weights sum to 100
  score: number;          // 0-100 per dimension
  requirement: 'mandatory' | 'recommended' | 'optional';
  jurisdiction: string[]; // Which jurisdictions require this
}

// Dimensions and weights:
const DIMENSIONS = {
  identity_verification:    { weight: 20, requirement: 'mandatory' },   // Is the agent who it claims to be?
  authorization_validity:   { weight: 20, requirement: 'mandatory' },   // Is the mandate current and properly signed?
  transaction_history:      { weight: 15, requirement: 'mandatory' },   // Clean transaction record?
  audit_trail_completeness: { weight: 15, requirement: 'mandatory' },   // Are all decisions logged to DKG?
  regulatory_classification:{ weight: 10, requirement: 'mandatory' },   // Properly classified per AI Act?
  spending_compliance:      { weight: 10, requirement: 'mandatory' },   // Operating within mandate limits?
  dispute_record:           { weight: 5,  requirement: 'mandatory' },   // Dispute win/loss ratio
  oversight_checkpoints:    { weight: 5,  requirement: 'recommended' }, // Human-in-the-loop evidence
};

// Score calculation:
compliance_score = sum(dimension.score * dimension.weight) / 100
// Mapped to Kamiyo's -1000 to 1000 range:
// 0-100 internal → -1000 to 1000 on-chain
```

**Scheduling:**

Reuse TraceHub's Relay scheduler pattern (Bull queue + Redis):
- **Continuous monitoring**: Every 4 hours for active agents
- **Triggered audits**: On dispute filing, mandate change, or score drop below threshold
- **Periodic deep audit**: Weekly comprehensive review
- **Circuit breaker**: Per-agent-type, 5-failure threshold, 30s reset

#### 4. DKG Audit Trail (OriginTrail Integration)

Every significant agent action gets published to OriginTrail's Decentralized Knowledge Graph as an immutable, queryable knowledge asset. This creates the legally admissible audit trail.

**Knowledge Asset Types:**

Building on the existing `@kamiyo/agent-paranet` publishing system:

```typescript
// 1. Transaction Decision Record
{
  "@context": "https://kamiyo.io/meishi/v1",
  "@type": "TransactionDecision",
  "agent": "<agent_global_id>",
  "meishi": "<meishi_pda>",
  "mandate_version": 3,
  "decision": {
    "action": "purchase",
    "merchant": "<merchant_id>",
    "product_category": "electronics",
    "amount_usd": 149.99,
    "reasoning_hash": "<sha256 of LLM reasoning trace>",
    "human_approved": false,
    "mandate_check": "passed",
    "spending_check": "passed",
    "category_check": "passed"
  },
  "outcome": {
    "transaction_id": "<tx_hash>",
    "escrow_address": "<pda>",
    "timestamp": "2026-02-05T20:00:00Z"
  }
}

// 2. Compliance Audit Record
{
  "@context": "https://kamiyo.io/meishi/v1",
  "@type": "ComplianceAudit",
  "agent": "<agent_global_id>",
  "meishi": "<meishi_pda>",
  "auditor": "<oracle_id>",
  "audit_type": "periodic",
  "dimensions": {
    "identity_verification": { "score": 95, "findings": [] },
    "authorization_validity": { "score": 100, "findings": [] },
    "transaction_history": { "score": 82, "findings": ["3 disputes in last 30 days"] },
    // ...
  },
  "overall_score": 87,
  "classification": "high-risk",
  "jurisdiction": "EU",
  "recommendations": ["Increase human oversight frequency"],
  "timestamp": "2026-02-05T20:00:00Z"
}

// 3. Liability Resolution Record
{
  "@context": "https://kamiyo.io/meishi/v1",
  "@type": "LiabilityResolution",
  "dispute_id": "<dispute_pda>",
  "meishi": "<meishi_pda>",
  "transaction": "<transaction_decision_ual>",
  "allocation": {
    "consumer": 0,
    "developer": 60,
    "merchant": 40,
    "platform": 0
  },
  "resolution": "oracle_consensus",
  "oracle_scores": [/* commit-reveal results */],
  "refund_amount_usd": 89.99,
  "reasoning_ual": "<link to detailed oracle reasoning>",
  "timestamp": "2026-02-05T20:00:00Z"
}
```

**SPARQL Queries for Discovery:**

```sparql
# Find all transactions by an agent in the last 30 days
SELECT ?tx ?amount ?merchant ?outcome
WHERE {
  ?tx a meishi:TransactionDecision ;
      meishi:agent <agent_id> ;
      meishi:decision/meishi:amount_usd ?amount ;
      meishi:decision/meishi:merchant ?merchant ;
      meishi:outcome/meishi:timestamp ?ts .
  FILTER (?ts > "2026-01-06T00:00:00Z"^^xsd:dateTime)
}

# Find agents with compliance score above threshold
SELECT ?agent ?score ?classification
WHERE {
  ?audit a meishi:ComplianceAudit ;
         meishi:agent ?agent ;
         meishi:overall_score ?score ;
         meishi:classification ?classification .
  FILTER (?score >= 80)
}
ORDER BY DESC(?score)

# Trace full liability chain for a disputed transaction
SELECT ?decision ?audit ?resolution ?allocation
WHERE {
  ?resolution a meishi:LiabilityResolution ;
              meishi:transaction ?decision ;
              meishi:allocation ?allocation .
  ?decision meishi:agent <agent_id> .
  OPTIONAL { ?audit a meishi:ComplianceAudit ; meishi:agent <agent_id> }
}
```

#### 5. ZK Proof Engine

Privacy-preserving compliance verification using the existing Kamiyo ZK infrastructure.

**New Circuits:**

```
circuits/
├── meishi-compliance/
│   ├── compliance-threshold.nr     // Prove: score >= threshold without revealing exact score
│   ├── mandate-validity.nr         // Prove: mandate is active and not expired without revealing limits
│   ├── spending-within-limits.nr   // Prove: cumulative spend < limit without revealing total
│   ├── category-authorized.nr      // Prove: purchase category is in whitelist without revealing full whitelist
│   └── clean-record.nr            // Prove: dispute rate < threshold without revealing exact counts
```

**Key proof: `compliance-threshold.nr`:**

```
// Proves an agent's compliance score meets a merchant's minimum threshold
// without revealing the agent's actual score
//
// Public inputs: threshold, meishi_commitment
// Private inputs: compliance_score, agent_id, secret
//
// Constraints:
//   1. compliance_score >= threshold
//   2. meishi_commitment == Poseidon2(agent_id, compliance_score, secret)
```

**Key proof: `spending-within-limits.nr`:**

```
// Proves agent's cumulative spend is within mandate limits
// without revealing how much the agent has already spent
//
// Public inputs: transaction_amount, mandate_commitment
// Private inputs: current_cumulative, daily_limit, monthly_limit, mandate_secret
//
// Constraints:
//   1. current_cumulative + transaction_amount <= daily_limit
//   2. current_cumulative + transaction_amount <= monthly_limit
//   3. mandate_commitment == Poseidon2(daily_limit, monthly_limit, mandate_secret)
```

This is critical for agents that don't want to reveal their full spending history or mandate details to every merchant they interact with.

#### 6. Kamon Generator

Every Meishi gets a **Kamon** — a deterministic visual crest generated from on-chain state. This serves as the agent's visual identity across platforms.

**Generation approach:**

```typescript
// Input: meishi PDA data
// Output: deterministic SVG crest

function generateKamon(meishi: MeishiPassport): SVG {
  // 1. Hash identity data into seed
  const seed = sha256(
    meishi.agent_identity,
    meishi.issuer,
    meishi.created_at
  );

  // 2. Derive visual parameters from seed
  const params = {
    symmetry: seed[0] % 8 + 4,           // 4-12 fold symmetry (like real Kamon)
    complexity: seed[1] % 5 + 1,          // 1-5 layers
    style: KAMON_STYLES[seed[2] % KAMON_STYLES.length], // geometric, organic, abstract
    primary_element: ELEMENTS[seed[3] % ELEMENTS.length],
  };

  // 3. Overlay compliance indicators
  //    - Border color: green (compliant), amber (warning), red (suspended)
  //    - Corner marks: jurisdiction badges
  //    - Ring count: trust tier visualization

  // 4. Render deterministic SVG
  return renderKamon(params, meishi.compliance_class, meishi.jurisdiction);
}
```

The Kamon is NOT stored on-chain (too expensive). It's deterministically generated client-side from on-chain data, so anyone can reproduce it. Could optionally be stored as an NFT metadata URI for platforms that want to display it.

---

## Package Structure

New packages within the kamiyo-protocol monorepo:

```
packages/
├── meishi/                          # NEW — Core Meishi SDK
│   ├── src/
│   │   ├── index.ts                 # Public API
│   │   ├── client.ts                # MeishiClient (PDA operations)
│   │   ├── passport.ts              # Create, update, verify passports
│   │   ├── mandate.ts               # Mandate management (set, revoke, verify)
│   │   ├── exchange.ts              # Meishi Exchange protocol (the handshake)
│   │   ├── liability.ts             # Liability allocation CRUD
│   │   ├── audit.ts                 # Audit record management
│   │   ├── compliance-score.ts      # Score calculation and update
│   │   ├── types.ts                 # All Meishi types and interfaces
│   │   ├── kamon.ts                 # Kamon visual generation
│   │   ├── zk/
│   │   │   ├── compliance-proof.ts  # Generate/verify compliance ZK proofs
│   │   │   ├── mandate-proof.ts     # Generate/verify mandate ZK proofs
│   │   │   └── spending-proof.ts    # Generate/verify spending ZK proofs
│   │   └── dkg/
│   │       ├── publisher.ts         # Publish audit trail to OriginTrail
│   │       ├── queries.ts           # SPARQL queries for Meishi data
│   │       └── schemas.ts           # Knowledge asset schemas
│   └── package.json

├── meishi-middleware/                # NEW — HTTP middleware for merchants
│   ├── src/
│   │   ├── index.ts
│   │   ├── express.ts               # Express middleware (verify Meishi headers)
│   │   ├── fastify.ts               # Fastify plugin
│   │   └── verification.ts          # Core verification logic
│   └── package.json

├── meishi-mcp/                      # NEW — MCP server for Meishi operations
│   ├── src/
│   │   ├── index.ts
│   │   └── tools.ts                 # MCP tools: verify_meishi, create_meishi, check_compliance, etc.
│   └── package.json
```

New service:

```
services/
├── meishi-compliance/               # NEW — Compliance engine service
│   ├── src/
│   │   ├── index.ts                 # Service entry point
│   │   ├── config.ts                # Configuration
│   │   ├── engine.ts                # Rule execution engine
│   │   ├── scheduler.ts             # Bull queue scheduler (adapted from TraceHub Relay)
│   │   ├── queue.ts                 # Job queue with circuit breaker
│   │   ├── rules/
│   │   │   ├── eu-ai-act/           # EU AI Act rule modules
│   │   │   ├── us-state/            # US state law rule modules
│   │   │   ├── consumer-protection/ # Consumer protection rules
│   │   │   └── commerce/            # Commerce-specific rules
│   │   ├── auditor.ts               # Audit execution and DKG publishing
│   │   └── oracle-integration.ts    # Submit scores to Kamiyo oracle consensus
│   └── package.json
```

New Solana program (or extension):

```
programs/
├── meishi/                          # NEW — Meishi on-chain program
│   ├── src/
│   │   ├── lib.rs
│   │   ├── state/
│   │   │   ├── passport.rs          # MeishiPassport account
│   │   │   ├── mandate.rs           # MeishiMandate account
│   │   │   ├── audit.rs             # MeishiAudit account
│   │   │   └── liability.rs         # LiabilityAllocation account
│   │   ├── instructions/
│   │   │   ├── create_meishi.rs
│   │   │   ├── update_mandate.rs
│   │   │   ├── revoke_mandate.rs
│   │   │   ├── record_audit.rs
│   │   │   ├── update_compliance.rs
│   │   │   ├── suspend.rs
│   │   │   ├── set_liability.rs
│   │   │   ├── record_transaction.rs
│   │   │   └── verify.rs
│   │   ├── errors.rs
│   │   └── events.rs
│   ├── Cargo.toml
│   └── Anchor.toml
```

New ZK circuits:

```
circuits/noir/
├── meishi-compliance/               # NEW
│   ├── compliance-threshold/
│   │   └── main.nr
│   ├── mandate-validity/
│   │   └── main.nr
│   ├── spending-within-limits/
│   │   └── main.nr
│   ├── category-authorized/
│   │   └── main.nr
│   └── clean-record/
│       └── main.nr
```

---

## Integration Points

### With Existing Kamiyo Infrastructure

| Existing Component | Meishi Integration |
|---|---|
| `kamiyo` program (AgentIdentity PDA) | Meishi requires existing AgentIdentity. `create_meishi` validates agent exists and is active |
| `kamiyo-escrow` program | Extended to require Meishi verification before escrow creation. LiabilityAllocation PDA referenced in escrow |
| `@kamiyo/sdk` | New `meishi` module exported alongside agent, agreement, oracle, etc. |
| `@kamiyo/hive` | AgentDiscovery filters by Meishi compliance score. A2AEscrow requires Meishi exchange |
| `@kamiyo/agent-paranet` | New knowledge asset types for TransactionDecision, ComplianceAudit, LiabilityResolution |
| `@kamiyo/mcp-server` | New tools: `verify_meishi`, `create_meishi`, `check_agent_compliance`, `get_audit_trail` |
| `@kamiyo/x402-client` | New Meishi headers added to x402 payment flow |
| `@kamiyo/middleware` | Express middleware extended with Meishi verification |
| Oracle consensus system | Compliance scores updated via existing multi-oracle commit-reveal |
| ZK circuits (Noir) | New Meishi-specific circuits alongside existing agent-identity and reputation-proof |
| `@kamiyo/erc8004` | Cross-chain Meishi verification for EVM-based commerce |

### With External Platforms

| Platform | Integration Approach |
|---|---|
| **Shopify Agentic Storefronts** | Shopify app/middleware that verifies incoming agent Meishi before accepting checkout. Merchants install it to protect against un-passported agents |
| **OpenAI ACP (Agentic Commerce Protocol)** | Meishi verification step injected into ACP checkout flow. Compatible with existing `session_id` and `cart` concepts |
| **Google UCP / AP2** | Meishi proof included alongside AP2 purchase mandates. Extends AP2's intent→cart→checkout flow with compliance verification |
| **Visa TAP / Mastercard Agent Pay** | Meishi passport address embedded in agent token metadata. Payment networks can query Meishi state for risk scoring |
| **Any MCP-compatible agent** | `meishi-mcp` server provides tools for any Claude/LLM agent to create and verify Meishi passports |

---

## Implementation Phases

### Phase 1: Foundation (Core Protocol)

**Goal:** On-chain Meishi program + TypeScript SDK + basic passport CRUD.

**Deliverables:**
- [x] Solana program: `meishi` with MeishiPassport, MeishiMandate accounts
- [x] Instructions: create_meishi, update_mandate, revoke_mandate, verify (10 instructions total)
- [x] `@kamiyo/meishi` SDK package with client, passport, mandate modules
- [x] Unit tests for all instructions (24 tests passing)
- [x] Devnet deployment (`6uejE3hDz3ZNHW7P4uHQEHS6fHAQ4vLJg7rx4VBYwpyK`)
- [ ] Basic CLI for passport management (extend oracle-cli or new meishi-cli)

**Dependencies:** Existing `kamiyo` program (AgentIdentity PDA), `@kamiyo/sdk`

### Phase 2: Compliance Engine

**Goal:** Off-chain compliance scoring service with rule engine.

**Deliverables:**
- [x] `services/meishi-compliance/` service scaffolded from TraceHub Relay patterns
- [x] Bull queue + Redis scheduler with circuit breaker
- [x] EU AI Act rule set (risk classification, transparency, human oversight)
- [x] Consumer protection rule set (authorization, spending limits)
- [x] Compliance scoring algorithm (8 dimensions, weighted)
- [ ] Oracle integration: submit scores to Kamiyo oracle consensus
- [x] Solana instructions: record_audit, update_compliance_score
- [x] Render.com deployment config (`meishi-compliance.onrender.com`)

**Dependencies:** Phase 1, existing oracle system

### Phase 3: Audit Trail + DKG

**Goal:** Immutable transaction decision trail on OriginTrail.

**Deliverables:**
- [x] TransactionDecision, ComplianceAudit, LiabilityResolution knowledge asset schemas
- [x] `@kamiyo/meishi` DKG publisher module (building on `@kamiyo/agent-paranet`)
- [x] SPARQL query library for Meishi data
- [x] Audit record on-chain account (MeishiAudit PDA)
- [ ] Integration test: full flow from transaction → DKG publish → SPARQL query

**Dependencies:** Phase 2, existing DKG integration

### Phase 4: Meishi Exchange Protocol

**Goal:** The handshake — mutual verification before transactions.

**Deliverables:**
- [x] Exchange protocol implementation (on-chain and lightweight modes)
- [x] `meishi-middleware` package (Express + Fastify)
- [x] x402 header extension with Meishi fields
- [x] LiabilityAllocation PDA and set_liability instruction
- [x] Integration with `@kamiyo/hive` (discovery filters, A2AEscrow requirement)
- [x] Integration with `@kamiyo/x402-client`

**Dependencies:** Phase 1, existing x402 and middleware packages

### Phase 5: ZK Privacy Layer

**Goal:** Privacy-preserving compliance proofs.

**Deliverables:**
- [ ] Noir circuits: compliance-threshold, mandate-validity, spending-within-limits, category-authorized, clean-record *(deferred — SHA-256 placeholder proofs in use)*
- [x] Proof generation utilities in `@kamiyo/meishi/zk/` (SHA-256 commitment-based, awaiting Noir circuits)
- [ ] On-chain verifier in meishi program *(deferred)*
- [ ] Integration: merchants can request ZK proof instead of raw Meishi data *(deferred)*

**Dependencies:** Phase 4, existing ZK infrastructure

### Phase 6: Kamon Visual Identity

**Goal:** Deterministic visual crest generation.

**Deliverables:**
- [x] Kamon generation algorithm (seed from on-chain data → SVG)
- [x] Compliance status overlay (border color, jurisdiction badges, trust tier rings)
- [x] `@kamiyo/meishi/kamon.ts` module
- [ ] Optional NFT metadata URI generation *(deferred)*
- [ ] Reference renderer (web component or React component) *(deferred)*

**Dependencies:** Phase 1 (just needs MeishiPassport data)

### Phase 7: MCP + External Integrations

**Goal:** Make Meishi accessible to any AI agent and commerce platform.

**Deliverables:**
- [x] `meishi-mcp` package with tools: verify_meishi, get_meishi, check_compliance, check_mandate, get_liability, get_kamon, suggest_liability (7 tools)
- [ ] Shopify app middleware (verify incoming agents) *(deferred)*
- [ ] ACP integration guide + reference implementation *(deferred)*
- [ ] UCP/AP2 integration guide *(deferred)*
- [ ] Documentation site / specification document *(deferred)*

**Dependencies:** All previous phases

---

## Differentiation Summary

| Competitor | What They Do | What They Don't Do (Meishi Does) |
|---|---|---|
| **Visa TAP** | Agent payment tokens | No compliance scoring, no audit trail, no liability allocation |
| **Mastercard Agent Pay** | Tokenization for agent identity | No regulatory classification, no dispute resolution, no DKG |
| **Google AP2** | Cryptographic purchase mandates | No reputation system, no multi-oracle consensus, no ZK privacy |
| **OpenAI/Stripe ACP** | Checkout protocol for agents | No on-chain identity, no compliance engine, no liability pre-allocation |
| **Shopify UCP** | Discovery + checkout standard | No accountability layer, no audit trail, no cross-platform verification |

Meishi is the **accountability layer underneath all of them**. It doesn't compete with payment pipes — it makes them trustworthy.

---

## Open Questions

1. **Program architecture**: New standalone `meishi` program vs. extending the existing `kamiyo` program? Standalone is cleaner for upgrades but adds CPI complexity. Extending `kamiyo` keeps everything in one program but increases its surface area.

2. **Mandate storage**: Full mandate on-chain (expensive, ~1KB per mandate) vs. mandate hash on-chain with full document on DKG/IPFS? Hash-on-chain is cheaper but requires off-chain availability guarantees.

3. **Compliance rule updates**: How do we update EU AI Act rules as regulations evolve? Off-chain engine is flexible (just redeploy), but on-chain score calculation needs to be stable. Proposal: rules are always off-chain, only the final score goes on-chain via oracle consensus.

4. **Cross-chain Meishi**: Start Solana-only, or plan for EVM Meishi from day one via ERC-8004? Recommendation: Solana first, EVM bridge in Phase 5+ using existing `@kamiyo/erc8004` infrastructure.

5. **Kamon as NFT**: Should Kamon be mintable as a cNFT (compressed NFT) on Solana? Low cost (~$0.001 per mint) and gives agents a tradeable visual identity. Could create secondary market dynamics.

6. **Pricing model**: Per-passport issuance fee? Per-verification fee? Subscription for compliance monitoring? Staking requirement (like existing Kamiyo agent identity)? Recommendation: Require KAMIYO token stake for passport issuance (mirrors existing agent identity pattern) + per-audit fees in USDC.
