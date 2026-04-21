# Changelog

## [Unreleased]

### Changed

- Migrated the marketing agent onto the shared Kamiyo agent runtime with OpenAI-compatible local model defaults.
- Added response parsing validation so only valid, capped post drafts are scheduled.

### Added

- Initial scaffold. Daily cron pulls recent merges, drafts posts via Claude, schedules them in a self-hosted Postiz.
