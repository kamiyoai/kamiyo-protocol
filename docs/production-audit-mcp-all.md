# Production Audit: MCP Surfaces (Claude + Hosted)

**Audit Date**: 2026-02-20  
**Scope**:
- Hosted MCP API server (`services/api/src/mcp/*`)
- Local Claude MCP server (`packages/kamiyo-mcp/src/index.ts`)
- Meishi MCP server (`packages/kamiyo-meishi-mcp/src/*`)
- Kyoshin Claude MCP wrappers (`services/kyoshin/src/x-mcp-server.ts`, `services/kyoshin/src/protocol-tools-mcp.ts`)  
**Verdict**: SHIP WITH FIXES

## Executive Summary

Core auth/session hardening for hosted MCP is in place, but there were still reliability and correctness gaps across the broader MCP surface: permissive method handling, stale session behavior, missing timeout controls in image workflows, and inconsistent error hygiene in auxiliary Claude MCP wrappers. Those are now tightened. Remaining risk is primarily architectural (single-process in-memory limits for some wrappers), not immediate P0/P1 security defects.

## Critical (P0)

- [x] None found in current scope after this pass.

## High Priority (P1)

- [x] Hosted MCP accepted non-protocol methods | Impact: ambiguous behavior, weak edge hardening | Fix: explicit method allowlist + `405` + `Allow` header
- [x] Hosted MCP could create a new session when a stale/unknown `mcp-session-id` was supplied on `POST` | Impact: session lifecycle confusion and harder client recovery semantics | Fix: require session-less `POST` for session creation; stale ID now returns `404`
- [x] Hosted MCP lacked explicit JSON parse failure mapping | Impact: inconsistent error surface under malformed payloads | Fix: route-level JSON syntax handler returning structured `400`
- [x] X MCP image generation/upload had no network timeout bounds | Impact: hanging tool calls under upstream/CDN stalls | Fix: AbortController timeouts for generation and media download
- [x] X MCP trusted remote image URL/content too loosely | Impact: non-image payload or oversized payload upload attempts | Fix: HTTPS enforcement, content-type check, max byte cap, status checks

## Medium Priority (P2)

- [x] OAuth client/token parsing had weak DB corruption tolerance | Impact: malformed persisted records could produce unpredictable behavior | Fix: strict JSON-array parsing and validation in client/token scope paths
- [x] Meishi MCP startup and runtime error handling was inconsistent | Impact: rougher operator behavior and noisier failures | Fix: safe error mapping, invalid key fallback warning, signal-based graceful shutdown
- [x] Protocol MCP wrapper returned raw `String(error)` in multiple tools | Impact: unnecessary error leakage/noise | Fix: centralized sanitized error formatter
- [x] Local MCP config parsing accepted invalid numeric `X402_MAX_PRICE_USD` | Impact: NaN/invalid pricing guard config | Fix: finite positive normalization with sane fallback

## Low Priority (P3)

- [ ] Move in-memory rate-limit/session maps to shared storage where horizontal scale is required.
- [ ] Add integration tests for hosted streamable MCP session lifecycle (init/reuse/delete/SSE paths).
- [ ] Add focused tests for Kyoshin image path timeout and payload guards.

## Security Assessment

Implemented in this pass:
- Enforced stricter hosted MCP method/session semantics.
- Added stricter OAuth record parsing/validation safety.
- Added timeout and payload guardrails on external image fetch/upload paths.
- Reduced direct raw error surfacing in MCP wrappers.

Residual:
- Some wrappers remain intentionally trust-bound to local operator environment; multi-instance safety and distributed rate-limiting are still architectural follow-ups.

## Action Log (This Pass)

- Hardened: `services/api/src/mcp/index.ts`
- Hardened: `services/api/src/mcp/oauth/provider.ts`
- Hardened: `services/api/src/mcp/oauth/clients-store.ts`
- Hardened: `services/api/src/mcp/server.ts`
- Cleanup+hardening: `packages/kamiyo-meishi-mcp/src/index.ts`
- Cleanup+hardening: `packages/kamiyo-meishi-mcp/src/tools.ts`
- Cleanup+hardening: `packages/kamiyo-mcp/src/index.ts`
- Hardened: `services/kyoshin/src/x-mcp-server.ts`
- Cleanup: `services/kyoshin/src/protocol-tools-mcp.ts`

