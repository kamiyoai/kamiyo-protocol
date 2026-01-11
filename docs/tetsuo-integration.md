# KAMIYO × TETSUO Integration

Paid inference with quality escrow, reputation tracking, and private proofs.

## Packages

### @kamiyo/tetsuo-inference

Quality-escrowed inference payments.

```typescript
import { InferenceClient } from '@kamiyo/tetsuo-inference';

const client = new InferenceClient(connection, wallet);

// Create escrow for inference request
const escrow = await client.createInferenceEscrow({
  model: 'tits-pro',
  maxCost: 0.01, // SOL
  qualityThreshold: 70,
});

// Call TITS API (escrow ID in header)
const response = await fetch('https://api.tetsuo.ai/v1/inference', {
  headers: { 'X-Kamiyo-Escrow': escrow.id },
  body: JSON.stringify({ prompt: '...' }),
});

// Oracle scores response, escrow auto-settles
// Score >= 70: full release to TETSUO
// Score < 70: partial refund based on quality
```

Components:
- `InferenceEscrow` - PDA holding funds until quality verified
- `QualityOracle` - Switchboard feed scoring response quality
- `InferenceClient` - SDK for creating/managing escrows

### @kamiyo/tetsuo-reputation

Model and user reputation tracking.

```typescript
import { ReputationClient } from '@kamiyo/tetsuo-reputation';

const rep = new ReputationClient(connection);

// Get model reputation
const modelRep = await rep.getModelReputation('tits-pro-v2');
// { successRate: 94, totalInferences: 12847, avgQuality: 87 }

// Get user reputation
const userRep = await rep.getUserReputation(wallet.publicKey);
// { successRate: 91, totalSpent: 2.4, disputeRate: 3 }

// Check if user can access premium model
const canAccess = await rep.meetsThreshold(wallet.publicKey, 80);
```

Components:
- `ModelReputation` - on-chain account per model version
- `UserReputation` - extends existing EntityReputation
- Blacklist integration via existing SMT

### @kamiyo/tetsuo-privacy

ZK proofs for private inference.

```typescript
import { PrivateInference } from '@kamiyo/tetsuo-privacy';

const priv = new PrivateInference(wallet);

// Prove reputation without revealing actual score
const repProof = await priv.proveReputation({
  threshold: 80,
  // Proves: "my score >= 80" without revealing actual number
});

// Prove payment without revealing query
const paymentProof = await priv.provePayment({
  escrowId: escrow.id,
  // Proves: "I paid for inference" without revealing what I asked
});

// Access TITS-Pro with proofs
await fetch('https://api.tetsuo.ai/v1/inference/pro', {
  headers: {
    'X-Kamiyo-Rep-Proof': repProof.encode(),
    'X-Kamiyo-Payment-Proof': paymentProof.encode(),
  },
});
```

Components:
- Extends existing `@kamiyo/sdk` privacy module
- New circuit: `InferencePaymentProof`
- TETSUO verifier integration

## On-Chain Accounts

```rust
#[account]
pub struct InferenceEscrow {
    pub user: Pubkey,
    pub model_id: [u8; 32],      // hash of model name/version
    pub amount: u64,
    pub quality_threshold: u8,   // minimum score for full release
    pub oracle: Pubkey,          // Switchboard feed
    pub status: EscrowStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

#[account]
pub struct ModelReputation {
    pub model_id: [u8; 32],
    pub owner: Pubkey,           // TETSUO's wallet
    pub total_inferences: u64,
    pub successful_inferences: u64,
    pub total_quality_sum: u64,  // for avg calculation
    pub disputes: u64,
    pub last_updated: i64,
    pub bump: u8,
}
```

## TETSUO Integration

Their side (minimal changes):

```typescript
// inference-endpoint.ts
import { verifyEscrow, reportQuality } from '@kamiyo/tetsuo-inference';

async function handleInference(req, res) {
  const escrowId = req.headers['x-kamiyo-escrow'];

  if (escrowId) {
    // Verify escrow exists and has funds
    const escrow = await verifyEscrow(escrowId);
    if (!escrow.valid) {
      return res.status(402).json({ error: 'Invalid escrow' });
    }
  }

  // Normal inference
  const response = await runInference(req.body.prompt);

  if (escrowId) {
    // Report quality score (triggers settlement)
    await reportQuality(escrowId, response.qualityScore);
  }

  return res.json(response);
}
```

For premium model access:

```typescript
// pro-inference-endpoint.ts
import { verifyReputationProof } from '@kamiyo/tetsuo-privacy';

async function handleProInference(req, res) {
  const repProof = req.headers['x-kamiyo-rep-proof'];

  if (!repProof) {
    return res.status(403).json({ error: 'Reputation proof required' });
  }

  const verified = await verifyReputationProof(repProof, {
    minThreshold: 80,
  });

  if (!verified) {
    return res.status(403).json({ error: 'Insufficient reputation' });
  }

  // Proceed with premium inference
  // ...
}
```

## Quality Oracle

Options:

1. **Switchboard** - TETSUO runs their own quality scorer, publishes to Switchboard feed
2. **Multi-oracle** - Multiple independent scorers, consensus required
3. **User feedback** - User can dispute within window, triggers oracle review

Recommended: Start with Switchboard, add dispute mechanism later.

Quality scoring criteria (TETSUO defines):
- Response coherence
- Factual accuracy (for verifiable queries)
- Latency
- Token efficiency

## Settlement Logic

```
Score >= threshold: 100% to TETSUO
Score 50-threshold: proportional split
Score < 50: 100% refund to user
```

Example with threshold=70:
- Score 85: TETSUO gets 100%
- Score 60: TETSUO gets 60%, user gets 40%
- Score 40: User gets 100% refund

## Development Order

1. `@kamiyo/tetsuo-inference`
   - InferenceEscrow account
   - create_inference_escrow instruction
   - settle_inference instruction
   - Switchboard oracle integration
   - SDK client

2. `@kamiyo/tetsuo-reputation`
   - ModelReputation account
   - update_model_reputation instruction
   - Query methods
   - Blacklist integration (reuse existing SMT)

3. `@kamiyo/tetsuo-privacy`
   - InferencePaymentProof circuit
   - Extend reputation proof for inference context
   - Verifier for TETSUO backend

## File Structure

```
packages/
  kamiyo-tetsuo-inference/
    src/
      client.ts
      types.ts
      oracle.ts
      index.ts
    package.json

  kamiyo-tetsuo-reputation/
    src/
      client.ts
      types.ts
      index.ts
    package.json

  kamiyo-tetsuo-privacy/
    src/
      proofs.ts
      verifier.ts
      index.ts
    package.json

programs/kamiyo/src/
  lib.rs  # Add InferenceEscrow, ModelReputation accounts + instructions
```

## API Endpoints (KAMIYO hosted)

```
POST /v1/tetsuo/escrow/create
POST /v1/tetsuo/escrow/settle
GET  /v1/tetsuo/escrow/:id
GET  /v1/tetsuo/model/:id/reputation
POST /v1/tetsuo/verify/reputation-proof
POST /v1/tetsuo/verify/payment-proof
```

## Testing

- Devnet deployment with mock TITS API
- Quality oracle simulator
- E2E: escrow → inference → settlement
- Proof generation/verification

## Dependencies

Reuses:
- Existing escrow infrastructure
- EntityReputation (extend for users)
- Shield module (reputation proofs)
- Blacklist SMT

New:
- Switchboard SDK
- TETSUO API client (for testing)





REVIEW AND ANALYSIS OF BUILD SO FAR:

tetsuo-core Production Readiness Assessment

  Executive Summary

  Overall Rating: 6/10 - Prototype Quality, Not Production Ready

  The codebase demonstrates strong low-level engineering skills and proper cryptographic foundations, but has significant gaps that would cause failures in real-world deployment. The architecture is sound, but implementation is incomplete in critical areas.

  ---
  1. CRITICAL ISSUES (Must Fix)

  1.1 Incomplete Groth16 Verification

  Severity: CRITICAL

  The core verification logic in verify.c:394-426 is incomplete. The verify_proof_ex function:
  - Computes public inputs and Poseidon hash
  - Checks if points are at infinity
  - Does NOT perform actual pairing checks
  - Line 423: (void)pub_input; - computed but unused

  // verify.c:423-425 - This is a stub, not real verification
  (void)pub_input;
  return VERIFY_OK;

  Impact: Any proof that isn't malformed will pass verification. The cryptographic guarantee is non-existent.

  1.2 Missing test_verify.c

  Severity: CRITICAL

  The Makefile and CMakeLists.txt reference tests/test_verify.c but this file does not exist:
  - Makefile:83: attempts to build test_verify
  - CMakeLists.txt:96-98: references test_verify
  - Build will fail if tests are enabled

  1.3 Missing bench_verify.c

  Severity: HIGH

  Same issue - referenced but non-existent:
  - Makefile:92: bench/bench_verify.c
  - CMakeLists.txt:106-107: references bench_verify

  1.4 No Pairing Implementation

  Severity: CRITICAL

  BN254 Groth16 verification requires optimal ate pairing. This is entirely absent:
  - No pairing.c or pairing.h
  - No G2 point operations
  - No Miller loop
  - No final exponentiation

  Without pairings, this library cannot verify any ZK proofs.

  ---
  2. SECURITY ISSUES

  2.1 Timing Side-Channels in field_add/field_sub

  Severity: HIGH

  field.c:316-318:
  if (carry || field_cmp(r, (const field_t *)FIELD_MODULUS) >= 0) {
      sub_256(r->limbs, r->limbs, FIELD_MODULUS);
  }

  - field_cmp is variable-time (early return on comparison)
  - Branch based on field element value
  - Timing oracle for field values

  Fix: Use constant-time conditional subtraction with masks.

  2.2 RNG Fallback is Insecure

  Severity: HIGH

  verify.c:461-465:
  } else {
      batch->randoms[batch->count].limbs[0] = batch->count + 1;
      batch->randoms[batch->count].limbs[1] = 0x9e3779b97f4a7c15ULL;
      // ...
  }

  If secure RNG fails, it falls back to predictable values. An attacker who can cause RNG failure could predict batch verification randomness and forge batch proofs.

  Fix: Return error on RNG failure, never use fallback.

  2.3 Integer Overflow in arena_calloc

  Severity: MEDIUM

  arena.c:166-167:
  size_t total = count * size;
  void *ptr = arena_alloc(arena, total);

  No overflow check on count * size. Can allocate less memory than expected.

  2.4 Poseidon Constants Not Verified

  Severity: MEDIUM

  The MDS matrix in verify.c:18-28 appears hardcoded without documentation of its origin. Incorrect constants = broken hash = broken verification.

  ---
  3. CORRECTNESS ISSUES

  3.1 Squaring ASM Bug (Potential)

  Severity: MEDIUM

  field.c:180-237 - The Karatsuba-style squaring optimization has complex carry chains. The c2 variable is declared but may not be used in all paths, which some compilers warn about.

  3.2 field_cmp is Not Constant-Time

  Severity: MEDIUM

  for (int i = 3; i >= 0; i--) {
      if (a->limbs[i] > b->limbs[i]) return 1;
      if (a->limbs[i] < b->limbs[i]) return -1;
  }

  Early return leaks information about field element values.

  3.3 Poseidon Round Count

  Severity: MEDIUM

  verify.c:51: Only 8 rounds. Standard Poseidon for security requires 8 full rounds + 56 partial rounds (or similar). This appears to use only full rounds and may be cryptographically weak.

  3.4 Point Validation Missing

  Severity: HIGH

  Points deserialized from proofs are never validated to be on the curve. Invalid curve attacks are possible.

  ---
  4. RELIABILITY & ROBUSTNESS

  4.1 No Error Propagation

  Severity: HIGH

  Many functions silently fail or fall back:
  - field_batch_inv: silently falls back to individual inversions on malloc fail
  - batch_add: silently ignores when at capacity
  - verify_ctx_load_vk: silently returns if len < 256

  Production code needs explicit error handling.

  4.2 Thread-Local Arena Leak

  Severity: MEDIUM

  arena.c:231-236:
  static __thread arena_t *tls_scratch = NULL;
  arena_t *scratch_arena_get(void) {
      if (!tls_scratch) {
          tls_scratch = arena_create(256 * 1024);
      }
      return tls_scratch;
  }

  - No cleanup on thread exit
  - 256KB leaked per thread that calls scratch_arena_get()
  - No scratch_arena_destroy() function

  4.3 No Resource Limits

  Severity: MEDIUM

  - No max allocation limits in arena
  - No max batch size enforcement
  - No proof size limits beyond hardcoded 128-byte data field
  - DoS via memory exhaustion possible

  4.4 Statistics Overflow

  Severity: LOW

  api.c:154-156: Running average calculation can overflow with many verifications:
  ctx->stats.avg_verify_time_us =
      (ctx->stats.avg_verify_time_us * (ctx->stats.total_verified - 1) + elapsed) /
      ctx->stats.total_verified;

  ---
  5. CODE QUALITY

  5.1 Dead Code

  - proof_serialize declared in verify.h:108 but never implemented
  - vk_ic and vk_ic_len in verify context never used
  - acc_g1 and acc_g2 in batch context never used

  5.2 Inconsistent Error Handling

  - Some functions return bool, some return enums
  - Some use NULL checks, some don't
  - No unified error code scheme

  5.3 Magic Numbers

  - 256 scattered throughout (field bits, batch sizes)
  - 128 for proof data size
  - 33 for merkle proof element size
  - No named constants

  5.4 Missing Documentation

  - No doxygen/documentation comments
  - No explanation of Montgomery representation choice
  - No security assumptions documented

  ---
  6. BUILD & DEPLOYMENT

  6.1 No CI/CD

  Severity: HIGH

  - No GitHub Actions / CI config
  - No automated testing
  - No coverage reporting
  - No fuzzing setup

  6.2 Platform Support Gaps

  Severity: MEDIUM

  - Windows: #pragma comment(lib, "bcrypt.lib") only works with MSVC
  - ARM64: No assembly optimizations (falls back to portable C)
  - 32-bit: Untested, likely broken (__uint128_t used)

  6.3 No Version Checks

  Severity: LOW

  - TETSUO_VERSION_* defined but never checked/validated
  - No ABI compatibility guarantees

  ---
  7. OBSERVABILITY

  7.1 No Logging

  Severity: MEDIUM

  Zero logging infrastructure. In production:
  - Can't debug verification failures
  - Can't trace performance issues
  - Can't audit proof processing

  7.2 Limited Metrics

  Severity: MEDIUM

  tetsuo_stats_t is basic. Missing:
  - Histogram of verification times
  - Error rate by type
  - Memory pressure indicators
  - Batch efficiency metrics

  ---
  8. TEST COVERAGE

  8.1 Current Coverage: ~15%

  Only field arithmetic is tested. Missing tests for:
  - Arena allocator (all paths)
  - Proof parsing (malformed inputs)
  - Batch verification
  - Poseidon hash
  - Point operations
  - Serialization/deserialization
  - Error paths
  - Edge cases (zero, infinity, max values)

  8.2 No Fuzzing

  Cryptographic code without fuzzing is dangerous. Need:
  - libFuzzer integration
  - AFL++ corpus
  - Structure-aware fuzzing for proofs

  8.3 No Property Tests

  Should verify:
  - Field axioms (associativity, commutativity, etc.)
  - Point operation identities
  - Serialization round-trips

  ---
  9. PRIORITIZED RECOMMENDATIONS

  P0 - Ship Blockers (Do First)

  1. Implement actual pairing verification - The library is non-functional without this
  2. Remove insecure RNG fallback - Security critical
  3. Add curve point validation - Invalid curve attacks
  4. Create test_verify.c and bench_verify.c - Build is broken

  P1 - High Priority

  5. Make field_add/field_sub constant-time
  6. Add integer overflow checks in arena_calloc
  7. Implement thread-local arena cleanup
  8. Add comprehensive error handling with error codes
  9. Verify Poseidon constants and round count

  P2 - Medium Priority

  10. Add CI/CD pipeline with tests
  11. Implement fuzzing targets
  12. Add logging infrastructure
  13. Document security assumptions
  14. Add resource limits

  P3 - Low Priority

  15. Clean up dead code
  16. Add ARM64 assembly optimizations
  17. Improve statistics collection
  18. Add pkg-config validation

  ---
  10. WHAT'S ACTUALLY GOOD

  For completeness, strengths of the current implementation:

  1. Field arithmetic - Montgomery implementation is correct and well-optimized
  2. ASM quality - x86-64 assembly is clean and uses BMI2 effectively
  3. Arena allocator - Design is solid with checkpointing
  4. API design - Public API is clean and well-structured
  5. Build system - Both Makefile and CMake work properly
  6. Memory safety - Sanitizer support in debug builds

  ---
  CONCLUSION

  This codebase is an impressive demonstration of low-level cryptographic engineering skills, but it's a prototype, not a production library. The core cryptographic verification is stubbed out, critical security issues exist, and test coverage is minimal.

  Time to production readiness: Significant work required. The pairing implementation alone is a substantial undertaking (typically 2000+ lines of carefully audited code).

  Recommendation: If this needs to ship, consider using an established library (arkworks-rs, blst, mcl) for the pairing implementation and wrapping it, rather than implementing pairings from scratch.
