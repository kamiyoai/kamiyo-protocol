# Production Audit: Eliza Trust Bridge (KAMIYO x plugin-trust)

## Executive Summary
The trust bridge is conceptually solid, but the initial implementation was not production-grade for `@elizaos/plugin-trust` compatibility: evidence type enums and `TrustEngine` method signatures must match exactly, and the bridge needs bounded state, idempotency, and basic observability to survive real workloads. The current branch (`kamiyo/eliza-trust-hardening`) fixes the API mismatches, bounds state growth, and adds tests for the most failure-prone parsing path.

## Critical Issues (P0 - Block Release)
- [x] plugin-trust API mismatch (`calculateTrust` signature, `TrustInteraction` shape, enum casing) | Impact: bridge silently fails or records unusable interactions | Fix: align types + runtime adapter in `packages/kamiyo-eliza/src/trust/pluginTrust.ts` and `packages/kamiyo-eliza-trust-provider/src/types.ts`
- [x] Wrong/unknown evidence enum values (e.g. `INCONSISTENCY` vs `INCONSISTENT_BEHAVIOR`) | Impact: downstream logic/weights don’t apply and validation may reject | Fix: align to plugin-trust `TrustEvidenceType`
- [x] Unbounded runtime state growth (`kamiyoPendingEscrows`, `kamiyoTrustEvidence`) | Impact: memory bloat + degraded agent runtime over time | Fix: cap and dedupe recent items

## High Priority (P1 - Fix Before Launch)
- [ ] No integration test exercising the bridge against a real plugin-trust `TrustEngineServiceWrapper` | Impact: regressions slip through when plugin-trust changes | Fix: add a thin integration test that imports plugin-trust in a dedicated test workspace and validates `recordInteraction` + `calculateTrust` behavior end-to-end
- [ ] Weak observability for periodic sync failures | Impact: silent degradation; hard to debug customer deployments | Fix: persist last-sync status/error in runtime state or emit structured logs via an injected logger (avoid `console.*` in production)
- [ ] Evidence semantics can be gamed without contextual constraints | Impact: trust inflation via repeated “success” events | Fix: apply rate limits / recency bias alignment and avoid recording per-event spam (aggregate + clamp already helps, but policy-level limits should be explicit)

## Medium Priority (P2 - Fix Soon After Launch)
- [ ] Evidence mapping needs a stable contract (what on-chain fields map to what trust dimensions, with examples) | Impact: unclear operator expectations, hard to tune | Fix: document mapping and tuning knobs, include sample interactions payloads
- [ ] Key parsing logic duplicated / lightly tested | Impact: brittle deployments | Fix: extracted `parseSecretKey` utility and covered with unit tests (done for trust-provider; eliza plugin uses its own keypair utility)

## Low Priority (P3 - Technical Debt)
- [ ] “Read-only wallet” adapter relies on throwing in `signTransaction` | Impact: confusing failure mode if accidentally used | Fix: make it explicit (separate type) or gate any signing calls at construction time

## Security Assessment
- Secrets: `SOLANA_PRIVATE_KEY` handling is a key risk. The trust-provider is read-only, but it still accepts a full keypair. Prefer allowing a public key for read-only fetches (future improvement).
- Injection: trust evidence is derived from on-chain state; good. Avoid accepting arbitrary evidence payloads from user messages without strict validation (current bridge does not).
- Abuse: recording interactions on every action without bounding leads to resource exhaustion; fixed via caps/dedupe.

## Performance Assessment
- Periodic sync: aggregate evidence generation avoids O(N) interaction spam on large histories.
- Network: on-chain fetch is RPC-bound; periodic sync interval must be clamped to avoid accidental hammering.

## Observability Assessment
- Missing: a clear “last successful sync” and “last error” signal.
- Missing: structured logs with correlation IDs (`transactionId`, entity id).

## Recommended Architecture Changes
- Add a small adapter layer that normalizes:
  - service wrapper vs engine inner (`trustEngine.recordInteraction`)
  - enum types and interaction schema
  - context field naming (`action`, `roomId`, etc.)
  This exists today for the Eliza plugin (`packages/kamiyo-eliza/src/trust/pluginTrust.ts`). The trust-provider should keep a similar normalization strategy.

## Test Coverage Gaps
- Need: integration test importing plugin-trust to validate full compatibility.
- Need: tests for diff-to-interaction aggregation semantics in the trust-provider bridge.
- Done: unit tests for secret key parsing in trust-provider.

## Action Plan
1. Lock API compatibility with plugin-trust (done).
2. Add bounded state + dedupe (done).
3. Add unit tests for secret key parsing (done).
4. Add sync observability + interval clamping (next).
5. Add end-to-end integration test (next).

