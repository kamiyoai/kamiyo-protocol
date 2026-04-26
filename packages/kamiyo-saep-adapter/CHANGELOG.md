# Changelog — @kamiyo/saep-adapter

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the package follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Sprint W1

- `SaepWorkRef`, `SaepTaskSnapshot`, `ExternalWorkRef` types.
- `SaepTaskStatus` enum mirroring the on-chain `TaskStatus` discriminants.
- `SaepAdapterError` with stable codes for decode, validate, and rpc failures.
- `BOUNDARY.md` documenting the KAMIYO ↔ SAEP responsibility split.
- Reference fixtures for every status surface.

### Added — Sprint W2

- `decodeTaskContract` Borsh decoder for `TaskContract` accounts.
- `deriveTaskPda`, `deriveTaskEscrowPda`, `deriveMarketGlobalPda` PDA helpers
  matching the SAEP seed schema.
- `normalizeSnapshot` collapsing a snapshot into the KAMIYO-owned
  `SaepWorkRef`.
- `computeRiskHash` deterministic SHA-256 over a frozen, ordered field set.
- `validateForUnderwriting` enforcing snapshot freshness, eligible status,
  allowed payment mint, deadline window, agent identity match.
- `SaepReader` high-level fetch + decode entry point.
- Vitest unit tests for PDAs, risk hash, decoder, normalizer, validator.
- Opt-in `SAEP_SMOKE_ENABLED=1` smoke test against Solana mainnet read-only.

### Sprint W3 — facilitator wiring (in `services/x402-facilitator`)

- `POST /kizuna/adapters/saep/underwrite` orchestrates SAEP read +
  validate + crypto-fast Kizuna underwriting. Returns reservation +
  Kizuna decision + `SaepWorkRef` + risk hash.
- `GET /kizuna/adapters/saep/reservations/:id` returns the reservation,
  decision envelope hash, debt, and latest health snapshot.
- Adapter errors propagate as `saep_*` reason codes alongside the
  Kizuna reason vocabulary so callers see one shape.
- Idempotency: `idempotencyKey` shares the existing `requestNonce`
  storage; replays return the original reservation without re-deciding.
- New facilitator config: `SAEP_TASK_MARKET_PROGRAM_ID`,
  `SAEP_TASK_DISCRIMINATOR_HEX`, `SAEP_ALLOWED_PAYMENT_MINTS`,
  `SAEP_RPC_URL_DEVNET`. Empty program id leaves the routes inert.

### Sprint W4 — settlement ingest (in `services/x402-facilitator`)

- `POST /kizuna/adapters/saep/settlement-ingest` finalizes Kizuna
  settlement state from a SAEP release/proof reference. KAMIYO never
  signs the on-chain release — this route ingests the *result* of a
  SAEP-side `release` or `expire` and updates Kizuna debt, settlement,
  and billable-event state.
- Released path: insert settlement, finalize Kizuna debt, emit billable
  event. Agent payout = `payment_amount - protocol_fee - solrep_fee`
  per the SAEP release math; merchant wallet defaults to
  `snapshot.assignedAgent` and accepts an explicit override.
- Expired path: release the reservation with reason `expired`. No debt,
  no billable event, no settlement record.
- Idempotency: a repeat call with the same `reservationId` returns the
  original settlement / debt / billable-event ids without re-emitting.
- Tests: 11 cases — Released happy path, Expired path, idempotent
  retry, missing inputs, reservation not found, wrong reservation
  state, SAEP not yet terminal, no assigned_agent without override,
  explicit merchantWallet override, non-positive payout math, missing
  internal auth.

### Notes

- The `TaskContract` Anchor discriminator is a placeholder — operators must
  pass the SAEP IDL value via `DecoderConfig.expectedDiscriminator` until
  the constant is pinned.
- Crypto-fast funding lane only in v1; enterprise prefund follows in a later
  sprint.
- Agent-DID identity check (cross-referencing the SAEP `agent_did` against
  KAMIYO's AgentRegistry mapping) remains deferred to a future iteration —
  the W3/W4 routes enforce `payerWallet` against the Kizuna account.
- Settlement-ingest currently requires the caller to pass `taskPda` — the
  decision row does not yet persist `external_work_ref` as a first-class
  column. Storing it explicitly is a lightweight follow-up that would let
  the route resolve `taskPda` from `reservationId` alone.

[Unreleased]: https://github.com/kamiyo-ai/kamiyo-protocol/commits/main/packages/kamiyo-saep-adapter
