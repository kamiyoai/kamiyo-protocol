# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
- Self-improvement package (@kamiyo-org/selfimprove) extracted as portable library with complete variant selection, tournament scheduling, and bandit routing. Published to npm registry with install instructions and quickstart guide.
- Routing helpers (maybeRouteVariant, toVariantDecisionMeta, applyGenomeOverrides, recordVariantEntry) moved to @kamiyo-org/selfimprove package.

### Changed
- Self-improvement judge.ts extracted to @kamiyo-org/selfimprove package with multi-provider JudgeLLM adapter interface. scoreOutput() and recordJudgedEntry() now accept optional JudgeLLM implementation for testing and alternative providers. services/api bootstrap wires default Anthropic implementation from ANTHROPIC_API_KEY. Legacy client parameter in scoreOutput() and recordJudgedEntry() wrapped to JudgeLLM adapter for backward compatibility.
- Self-improvement modules (service, tournament, bandit, sweep-worker) extracted to @kamiyo-org/selfimprove package and use dependency injection via getContext(). services/api maintains re-export shims for backward compatibility.
- Production call sites (runtime-support, task-executor, engagement-optimizer, api/routes/variants) now import directly from @kamiyo-org/selfimprove instead of services/api shims.
