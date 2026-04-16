# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- `@kamiyo/selfimprove` package now exports `service` module (variant CRUD, leaderboard, Thompson sampling, auto-promotion). Full service API available: `createVariant`, `forkVariant`, `getVariant`, `listActiveVariants`, `getLeaderboard`, `getVariantScores`, `thompsonSample`, `evaluateAndPromote`, `recordTournamentEntry`.

### Changed

- `services/api/src/variants/service.ts` refactored to thin re-export shim. Implementation moved to `@kamiyo/selfimprove/src/service.ts`. Direct database and metrics imports swapped for dependency-injection via `getContext()`. Bootstrap via `services/api/src/variants/bootstrap.ts` wires db, Prometheus counters, and logger on first use; side-effect import maintains backward compatibility with all 31 variant tests unchanged.
- docs-agent workflow now opens pull requests instead of committing directly to main, with labeled branch and automated PR creation.

