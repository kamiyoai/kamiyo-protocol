# @kamiyo/docs-agent

Headless docs maintainer. Runs on merge to `main` and regenerates `README.md` + `CHANGELOG.md` via the shared Kamiyo agent runtime using an OpenAI-compatible local LLM endpoint by default.

## Run locally

```bash
cp .env.example .env
# adjust LLM settings if needed
pnpm install
pnpm test
pnpm --filter @kamiyo/docs-agent dev
```

## How it runs in CI

Triggered by `push: branches: [main]` via `.github/workflows/docs-agent.yml`. The workflow builds the shared agent runtime, runs the docs agent, and opens a PR if docs changed.

## Config

| var | default | purpose |
| --- | --- | --- |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | `ollama` | API key sent to the endpoint |
| `GITHUB_REPO` | — | `owner/repo` |
| `CLAUDE_MODEL` | `hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M` | model id |
| `MAX_TURNS` | 20 | agent turn cap |
| `DAILY_USD_MAX` | 0 | informational run cost cap |
| `MERGE_SHA` | `HEAD` | commit to inspect |
| `DRY_RUN` | — | set to `1` for plan-only |
