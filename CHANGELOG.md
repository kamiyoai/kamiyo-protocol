# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed
- @kamiyo-org/selfimprove 1.0.1: harden canary deployment against race conditions and constraint violations. Wrap startCanary, promoteCanary, and rollbackCanary in database transactions. Add partial UNIQUE index on agent_variants(task_type) WHERE status='promoted' to enforce single promoted baseline. Add compound index on variant_tournament_entries(variant_id, created_at) for efficient time-range queries. Map UNIQUE constraint errors in startCanary to user-friendly message. Guard status transitions in promoteCanary with re-read inside transaction. Archive canary on 'active' OR 'promoted' status in rollbackCanary and record priorStatus in event. Scope judge_cache DELETE to rescored rows when variantId supplied in rescoreShadowRuns. Wrap shadow-run persist loop in transaction.

### Added
- kamiyo-autopilot: comprehensive vitest suite for pickModel function covering label→tier resolution with 13 test cases: no labels, agent:haiku/sonnet/opus resolution, case-insensitive parsing, unknown label fallback, and multiple label scenarios.
- @kamiyo-org/selfimprove 0.3.0: pairwise preference evaluation. `comparePair` performs A/B selection via LLM-as-judge against existing rubric with sha256-cached results in `pairwise_cache`. `recordPairwiseMatch` logs matches in `pairwise_matches` with online Elo updates (k=32 default, stored in `elo_rating` column on `agent_variants`). `fitBradleyTerry` fits batch MLE skill estimates for calibrated leaderboards with unit-mean normalization and tie handling as half-wins.
- @kamiyo-org/selfimprove 0.2.0: applySchema(db) executes bundled SQLite DDL (7 tables + indexes) for package consumers. SCHEMA_SQL export and sql/schema.sql raw file available for non-TS users, eliminating need to copy migrations manually.
- Marketing Agent service: daily cron that pulls recent commits from GitHub, drafts posts with Claude, and schedules them via Postiz. Includes daily workflow and full configuration support.

### Changed
- Self-improvement judge.ts extracted to @kamiyo/selfimprove package with multi-provider JudgeLLM adapter interface. scoreOutput() and recordJudgedEntry() now accept optional JudgeLLM implementation for testing and alternative providers. services/api bootstrap wires default Anthropic implementation from ANTHROPIC_API_KEY. Legacy client parameter in scoreOutput() and recordJudgedEntry() wrapped to JudgeLLM adapter for backward compatibility.
- Self-improvement modules extracted to @kamiyo/selfimprove package: tournament, bandit, sweep-worker, and service modules now use dependency injection via getContext(). services/api maintains re-export shims for backward compatibility.
