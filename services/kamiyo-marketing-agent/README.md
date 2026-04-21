# @kamiyo/marketing-agent

Daily cron. Pulls recent merges from GitHub, drafts short posts with the shared Kamiyo agent runtime against an OpenAI-compatible local LLM endpoint by default, then schedules them via the self-hosted Postiz API.

## Flow

1. Fetch last 15 commits from `${GITHUB_REPO}`.
2. The marketing agent drafts up to `POSTS_PER_DAY` posts. Skips chores and trivial commits.
3. Each post is scheduled into Postiz, spaced across a 12-hour window starting 15 min from now.

## Run locally

```bash
cp .env.example .env
# fill secrets
pnpm install
pnpm test
pnpm --filter @kamiyo/marketing-agent dev
```

Set `DRY_RUN=1` to log intended posts without hitting Postiz.

## Config

| var | default | purpose |
| --- | --- | --- |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | `ollama` | API key sent to the endpoint |
| `GITHUB_REPO` | — | `owner/repo` |
| `GITHUB_TOKEN` | — | read access to commits |
| `POSTIZ_URL` | — | e.g. `http://localhost:5000/api` |
| `POSTIZ_API_KEY` | — | issued via Postiz UI |
| `POSTIZ_INTEGRATIONS` | — | comma-separated integration IDs from Postiz |
| `CLAUDE_MODEL` | `hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M` | |
| `MAX_TURNS` | 25 | |
| `DAILY_USD_MAX` | 0 | informational run cost cap |
| `POSTS_PER_DAY` | 2 | cap on drafts per run |
| `DRY_RUN` | — | `1` = no network writes |

## CI

`.github/workflows/marketing-agent.yml` runs daily at 09:00 UTC, builds the shared agent runtime, and then runs the marketing agent.
