#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.e2e.yml"
SERVICE_LOG="${SCRIPT_DIR}/fault-injection.service.log"

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54329/trust_layer"
DATABASE_URL_CONTAINER="postgresql://postgres:postgres@postgres:5432/trust_layer"
BIND_ADDR="127.0.0.1:18095"
TOPIC="kamiyo.trust.events"
API_KEY="e2e-test-key"

SERVICE_PID=""

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "missing required command: ${cmd}" >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "${SERVICE_PID}" ]] && kill -0 "${SERVICE_PID}" >/dev/null 2>&1; then
    kill "${SERVICE_PID}" >/dev/null 2>&1 || true
    pkill -P "${SERVICE_PID}" >/dev/null 2>&1 || true
    wait "${SERVICE_PID}" >/dev/null 2>&1 || true
  fi
  compose down -v >/dev/null 2>&1 || true
}

trap cleanup EXIT

wait_for_redpanda() {
  compose exec -T redpanda sh -lc 'until rpk cluster info >/dev/null 2>&1; do sleep 0.2; done'
}

wait_for_service() {
  local url="$1"
  local timeout="${2:-60}"
  local end=$((SECONDS + timeout))
  while (( SECONDS < end )); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

metric_value() {
  local metric="$1"
  curl -fsS "http://${BIND_ADDR}/metrics" | awk -v name="${metric}" '$1 == name { print $2; exit }'
}

wait_for_metric_at_least() {
  local metric="$1"
  local want="$2"
  local timeout="${3:-60}"
  local end=$((SECONDS + timeout))
  while (( SECONDS < end )); do
    local got
    got="$(metric_value "${metric}" || true)"
    if [[ -n "${got}" ]]; then
      if awk -v got="${got}" -v want="${want}" 'BEGIN { exit !(got + 0 >= want + 0) }'; then
        return 0
      fi
    fi
    sleep 0.25
  done
  return 1
}

post_event() {
  local event_id="$1"
  local sequence="$2"
  local subject="$3"
  local payload
  payload="$(cat <<JSON
{
  "event_id": "${event_id}",
  "subject": "${subject}",
  "sequence": ${sequence},
  "observed_at": 1700000000,
  "kind": "manual_credit",
  "weight": 25,
  "stake_delta": 1000,
  "context": {
    "request_id": "req-${event_id}",
    "trace_id": "trace-${event_id}",
    "span_id": "span-${event_id}",
    "provider": "openclaw"
  }
}
JSON
)"
  local code
  code="$(
    curl -sS -o /tmp/trust-layer-e2e-response.json -w "%{http_code}" \
      "http://${BIND_ADDR}/v1/trust/events" \
      -H "content-type: application/json" \
      -H "x-api-key: ${API_KEY}" \
      -d "${payload}"
  )"
  if [[ "${code}" != "200" ]]; then
    echo "event ingest failed: status=${code}" >&2
    cat /tmp/trust-layer-e2e-response.json >&2 || true
    return 1
  fi
}

echo "[e2e] starting docker dependencies"
require_cmd docker
require_cmd curl
require_cmd awk

compose up -d postgres redpanda >/dev/null

echo "[e2e] waiting for postgres and kafka"
compose exec -T postgres sh -lc 'until pg_isready -U postgres -d trust_layer >/dev/null 2>&1; do sleep 0.2; done'
wait_for_redpanda
compose exec -T redpanda rpk topic create "${TOPIC}" --partitions 1 --replicas 1 >/dev/null 2>&1 || true

echo "[e2e] starting trust-layer-service"
pkill -f "trust-layer-service serve --database-url ${DATABASE_URL}" >/dev/null 2>&1 || true
: > "${SERVICE_LOG}"
(
  cd "${REPO_ROOT}" && \
  cargo build -p trust-layer-service
) >/dev/null
(
  "${REPO_ROOT}/target/debug/trust-layer-service" serve \
    --database-url "${DATABASE_URL}" \
    --bind-addr "${BIND_ADDR}" \
    --api-key "${API_KEY}" \
    --kafka-brokers "127.0.0.1:19092" \
    --kafka-topic "${TOPIC}" \
    --relay-batch-size 10 \
    --relay-interval-ms 200 \
    --relay-max-attempts 2 \
    --relay-stuck-timeout-secs 2
) > "${SERVICE_LOG}" 2>&1 &
SERVICE_PID="$!"

if ! wait_for_service "http://${BIND_ADDR}/healthz" 90; then
  echo "trust-layer-service did not become healthy" >&2
  tail -n 200 "${SERVICE_LOG}" >&2 || true
  exit 1
fi

echo "[e2e] injecting kafka outage and validating dead-letter path"
compose pause redpanda >/dev/null
post_event "e2e-fault-1" "1" "e2e-agent"

if ! wait_for_metric_at_least "trust_layer_outbox_dead_letter" 1 90; then
  echo "dead-letter metric did not increase under kafka outage" >&2
  tail -n 200 "${SERVICE_LOG}" >&2 || true
  exit 1
fi

echo "[e2e] restoring kafka and redriving dead-letter records"
compose unpause redpanda >/dev/null
wait_for_redpanda
(
  "${REPO_ROOT}/target/debug/trust-layer-service" dead-letter redrive \
    --database-url "${DATABASE_URL}" \
    --limit 10
) >/dev/null

if ! wait_for_metric_at_least "trust_layer_outbox_published_total" 1 90; then
  echo "outbox publish counter did not advance after redrive" >&2
  tail -n 200 "${SERVICE_LOG}" >&2 || true
  exit 1
fi

if ! compose exec -T redpanda rpk topic consume "${TOPIC}" -n 1 --offset start -f '%v\n' | grep -q '"event_id":"e2e-fault-1"'; then
  echo "kafka topic does not contain the redriven event payload" >&2
  exit 1
fi

echo "[e2e] generating a second dead-letter record for retention sweep"
compose pause redpanda >/dev/null
post_event "e2e-fault-2" "2" "e2e-agent"

if ! wait_for_metric_at_least "trust_layer_outbox_dead_letter" 1 90; then
  echo "second dead-letter event did not materialize" >&2
  tail -n 200 "${SERVICE_LOG}" >&2 || true
  exit 1
fi

compose unpause redpanda >/dev/null
wait_for_redpanda

compose exec -T postgres psql "${DATABASE_URL_CONTAINER}" -v ON_ERROR_STOP=1 \
  -c "UPDATE trust_outbox_dead_letter SET dead_lettered_at = EXTRACT(EPOCH FROM NOW())::bigint - 3600 WHERE event_id = 'e2e-fault-2';" >/dev/null

(
  "${REPO_ROOT}/target/debug/trust-layer-service" dead-letter sweep \
    --database-url "${DATABASE_URL}" \
    --retention-secs 60 \
    --limit 10
) >/dev/null

remaining="$(compose exec -T postgres psql "${DATABASE_URL_CONTAINER}" -tA -c "SELECT COUNT(*) FROM trust_outbox_dead_letter;")"
if [[ "${remaining}" != "0" ]]; then
  echo "dead-letter sweep left ${remaining} rows; expected 0" >&2
  exit 1
fi

echo "[e2e] fault-injection flow passed"
