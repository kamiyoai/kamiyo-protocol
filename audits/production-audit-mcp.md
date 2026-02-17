# Production Audit: MCP Server

**Audit Date**: 2026-02-17
**Scope**: Hosted MCP HTTP server + OAuth (services/api/src/mcp)
**Verdict**: SHIP WITH FIXES (P0/P1 addressed in this change)

## Executive Summary

The hosted MCP surface area is small but it had a few security and production-footgun issues that are easy to miss in happy-path testing: refresh token scope escalation, session IDs not being bound to the authenticated client, and OAuth invariants (PKCE + redirect URI) not being enforced locally. These are all production issues because they enable privilege escalation or brittle behavior when clients deviate slightly from the expected flow.

This patch hardens the OAuth provider, tightens MCP session handling, adds basic timeouts for outbound fetches, fixes misleading tool advertising, and adds tests to prevent regressions.

## Critical Issues (P0 - Block Release)

- [x] Refresh token scope escalation possible | Impact: client can mint access tokens with broader scopes than originally granted | Fix: enforce requested scopes are a non-empty subset of granted scopes in refresh flow
- [x] MCP session IDs not bound to authenticated client | Impact: session-id reuse could cross client boundaries, enabling privilege escalation if a session ID leaks | Fix: enforce `session.clientId === auth.clientId` for all session-bound requests and deletes
- [x] PKCE code_challenge not enforced in authorization | Impact: brittle behavior / undefined behavior vs DB constraints; weakens auth invariants | Fix: require `code_challenge` and validate redirect URI + scopes before issuing codes

## High Priority (P1 - Fix Before Launch)

- [x] Remote MCP advertised an `x402_fetch` tool that can never succeed | Impact: client confusion and wasted calls; breaks “tools list is truthful” contract | Fix: remove tool from hosted MCP tool list
- [x] Outbound `fetch()` in MCP tools had no timeout | Impact: request thread can hang under network issues | Fix: add an AbortController timeout
- [x] In-memory rate limiter map unbounded | Impact: memory growth with many unique client IDs | Fix: prune old entries in periodic cleanup
- [x] Session cleanup only closed transports | Impact: server resources can linger | Fix: close server alongside transport on cleanup/shutdown
- [x] MCP request metrics always recorded status `200` | Impact: observability lies; can’t distinguish errors vs success | Fix: record `res.statusCode`
- [x] DCR scope parsing could persist an empty scope set | Impact: client capability becomes ambiguous and can break authorization | Fix: normalize empty scope lists to `mcp:tools` at registration + retrieval

## Medium Priority (P2 - Fix Soon After Launch)

- [ ] Distributed rate limiting + session store | Impact: current in-memory maps won’t behave correctly with multiple instances | Fix: move to shared store (Redis) or enforce single instance
- [ ] `API_BASE_URL` hard-coded fallback | Impact: OAuth metadata could be wrong if env is missing | Fix: require env in production or derive from trusted proxy headers

## Security Assessment

Hardened:
- OAuth authorization now enforces registered redirect URIs.
- Authorization now enforces requested scopes are within client scope.
- Refresh token exchange enforces scope subset (no escalation) and resource binding.
- Constant-time compare used where easy (client secret verification and PKCE verification).
- MCP session IDs are now bound to client identity.

Remaining considerations:
- Multi-instance deployments need a shared session store and shared rate limiter to avoid cross-instance inconsistencies.

## Test Coverage Gaps

- Added unit tests for OAuth provider scope + redirect + PKCE invariants.
- No integration tests yet for the full `/mcp` HTTP transport (session creation + SSE) due to transport complexity; recommended follow-up if the hosted MCP becomes a core product surface.

