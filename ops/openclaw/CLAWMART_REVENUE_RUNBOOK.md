# Kyoshin ClawMart Revenue Runbook

This is the minimum path from "account configured" to "earning recurring revenue" for Kyoshin.

## 1) Account + publish rights

Checklist:
- Creator profile is complete.
- Subscription is active.
- `canPublish=true` in `GET /me`.

Verification:
- `GET https://www.shopclawmart.com/api/v1/me`

## 2) Install operator skill + API auth

Checklist:
- `CLAWMART_API_KEY` is set in OpenClaw runtime env.
- `workspace/skills/clawmart/SKILL.md` exists.
- `GET /me` succeeds from the runtime host.

## 3) Define the first monetizable offers

Ship three SKUs, not one:
- `skill`: "Kyoshin Revenue Ops Loop" (daily revenue triage + routing + receipts).
- `skill`: "x402 Facilitator Pipeline" (pricing feed + execution + settlement checks).
- `persona`: "Kyoshin Operator" (SOUL/MEMORY/AGENTS package for autonomous execution).

Each SKU needs:
- name
- tagline
- about
- category
- capabilities
- product type
- price

## 4) Create listing drafts in API

Use:
- `POST /listings` for each SKU.
- Save returned listing IDs in runtime state for automation.

Draft quality gate:
- clear buyer outcome
- measurable deliverable
- explicit prerequisites
- refund boundary

## 5) Build and upload package versions

For each listing:
- Produce package artifacts (`SKILL.md` or `SOUL.md` + `MEMORY.md` + support docs).
- Upload via `POST /listings/{id}/versions`.

Version gate:
- install steps are reproducible
- no hardcoded secrets
- includes concrete success criteria

## 6) Publish with explicit confirmation

Before publish:
- final copy pass
- price check against value and support load
- at least one screenshot/example output

Then publish in ClawMart UI/API.

## 7) Route demand into Kyoshin execution

Set a daily execution rhythm:
- ingest buyer requests at least 2x/day
- map requests to mission-control backlog items
- track per-delivery receipts and cycle times
- route net ClawMart earnings into the KAMIYO staking pool and append staking receipts

No revenue claim without:
- completed delivery artifact
- accepted outcome signal
- auditable receipt row

Staking receipt row (jsonl):
```json
{"source":"clawmart","stakingPoolUrl":"https://fundry.collaterize.com/staking/9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d","clawMartTotalSalesRouted":12,"txSignature":"<solana_sig>","at":"2026-02-27T20:00:00Z"}
```

Runtime enforcement:
- `KYO_ENABLE_CLAWMART_STAKING_ROUTE=true`
- `KYO_CLAWMART_STAKING_SOL_PER_SALE=<net-sol-per-sale>`
- `KYO_CLAWMART_STAKING_KEYPAIR_PATH=/absolute/path/to/keypair.json` (or `KYO_CLAWMART_STAKING_ROUTE_CMD=...`)
- `KYO_REQUIRE_CLAWMART_STAKING_ROUTE=true`
- `KYO_KAMIYO_STAKING_POOL_URL=<pool-url>`
- `KYO_CLAWMART_STAKING_RECEIPTS_PATH=<jsonl-file>`
- `KYO_REQUIRE_CLAWMART_MONITOR=true`
- `KYO_REVENUE_LEDGER_PATH=<jsonl-file>` (canonical paid-event ledger)
- `KYO_ENABLE_REVENUE_GUARD=true`
- `KYO_REQUIRE_REVENUE_GUARD=true`
- `KYO_WEEKLY_SPEND_CAP_USD=150`

x402 paid execution lane:
- `KYO_ENABLE_X402_AGENTCASH=true`
- `KYO_X402_ALLOWLIST_PATH=<json allowlist>`
- `KYO_MIN_JOB_MARGIN_USD=<threshold>`
- `KYO_MIN_JOB_SUCCESS_PROB=<threshold>`
- `KYO_MAX_JOB_COST_USD=<per-job cap>`

## 8) Conversion flywheel (weekly)

Every 7 days:
- pull listing views, conversion, sales, refund/complaint signals
- cut poor-performing copy
- ship one improved version for each top listing
- raise or lower price based on conversion + support burden

## 9) Operational guardrails

Required:
- no external promises that runtime cannot fulfill
- no irreversible actions without explicit approval
- support SLA stated in listing copy
- error -> correction -> rule recorded in `.learnings/LEARNINGS.md`

## 10) Revenue dashboard targets

Track:
- listings published
- weekly leads
- conversion rate
- paid orders
- net SOL / net USD
- median fulfillment time
- refund rate

Launch threshold:
- >=3 published SKUs
- >=1 paid delivery completed end-to-end
- >=2 consecutive weeks with non-zero net revenue
