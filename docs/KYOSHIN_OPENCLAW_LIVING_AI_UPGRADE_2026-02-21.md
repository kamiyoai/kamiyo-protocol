# Kyoshin OpenClaw Living-AI Upgrade (2026-02-21)

## Why this upgrade

This upgrade applies five hard requirements for a real 24/7 agent runtime:

1. brain dump must exist and stay complete.
2. tool connectivity must be measurable and enforced.
3. mission control must exist as a live execution hub.
4. one mission statement must anchor every cycle.
5. proactive behavior must run on schedule without manual prompting.
6. every mistake must become a durable rule in `.learnings/LEARNINGS.md`.

It also adds a ClawWork-style subagent policy: `work / earn / or die`.

## External references used

- GEPA skill optimization for coding agents:
  - [https://gepa-ai.github.io/gepa/blog/2026/02/18/automatically-learning-skills-for-coding-agents/](https://gepa-ai.github.io/gepa/blog/2026/02/18/automatically-learning-skills-for-coding-agents/)
- ClawHub:
  - [https://github.com/openclaw/clawhub](https://github.com/openclaw/clawhub)
  - [https://clawhub.ai/skills?sort=downloads](https://clawhub.ai/skills?sort=downloads)
- OpenClaw Trust architecture:
  - [https://trust.openclaw.ai/](https://trust.openclaw.ai/)
- ClawWork benchmark:
  - [https://github.com/HKUDS/ClawWork](https://github.com/HKUDS/ClawWork)

## What was implemented in repo

Runtime scripts added in `ops/openclaw`:

- `kyoshin-context-guard.py`
  - enforces required context files (`MISSION_STATEMENT.md`, `USER_PROFILE.md`, `GOALS.md`, `AMBITIONS.md`, `TOOLS.md`, `WORKING-MEMORY.md`)
  - writes context completeness report to `runtime/state/context-guard.json`
- `kyoshin-tool-health.py`
  - checks tool registry from `runtime/tools/tool-registry.json`
  - blocks healthy status when critical tools fail
  - writes output to `runtime/tools/tool-health.json`
- `kyoshin-swarm-governor.py`
  - applies performance policy from `runtime/receipts/execution-receipts.jsonl`
  - auto-pauses weak agents and boosts strong agents
  - writes summary to `runtime/state/swarm-governor.json`
- `kyoshin-mission-control.py`
  - generates live mission-control board/backlog from queue + tool health + governor state
  - writes to `runtime/mission-control/board.json` and `runtime/mission-control/backlog.json`
- `kyoshin-artifact-contracts.py`
  - validates runtime JSON contracts for feed/queue/tools/mission-control/runtime-state artifacts
  - writes contract report to `runtime/state/runtime-artifact-contracts.json`
- `install-context-pack.sh`
  - scaffolds the required mission/profile/goals/memory/tool-registry baseline files
  - now also scaffolds `soul.md`, `identity.md`, `heartbeat.md`, and `.learnings/LEARNINGS.md`
- `kyoshin-learnings.py`
  - reads cycle status + loop error signatures
  - appends normalized mistake/correction/rule entries into `.learnings/LEARNINGS.md`
  - deduplicates repeated failures using signature state in `runtime/state/learnings-state.json`

Runtime loop integration updated in:

- `ops/openclaw/kyoshin-autonomy-loop.sh`

New behavior in every tick:

1. feed sync
2. gateway health
3. context guard
4. tool health
5. marketplace intake
6. swarm governor (`work/earn/die`)
7. swarm planner
8. mission-control board generation
9. runtime artifact contract validation
10. heartbeat agent decision turn
11. nightly proactive run at `KYO_PROACTIVE_HOUR_UTC` (default `02:00 UTC`, once/day)
12. learnings flywheel run (`kyoshin-learnings.py`) to convert degraded ticks into durable rules

Cycle status is `degraded` if any required guard fails.

Docs updated:

- `ops/openclaw/README.md`

## Required deployment update on droplet

Install updated scripts and restart timer:

```bash
cd ~/local/kamiyo-protocol/ops/openclaw
sudo install -m 700 -o openclaw -g openclaw kyoshin-marketplace-intake.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-swarm-planner.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-sync-feed-config.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-context-guard.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-tool-health.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-swarm-governor.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-mission-control.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-artifact-contracts.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-learnings.py ~/bin/
sudo install -m 700 -o openclaw -g openclaw install-context-pack.sh ~/bin/
sudo install -m 700 -o openclaw -g openclaw kyoshin-autonomy-loop.sh ~/bin/
sudo -u openclaw -H bash -lc '~/bin/install-context-pack.sh'
sudo systemctl restart kyoshin-autonomy-loop.timer
sudo systemctl start kyoshin-autonomy-loop.service
```

## Definition of done for this upgrade

- context report shows `ok=true` with no required missing files.
- tool health shows zero critical failures.
- mission-control board and backlog update every cycle.
- nightly proactive run appears exactly once per UTC day.
- swarm governor updates registry statuses/priorities from receipt evidence.
- autonomy log includes `context`, `toolHealth`, `governor`, `missionControl`, `artifactContracts`, `learning`, and `proactive` objects.
- `.learnings/LEARNINGS.md` grows only with unique failure signatures and includes actionable prevention rules.

## Hard truth

This still does not prove earned revenue by itself.
It proves autonomy control quality.
Revenue proof still depends on live paid rails, valid credentials, and execution receipts containing real net SOL outcomes.
