# x402Resolve: Automated Dispute Resolution for HTTP 402 Payments

**Version:** 1.0
**Status:** Architecture Design (Solana Hackathon)
**Date:** October 29, 2025

---

## Executive Summary

**x402Resolve** is a protocol extension for HTTP 402 Payment Required that adds automated conflict resolution for AI agent transactions. When an agent pays for a service but disputes the quality, x402Resolve programmatically determines fairness and executes partial refunds—all in <10 seconds with zero human intervention.

**Key Innovation:** First automated dispute resolution protocol for agent-to-agent commerce on Solana.

---

## Problem Statement

### Current State: Broken Agent Commerce

```
Agent A: "Give me comprehensive Uniswap exploit data"
API: "402 Payment Required - $0.01"
Agent A: *pays 0.01 SOL*
API: *returns 3 exploits*
Agent A: "This is incomplete! I expected 10+ historical exploits"
API: "Payment is final. No refunds."

Result: DEADLOCK
- Agent lost money for poor data
- API lost reputation
- No recourse mechanism
- Human arbitration required (slow, expensive, breaks automation)
```

### Why Existing Solutions Don't Work

1. **Credit Card Chargebacks** - AI agents can't use credit cards
2. **Human Arbitration** - Takes days, costs $50+, breaks automation
3. **Reputation Systems** - No enforcement mechanism, easily gamed
4. **Escrows with Manual Release** - Requires human decision-maker

---

## Solution: x402Resolve Protocol

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    x402Resolve Protocol                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Layer 1: Escrow (Solana Program)                           │
│  ├─ Hold payments for 24-hour dispute window                │
│  ├─ Auto-release on timeout                                 │
│  └─ Auto-refund based on verifier score                     │
│                                                               │
│  Layer 2: Verifier (Python/FastAPI Oracle)                  │
│  ├─ Semantic quality assessment                             │
│  ├─ Completeness scoring (0-100)                            │
│  └─ Refund calculation (sliding scale)                      │
│                                                               │
│  Layer 3: SDK (TypeScript Client)                           │
│  ├─ .payToEscrow() - Payment with dispute protection        │
│  ├─ .dispute() - File quality complaint                     │
│  └─ .getResolution() - Check refund status                  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Flow Diagram

```
┌──────────┐
│ Agent A  │ 1. Pay 0.01 SOL to escrow
└────┬─────┘
     │
     ▼
┌─────────────────────┐
│ Solana Escrow       │ 2. Lock funds for 24h
│ (x402-escrow)       │
└────┬────────────────┘
     │
     ▼
┌─────────────────────┐
│ KAMIYO API          │ 3. Return data
│ (x402 endpoint)     │
└────┬────────────────┘
     │
     ▼
┌──────────┐
│ Agent A  │ 4. Evaluate quality → "Incomplete!"
└────┬─────┘
     │
     ▼
┌─────────────────────────────┐
│ x402 Verifier Oracle        │ 5. Calculate quality score
│ - Semantic similarity: 0.72 │    - Semantic: 72%
│ - Completeness: 0.40        │    - Complete: 40%
│ - Freshness: 1.00           │    - Fresh: 100%
│                             │
│ Quality Score: 65/100       │ 6. Determine refund
│ Recommendation: 35% refund  │    - Score < 80 → partial refund
└────┬────────────────────────┘
     │
     ▼
┌─────────────────────┐
│ Solana Escrow       │ 7. Execute resolution
│ - Refund: 0.0035 SOL│    - 35% to Agent A
│ - Payment: 0.0065 SOL    - 65% to API
└─────────────────────┘

Total Time: 8 seconds
Human Intervention: Zero
```

---

## Component Specifications

### Component 1: Solana Escrow Program

**Language:** Rust (Anchor Framework)
**Package:** `x402-escrow`
**Deployment:** Solana Devnet (hackathon), Mainnet (production)

#### Key Functions

```rust
pub mod x402_escrow {
    // Initialize escrow account with payment
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        amount: u64,                    // Payment amount in lamports
        dispute_window: i64,            // 24 hours = 86400 seconds
        expected_quality_score: u8      // Minimum acceptable quality (0-100)
    ) -> Result<()>

    // Release funds to recipient after verification
    pub fn release_funds(
        ctx: Context<ReleaseFunds>,
        verifier_signature: [u8; 64]    // Signature from x402 Verifier Oracle
    ) -> Result<()>

    // Partial or full refund based on quality score
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        quality_score: u8,              // 0-100 from verifier
        verifier_signature: [u8; 64]    // Cryptographic proof
    ) -> Result<()>

    // Auto-release if dispute window expires with no complaints
    pub fn auto_release(
        ctx: Context<AutoRelease>
    ) -> Result<()>
}
```

#### Escrow Account Structure

```rust
#[account]
pub struct EscrowAccount {
    pub payer: Pubkey,                  // Agent wallet address
    pub recipient: Pubkey,              // API provider address
    pub amount: u64,                    // Payment amount (lamports)
    pub status: EscrowStatus,           // Pending | Released | Disputed | Refunded
    pub created_at: i64,                // Unix timestamp
    pub dispute_window_end: i64,        // created_at + 86400
    pub expected_quality_score: u8,     // Minimum quality threshold
    pub actual_quality_score: Option<u8>, // Verifier result (if disputed)
    pub transaction_id: String,         // Original x402 transaction reference
    pub bump: u8,                       // PDA bump seed
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Pending,        // Waiting for dispute window to expire
    Released,       // Full payment released to recipient
    Disputed,       // Agent filed dispute, awaiting verifier
    Resolved,       // Verifier scored, refund executed
    Refunded,       // Full refund to payer
}
```

#### Security Features

1. **PDA-based escrow** - No private keys, fully on-chain
2. **Time-locked release** - Auto-release after 24h if no dispute
3. **Verifier signature validation** - Only authorized oracle can trigger refunds
4. **Replay protection** - Transaction IDs prevent double-refunds
5. **Slippage protection** - Quality score threshold prevents gaming

---

### Component 2: x402 Verifier Oracle

**Language:** Python (FastAPI)
**Package:** `x402-verifier`
**Deployment:** Cloud service (stateless, horizontally scalable)

#### API Endpoints

```python
@app.post("/verify-quality")
async def verify_quality(request: QualityVerificationRequest) -> QualityVerificationResponse:
    """
    Programmatically assess data quality and recommend refund

    Input:
    - original_query: What agent requested
    - data_received: What API provided
    - expected_criteria: Quality requirements

    Output:
    - quality_score: 0-100
    - recommendation: 'release' | 'partial_refund' | 'full_refund'
    - refund_percentage: 0-100
    - reasoning: Explanation string
    """
```

#### Quality Scoring Algorithm

```python
def calculate_quality_score(
    original_query: str,
    data_received: dict,
    expected_criteria: list[str]
) -> float:
    """
    Multi-factor quality assessment

    Factors (weighted):
    1. Semantic Similarity (40%)
       - Cosine similarity between query and data
       - Uses sentence-transformers embeddings

    2. Completeness (40%)
       - Coverage of expected criteria
       - Record count vs expected count

    3. Freshness (20%)
       - Timestamp validation
       - Data age vs expected recency

    Returns: Quality score 0-100
    """

    # 1. Semantic similarity
    query_embedding = get_embedding(original_query)
    data_embedding = get_embedding(str(data_received))
    semantic_score = cosine_similarity(query_embedding, data_embedding)

    # 2. Completeness
    completeness_score = check_criteria_coverage(data_received, expected_criteria)

    # 3. Freshness
    freshness_score = validate_data_freshness(data_received)

    # Weighted average
    quality_score = (
        semantic_score * 0.4 +
        completeness_score * 0.4 +
        freshness_score * 0.2
    ) * 100

    return quality_score
```

#### Refund Calculation Logic

```python
def determine_refund(quality_score: float) -> tuple[str, float]:
    """
    Convert quality score to refund percentage

    Thresholds:
    - 80-100: Full release (0% refund)
    - 50-79:  Partial refund (sliding scale)
    - 0-49:   Full refund (100%)

    Returns: (recommendation, refund_percentage)
    """
    if quality_score >= 80:
        return ("release", 0.0)
    elif quality_score >= 50:
        # Sliding scale: 80 - score = refund
        refund_pct = (80 - quality_score) / 80
        return ("partial_refund", refund_pct)
    else:
        return ("full_refund", 1.0)
```

#### Cryptographic Signing

```python
def sign_verification_result(
    quality_score: int,
    transaction_id: str,
    private_key: bytes
) -> bytes:
    """
    Sign verification result with oracle's private key

    This signature is submitted to Solana escrow program
    to prove the score came from authorized verifier
    """
    message = f"{transaction_id}:{quality_score}".encode()
    signature = nacl.signing.SigningKey(private_key).sign(message).signature
    return signature
```

---

### Component 3: x402 SDK with Dispute Handling

**Language:** TypeScript
**Package:** `@x402/resolve`
**Distribution:** npm registry

#### Client API

```typescript
import { x402ResolveClient } from '@x402/resolve';

// Initialize client
const client = new x402ResolveClient({
  apiUrl: 'https://api.kamiyo.ai',
  chain: 'solana',
  walletAdapter: phantomWallet,
  enableDisputes: true
});

// 1. Payment with escrow protection
const payment = await client.payToEscrow({
  amount: 0.01,                    // SOL amount
  endpoint: '/v1/exploits',
  query: {
    protocol: 'Uniswap V3',
    chain: 'ethereum'
  },
  expectedQuality: 80              // Minimum acceptable score
});

console.log(payment.escrowAddress);  // Solana PDA
console.log(payment.transactionId);  // x402 transaction ID

// 2. Fetch data
const data = await client.query(payment.accessToken);

// 3. Evaluate quality (agent logic)
const isAcceptable = evaluateDataQuality(data);

if (!isAcceptable) {
  // 4. File dispute
  const dispute = await client.dispute({
    transactionId: payment.transactionId,
    reason: "Expected comprehensive history, received only 3 recent exploits",
    expectedCriteria: ['comprehensive', 'historical', 'verified'],
    dataReceived: data
  });

  console.log(dispute.disputeId);

  // 5. Wait for resolution (automatic)
  const resolution = await client.waitForResolution(dispute.disputeId, {
    timeout: 30000  // 30 second max
  });

  console.log(resolution.qualityScore);      // 65
  console.log(resolution.refundAmount);      // 0.0035 SOL
  console.log(resolution.paymentAmount);     // 0.0065 SOL
  console.log(resolution.resolutionTime);    // 8 seconds
}
```

#### Internal Architecture

```typescript
class x402ResolveClient {
  private apiClient: axios.AxiosInstance;
  private solanaConnection: Connection;
  private escrowProgram: Program;
  private verifierOracle: string;

  async payToEscrow(params: PaymentParams): Promise<Payment> {
    // 1. Create escrow account on Solana
    const escrowPDA = await this.createEscrowAccount(params);

    // 2. Transfer SOL/USDC to escrow
    const tx = await this.fundEscrow(escrowPDA, params.amount);

    // 3. Get x402 access token (payment proof)
    const accessToken = await this.getAccessToken(tx.signature);

    return {
      escrowAddress: escrowPDA.toString(),
      transactionId: tx.signature,
      accessToken: accessToken,
      expiresAt: Date.now() + 86400000 // 24 hours
    };
  }

  async dispute(params: DisputeParams): Promise<Dispute> {
    // 1. Submit to verifier oracle
    const verification = await this.verifierOracle.verify({
      originalQuery: params.expectedCriteria.join(' '),
      dataReceived: params.dataReceived,
      expectedCriteria: params.expectedCriteria
    });

    // 2. Call escrow program with verifier signature
    await this.escrowProgram.methods
      .resolveDispute(
        verification.qualityScore,
        verification.signature
      )
      .accounts({ escrow: params.escrowAddress })
      .rpc();

    return {
      disputeId: `DISP_${params.transactionId}`,
      status: 'resolved',
      qualityScore: verification.qualityScore,
      refundPercentage: verification.refundPercentage
    };
  }
}
```

---

## Integration with Existing KAMIYO Stack

### Current x402 Payment Flow

```
Agent → API (402 Response) → Agent pays → API returns data
```

### Enhanced x402Resolve Flow

```
Agent → API (402 Response) → Agent pays to ESCROW → API returns data →
Agent evaluates → [Happy: Escrow auto-releases after 24h] OR
                  [Unhappy: Agent disputes → Verifier scores → Auto-refund]
```

### Backward Compatibility

**x402Resolve is OPTIONAL:**
- Agents can still use direct x402 payments (current behavior)
- Only agents who want dispute protection use escrow flow
- APIs don't need to change - they get paid either way (just timing differs)

```typescript
// Old way (still works)
const token = await client.pay({ amount: 0.01 });

// New way (with x402Resolve protection)
const token = await client.payToEscrow({ amount: 0.01, enableDisputes: true });
```

---

## Security Considerations

### Verifier Oracle Trust Model

**Problem:** Oracle could collude with agents or APIs to manipulate scores

**Mitigation:**
1. **Multi-oracle consensus (Future)** - Require 3+ verifiers to agree
2. **Staking mechanism** - Verifiers stake $KAMIYO, get slashed for dishonesty
3. **On-chain logging** - All scores publicly auditable
4. **Reputation tracking** - Verifiers with consistent accuracy get more work

### Sybil Resistance

**Problem:** Agents could spam fake disputes

**Mitigation:**
1. **Dispute bond** - Agent pays 0.001 SOL to file dispute (refunded if valid)
2. **Rate limiting** - Max 5 disputes/day per wallet
3. **Quality threshold** - Scores < 50 trigger refund, 50-80 trigger review

### Escrow Safety

**Problem:** Funds locked in escrow could be lost if oracle fails

**Mitigation:**
1. **Time-based auto-release** - After 24h, funds release to API even if oracle offline
2. **Emergency withdraw** - DAO governance can force release after 7 days
3. **Insurance pool** - 1% of all payments go to dispute insurance fund

---

## Success Metrics

### MVP (Hackathon Demo)

✅ 1 dispute resolved in <10 seconds
✅ Quality score accuracy >70%
✅ Zero manual intervention
✅ Working Solana escrow deployed to devnet
✅ Verifier oracle live and callable

### V1 (Post-Hackathon)

🎯 100+ disputes resolved
🎯 Quality score accuracy >85%
🎯 Multi-oracle consensus (3 verifiers)
🎯 Mainnet deployment
🎯 10+ APIs integrated

### V2 (6 Months)

🚀 10,000+ disputes/month
🚀 Cross-chain support (Base, Ethereum)
🚀 White-label oracle for other x402 providers
🚀 DAO governance for oracle selection

---

## Implementation Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **Phase 1: Architecture** | Day 1-2 | This document |
| **Phase 2: Solana Escrow** | Day 3-5 | Rust/Anchor program deployed to devnet |
| **Phase 3: Verifier Oracle** | Day 6-8 | Python/FastAPI service live |
| **Phase 4: TypeScript SDK** | Day 9-10 | npm package published |
| **Phase 5: Demo** | Day 11-12 | Full dispute resolution example |
| **Phase 6: Docs & Video** | Day 13-14 | README, video, screenshots |
| **Phase 7: Submission** | Day 15 | GitHub public, hackathon submitted |

**Total: 15 days**

---

## FAQ

**Q: Why not use Chainlink oracles?**
A: Chainlink focuses on price feeds. x402Resolve needs semantic quality assessment, which requires custom ML models.

**Q: What if the verifier oracle goes offline?**
A: Escrow auto-releases after 24 hours. Agent gets nothing, but API gets paid (same as traditional payment).

**Q: Can this be gamed by malicious agents filing fake disputes?**
A: Dispute bonds + rate limiting + quality thresholds make it economically irrational to spam disputes.

**Q: Why Solana instead of Ethereum?**
A: 8-second resolution requires fast finality. Ethereum disputes would take 3-15 minutes.

**Q: Is this production-ready?**
A: Hackathon MVP is proof-of-concept. Production requires multi-oracle consensus and insurance pools.

---

## Open Questions for Implementation

1. **Verifier Economics:** Who pays verifier oracle gas fees? (Proposal: 0.1% of disputed amount)
2. **Appeal Mechanism:** Should agents be able to appeal verifier decision? (Proposal: Yes, costs 0.01 SOL)
3. **Quality Benchmarks:** What's the baseline semantic similarity for "acceptable"? (Proposal: 0.7+ cosine similarity)
4. **Dispute Window:** Is 24 hours the right duration? (Proposal: Configurable per payment, min 1 hour, max 7 days)

---

## Conclusion

x402Resolve transforms HTTP 402 from a payment protocol into a **trust protocol** for AI agents. By adding automated dispute resolution, we enable autonomous agents to transact safely without human mediators.

**This is the infrastructure for the AI agent economy.**

---

**Next Steps:**
1. Begin Solana escrow program development (Rust/Anchor)
2. Implement verifier oracle (Python/FastAPI)
3. Build TypeScript SDK
4. Create killer demo
5. Win hackathon 🏆

---

**Document Status:** ✅ Complete - Ready for implementation

**Last Updated:** October 29, 2025
**Author:** KAMIYO Team
**License:** MIT (open source for hackathon)
