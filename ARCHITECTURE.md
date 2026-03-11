# Architecture

KAMIYO Protocol is now organized around Kizuna.

Kizuna is the open payment rail for autonomous agents. It exposes public APIs, settlement hooks, funding controls, and client SDKs, while production approval logic stays in the hosted `kizuna-kernel`.

## System View

```text
┌──────────────────────────────────────────────────────────────────────┐
│                           Kizuna-Powered Clients                    │
│  Kyoshin runtime   Keiro app   OpenClaw tools   partner APIs        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         KAMIYO Open Rails                           │
│                                                                      │
│  x402 facilitator                                                    │
│  - verify / settle                                                   │
│  - Kizuna account, funding, collateral, repayment APIs              │
│  - reservation, debt, billable event accounting                     │
│                                                                      │
│  wallet control plane                                                │
│  - mandates                                                          │
│  - linked wallets                                                    │
│  - enterprise funding controls                                       │
│  - crypto-fast collateral controls                                   │
│                                                                      │
│  companion API                                                       │
│  - credits ledger / repayment                                        │
│  - internal billing hooks                                            │
│  - retained legacy integrations during cutover                       │
│                                                                      │
│  shared packages                                                     │
│  - x402 client                                                       │
│  - settlement                                                        │
│  - Meishi                                                            │
│  - CDP integration                                                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Hosted Proprietary Boundary                       │
│  kizuna-kernel                                                       │
│  - policy packs                                                      │
│  - risk graph and abuse detection                                    │
│  - decision signing                                                  │
│  - commit / ingest APIs                                              │
└──────────────────────────────────────────────────────────────────────┘
```

## Product Lanes

### Enterprise Lane

Use when an API platform or operator wants controlled spend with clear audit trails.

Rules:

- prefund required
- mandate limits enforced
- kernel approval required
- no unsecured payout path
- settlement consumes locked prefund instead of creating unsecured debt

### Crypto-Fast Lane

Use when an agent wants low-friction access but can post collateral.

Rules:

- collateral required
- pool isolation required
- LTV cap enforced
- health factor enforced
- settlement can create debt only inside the collateralized lane

## Default Flow

### 1. Onboarding

- agent is registered with payer and repay wallet metadata
- enterprise agents can establish mandate + prefund controls
- crypto-fast agents can establish collateral positions

### 2. Verify

- facilitator validates protocol inputs
- lane is resolved
- kernel evaluates approval
- facilitator creates a reservation in the selected pool
- response returns Kizuna extension metadata for the approved amount

### 3. Settle

- facilitator validates reservation + decision envelope
- settlement executes on-chain or over the configured payment rail
- enterprise lane consumes prefund
- crypto-fast lane creates debt against the isolated pool
- exactly-once billable settlement event is emitted

### 4. Repay or Rebalance

- enterprise lane replenishes prefund
- crypto-fast lane repays outstanding debt or adds collateral
- companion API and kernel ingest repayment state idempotently

## Repo Layout by Role

### Core

The default build, test, and CI path.

- `services/x402-facilitator`
- `services/wallet-control-plane`
- `services/api` Kizuna routes and ledger surfaces
- `packages/kamiyo-x402-client`
- `packages/kamiyo-settlement`
- `packages/kamiyo-meishi`
- `packages/kamiyo-sdk`
- `packages/kamiyo-cdp`
- `apps/cdp-onboarding`

### Modules

Kizuna-powered surfaces that stay active but are not the repo default.

- `services/kyoshin`
- `apps/keiro`
- `packages/kamiyo-openclaw`
- `packages/kamiyo-hive`
- `packages/kamiyo-agents`
- `packages/kamiyo-agent-paranet`
- related orchestration packages

### Legacy

Retained during cutover, not part of the default production path.

- FairScale fusion and other retained partner feeds
- trust-graph / paranet / PoCH-heavy surfaces
- oracle-specific tracks
- extra deploy workflows for non-Kizuna contract lanes
- demos, experiments, and old contract tracks

## Operational Rules

- `pnpm run build`, `pnpm run test`, and `pnpm run lint:check` target Kizuna core only.
- Module checks run only when module paths change.
- Legacy checks move off the required path.
- Public Kizuna HTTP contracts stay stable during this cutover.
- No repo-default path is allowed to front unsecured liquidity.
