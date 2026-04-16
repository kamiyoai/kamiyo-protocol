# @kamiyo/docs-agent

Headless docs maintainer. Runs on merge to `main` and regenerates `README.md` + `CHANGELOG.md` via Claude Agent SDK.

## Run locally

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY
pnpm install
pnpm --filter @kamiyo/docs-agent dev
```

## How it runs in CI

Triggered by `push: branches: [main]` via `.github/workflows/docs-agent.yml`. Agent edits `README.md` / `CHANGELOG.md`; the workflow commits the result as `kamiyobot` if anything changed.

## Config

| var | default | purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | required |
| `GITHUB_REPO` | — | `owner/repo` |
| `CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | model id |
| `MAX_TURNS` | 20 | agent turn cap |
| `DAILY_USD_MAX` | 5 | cost cap per run |
| `MERGE_SHA` | `HEAD` | commit to inspect |
| `DRY_RUN` | — | set to `1` for plan-only |
