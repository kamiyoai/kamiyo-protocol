#!/usr/bin/env bash
set -euo pipefail

if [ -z "${HOME:-}" ]; then
  HOME="$(getent passwd "$(id -u)" | cut -d: -f6)"
  export HOME
fi

WORKSPACE="$HOME/.openclaw/workspace"
RUNTIME_DIR="$WORKSPACE/runtime"
STATE_DIR="$RUNTIME_DIR/state"
TOOLS_DIR="$RUNTIME_DIR/tools"
RECEIPTS_DIR="$RUNTIME_DIR/receipts"

mkdir -p "$WORKSPACE" "$RUNTIME_DIR" "$STATE_DIR" "$TOOLS_DIR" "$RECEIPTS_DIR"
chmod 700 "$WORKSPACE" "$RUNTIME_DIR" "$STATE_DIR" "$TOOLS_DIR" "$RECEIPTS_DIR"

create_if_missing() {
  local path="$1"
  local content="$2"
  if [ -f "$path" ]; then
    chmod 600 "$path"
    return
  fi
  printf '%s\n' "$content" > "$path"
  chmod 600 "$path"
}

create_if_missing "$WORKSPACE/MISSION_STATEMENT.md" \
"# Mission Statement

One autonomous AI organization that compounds value 24/7 and routes net SOL to the KAMIYO staking path."

create_if_missing "$WORKSPACE/USER_PROFILE.md" \
"# User Profile

- Name: Mizuki Hayashi
- Role: founder/operator
- Interests:
- Career Focus:
- Non-Negotiables:"

create_if_missing "$WORKSPACE/GOALS.md" \
"# Goals

## 90-Day

- 

## 12-Month

- "

create_if_missing "$WORKSPACE/AMBITIONS.md" \
"# Ambitions

- "

create_if_missing "$WORKSPACE/WORKING-MEMORY.md" \
"# Working Memory

## Current Focus

- 

## Active Blockers

- 

## Next Tick Priorities

- "

create_if_missing "$TOOLS_DIR/tool-registry.json" \
"{
  \"version\": 1,
  \"tools\": [
    {\"id\":\"openclaw_cli\",\"kind\":\"command\",\"target\":\"openclaw\",\"critical\":true},
    {\"id\":\"jq_cli\",\"kind\":\"command\",\"target\":\"jq\",\"critical\":true},
    {\"id\":\"python3_cli\",\"kind\":\"command\",\"target\":\"python3\",\"critical\":true},
    {\"id\":\"openclaw_gateway\",\"kind\":\"command\",\"target\":\"openclaw gateway health --json\",\"critical\":true}
  ]
}"

create_if_missing "$RECEIPTS_DIR/execution-receipts.jsonl" ""
create_if_missing "$STATE_DIR/nightly-mission-state.json" "{\"lastRunDate\":null}"

echo "Context pack installed at $WORKSPACE"
