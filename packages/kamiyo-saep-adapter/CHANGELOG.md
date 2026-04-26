# Changelog — @kamiyo/saep-adapter

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the package follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-26

First complete cut of the SAEP adapter and the `/kizuna/adapters/saep/*`
facilitator surface. Covers W1–W6 of the SAEP-adapter sprint: types,
decoder, validator, risk hash, facilitator routes, settlement-ingest,
operator GETs + CLI, and the W6 hardening pass.

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

### Sprint W5 — operator surface + CLI + demo (in `services/x402-facilitator` + new `packages/kamiyo-saep-cli`)

- Migration `019_kizuna_decision_external_work_ref` adds an
  `external_work_ref jsonb` column on `kizuna_underwrite_decisions`. The
  underwrite route now persists the full `SaepWorkRef` there at decision
  time.
- Settlement-ingest no longer requires `taskPda` and `cluster` in the
  request body — both are resolved from the persisted decision via the
  reservation id. Explicit body params still win when supplied. Missing
  ref + missing override → 400 with reason code `saep_external_work_ref_missing`.
- `GET /reservations/:id` now returns the full `taskRef` (the SAEP work-ref
  recovered from the decision) alongside the reservation, debt, and health
  snapshot.
- New operator GETs (internal-auth gated):
  - `GET /kizuna/adapters/saep/health` — reports whether the program id is
    pinned, the discriminator is set, RPC URLs are configured per cluster,
    and whether the routes are `ready`.
  - `GET /kizuna/adapters/saep/decisions/:reservationId` — returns the full
    decision envelope joined to the reservation (score, reason codes,
    policy pack, envelope hash, persisted external work-ref).
  - `GET /kizuna/adapters/saep/snapshots/:taskPda?cluster=…` — reads the
    SAEP `TaskContract` and returns the JSON-friendly snapshot, normalized
    work-ref, and risk hash. Bypasses underwriting validation.
- `@kamiyo/saep-cli` (new package): `kamiyo-saep read | underwrite |
  reservation | settle` operator CLI built on `commander` + `chalk` +
  `ora`. Reads `KAMIYO_FACILITATOR_URL` + `KAMIYO_INTERNAL_TOKEN` for
  service calls and `SAEP_TASK_MARKET_PROGRAM_ID` + per-cluster RPC
  variables for direct decoder use.
- `scripts/saep-adapter-demo.ts` — end-to-end happy-path walkthrough
  (health → underwrite → reservation → settlement-ingest) parameterized
  by `SAEP_DEMO_*` env. Drives the operator surface and proves the
  fallback-resolution path on settlement-ingest.
- Tests: 12 new vitest cases — health (ready/not-ready/auth), decisions
  GET (200/404/auth), snapshots GET (200/404/400/auth), settlement-ingest
  fallback (resolves from persisted ref), settlement-ingest reason code
  on missing ref.

### Sprint W6 — hardening + acceptance pass (in `services/x402-facilitator`)

- Underwrite replay response now matches the first-call response shape:
  `taskRef`, `riskHash`, and `collateralAccount` are emitted on replay too,
  so callers can pipeline retries without branching on `replay`.
- Each `/kizuna/adapters/saep/*` request emits one ndjson metric line on
  finish, prefixed `[saep-route-metric]`. Fields: `ts`, `route`, `status`,
  `durationMs`, `outcome` (`ok` / `reject` / `error`), and the optional
  `reservationId`, `agentId`, `cluster`, `reasonCodes` tags. Mirrors the
  autopilot metric pattern; zero new logging deps.
- `BOUNDARY.md` rewritten in three places to track W4/W5 reality:
  externalWorkRef persistence, settlement-ingest's role on disputes, and
  the operator CLI as out-of-scope for the adapter package.
- Tests: 6 new vitest cases for hardening + acceptance — replay
  shape parity, `saep_rpc_unreachable` propagation on underwrite,
  `saep_validate_unsupported_mint` propagation on underwrite,
  settlement-ingest empty-body 400, snapshot 503 on RPC failure, and a
  full underwrite → reservation → settlement-ingest end-to-end pipeline
  threading the persisted externalWorkRef across all three routes.

### Notes

- The `TaskContract` Anchor discriminator is still a placeholder —
  operators must pass the SAEP IDL value via
  `DecoderConfig.expectedDiscriminator` until the constant is pinned.
  This is the largest known gap remaining; everything else in the W1–W6
  surface is acceptance-ready.
- Crypto-fast funding lane only in v1; enterprise prefund follows in a
  later sprint.
- Agent-DID identity check (cross-referencing the SAEP `agent_did` against
  KAMIYO's AgentRegistry mapping) remains deferred to a future iteration —
  the W3–W6 routes enforce `payerWallet` against the Kizuna account.

[0.1.0]: https://github.com/kamiyo-ai/kamiyo-protocol/commits/main/packages/kamiyo-saep-adapter
