# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
- @kamiyo-org/selfimprove 1.0.0: shadow mode and replay harness. `shadowRun()` executes N candidate variants in parallel with primary on same input with bounded concurrency, persists to shadow_runs table, and scores candidates without user exposure. `getShadowStats()` aggregates results by variant. `replayVariant()` re-runs a target variant against historical inputs from shadow_runs and rescores. `rescoreShadowRuns()` re-judges existing (input, output) pairs after rubric changes with before/after delta reporting.
- @kamiyo-org/selfimprove 1.0.0: canary rollout module with gradual traffic shifting, auto-rollback on regression, and ramp stepper. `startCanary()`, `stepCanary()`, `pickCanaryArm()` manage traffic split from 10% → 25% → 50% → 100% with configurable regression threshold. CLI: `kamiyo-si canary start/status/step/ramp/promote/rollback` subcommands. New `canary_rollouts` schema table with unique active index per task type.
- @kamiyo-org/selfimprove 1.0.0: multi-provider judge adapters — zero-dependency wrappers for Anthropic, OpenAI, and Gemini SDKs, plus generic chat interface for custom gateways. Imported clients require no additional dependencies; adapters export `anthropicJudge()`, `openaiJudge()`, `geminiJudge()`, and `genericChatJudge()`.
- @kamiyo-org/selfimprove: CLI `kamiyo-si shadow stats --task <t>` subcommand to inspect shadow run aggregate metrics.
- @kamiyo-org/selfimprove 0.3.0: pairwise preference evaluation. `comparePair` performs A/B selection via LLM-as-judge against existing rubric with sha256-cached results in `pairwise_cache`. `recordPairwiseMatch` logs matches in `pairwise_matches` with online Elo updates (k=32 default, stored in `elo_rating` column on `agent_variants`). `fitBradleyTerry` fits batch MLE skill estimates for calibrated leaderboards with unit-mean normalization and tie handling as half-wins.
- @kamiyo-org/selfimprove 0.2.0: applySchema(db) executes bundled SQLite DDL (7 tables + indexes) for package consumers. SCHEMA_SQL export and sql/schema.sql raw file available for non-TS users, eliminating need to copy migrations manually.
- Marketing Agent service: daily cron that pulls recent commits from GitHub, drafts posts with Claude, and schedules them via Postiz. Includes daily workflow and full configuration support.

### Changed
- Self-improvement judge.ts extracted to @kamiyo/selfimprove package with multi-provider JudgeLLM adapter interface. scoreOutput() and recordJudgedEntry() now accept optional JudgeLLM implementation for testing and alternative providers. services/api bootstrap wires default Anthropic implementation from ANTHROPIC_API_KEY. Legacy client parameter in scoreOutput() and recordJudgedEntry() wrapped to JudgeLLM adapter for backward compatibility.
- Self-improvement modules extracted to @kamiyo/selfimprove package: tournament, bandit, sweep-worker, and service modules now use dependency injection via getContext(). services/api maintains re-export shims for backward compatibility.

### Status
- @kamiyo-org/selfimprove 1.0.0 API freeze. Public interfaces stable; schema migrations are additive.
