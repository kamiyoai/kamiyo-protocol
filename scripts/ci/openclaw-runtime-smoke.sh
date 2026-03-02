#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/packages/kamiyo-openclaw"
OPENCLAW_BIN="${OPENCLAW_BIN:-openclaw}"
OPENCLAW_SMOKE_PORT="${OPENCLAW_SMOKE_PORT:-19091}"
OPENCLAW_SMOKE_TOKEN="${OPENCLAW_SMOKE_TOKEN:-openclaw-smoke-token}"

if ! command -v "$OPENCLAW_BIN" >/dev/null 2>&1; then
  echo "missing OpenClaw CLI: $OPENCLAW_BIN" >&2
  exit 1
fi

if [ ! -f "$PLUGIN_DIR/openclaw.plugin.json" ]; then
  echo "plugin manifest missing: $PLUGIN_DIR/openclaw.plugin.json" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
PLUGIN_LOAD_DIR="$TMP_DIR/kamiyo"
GATEWAY_PID=""

cleanup() {
  if [ -n "$GATEWAY_PID" ] && kill -0 "$GATEWAY_PID" >/dev/null 2>&1; then
    kill "$GATEWAY_PID" >/dev/null 2>&1 || true
    wait "$GATEWAY_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

export OPENCLAW_STATE_DIR="$TMP_DIR/state"
export OPENCLAW_CONFIG_PATH="$TMP_DIR/openclaw.json"
mkdir -p "$OPENCLAW_STATE_DIR"
ln -s "$PLUGIN_DIR" "$PLUGIN_LOAD_DIR"

cat >"$OPENCLAW_CONFIG_PATH" <<EOF
{
  "gateway": {
    "mode": "local",
    "port": $OPENCLAW_SMOKE_PORT,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "$OPENCLAW_SMOKE_TOKEN"
    }
  },
  "plugins": {
    "slots": {
      "memory": "none"
    },
    "load": {
      "paths": [
        "$PLUGIN_LOAD_DIR"
      ]
    },
    "entries": {
      "kamiyo": {
        "enabled": true,
        "config": {
          "rpcUrl": "http://localhost:8899"
        }
      }
    }
  },
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "allow": [
            "kamiyo",
            "kamiyo_oracle_consensus_preview",
            "kamiyo_staked_identity_create"
          ]
        }
      }
    ]
  }
}
EOF

"$OPENCLAW_BIN" plugins list --json >"$TMP_DIR/plugins.json"
node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const plugin = (report.plugins || []).find((p) => p.id === "kamiyo");
if (!plugin) throw new Error("kamiyo plugin missing from plugin registry");
if (plugin.status !== "loaded") throw new Error(`kamiyo plugin is not loaded: ${plugin.status}`);
' "$TMP_DIR/plugins.json"

"$OPENCLAW_BIN" gateway run \
  --allow-unconfigured \
  --bind loopback \
  --port "$OPENCLAW_SMOKE_PORT" \
  --auth token \
  --token "$OPENCLAW_SMOKE_TOKEN" \
  >"$TMP_DIR/gateway.log" 2>&1 &
GATEWAY_PID="$!"

health_url="http://127.0.0.1:${OPENCLAW_SMOKE_PORT}/health"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1; then
  echo "gateway failed to become healthy" >&2
  cat "$TMP_DIR/gateway.log" >&2
  exit 1
fi

invoke_url="http://127.0.0.1:${OPENCLAW_SMOKE_PORT}/tools/invoke"
auth_header="Authorization: Bearer $OPENCLAW_SMOKE_TOKEN"

read_status="$(
  curl -sS \
    --max-time 10 \
    -H "$auth_header" \
    -H "Content-Type: application/json" \
    -X POST "$invoke_url" \
    -d '{"tool":"kamiyo_oracle_consensus_preview","args":{"scores":[90,84,81,10],"maxDeviation":15}}' \
    -o "$TMP_DIR/read.json" \
    -w "%{http_code}"
)"

if [ "$read_status" != "200" ]; then
  echo "unexpected read-tool HTTP status: $read_status" >&2
  cat "$TMP_DIR/read.json" >&2 || true
  cat "$TMP_DIR/gateway.log" >&2
  exit 1
fi

node -e '
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (payload?.ok !== true) throw new Error("read-tool invoke did not return ok=true");
const score = payload?.result?.details?.consensusScore;
if (score !== 84) throw new Error(`unexpected consensus score: ${String(score)}`);
' "$TMP_DIR/read.json"

write_status="$(
  curl -sS \
    --max-time 10 \
    -H "$auth_header" \
    -H "Content-Type: application/json" \
    -X POST "$invoke_url" \
    -d '{"tool":"kamiyo_staked_identity_create","args":{"name":"smoke-agent","agentType":"service","stakeSol":1}}' \
    -o "$TMP_DIR/write.json" \
    -w "%{http_code}"
)"

if [ "$write_status" = "404" ]; then
  echo "write-tool was not found in runtime catalog" >&2
  cat "$TMP_DIR/write.json" >&2 || true
  cat "$TMP_DIR/gateway.log" >&2
  exit 1
fi

if [ "$write_status" != "500" ]; then
  echo "unexpected write-tool HTTP status: $write_status" >&2
  cat "$TMP_DIR/write.json" >&2 || true
  cat "$TMP_DIR/gateway.log" >&2
  exit 1
fi

node -e '
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (payload?.ok !== false) throw new Error("write-tool response should fail without signer");
if ((payload?.error?.type || "") !== "tool_error") {
  throw new Error(`unexpected write-tool error type: ${String(payload?.error?.type)}`);
}
' "$TMP_DIR/write.json"

echo "OpenClaw runtime smoke passed"
