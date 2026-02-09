# Helius Next Level Plan (Kamiyo Protocol)

## Executive Take

If we want Helius (and the ecosystem) to pay attention, we should not compete on “RPC plumbing”. We should ship an **agent commerce underwriter** built on top of reliable real-time data ingestion:

- **Ingestion layer**: Webhooks + WS/LaserStream + deterministic backfill, idempotent processing, and derived views.
- **Underwriting layer (moat)**: escrow/dispute outcomes + reputation/credit scoring + privacy proofs wired into payments (x402) and routing.

Building an impressive *streaming client* is table-stakes. Building a *useful underwriting engine* that developers can drop into their agent/payment stack is what becomes hard to ignore.

## What’s Actually Our Moat (From This Codebase)

The defensible pieces here are not Helius-specific:

- **Escrow + dispute primitives** (multiple programs/services) with “quality-driven settlement” semantics.
- **Reputation + credit logic** (x402 reputation extensions, tiering, discounting, credit scoring).
- **Oracle-agent workflow** for dispute evaluation and evidence gathering.
- **ZK direction** (proof plumbing, commitments) that can become “private reputation” and “compliance-friendly underwriting”.

Helius is an accelerant for the above because it makes “on-chain truth → off-chain decisions” fast and cheap to consume.

## Current Helius Surface Area (What We Have Today)

- `packages/helius-adapter/`
  - Webhook verification and a “parser” layer exist, but the instruction/account model is **not aligned** with the current escrow IDLs present in-repo.
  - Good building blocks: connection pooling, rate limiting, fee estimation.
- `packages/kamiyo-oracle-agent/`
  - Uses Helius REST for transaction lookups as enrichment.
  - Webhook usage is a placeholder; dispute detection is currently polling-based in some paths.
- Various scripts/services build Helius RPC URLs; keys were previously hardcoded in some scripts (already removed on the current branch).

## The “Can’t Ignore” Deliverable

### Product: Kamiyo Observatory + Underwriter (MVP)

Goal: given a Solana program (IDL + program ID), ship a service + library that:

- Ingests transactions/events in real time (Helius webhooks first).
- Backfills deterministically (RPC + Helius address tx endpoints).
- Produces derived views:
  - escrow lifecycle state machine
  - dispute timelines + outcome stats
  - counterparty reputation deltas
  - “risk flags” (repeat disputes, anomalous refunds, timing weirdness)
- Exposes a clean API and a tiny SDK.

Then: plug those derived views into x402:

- Dynamic pricing + credit limits based on empirical on-chain settlement history.
- Provider routing heuristics (price x quality x dispute-history).

### Why This Is Hard To Ignore

- Developers want “Stripe for agent payments” behavior:
  - instant fraud/risk signals
  - dispute automation
  - reputation-aware routing
  - credit decisions
- Helius doesn’t ship underwriting. We can.

## LaserStream: Build vs. Buy

### Is it worth building a LaserStream equivalent?

Not as a primary bet.

- A real “LaserStream clone” implies:
  - running validators / geyser plugins
  - ingestion infra and reorg correctness
  - SLOs, capacity planning, multi-region, DDoS posture
  - long-term maintenance as Solana evolves
- That’s an infra company roadmap. It can be justified only if:
  - we need hard guarantees Helius cannot provide,
  - or we reach a scale where the unit economics force us to self-host.

### The better move (now)

Implement a **provider-agnostic ingestion interface** and ship:

1. Helius Webhooks connector (at-least-once + dedupe).
2. Enhanced WS connector (low latency; less “push config” overhead).
3. Backfill connector (RPC + Helius REST).
4. Optional: LaserStream connector (if/when we have access).

Then, if we ever self-host, it drops in as “Source #5”.

## Execution Plan

### Phase 0: Correctness + Hardening (immediate)

- [ ] Align `packages/helius-adapter` parsing to the escrow IDL we actually use (instruction discriminators, account layouts, event semantics).
- [ ] Add realistic webhook fixture tests (and signature verification tests that match production behavior).
- [ ] Standardize env/config across scripts/services (`HELIUS_API_KEY`, `SOLANA_RPC_URL`, etc.).

### Phase 1: Observatory MVP (1-2 weeks)

- [ ] New package/service: “observatory” with:
  - webhook endpoint (verified)
  - idempotent event store (sqlite/postgres)
  - derived lifecycle materialization
  - minimal API for “escrow/dispute status by id/pda”
- [ ] Backfill job: reconcile missing events and fill gaps.
- [ ] Export a thin SDK for downstream services (oracle agent, x402 facilitator).

### Phase 2: Underwriter (2-4 weeks)

- [ ] Risk model v1:
  - per-entity dispute rate, refund severity, time-to-resolution
  - behavior-based confidence scores
- [ ] x402 integration:
  - credit limits, tiering, routing, pricing decisions based on underwriter output
- [ ] ZK “private thresholds”:
  - prove “>= threshold” without revealing raw scores/history.

### Phase 3: Source Diversity + Scale (later)

- [ ] Add WS + LaserStream connectors behind the ingestion interface.
- [ ] Reorg-aware ordering + idempotency guarantees.
- [ ] Multi-tenant program support (“bring your own IDL”).

## What I’m Executing Now

On this repo branch:

- Phase 0 item 1: make `packages/helius-adapter` match the escrow program it claims to support.
- Phase 0 item 2: update tests/fixtures so we can trust webhook parsing and account decoding.

