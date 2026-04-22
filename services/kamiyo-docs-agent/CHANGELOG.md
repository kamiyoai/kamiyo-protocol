# Changelog

All notable changes to `@kamiyo/docs-agent` will be documented here.

## [Unreleased]

### Changed

- Migrated the docs agent onto the shared Kamiyo agent runtime with OpenAI-compatible local model defaults.
- Tightened the docs-only tool layer so write access stays limited to `README.md` and `CHANGELOG.md`, with read-only shell inspection commands.
- Enabled SQLite-backed self-improve for docs regeneration, with seeded variants, a docs-specific rubric, and shared outcome scoring persisted into the variant system.
- Added delayed reconciliation for docs follow-up PRs so merged, closed, or missing docs PRs feed a second-stage score back into self-improve.
- Updated the workflow so docs-agent commits still skip regeneration, but the reconciliation pass can continue running on later pushes.

### Added

- Initial scaffold. Runs on merge to main, regenerates README.md and CHANGELOG.md via Claude Agent SDK.
