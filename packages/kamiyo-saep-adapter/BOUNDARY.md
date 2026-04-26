# KAMIYO ↔ SAEP Boundary

This document is the load-bearing contract between KAMIYO and the SAEP
task-market. Anything ambiguous about which system owns which surface should
be settled here, not in code.

## What KAMIYO does

- **Underwrite** SAEP activity. KAMIYO holds collateral, runs Kizuna risk
  decisions, issues reservations against approved tasks, tracks debt and
  receipts, and settles repayment.
- **Read SAEP state.** This adapter does that.
- **Maintain the agent ↔ KAMIYO mapping.** SAEP knows agents by `agent_did`
  (a 32-byte identifier); KAMIYO knows them by its own `agentId`. The mapping
  lives in KAMIYO services, not in this adapter.

## What KAMIYO does **not** do

- KAMIYO does **not** sign SAEP transactions. No instruction in this adapter
  produces a signed message. Production code that does sign SAEP
  transactions must live in a separate package and pass an explicit
  authorization gate; this adapter's job is to underwrite, not to execute.
- KAMIYO does **not** fork or mirror the SAEP task-market program logic.
  When the SAEP spec changes, this adapter must be updated to track it; the
  protocol stays in SAEP.
- KAMIYO does **not** own the task lifecycle. `Created → Funded →
  ProofSubmitted → Verified → Released` happens entirely on SAEP and is
  driven by the client, agent, and SAEP cranker — not by KAMIYO.

## What SAEP owns

- The task market (creation, funding, escrow, proof, release).
- Agent identity attestation via the SAEP `AgentRegistry` cross-program ID.
- Proof verification via the SAEP `ProofVerifier`.
- Fee accounting (`protocol_fee`, `solrep_fee`) and the dispute window.
- Whitelisted payment mints, paused / unpaused state, and the `MarketGlobal`
  singleton's policy fields.

## What KAMIYO owns

- Whether to underwrite a given SAEP task. The decision is KAMIYO's; SAEP
  has no awareness of it.
- Collateral, reservations, receipts, debt, repayment.
- The `SaepWorkRef` shape and the deterministic risk hash. Both are KAMIYO
  artifacts; SAEP does not see or sign them.
- The agent ↔ Kizuna `agentId` mapping. SAEP knows the `agent_did`; KAMIYO
  is the one and only place that resolves a Kizuna agent's claim.
- Idempotency keys on Kizuna routes — see the facilitator service, not this
  adapter.

## Failure modes that cross the boundary

- **SAEP changes the on-chain account layout.** Decoder breaks. Update
  `decoder.ts` field order; bump this package; coordinate with the SAEP
  release.
- **SAEP rotates the `TaskContract` discriminator** (Anchor build hash
  changes when the program is redeployed). Decoder rejects every account
  with `decode_invalid_discriminator`. Operators must pass the new
  discriminator via `DecoderConfig.expectedDiscriminator`; package CHANGELOG
  notes it.
- **A SAEP-side dispute lands while a KAMIYO underwriting decision is
  in-flight.** SAEP's status moves to `Disputed`; the adapter rejects new
  underwriting via `validate_status_not_eligible`. Settlement-ingest (W4
  surface, not in this package) handles the in-flight reservation.

## Versioning

This adapter follows semver. Breaking changes:

- Reordering `RISK_HASH_FIELDS` (every previously-issued risk hash changes).
- Changing `SaepWorkRef`'s field shape.
- Removing or renaming an exported function or type.

Adding a new optional config field, a new fixture, or a new validation rule
is non-breaking and ships in a minor.

## Out of scope for this package

- The Kizuna routes themselves (`/kizuna/adapters/saep/*`). Those live in
  the facilitator service and consume this adapter via its public types.
- Receipt and debt models. Those land in W4.
- The crypto-fast lane decision logic. That lives in Kizuna; this adapter
  provides the inputs (snapshot, work-ref, validation result, risk hash).
- Solana mainnet transaction signing for SAEP. **Never in this package.**
