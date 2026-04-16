# @kamiyo/autopilot

Headless autonomous dev loop. Reads GitHub issues labeled `agent`, drafts a branch + PR via the Claude Agent SDK, runs tests, and lets `autopilot-auto-merge.yml` squash-merge once `agent-approved` is applied and CI is green.

## Runtime

Driven by `.github/workflows/autonomous-dev.yml`:

- Cron every 4 hours (`0 */4 * * *`)
- On any issue gaining the `agent` label
- Manual via `workflow_dispatch` (optionally pass an issue number)

A halt-check job first looks for any open issue labeled `halt-autopilot`. If one exists, the autopilot job is skipped.

## Env / secrets

Set in repo secrets:

| Secret | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude Agent SDK |
| `AUTOPILOT_PAT` | Fine-grained PAT owned by `kamiyo-bot`, scoped to this repo with `contents:write`, `pull-requests:write`, `issues:write`. Falls back to `GITHUB_TOKEN` if unset, but PRs opened by `GITHUB_TOKEN` cannot trigger other workflows, so CI won't run — **set the PAT for real operation**. |

Runtime config (env):

- `CLAUDE_MODEL` (default `claude-opus-4-6`)
- `MAX_TURNS` (default `30`)
- `DAILY_USD_MAX` (default `50`, workflow sets `25`) — hard stop per invocation
- `AGENT_LABEL` / `APPROVED_LABEL` / `HALT_LABEL` / `BOT_LOGIN` — defaults are `agent` / `agent-approved` / `halt-autopilot` / `kamiyo-bot`
- `DRY_RUN=1` — plan only, no writes

## Labels

| Label | Meaning |
| --- | --- |
| `agent` | Issue is queued for the autopilot |
| `agent-approved` | Applied by the PR-review agent (week 3) or a human; eligible for auto-merge |
| `halt-autopilot` | Any open issue with this label disables the autopilot workflow and auto-merge |

## Branch protection (configure manually once on `main`)

- Require pull request before merging
- Require status checks: `ci / build-test` (match existing)
- Require branches to be up to date
- Restrict who can push directly: only repo admins
- Do **not** allow force pushes
- Do **not** allow deletions

With these rules the autopilot PAT cannot bypass CI. Auto-merge only squashes when GitHub reports `mergeable_state === "clean"`, which means all required checks passed.

## Seed issues (week 1 dogfood)

Open each of these labeled `agent` to verify the loop end-to-end. Start with trivial ones.

1. **Add `LICENSE` header to every `packages/kamiyo-autopilot/src/*.ts` file** — one-line check.
2. **Fix typos in `README.md`** — cheap, visible.
3. **Add `pnpm run lint` stub to `services/kamiyo-autopilot/package.json` that runs `tsc --noEmit`** — slightly structural.
4. **Add a `services/kamiyo-autopilot/CHANGELOG.md` with initial `0.1.0` entry** — docs.
5. **Replace hardcoded default model string with a shared constant** — small refactor.

After each merges cleanly, retire the issue. If any fails, inspect the PR + comment, tighten the system prompt in `src/agent.ts`, retry.

## Kill switch

If the autopilot misbehaves:

1. Open an issue titled `halt-autopilot` and apply the `halt-autopilot` label. Both workflows short-circuit on the next run.
2. Revoke `AUTOPILOT_PAT` in GitHub settings for immediate hard-stop.
3. Revert bad merges with `git revert` — never force-push `main`.

## Cost

Per-invocation cap via `DAILY_USD_MAX` (currently $25). Set Anthropic org-level spend cap separately. Expected steady-state: $5–15 per completed PR on Opus 4.6, cheaper with prompt caching (week 4).

## Local testing

```bash
cd services/kamiyo-autopilot
pnpm install --ignore-workspace
export ANTHROPIC_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...
export GITHUB_REPO=your-org/kamiyo-protocol
export DRY_RUN=1
pnpm dev                 # picks next agent-labeled issue
pnpm run:issue -- 42     # runs on a specific issue
```
