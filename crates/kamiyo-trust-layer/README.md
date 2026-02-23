# kamiyo-trust-layer

Standalone trust decision layer for KAMIYO. This crate is decoupled from on-chain handlers so it can run in APIs, workers, and simulation pipelines.

## What it provides

- deterministic trust policy evaluation (`allow` / `review` / `deny`)
- idempotent event ingestion via unique `event_id`
- strict per-subject sequence enforcement
- append-only journal with tamper-evident hash chaining
- policy version tracking on every decision receipt
- snapshot/restore for deterministic recovery
- audit-log record export with trace correlation + provider provenance fields
- Kani proof harnesses behind `cfg(kani)` for core invariants

## Core types

- `TrustPolicy`: score/stake/failure/inactivity thresholds
- `TrustEvent`: evidence event envelope (`event_id`, sequence, context)
- `TrustProvider`: normalized source provider identity (`openclaw`, `nanoclaw`, `ironclaw`, ...)
- `TrustReceipt`: immutable decision artifact with `policy_version` + `decision_id`
- `JournalEntry`: append-only event + receipt record
- `TrustLayerSnapshot`: full in-memory checkpoint for restore/replay

## Quick usage

```rust
use kamiyo_trust_layer::{EvidenceKind, TrustEvent, TrustLayer, TrustPolicy};

let mut layer = TrustLayer::new(TrustPolicy::default())?;

let receipt = layer.apply_event(
    "agent-alpha",
    TrustEvent::new("evt-001", 1, 1_700_000_000, EvidenceKind::ManualCredit, 20, 12_000),
)?;

assert!(layer.verify_receipt(&receipt));
assert_eq!(layer.policy_version(), 1);
# Ok::<(), Box<dyn std::error::Error>>(())
```

## Snapshot and restore

```rust
# use kamiyo_trust_layer::{EvidenceKind, TrustEvent, TrustLayer, TrustPolicy};
# let mut layer = TrustLayer::new(TrustPolicy::default())?;
# let _ = layer.apply_event("agent", TrustEvent::new("evt-1", 1, 1000, EvidenceKind::ManualCredit, 20, 10000))?;
let snapshot = layer.snapshot();
let restored = TrustLayer::from_snapshot(snapshot)?;

assert_eq!(restored.subject_count(), layer.subject_count());
assert_eq!(restored.journal_len(), layer.journal_len());
# Ok::<(), Box<dyn std::error::Error>>(())
```

## Operational notes

- Reusing the same `event_id` with identical payload returns the original receipt (idempotent replay).
- Reusing the same `event_id` with different payload returns `EventIdConflict`.
- `set_policy_with_version` enforces strict monotonic policy version transitions.
- `audit_log_records()` returns normalized records ready for external log sinks.

## Verification

Unit tests:

```bash
cargo test -p kamiyo-trust-layer
```

Kani proofs:

```bash
cargo kani -p kamiyo-trust-layer
```
