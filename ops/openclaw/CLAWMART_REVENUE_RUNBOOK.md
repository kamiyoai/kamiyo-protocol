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

No revenue claim without:
- completed delivery artifact
- accepted outcome signal
- auditable receipt row

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
