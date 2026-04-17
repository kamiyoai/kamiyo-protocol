# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Breaking
- @kamiyo-org/selfimprove 1.1.0: `createVariant()` now returns `{ variant: AgentVariant, created: boolean }` instead of bare `AgentVariant`. Update call sites: `createVariant(...)` → `createVariant(...).variant` (or destructure `const { variant, created } = createVariant(...)`).

### Added
- @kamiyo-org/selfimprove 1.1.0: `recordScore({ variantId, qualityScore, cost?, latencyMs? })` convenience wrapper — auto-resolves standing tournament, no manual tournament wiring needed.
- @kamiyo-org/selfimprove 1.1.0: CLI `--json` flag on leaderboard, sweep, variants, tasks, canary commands for scripting.
- @kamiyo-org/selfimprove 1.1.0: dashboard canary rollout section (active status + history table).
- @kamiyo-org/selfimprove 1.1.0: integration tests for service.ts (createVariant, recordScore, evaluateAndPromote edge cases) and schema migration guard.

### Fixed
- @kamiyo-org/selfimprove 1.1.0: `evaluateAndPromote` cold-start baseline now picks lowest-scoring variant with ≥minSamples (was picking arbitrary last element). Reason messages distinguish "insufficient samples" from "no candidate beats baseline".
- @kamiyo-org/selfimprove 1.1.0: `applySchema` partial unique indexes wrapped in try/catch — dirty DBs with >1 promoted variant per task no longer crash on migration.
- @kamiyo-org/selfimprove 1.1.0: `rescoreShadowRuns` falls back to task-wide cache delete when no rubric found for variant.
- @kamiyo-org/selfimprove 1.1.0: `listTaskTypes` now unions `agent_variants` with `task_rubrics` so rubric-only task types appear.
- kamiyo-autopilot: comprehensive vitest suite for pickModel function covering label→tier resolution with 13 test cases: no labels, agent:haiku/sonnet/opus resolution, case-insensitive parsing, unknown label fallback, and multiple label scenarios.
- @kamiyo-org/selfimprove 0.3.0: pairwise preference evaluation. `comparePair` performs A/B selection via LLM-as-judge against existing rubric with sha256-cached results in `pairwise_cache`. `recordPairwiseMatch` logs matches in `pairwise_matches` with online Elo updates (k=32 default, stored in `elo_rating` column on `agent_variants`). `fitBradleyTerry` fits batch MLE skill estimates for calibrated leaderboards with unit-mean normalization and tie handling as half-wins.
- @kamiyo-org/selfimprove 0.2.0: applySchema(db) executes bundled SQLite DDL (7 tables + indexes) for package consumers. SCHEMA_SQL export and sql/schema.sql raw file available for non-TS users, eliminating need to copy migrations manually.
- Marketing Agent service: daily cron that pulls recent commits from GitHub, drafts posts with Claude, and schedules them via Postiz. Includes daily workflow and full configuration support.

### Changed
- Self-improvement judge.ts extracted to @kamiyo/selfimprove package with multi-provider JudgeLLM adapter interface. scoreOutput() and recordJudgedEntry() now accept optional JudgeLLM implementation for testing and alternative providers. services/api bootstrap wires default Anthropic implementation from ANTHROPIC_API_KEY. Legacy client parameter in scoreOutput() and recordJudgedEntry() wrapped to JudgeLLM adapter for backward compatibility.
- Self-improvement modules extracted to @kamiyo/selfimprove package: tournament, bandit, sweep-worker, and service modules now use dependency injection via getContext(). services/api maintains re-export shims for backward compatibility.
