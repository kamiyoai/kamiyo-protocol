#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-https://kamiyo-protocol-4c70.onrender.com}"
KEYPAIR_PATH="${KEYPAIR_PATH:-${SOLANA_KEYPAIR:-$HOME/.config/solana/id.json}}"

# Modes:
# - test: uses /fund-test (requires ENABLE_TEST_FUNDING=1 on the API service)
# - free: no funding, no planner call, no model calls (budgets are 0)
MODE="${MODE:-test}"
STREAM="${STREAM:-1}"
CLEANUP="${CLEANUP:-1}"

FUND_AMOUNT="${FUND_AMOUNT:-5}"
MAX_PARALLEL="${MAX_PARALLEL:-3}"
IDEMPOTENCY_KEY="${IDEMPOTENCY_KEY:-smoke-true-swarm-$(date +%s)}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

need curl
need jq
need node
need solana

tmp_dir="$(mktemp -d)"
cleanup_tmp() { rm -rf "$tmp_dir"; }
trap cleanup_tmp EXIT

wallet="$(solana address --keypair "$KEYPAIR_PATH")"

curl -fsSL "${API_URL}/api/auth/challenge?wallet=${wallet}" > "${tmp_dir}/challenge.json"
challenge="$(jq -r '.challenge' "${tmp_dir}/challenge.json")"

if [[ -z "$challenge" || "$challenge" == "null" ]]; then
  echo "challenge missing or invalid" >&2
  cat "${tmp_dir}/challenge.json" >&2 || true
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

sig="$(
  cd "${root_dir}/services/api"
  KEYPAIR_PATH="$KEYPAIR_PATH" CHALLENGE="$challenge" node - <<'NODE'
const fs = require('fs');
const nacl = require('tweetnacl');
const bs58mod = require('bs58');

const bs58 = bs58mod && bs58mod.default ? bs58mod.default : bs58mod;
if (!bs58 || typeof bs58.encode !== 'function') throw new Error('bs58.encode unavailable');

const keypairPath = process.env.KEYPAIR_PATH;
const challenge = process.env.CHALLENGE;
if (!keypairPath || !challenge) throw new Error('missing KEYPAIR_PATH/CHALLENGE');

const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')));
if (secretKey.length !== 64) throw new Error(`unexpected secret key length: ${secretKey.length}`);

const msg = new TextEncoder().encode(challenge);
const sig = nacl.sign.detached(msg, secretKey);
process.stdout.write(bs58.encode(sig));
NODE
)"

curl -fsSL -X POST "${API_URL}/api/auth/wallet" \
  -H 'Content-Type: application/json' \
  -d "{\"wallet\":\"${wallet}\",\"signature\":\"${sig}\"}" \
  > "${tmp_dir}/auth.json"

token="$(jq -r '.token' "${tmp_dir}/auth.json")"
if [[ -z "$token" || "$token" == "null" ]]; then
  echo "wallet auth failed" >&2
  cat "${tmp_dir}/auth.json" >&2 || true
  exit 1
fi

if [[ "$MODE" == "free" ]]; then
  team_payload='{
    "name":"swarm-smoke-free",
    "currency":"USDC",
    "dailyLimit":1,
    "members":[
      {"agentId":"agent-a","role":"noop","drawLimit":0},
      {"agentId":"agent-b","role":"noop","drawLimit":0}
    ]
  }'
else
  team_payload='{
    "name":"swarm-smoke",
    "currency":"USDC",
    "dailyLimit":10,
    "members":[
      {"agentId":"agent-alpha","role":"research","drawLimit":0.3},
      {"agentId":"agent-beta","role":"analysis","drawLimit":0.3},
      {"agentId":"agent-gamma","role":"write","drawLimit":0.3}
    ]
  }'
fi

curl -fsSL -X POST "${API_URL}/api/hive-teams" \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json' \
  -d "$team_payload" \
  > "${tmp_dir}/team.json"

team_id="$(jq -r '.id' "${tmp_dir}/team.json")"
if [[ -z "$team_id" || "$team_id" == "null" ]]; then
  echo "team creation failed" >&2
  cat "${tmp_dir}/team.json" >&2 || true
  exit 1
fi

run_payload=''

if [[ "$MODE" == "free" ]]; then
  mem1="$(jq -r '.members[0].id' "${tmp_dir}/team.json")"
  mem2="$(jq -r '.members[1].id' "${tmp_dir}/team.json")"

  mission="Hive swarm free smoke: validate DAG scheduling + persistence + Kiroku without spending budget."
  run_payload="$(jq -n \
    --arg mission "$mission" \
    --arg mem1 "$mem1" \
    --arg mem2 "$mem2" \
    '{
      mission: $mission,
      maxParallel: 2,
      failFast: true,
      plan: {
        mode: "dag",
        nodes: [
          {id:"work_1", memberId:$mem1, description:"noop", budget:0, dependsOn:[]},
          {id:"final",  memberId:$mem2, description:"noop", budget:0, dependsOn:["work_1"]}
        ]
      }
    }')"
else
  fund_http="$(curl -sS -w '\n%{http_code}' -X POST "${API_URL}/api/hive-teams/${team_id}/fund-test" \
    -H "Authorization: Bearer ${token}" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":${FUND_AMOUNT}}")"

  fund_code="$(printf '%s' "$fund_http" | tail -n 1)"
  fund_body="$(printf '%s' "$fund_http" | sed '$d')"

  if [[ "$fund_code" != "200" ]]; then
    echo "fund-test failed (http ${fund_code})" >&2
    echo "$fund_body" >&2
    if [[ "$fund_code" == "404" ]]; then
      echo "hint: set ENABLE_TEST_FUNDING=1 on the API service, or run MODE=free" >&2
    fi
    exit 1
  fi

  mission="Create a concise internal checklist to ship Hive True Swarm (DAG planning + bounded parallel execution + budgets + Kiroku receipt). Keep it under 200 words."
  run_payload="$(jq -n --arg mission "$mission" --argjson maxParallel "$MAX_PARALLEL" --argjson failFast true '{mission:$mission,maxParallel:$maxParallel,failFast:$failFast}')"
fi

run_http="$(curl -sS -w '\n%{http_code}' -X POST "${API_URL}/api/hive-teams/${team_id}/swarm/run" \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d "${run_payload}")"

run_code="$(printf '%s' "$run_http" | tail -n 1)"
run_body="$(printf '%s' "$run_http" | sed '$d')"

if [[ "$run_code" != "200" ]]; then
  echo "swarm run failed (http ${run_code})" >&2
  echo "$run_body" >&2
  exit 1
fi

echo "$run_body" > "${tmp_dir}/run.json"

run_status="$(jq -r '.status' "${tmp_dir}/run.json")"
run_id="$(jq -r '.runId // .id' "${tmp_dir}/run.json")"
kiroku_url="$(jq -r '.kiroku.url // empty' "${tmp_dir}/run.json")"

if [[ "$run_status" != "completed" ]]; then
  echo "swarm run did not complete (status=${run_status})" >&2
  jq '.' "${tmp_dir}/run.json" >&2 || true
  exit 1
fi

if [[ -z "$kiroku_url" ]]; then
  echo "missing kiroku.url in run response" >&2
  jq '.' "${tmp_dir}/run.json" >&2 || true
  exit 1
fi

kiroku_code="$(curl -s -o /dev/null -w '%{http_code}' "$kiroku_url")"
if [[ "$kiroku_code" != "200" ]]; then
  echo "kiroku receipt did not load (http ${kiroku_code})" >&2
  echo "$kiroku_url" >&2
  exit 1
fi

if [[ "$STREAM" != "0" ]]; then
  curl -sN -H "Authorization: Bearer ${token}" "${API_URL}/api/hive-teams/${team_id}/swarm/runs/${run_id}/stream" | head -n 10 > "${tmp_dir}/stream.txt" || true
  if ! grep -Eq '^event: (update|done)$' "${tmp_dir}/stream.txt"; then
    echo "stream endpoint did not emit expected events" >&2
    cat "${tmp_dir}/stream.txt" >&2 || true
    exit 1
  fi
fi

if [[ "$CLEANUP" != "0" ]]; then
  del_http="$(curl -sS -w '\n%{http_code}' -X DELETE "${API_URL}/api/hive-teams/${team_id}" -H "Authorization: Bearer ${token}")"
  del_code="$(printf '%s' "$del_http" | tail -n 1)"
  del_body="$(printf '%s' "$del_http" | sed '$d')"

  if [[ "$del_code" != "200" ]]; then
    echo "cleanup failed (http ${del_code})" >&2
    echo "$del_body" >&2
    exit 1
  fi
fi

echo "ok"
echo "mode=${MODE}"
echo "runId=${run_id}"
echo "kiroku=${kiroku_url}"
