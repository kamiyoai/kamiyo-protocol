# KAMIYO Singularity Implementation Plan (2026-02-24)

## Mission
Build **KAMIYO Singularity** as an on-chain prediction market arena where autonomous agents trade under KAMIYO trust constraints, with a strict fee flywheel that routes market usage value into the `$KAMIYO` staking pool.

Pool target:
- URL: `https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d`
- Pool authority: `9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d`

## Research Summary (What Was Reused)

### Source Repo Scanned
- `local/neuralminds` (linked to `polyguard`)

### High-Value Components Reused
- Web client baseline: `web/` -> copied to `apps/kamiyo-singularity`
- Market program baseline: `programs/polyguard-market` -> copied to `programs/kamiyo-singularity-market`
- Orderbook baseline: `programs/polyguard-orderbook` -> copied to `programs/kamiyo-singularity-orderbook`

### Existing KAMIYO Assets Integrated
- Trust-layer and staking context in monorepo (`programs/kamiyo-escrow`, `programs/kamiyo-staking`, `services/kyoshin/src/tools/*`)
- Existing Fundry staking tooling patterns for pool interactions

## Current Implementation Delta (Already Applied)

### 1. Frontend Foundation
- Added new app: `apps/kamiyo-singularity`
- Rebranded and rethemed entry surfaces for KAMIYO Singularity narrative
- Added flywheel constants in `src/lib/constants.ts`
  - `SINGULARITY_TRADING_FEE_BPS = 50`
  - `KAMIYO_STAKING_POOL_ADDRESS`
  - `KAMIYO_STAKING_POOL_URL`
- Surfaced flywheel and pool destination in:
  - Home page hero + flywheel panel
  - Market detail info panel

### 2. Program Port + Naming
- Added new workspace programs:
  - `programs/kamiyo-singularity-market`
  - `programs/kamiyo-singularity-orderbook`
- Renamed crates/modules from Polyguard naming to Singularity naming
- Added both programs to:
  - Rust workspace (`Cargo.toml` members)
  - Anchor config (`Anchor.toml` program mappings)

### 3. Fee Flywheel Enforcement (On-Chain)

#### Market Program (`kamiyo-singularity-market`)
- `create_market` now enforces protocol treasury authority to the Fundry pool authority (`9mEd...Cv9d`)
- New markets are forced to `protocol_fee_share_bps = 10000` (100% protocol share)
- Creator fee withdrawal path is disabled
- Protocol fee withdrawals remain permissionless but recipient account owner must match protocol treasury authority

#### Orderbook Program (`kamiyo-singularity-orderbook`)
- Added settlement-level trading fee in `settle_trade`:
  - `SINGULARITY_TRADING_FEE_BPS = 50` (0.50%)
- Fee is deducted from seller proceeds and transferred to `protocol_fee_vault`
- `protocol_fee_vault` is constrained:
  - owner must be the Fundry pool authority (`9mEd...Cv9d`)
  - mint must match escrow collateral mint
- `TradeFilled` event extended with:
  - `trading_fee`
  - `seller_receipt`

## Architecture Alignment to KAMIYO Singularity

### Protocol Layer
- Prediction market state + lifecycle: `kamiyo-singularity-market`
- Matching + settlement fee extraction: `kamiyo-singularity-orderbook`
- Oracle governance path exists and can be upgraded to committee voting + confidence output

### Trust Layer Integration Targets
- Bind market actions to stake-backed identities (Meishi/KAMIYO trust identity)
- Emit deterministic evidence digests for market resolution/disputes
- Track oracle agreement and slashing evidence in a reputation ledger

### Flywheel Loop
1. Agent/human trade activity executes market/orderbook flows
2. Trading fee captured at settlement
3. Fee routed to fee vault constrained to pool authority
4. Market protocol fees are sweepable only to pool-authority-owned token accounts
5. Value compounds in `$KAMIYO` staking economics

## Phased Delivery Plan

## Phase 1: Hardening + Compile Baseline (Week 1)
- Build both new programs in this workspace
- Fix Anchor compatibility drift from upstream code
- Add regression tests for:
  - fee routing constraints
  - disabled creator fee withdrawal
  - protocol treasury enforcement
- Add integration fixture for `settle_trade` with protocol fee vault account

Exit criteria:
- `anchor build` succeeds for Singularity programs
- All fee-routing tests pass

## Phase 2: Trust-Layer Constraints (Week 1-2)
- Add stake-backed identity checks for market creation/trading permissions
- Add dispute evidence hash fields and event emission
- Add committee-based oracle finalization path with confidence-weighted verdict

Exit criteria:
- Unauthorized or unstaked agent actions rejected
- Resolution output reproducible from event/evidence data

## Phase 3: Agent Execution Surface (Week 2)
- Add agent policy envelope:
  - market scope allowlist
  - capital caps
  - dispute thresholds
- Add signed execution receipts for agent actions

Exit criteria:
- Agent execution bounded by policy and auditable via receipts

## Phase 4: Frontend Audit Console (Week 2-3)
- Expand `apps/kamiyo-singularity` with:
  - Agent Hub (stake backing, accuracy, slashing)
  - Market evidence panel (hashes, committee composition, confidence)
  - Reputation Explorer (dispute lineage + consensus drift)
- Add route-level status indicators for flywheel destination and fee vault health

Exit criteria:
- Core trust and economic signals visible per market/agent

## Phase 5: Monitoring + Integrity Controls (Week 3)
- Add telemetry for:
  - fee routing success/failures
  - oracle divergence
  - stake concentration shifts
  - abnormal dispute rates
- Add alerts and runbooks for routing breakage and manipulation patterns

Exit criteria:
- Operational SLOs and incident playbooks in place

## Validation Checklist
- [ ] `anchor build -p kamiyo-singularity-market`
- [ ] `anchor build -p kamiyo-singularity-orderbook`
- [ ] Unit tests for fee routing constraints
- [ ] End-to-end simulation: place orders -> settle -> verify fee transfer to pool-owned vault
- [ ] Frontend renders flywheel metadata and staking destination correctly

## Risks and Mitigations
- **Pool authority/token-account mismatch**: create and document canonical pool-owned token account per collateral mint
- **Anchor version drift from upstream code**: lock to monorepo toolchain and patch instruction/account constraints incrementally
- **Permissionless sweeps abuse risk**: keep strict recipient-owner checks and add optional rate limiting at relayer layer
- **Oracle collusion risk**: committee expansion + confidence scoring + slashing linkage

## Immediate Next Build Tasks
1. Compile and fix both Singularity programs in current workspace.
2. Add deterministic tests for `settle_trade` trading-fee routing.
3. Add a relayer script/service to sweep `accumulated_fees` into pool-owned token accounts on schedule.
4. Add market creation CLI that pre-fills the enforced pool authority and fee defaults.
