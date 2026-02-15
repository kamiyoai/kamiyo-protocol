# Hive True Swarm: Next Steps Execution Plan

This document tracks the immediate follow-through work after landing the True Swarm DAG runtime.

## PR + Merge

- [x] Open PR for `kamiyo/hive-true-swarm` into `main` (draft).
- [ ] Land hardening commits (concurrency caps, timeouts, cancel/retry, idempotency).
- [ ] Mark PR ready, merge to `main`.

## Deploy (Render: `kamiyo-api`)

Deployment is auto on `main`. After merge:

- [ ] Verify `/version` reports the merged commit SHA.
- [ ] Ensure env is set:
  - `KIROKU_AGENT_PUBLISH_URL`
  - `KIROKU_AGENT_PUBLISH_KEY`
  - `KIROKU_AGENT_AUTHOR`
  - optional: `KIROKU_RECEIPT_ORIGIN`
- [ ] (Temporary for smoke test only) set `ENABLE_TEST_FUNDING=1`, run smoke, then unset.

## Smoke Mission (Production Service)

Goal: prove the full loop works end-to-end:

- [ ] Auth via wallet-only token (`/api/auth/challenge` + `/api/auth/wallet`).
- [ ] Create a Hive team with 2–4 members (`POST /api/hive-teams`).
- [ ] Fund pool using `POST /api/hive-teams/:id/fund-test` (requires `ENABLE_TEST_FUNDING=1`).
- [ ] `POST /api/hive-teams/:id/swarm/run` with:
  - `maxParallel` > 1
  - `failFast: true`
- [ ] Confirm:
  - run persisted (`GET /api/hive-teams/:id/swarm/runs/:runId`)
  - node statuses + timings are coherent
  - pool accounting matches `totalSpent`
  - Kiroku receipt URL is present (or a concrete publish error is persisted)

## Hardening Work Items

### Concurrency Controls

- [ ] Add global + per-team concurrency caps (in-process semaphores).
- [ ] Clamp `maxParallel` by available capacity.
- [ ] Metrics: active nodes, queued nodes, rejected runs.

### Timeouts + Cancellation

- [ ] Per-node timeout (fail node, refund reserved budget).
- [ ] Run-level timeout (cancel remaining nodes).
- [ ] Cancel endpoint: `POST /api/hive-teams/:id/swarm/runs/:runId/cancel`.

### Retry + Idempotency

- [ ] Retry endpoint: `POST /api/hive-teams/:id/swarm/runs/:runId/retry` (default: retry incomplete nodes).
- [ ] Idempotency key for `POST /run` to avoid duplicate runs on client retries.

## SDK / Docs Polish

- [ ] Update docs to include the new hardening env vars + operational guidance.
- [ ] Ensure API responses include a stable `kiroku` object for run detail and run list.

