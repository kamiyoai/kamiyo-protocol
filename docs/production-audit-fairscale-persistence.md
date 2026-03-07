# Production Audit: FairScale Persistence

## Executive Summary
The FairScale fusion feed was not production-safe. Event ingestion and reads were correct, but the data lived in the API's local SQLite file, which meant partner-facing history could disappear on deploy or instance replacement. The fix is to move the FairScale store behind a dedicated durable backend, make the active backend visible in health, and close the new connection cleanly on shutdown.

## Critical Issues (P0 - Block Release)
- [x] FairScale partner data was stored on local SQLite only | Deploys and container churn could wipe or strand history | Added a dedicated Postgres-backed FairScale store behind `FUSION_FAIRSCALE_DATABASE_URL`

## High Priority (P1 - Fix Before Launch)
- [x] No runtime proof of durable storage | Integration debugging required guessing the active backend | Added backend status to `/api/fusion/fairscale/health`
- [x] FairScale store lifecycle was tied to the SQLite process only | New backend would leak connections on shutdown | Added explicit FairScale store shutdown in the API process

## Medium Priority (P2 - Fix Soon After Launch)
- [ ] Automated backfill/cutover tooling is still missing | Moving legacy rows into the durable store still requires an operator runbook | Backfill the current pilot feed during deployment and add a repeatable import script if the feed grows
- [ ] No Postgres integration test coverage yet | SQLite fallback is covered, but live Postgres semantics are only exercised in production | Add a CI job with ephemeral Postgres for the FairScale store

## Low Priority (P3 - Technical Debt)
- [ ] FairScale storage config is feature-specific | If more durable partner feeds appear, storage bootstrapping logic may duplicate | Consolidate service-local durable store bootstrap patterns once another feed needs it

## Security Assessment
The change keeps the existing HMAC ingest and bearer-token read controls intact. No secrets are surfaced in health or logs. The new connection uses TLS in production-style environments unless explicitly disabled.

## Performance Assessment
The FairScale workload is low-write and read-light. Postgres is a better fit than local SQLite for multi-instance durability and concurrent partner access. The existing wallet, partner, and service indexes were preserved for the new backend.

## Observability Assessment
Health now exposes backend state, which closes the biggest blind spot. That is enough for launch verification, but there is still no metric or alert on write failures, pool exhaustion, or backend drift.

## Recommended Architecture Changes
- Keep FairScale on its own durable store instead of piggybacking on the API's local SQLite file
- Back the production service with a dedicated Render Postgres instance and a single scoped env var
- Add a one-shot backfill step during cutover so the existing pilot history lands in Postgres before partner retest

## Test Coverage Gaps
- No Postgres integration test in CI
- No deploy smoke test that asserts `storage.durable === true` after production rollout

## Action Plan
1. Deploy the Postgres-backed store code
2. Provision a dedicated production Postgres instance
3. Set `FUSION_FAIRSCALE_DATABASE_URL` on the API service
4. Redeploy and verify `/api/fusion/fairscale/health` reports `backend=postgres`, `durable=true`
5. Replay the current FairScale pilot feed into the durable store
6. Re-test `/events` and `/reliability` against the pilot wallets
