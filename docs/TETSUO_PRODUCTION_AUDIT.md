# TETSUO Production Readiness Audit

**Date:** 2026-01-10
**Auditor:** Automated Code Review
**Verdict:** NOT PRODUCTION READY

---

## Executive Summary

This audit evaluates the TETSUO integration components against production standards expected of a top-tier software company. The assessment is brutally honest: **the current implementation is a prototype that cannot be deployed to production**.

The core problem: **There is no actual ZK proof generation**. The `PrivateInference` class generates random bytes and calls them "proofs". Without a ZK circuit and proving system, the entire privacy layer is non-functional.

### Critical Findings

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 3 | System cannot function in production |
| **HIGH** | 9 | Significant security/reliability risks |
| **MEDIUM** | 8 | Production hardening required |
| **LOW** | 6 | Code quality improvements |

### Blocking Issues

1. **No ZK proof generation exists** - proofs.ts generates random bytes
2. **No ZK circuit definition** - no circom/noir/R1CS files
3. **Instruction discriminators are hardcoded guesses** - likely won't match program

---

## Layer 1: Privacy SDK (@kamiyo/tetsuo-privacy)

### CRITICAL: Fake Proof Generation

**Location:** `packages/kamiyo-tetsuo-privacy/src/proofs.ts:12-25`

```typescript
async proveReputation(params: { threshold: number }): Promise<ReputationProof> {
  const proofBytes = new Uint8Array(64);
  crypto.getRandomValues(proofBytes);  // <-- RANDOM BYTES, NOT A PROOF
  return {
    agentPk: this.wallet.publicKey.toBase58(),
    commitment: params.commitment ?? '0x' + Buffer.from(proofBytes.slice(0, 32)).toString('hex'),
    threshold: params.threshold,
    proofBytes,  // <-- This is not a Groth16 proof
  };
}
```

**Impact:** Complete security bypass. Anyone can create "proofs" that pass structural validation.

**Required Fix:** Integrate actual ZK proving system:
- Define circom/noir circuit for reputation threshold proofs
- Use snarkjs/circomlib for browser-side proving
- Or call a proving service API

### CRITICAL: No Circuit Exists

The verification engine in `tetsuo-core` expects Groth16 proofs, but:
- No circuit definition exists (no `.circom`, `.noir`, or R1CS files)
- No verification key is ever loaded
- No way to generate valid proofs

**Required Fix:**
1. Design the reputation threshold circuit
2. Compile to R1CS
3. Generate proving/verification keys
4. Integrate with snarkjs or native prover

### HIGH: Verification Without Crypto is Silent

**Location:** `packages/kamiyo-tetsuo-privacy/src/verifier.ts:234-246`

When `requireCrypto` is false (default), structural validation returns `valid: true`:

```typescript
return {
  valid: true,  // DANGEROUS: No cryptographic verification occurred
  threshold: data.threshold,
  error: 'Warning: Native verification unavailable...',
};
```

**Impact:** In default mode, any well-formed proof passes validation.

**Required Fix:** Default `requireCrypto` to `true` in production environments.

### HIGH: Base58 Decode is Inefficient and Potentially Buggy

**Location:** `packages/kamiyo-tetsuo-privacy/src/verifier.ts:83-109`

Custom base58 implementation:
- Quadratic time complexity O(n²)
- No input validation for non-base58 characters until loop
- Should use established library (bs58)

### MEDIUM: Double JSON Encoding

**Location:** `packages/kamiyo-tetsuo-privacy/src/proofs.ts:37-48`

```typescript
const data: EncodedProof = {
  type: 'reputation',
  data: Buffer.from(JSON.stringify({...})).toString('base64'),  // JSON inside
};
return Buffer.from(JSON.stringify(data)).toString('base64');    // JSON wrapped
```

Double encoding wastes bytes and is error-prone.

---

## Layer 2: Inference SDK (@kamiyo/tetsuo-inference)

### CRITICAL: Hardcoded Instruction Discriminators

**Location:** `packages/kamiyo-tetsuo-inference/src/client.ts:85,171,238`

```typescript
const discriminator = Buffer.from([0x5a, 0x3c, 0x8e, 0x2d, 0x1f, 0x9b, 0x4a, 0x7c]);
```

These values appear to be made up. Anchor generates discriminators from the instruction name hash. If these don't match the actual program, all transactions will fail.

**Required Fix:**
- Use Anchor's IDL to get correct discriminators
- Or compute: `sha256("global:create_inference_escrow")[0:8]`

### HIGH: Escrow Deserialization Has No Bounds Checking

**Location:** `packages/kamiyo-tetsuo-inference/src/client.ts:261-307`

```typescript
private deserializeEscrow(data: Buffer): InferenceEscrow {
  let offset = 8;
  const user = new PublicKey(data.subarray(offset, offset + 32));  // No length check
  // ... continues reading without validation
}
```

**Impact:**
- Throws on short data
- No validation of enum values (status could be 255)
- Integer overflow on malformed data

**Required Fix:**
```typescript
if (data.length < 130) {
  throw new Error('Invalid escrow data length');
}
if (data[offset] > 3) {
  throw new Error('Invalid status value');
}
```

### HIGH: No Retry Logic for RPC Calls

All RPC operations fail permanently on first error:

```typescript
const signature = await this.connection.sendRawTransaction(signed.serialize());
await this.connection.confirmTransaction(signature);  // No timeout, no retry
```

**Impact:** Transient network issues cause permanent failures.

**Required Fix:** Implement exponential backoff:
```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

### HIGH: Transaction Confirmation Uses Deprecated API

**Location:** `packages/kamiyo-tetsuo-inference/src/client.ts:110,256`

```typescript
await this.connection.confirmTransaction(signature);
```

This method is deprecated and can hang indefinitely.

**Required Fix:**
```typescript
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
await connection.confirmTransaction({
  signature,
  blockhash,
  lastValidBlockHeight,
}, 'confirmed');
```

### MEDIUM: modelIdFromString is Not Collision-Resistant

**Location:** `packages/kamiyo-tetsuo-inference/src/types.ts:48-56`

```typescript
export function modelIdFromString(model: string): Uint8Array {
  const hash = new Uint8Array(32);
  const bytes = encoder.encode(model);
  for (let i = 0; i < Math.min(bytes.length, 32); i++) {
    hash[i] = bytes[i];  // Just copies bytes, no hashing
  }
  return hash;
}
```

**Impact:**
- "model_a" and "model_a_extended_name_that_is_very_long" may collide
- Different models could share the same PDA

**Required Fix:**
```typescript
import { createHash } from 'crypto';
export function modelIdFromString(model: string): Uint8Array {
  return createHash('sha256').update(model).digest();
}
```

### MEDIUM: Settlement Math Not Verified

**Location:** `packages/kamiyo-tetsuo-inference/src/client.ts:202-215`

The client-side settlement calculation may not match on-chain logic:

```typescript
if (qualityScore >= threshold) {
  providerPayment = amount;
} else if (qualityScore < 50) {
  userRefund = amount;
} else {
  const providerShare = Math.floor((qualityScore * 100) / 100);  // Bug: always = qualityScore
  providerPayment = amount.muln(providerShare).divn(100);
}
```

The `providerShare` calculation is wrong and doesn't match the documented behavior.

---

## Layer 3: Reputation SDK (@kamiyo/tetsuo-reputation)

### MEDIUM: Code Duplication

`modelIdFromString` and `KAMIYO_PROGRAM_ID` are duplicated across packages:
- `kamiyo-tetsuo-inference/src/types.ts`
- `kamiyo-tetsuo-reputation/src/types.ts`

**Required Fix:** Extract to shared package `@kamiyo/tetsuo-common`.

### MEDIUM: No Caching

Every reputation query hits RPC:

```typescript
async getModelReputation(model: string): Promise<ModelStats | null> {
  const info = await this.connection.getAccountInfo(modelPda);  // No cache
```

**Impact:** High RPC costs, slow performance.

**Required Fix:** Add LRU cache with TTL:
```typescript
const cache = new LRUCache<string, ModelStats>({ max: 1000, ttl: 60000 });
```

### LOW: No Pagination for Bulk Queries

No batch API for querying multiple models/users.

---

## Layer 4: Native Library (tetsuo-core)

### HIGH: Field Operations Have Timing Side Channels

**Location:** `native/tetsuo-core/src/field.c:100-107`

```c
uint64_t borrow = sub_256(tmp, r, FIELD_MODULUS);
uint64_t mask = borrow - 1;  // Conditional based on secret
r[0] = (r[0] & ~mask) | (tmp[0] & mask);  // Leaks timing
```

While attempts were made for constant-time, the comparison `field_cmp` is variable-time.

**Impact:** Theoretical key extraction via timing analysis.

### HIGH: Poseidon Constants Not Verified

**Location:** `native/tetsuo-core/src/verify.c:41-51`

MDS matrix constants are stated to be "circomlib compatible" but:
- No test vector validation
- No reference to source commit

**Required Fix:** Add test that matches known Poseidon(1,2) output.

### MEDIUM: Batch Verification Falls Back to Sequential

**Location:** `native/tetsuo-core/src/verify.c:510-514`

```c
/* Simplified: verify each proof individually for now */
for (size_t i = 0; i < num_proofs; i++) {
  if (!groth16_verify(vk, &proofs[i], ...)) return false;
}
```

No actual batch optimization implemented.

### MEDIUM: G2 Extraction is Incomplete

**Location:** `native/tetsuo-core/src/verify.c:677-682`

```c
/* B is in G2 - extract from proof_point_b */
/* For now, assume proof_point_b contains serialized G2 data */
g16_proof.b.is_infinity = false;
field_copy(&g16_proof.b.x_re, &proof->proof_point_b.x);
/* Note: proper G2 extraction needs full Fp2 coordinates */
```

The comment acknowledges this is incomplete. G2 points need Fp2 coordinates (4 field elements), but only 2 are extracted.

### LOW: No Memory Limit Enforcement

Arena allocator can grow without bound:
```c
arena_block_t *new_block = create_block(new_size);  // No total limit check
```

---

## Layer 5: Node.js Bindings (tetsuo-node)

### HIGH: FFI Path Resolution is Fragile

**Location:** `native/tetsuo-node/src/index.ts:43-53`

Hardcoded paths that may not exist:
```typescript
const possiblePaths = [
  path.join(__dirname, '../../tetsuo-core/lib/libtetsuo.so'),
  '/usr/local/lib/libtetsuo.so',
  '/opt/homebrew/lib/libtetsuo.so',
];
```

**Impact:** Works on dev machines, fails in containers/production.

**Required Fix:**
- Use node-pre-gyp for native module distribution
- Or ship prebuilt binaries in npm package

### MEDIUM: No Async Wrapper for CPU-Intensive Operations

`verifyProofNative` blocks the event loop:
```typescript
export function verifyProofNative(proof: NativeProof): VerifyResult | null {
  // Synchronous FFI call
  const result = libTetsuo.tetsuo_verify(ctx, proofBuf);
```

**Required Fix:** Use worker threads for verification.

---

## Layer 6: Solana Program

### MEDIUM: No Program Tests

**Location:** `programs/kamiyo/src/lib.rs`

No test directory for the program. Anchor tests in `tests/` may not cover TETSUO-specific instructions.

### MEDIUM: Settlement Logic Trusts Provider

The `settle_inference` instruction accepts quality score from the caller without oracle verification.

---

## Infrastructure & Operations

### No CI/CD

- No `.github/workflows/` directory
- No automated testing on PR
- No release automation
- No security scanning

**Required:**
```yaml
# .github/workflows/tetsuo.yml
name: TETSUO CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build native
        run: cd native/tetsuo-core && make USE_MCL=1
      - name: Test native
        run: cd native/tetsuo-core && make test USE_MCL=1
      - name: Test TypeScript
        run: |
          cd packages/kamiyo-tetsuo-inference && npm test
          cd packages/kamiyo-tetsuo-reputation && npm test
          cd packages/kamiyo-tetsuo-privacy && npm test
```

### No Observability

- No structured logging
- No metrics (Prometheus, etc.)
- No distributed tracing
- No error reporting (Sentry, etc.)

### No Documentation

- No API reference
- No integration guide
- No deployment runbook
- No troubleshooting guide

### Package Configuration Issues

**package.json** missing:
- `test` script
- `lint` script
- `prepublishOnly` hook
- `files` field for npm publish
- Jest as devDependency (only in root)

---

## Prioritized Remediation Plan

### Phase 1: Blockers (Must Fix Before Any Use)

| # | Issue | Effort | Owner |
|---|-------|--------|-------|
| 1 | Design and implement ZK circuit | 40h | Crypto |
| 2 | Integrate snarkjs or native prover | 16h | Backend |
| 3 | Fix instruction discriminators | 2h | SDK |
| 4 | Add bounds checking to deserializers | 2h | SDK |
| 5 | Default requireCrypto=true | 1h | SDK |

### Phase 2: Security (Required for Production)

| # | Issue | Effort |
|---|-------|--------|
| 6 | Constant-time field operations | 8h |
| 7 | Verify Poseidon test vectors | 4h |
| 8 | Complete G2 point extraction | 4h |
| 9 | Fix modelIdFromString collision risk | 2h |
| 10 | Add retry logic with backoff | 4h |

### Phase 3: Reliability (Required for Scale)

| # | Issue | Effort |
|---|-------|--------|
| 11 | Fix transaction confirmation | 2h |
| 12 | Add worker threads for FFI | 8h |
| 13 | Add reputation caching | 4h |
| 14 | Implement actual batch verification | 16h |

### Phase 4: Operations (Required for Maintenance)

| # | Issue | Effort |
|---|-------|--------|
| 15 | CI/CD pipeline | 4h |
| 16 | Structured logging | 4h |
| 17 | Observability stack | 8h |
| 18 | Documentation | 8h |
| 19 | Package consolidation | 4h |

---

## Test Coverage Analysis

### Current Coverage

| Component | Unit | Integration | E2E | Load |
|-----------|------|-------------|-----|------|
| tetsuo-core | ~15% | None | None | None |
| tetsuo-inference | Input validation only | None | None | None |
| tetsuo-reputation | Input validation only | None | None | None |
| tetsuo-privacy | Structural only | None | None | None |
| Solana program | None | None | None | None |

### Required Test Additions

1. **ZK Circuit Tests**
   - Constraint satisfaction
   - Proof generation/verification roundtrip
   - Edge cases (threshold=0, threshold=100)

2. **SDK Integration Tests**
   - Full escrow lifecycle with devnet
   - Error recovery scenarios
   - Concurrent operations

3. **Load Tests**
   - Verification throughput
   - Memory behavior under load
   - RPC rate limiting behavior

4. **Security Tests**
   - Malformed proof handling
   - Replay attack prevention
   - Timing analysis

---

## Conclusion

The TETSUO integration has architectural soundness but lacks implementation completeness. The verification engine is well-designed, but without proof generation, it's useless.

**Estimated time to production-ready:** 120-160 hours of focused engineering work.

**Highest-impact immediate actions:**
1. Design the ZK circuit for reputation threshold proofs
2. Fix the instruction discriminators
3. Add bounds checking to all deserializers

The foundation exists. The implementation does not.

---

## Appendix: Files Reviewed

```
packages/
├── kamiyo-tetsuo-inference/
│   ├── src/client.ts      - CRITICAL issues found
│   ├── src/types.ts       - MEDIUM issues found
│   └── src/index.ts       - OK
├── kamiyo-tetsuo-reputation/
│   ├── src/client.ts      - MEDIUM issues found
│   ├── src/types.ts       - MEDIUM issues (duplication)
│   └── src/index.ts       - OK
└── kamiyo-tetsuo-privacy/
    ├── src/proofs.ts      - CRITICAL: fake proofs
    ├── src/verifier.ts    - HIGH issues found
    ├── src/types.ts       - OK
    └── src/index.ts       - OK

native/
├── tetsuo-core/
│   ├── src/verify.c       - HIGH issues found
│   ├── src/field.c        - HIGH: timing channels
│   ├── src/pairing.c      - MEDIUM issues found
│   ├── src/arena.c        - LOW issues found
│   └── src/tetsuo.h       - OK
└── tetsuo-node/
    └── src/index.ts       - HIGH/MEDIUM issues found

programs/kamiyo/src/lib.rs - MEDIUM issues found
```
