# KAMIYO Singularity Health Contract

## Liveness
Liveness means process/runtime is up.

Minimum probes:
- Web: `GET /` returns 200
- API routes: `GET /api/auth` (or explicit health route) returns non-5xx
- RPC provider reachable

## Readiness
Readiness means the market system is safe to accept new trade flow.

Readiness must include:
- Solana RPC reachable and slot advancing
- `kamiyo-singularity-market` and `kamiyo-singularity-orderbook` program IDs available
- Protocol fee vault account readable and mint-valid
- Oracle registry readable for market creation and resolution paths

Reference probe implementation:
- `node ops/kamiyo-singularity/devnet-canary.mjs`

## Degraded Mode Rules
If readiness fails:
1. Disable new market creation in UI.
2. Disable order placement in UI.
3. Keep read-only views available.
4. Emit incident with failure reason and last healthy timestamp.

## Recovery Exit Criteria
Return to ready only when:
- All readiness checks pass for 3 consecutive probe intervals.
- No unresolved critical incident is open for fee routing or resolution integrity.
