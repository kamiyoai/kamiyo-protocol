# Forge Session: Meishi Protocol

## Target
Agent Compliance Passports — Solana program, TypeScript SDK, MCP server, middleware, compliance service.

## Target Files

### Solana Program
- `programs/meishi/src/lib.rs`

### TypeScript SDK
- `packages/kamiyo-meishi/src/client.ts`
- `packages/kamiyo-meishi/src/types.ts`
- `packages/kamiyo-meishi/src/exchange.ts`
- `packages/kamiyo-meishi/src/passport.ts`
- `packages/kamiyo-meishi/src/mandate.ts`
- `packages/kamiyo-meishi/src/liability.ts`
- `packages/kamiyo-meishi/src/compliance-score.ts`
- `packages/kamiyo-meishi/src/kamon.ts`
- `packages/kamiyo-meishi/src/dkg/queries.ts`
- `packages/kamiyo-meishi/src/dkg/schemas.ts`
- `packages/kamiyo-meishi/src/dkg/index.ts`
- `packages/kamiyo-meishi/src/zk/index.ts`

### MCP Server
- `packages/kamiyo-meishi-mcp/src/index.ts`
- `packages/kamiyo-meishi-mcp/src/tools.ts`

### Middleware
- `packages/kamiyo-meishi-middleware/src/express.ts`
- `packages/kamiyo-meishi-middleware/src/fastify.ts`
- `packages/kamiyo-meishi-middleware/src/verification.ts`
- `packages/kamiyo-meishi-middleware/src/index.ts`

### Tests
- `tests/meishi.test.ts`

## Current Phase: 6 (Complete)

## Progress
- [x] Phase 3: Harden — Security audit, input validation, SPARQL injection, buffer checks
- [x] Phase 4: Test — 25/25 passing, including InvalidDisputeState test
- [x] Phase 5: Humanize — Removed box-drawing separators, 0 litmus matches
- [x] Phase 6: External Review — GPT-5 harden/test/humanize, 9 findings applied

## Test Results
- 25 meishi tests passing (50 total repo, 41 non-meishi failures unrelated)
- TypeScript compilation clean across all packages

## Review Summary

GPT-5 reviewed all files across harden, test, and humanize dimensions.

### Applied (9 fixes)
1. Fixed unwrap() panic in UpdateMandate seeds — added overflow constraint
2. Added xsd PREFIX to SPARQL queries using xsd:dateTime
3. Added account owner validation to all client fetch methods
4. Fixed geo restriction bit mapping (Global=0 no longer maps to EU bit)
5. Replaced base58 regex with PublicKey constructor validation
6. Commented out unused MIN_PASSPORT_STAKE with TODO reference
7. Added TODO to MAX_AUDIT_NONCE for ring buffer enforcement
8. Replaced heap Vec with stack [u8; 72] in compute_kamon_hash
9. Replaced hedging CHECK comment with concrete TODO

### Skipped (by design)
- Oracle/authority registries (governance workstream)
- Presentation signature verification (protocol spec needed)
- CPI agent identity verification (kamiyo program integration)
- Hardcoded discriminator replacement (IDL codegen task)
- Test coverage expansion (tracked separately)

Review document: `docs/review-meishi.md`
