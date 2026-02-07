# Meishi Review — Round 3 (Full-Stack External Review)

Forge phase 6 external review across all 5 meishi components:
- `programs/meishi/` (Solana program, Rust)
- `packages/kamiyo-meishi/` (TypeScript SDK)
- `packages/kamiyo-meishi-middleware/` (HTTP middleware)
- `packages/kamiyo-meishi-mcp/` (MCP server)
- `services/meishi-compliance/` (compliance engine)

29 source files reviewed. Three GPT-5 review passes: harden, test, humanize.

## GPT-5 Review Summary

| Type | Critical | High | Medium | Recommendations |
|------|----------|------|--------|-----------------|
| Harden | 6 | 8 | 10 | 14 |
| Test | - | - | - | 74 missing items |
| Humanize | 0 definite | 5 probable | - | - |

## Applied Fixes

### Harden (8 fixes)

| # | File | Fix |
|---|------|-----|
| 1 | middleware/fastify.ts | Return after 403 — route handler was still executing after rejection |
| 2 | meishi/compliance-score.ts | `classifyCompliance` returns enum values, not raw numbers |
| 3 | meishi/client.ts | `deserializeAudit` min size corrected from 115 to 123 bytes |
| 4 | meishi/client.ts | UAL length bounds check to prevent out-of-bounds read |
| 5 | meishi/mandate.ts | `buildGeoRestrictions` now accepts jurisdiction enum values matching `checkGeoRestriction` |
| 6 | meishi/exchange.ts | Documented signature verification gap as TODO |
| 7 | middleware/verification.ts | Documented unused `allowWarnings` config with TODO |
| 8 | meishi/client.ts | Added TODO for account discriminator validation |

### Humanize (4 fixes)

| # | File | Fix |
|---|------|-----|
| 1 | meishi/exchange.ts | Trimmed marketing-tone class docstring |
| 2 | meishi/dkg/index.ts | Simplified publisher docstring |
| 3 | compliance/consumer-protection.ts | Removed marketing module comment |
| 4 | meishi/zk/index.ts | Consolidated repetitive Noir circuit TODO comments |

## Deliberately Skipped

These findings were reviewed and intentionally deferred:

| Finding | Reason |
|---------|--------|
| On-chain access control (Critical 1,3,4) | Requires oracle registry PDA — architectural change, tracked separately |
| Signature verification (Critical 5) | Documented as TODO. Needs design decision on key source (principal vs issuer) |
| Account discriminator validation (High 3) | Needs Anchor IDL generation. Hardcoding wrong values would be worse |
| Missing test coverage (74 items) | Tracked for dedicated test sprint. No test infrastructure changes in this review |

## Build Verification

All modified packages pass `tsc --noEmit`:
- `packages/kamiyo-meishi/` — clean
- `packages/kamiyo-meishi-middleware/` — clean
- `packages/kamiyo-meishi-mcp/` — clean
- `services/meishi-compliance/` — clean

## Litmus Tests

- AI weasel words: 0 matches
- AI attribution: 0 matches
