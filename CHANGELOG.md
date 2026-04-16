# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
- @kamiyo-org/selfimprove 0.6.0: cold-start seeding, CLI, dashboard, and Pareto frontier.
  - `seedFromPrompts` / `offlineEval` / `coldStartRank`: seed new task types from prompt candidates, validate with judge before exposing to live traffic. Eval runs persist in `coldstart_evals` table for audit.
  - `kamiyo-si` CLI: init, rubric set/get, variants list/lineage, leaderboard, sweep run, tasks list. Resolves better-sqlite3 from cwd so global install works.
  - `startDashboard({port, host})` and `kamiyo-si dashboard --port 4100`: local read-only web UI over SQLite DB. SSR HTML pages for task overview, leaderboard, genome details, lineage, and proposal history. Zero external deps, no build step.
  - `getParetoFrontier(taskType)` / `getAllWithDomination`: multi-objective optimization across quality/cost/latency aggregated from variant tournament entries.
  - `tweet_reply` benchmark example: drop-in harness with 50 inputs, 3-axis rubric (tone/relevance/brevity), baseline + 3 rounds auto-mutation, lift reporting. ~$3-5 per run via Claude Haiku.
- @kamiyo-org/selfimprove 0.3.0: pairwise preference evaluation. `comparePair` performs A/B selection via LLM-as-judge against existing rubric with sha256-cached results in `pairwise_cache`. `recordPairwiseMatch` logs matches in `pairwise_matches` with online Elo updates (k=32 default, stored in `elo_rating` column on `agent_variants`). `fitBradleyTerry` fits batch MLE skill estimates for calibrated leaderboards with unit-mean normalization and tie handling as half-wins.
- @kamiyo-org/selfimprove 0.2.0: applySchema(db) executes bundled SQLite DDL (7 tables + indexes) for package consumers. SCHEMA_SQL export and sql/schema.sql raw file available for non-TS users, eliminating need to copy migrations manually.
- Marketing Agent service: daily cron that pulls recent commits from GitHub, drafts posts with Claude, and schedules them via Postiz. Includes daily workflow and full configuration support.

### Changed
- Self-improvement judge.ts extracted to @kamiyo/selfimprove package with multi-provider JudgeLLM adapter interface. scoreOutput() and recordJudgedEntry() now accept optional JudgeLLM implementation for testing and alternative providers. services/api bootstrap wires default Anthropic implementation from ANTHROPIC_API_KEY. Legacy client parameter in scoreOutput() and recordJudgedEntry() wrapped to JudgeLLM adapter for backward compatibility.
- Self-improvement modules extracted to @kamiyo/selfimprove package: tournament, bandit, sweep-worker, and service modules now use dependency injection via getContext(). services/api maintains re-export shims for backward compatibility.
