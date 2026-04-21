# Changelog

All notable changes to `@kamiyo/docs-agent` will be documented here.

## [Unreleased]

### Changed

- Migrated the docs agent onto the shared Kamiyo agent runtime with OpenAI-compatible local model defaults.
- Tightened the docs-only tool layer so write access stays limited to `README.md` and `CHANGELOG.md`, with read-only shell inspection commands.

### Added

- Initial scaffold. Runs on merge to main, regenerates README.md and CHANGELOG.md via Claude Agent SDK.
