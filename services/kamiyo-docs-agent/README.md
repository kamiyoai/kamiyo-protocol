# @kamiyo/docs-agent

Headless docs maintainer. Runs on merge to `main` and regenerates `README.md` + `CHANGELOG.md` via the shared Kamiyo agent runtime using an OpenAI-compatible local LLM endpoint by default, with SQLite-backed self-improve enabled for docs variants.

## Run locally

```bash
cp .env.example .env
# adjust LLM settings if needed
pnpm install
pnpm test
pnpm --filter @kamiyo/docs-agent dev
```

## How it runs in CI

Triggered by `push: branches: [main]` via `.github/workflows/docs-agent.yml`. The workflow builds the shared agent runtime, runs the docs agent with its SQLite-backed self-improve path on Node 20, and opens a PR if docs changed.

## Config

| var | default | purpose |
| --- | --- | --- |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | `ollama` | API key sent to the endpoint |
| `GITHUB_REPO` | — | `owner/repo` |
| `CLAUDE_MODEL` | `hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M` | model id |
| `DOCS_AGENT_DB_PATH` | `.docs-agent/agent.db` | SQLite path for variant memory and scoring |
| `MAX_TURNS` | 20 | agent turn cap |
| `DAILY_USD_MAX` | 0 | informational run cost cap |
| `SELF_IMPROVE_ENABLED` | `true` | turn on DB-backed variant routing and scoring |
| `SELF_IMPROVE_TASK_TYPE` | `docs_regeneration` | variant task bucket |
| `SELF_IMPROVE_JUDGE_MODEL` | `hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M` | rubric judge model id |
| `SELF_IMPROVE_MIN_SAMPLES` | 5 | promotion sample floor |
| `SELF_IMPROVE_P_THRESHOLD` | 0.1 | promotion significance threshold |
| `MERGE_SHA` | `HEAD` | commit to inspect |
| `DRY_RUN` | — | set to `1` for plan-only |
