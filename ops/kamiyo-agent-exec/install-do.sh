#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

RUN_USER="${RUN_USER:-openclaw}"
REPO_URL="${REPO_URL:-https://github.com/kamiyo-ai/kamiyo-protocol.git}"
BRANCH="${BRANCH:-kamiyo/kamiyo-agent-exec-canary}"
ENV_FILE="${ENV_FILE:-/etc/kamiyo/kamiyo-agent-exec.env}"
UNIT_FILE="/etc/systemd/system/kamiyo-agent-exec.service"
WATCHDOG_SERVICE_FILE="/etc/systemd/system/kamiyo-agent-watchdog.service"
WATCHDOG_TIMER_FILE="/etc/systemd/system/kamiyo-agent-watchdog.timer"
ASSESS_BOOTSTRAP_SERVICE_FILE="/etc/systemd/system/kamiyo-agent-assessment-bootstrap.service"
ASSESS_GROWTH_SERVICE_FILE="/etc/systemd/system/kamiyo-agent-assessment-growth.service"
ASSESS_GROWTH_TIMER_FILE="/etc/systemd/system/kamiyo-agent-assessment-growth.timer"

if ! id "$RUN_USER" >/dev/null 2>&1; then
  echo "missing user: $RUN_USER" >&2
  exit 1
fi

RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
if [[ -z "$RUN_HOME" ]]; then
  echo "failed to resolve home for user: $RUN_USER" >&2
  exit 1
fi

APP_ROOT="${APP_ROOT:-${RUN_HOME}/local/kamiyo-protocol}"
RUNTIME_DIR="${RUNTIME_DIR:-${RUN_HOME}/.openclaw/workspace/runtime/kamiyo-agent-exec}"

corepack enable
install -d -m 750 /etc/kamiyo
install -d -m 750 -o "$RUN_USER" -g "$RUN_USER" "$RUNTIME_DIR/db" "$RUNTIME_DIR/outbox"

sudo -u "$RUN_USER" -H bash -s <<EOS
set -euo pipefail
mkdir -p "\$HOME/local"
corepack prepare pnpm@10.17.1 --activate
if [[ ! -d "$APP_ROOT/.git" ]]; then
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$APP_ROOT"
fi
cd "$APP_ROOT"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
pnpm install --frozen-lockfile
pnpm --filter @kamiyo/x402-client build
pnpm --filter @kamiyo/kamiyo-agent build
EOS

install -d -m 750 -o "$RUN_USER" -g "$RUN_USER" "$RUNTIME_DIR"
if [[ ! -f "$RUNTIME_DIR/swarm.registry.json" ]]; then
  cat >"$RUNTIME_DIR/swarm.registry.json" <<'JSON'
{
  "version": 1,
  "parent": "kamiyo-agent",
  "agents": [
    {
      "id": "signal-hunter",
      "name": "Signal Hunter",
      "role": "opportunity scout",
      "mandate": "identify high-confidence paid opportunities and route executable leads",
      "mint": "Kamiyo AgentSignal1111111111111111111111111111111",
      "status": "active",
      "priority": 120,
      "jobSources": ["relevance", "near_market", "direct_api", "x402"]
    },
    {
      "id": "deal-executor",
      "name": "Deal Executor",
      "role": "execution operator",
      "mandate": "execute profitable assignments with strict budget controls",
      "mint": "Kamiyo AgentDeal11111111111111111111111111111111",
      "status": "active",
      "priority": 110,
      "jobSources": ["relevance", "near_market", "agent_ai", "x402", "direct_api"]
    },
    {
      "id": "research-prover",
      "name": "Research Prover",
      "role": "evidence analyst",
      "mandate": "validate execution quality and payment reliability before action",
      "mint": "Kamiyo AgentProof1111111111111111111111111111111",
      "status": "active",
      "priority": 100,
      "jobSources": ["relevance", "near_market", "direct_api", "agent_ai"]
    },
    {
      "id": "ops-keeper",
      "name": "Ops Keeper",
      "role": "reliability governor",
      "mandate": "enforce circuit breakers and treasury risk limits",
      "mint": "Kamiyo AgentOps111111111111111111111111111111111",
      "status": "active",
      "priority": 105,
      "jobSources": ["internal", "direct_api", "relevance", "near_market"]
    }
  ]
}
JSON
  chown "$RUN_USER:$RUN_USER" "$RUNTIME_DIR/swarm.registry.json"
  chmod 640 "$RUNTIME_DIR/swarm.registry.json"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_ROOT/ops/kamiyo-agent-exec/kamiyo-agent-exec.env.example" "$ENV_FILE"
fi

if grep -q '^KAMIYO_AGENT_HTTP_TOKEN=replace-with-random-token$' "$ENV_FILE"; then
  sed -i "s|^KAMIYO_AGENT_HTTP_TOKEN=.*|KAMIYO_AGENT_HTTP_TOKEN=$(openssl rand -hex 24)|" "$ENV_FILE"
fi

# Keep first deploy in hard-stop canary mode by default.
if grep -q '^KAMIYO_EXECUTION_STAGE=' "$ENV_FILE"; then
  sed -i 's|^KAMIYO_EXECUTION_STAGE=.*|KAMIYO_EXECUTION_STAGE=canary_0|' "$ENV_FILE"
else
  echo "KAMIYO_EXECUTION_STAGE=canary_0" >>"$ENV_FILE"
fi
if grep -q '^KAMIYO_EXECUTION_HARD_STOP=' "$ENV_FILE"; then
  sed -i 's|^KAMIYO_EXECUTION_HARD_STOP=.*|KAMIYO_EXECUTION_HARD_STOP=true|' "$ENV_FILE"
else
  echo "KAMIYO_EXECUTION_HARD_STOP=true" >>"$ENV_FILE"
fi
if grep -q '^KAMIYO_SWARM_REGISTRY_PATH=' "$ENV_FILE"; then
  sed -i "s|^KAMIYO_SWARM_REGISTRY_PATH=.*|KAMIYO_SWARM_REGISTRY_PATH=$RUNTIME_DIR/swarm.registry.json|" "$ENV_FILE"
else
  echo "KAMIYO_SWARM_REGISTRY_PATH=$RUNTIME_DIR/swarm.registry.json" >>"$ENV_FILE"
fi
if ! grep -q '^KAMIYO_POLICY_HOT_RELOAD_ENABLED=' "$ENV_FILE"; then
  echo "KAMIYO_POLICY_HOT_RELOAD_ENABLED=true" >>"$ENV_FILE"
fi
if ! grep -q '^KAMIYO_POLICY_HOT_RELOAD_INTERVAL_SECONDS=' "$ENV_FILE"; then
  echo "KAMIYO_POLICY_HOT_RELOAD_INTERVAL_SECONDS=30" >>"$ENV_FILE"
fi
if grep -q '^KAMIYO_POLICY_HOT_RELOAD_ENV_FILE=' "$ENV_FILE"; then
  sed -i "s|^KAMIYO_POLICY_HOT_RELOAD_ENV_FILE=.*|KAMIYO_POLICY_HOT_RELOAD_ENV_FILE=$ENV_FILE|" "$ENV_FILE"
else
  echo "KAMIYO_POLICY_HOT_RELOAD_ENV_FILE=$ENV_FILE" >>"$ENV_FILE"
fi
if ! grep -q '^KAMIYO_SINGLE_INSTANCE_LOCK_ENABLED=' "$ENV_FILE"; then
  echo "KAMIYO_SINGLE_INSTANCE_LOCK_ENABLED=true" >>"$ENV_FILE"
fi
if grep -q '^KAMIYO_SINGLE_INSTANCE_LOCK_PATH=' "$ENV_FILE"; then
  sed -i "s|^KAMIYO_SINGLE_INSTANCE_LOCK_PATH=.*|KAMIYO_SINGLE_INSTANCE_LOCK_PATH=$RUNTIME_DIR/db/kamiyo-agent-exec.lock|" "$ENV_FILE"
else
  echo "KAMIYO_SINGLE_INSTANCE_LOCK_PATH=$RUNTIME_DIR/db/kamiyo-agent-exec.lock" >>"$ENV_FILE"
fi
if ! grep -q '^KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_STALE_ENABLED=' "$ENV_FILE"; then
  echo "KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_STALE_ENABLED=true" >>"$ENV_FILE"
fi
if ! grep -q '^KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_INTERVAL_MINUTES=' "$ENV_FILE"; then
  echo "KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_INTERVAL_MINUTES=5" >>"$ENV_FILE"
fi
if ! grep -q '^KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_PENDING_MAX_MINUTES=' "$ENV_FILE"; then
  echo "KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_PENDING_MAX_MINUTES=30" >>"$ENV_FILE"
fi
if ! grep -q '^KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_LIMIT=' "$ENV_FILE"; then
  echo "KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_LIMIT=20" >>"$ENV_FILE"
fi
if grep -q '^KYO_ASSESS_STATE_PATH=' "$ENV_FILE"; then
  sed -i "s|^KYO_ASSESS_STATE_PATH=.*|KYO_ASSESS_STATE_PATH=$RUNTIME_DIR/db/assessment-growth-state.json|" "$ENV_FILE"
else
  echo "KYO_ASSESS_STATE_PATH=$RUNTIME_DIR/db/assessment-growth-state.json" >>"$ENV_FILE"
fi
if ! grep -q '^KYO_ASSESS_BOOTSTRAP_TARGET=' "$ENV_FILE"; then
  echo "KYO_ASSESS_BOOTSTRAP_TARGET=1000" >>"$ENV_FILE"
fi
if ! grep -q '^KYO_ASSESS_MAX_CYCLES_PER_RUN=' "$ENV_FILE"; then
  echo "KYO_ASSESS_MAX_CYCLES_PER_RUN=1000" >>"$ENV_FILE"
fi
if ! grep -q '^KYO_ASSESS_MODE=' "$ENV_FILE"; then
  echo "KYO_ASSESS_MODE=auto" >>"$ENV_FILE"
fi

chmod 600 "$ENV_FILE"
sed "s|__KAMIYO_APP_ROOT__|$APP_ROOT|g" "$APP_ROOT/ops/kamiyo-agent-exec/kamiyo-agent-exec.service" >"$UNIT_FILE"
sed "s|__KAMIYO_APP_ROOT__|$APP_ROOT|g" "$APP_ROOT/ops/kamiyo-agent-exec/kamiyo-agent-assessment-bootstrap.service" >"$ASSESS_BOOTSTRAP_SERVICE_FILE"
sed "s|__KAMIYO_APP_ROOT__|$APP_ROOT|g" "$APP_ROOT/ops/kamiyo-agent-exec/kamiyo-agent-assessment-growth.service" >"$ASSESS_GROWTH_SERVICE_FILE"
chmod 644 "$UNIT_FILE"
chmod 644 "$ASSESS_BOOTSTRAP_SERVICE_FILE" "$ASSESS_GROWTH_SERVICE_FILE"
install -m 644 "$APP_ROOT/ops/kamiyo-agent-exec/kamiyo-agent-watchdog.service" "$WATCHDOG_SERVICE_FILE"
install -m 644 "$APP_ROOT/ops/kamiyo-agent-exec/kamiyo-agent-watchdog.timer" "$WATCHDOG_TIMER_FILE"
install -m 644 "$APP_ROOT/ops/kamiyo-agent-exec/kamiyo-agent-assessment-growth.timer" "$ASSESS_GROWTH_TIMER_FILE"
install -m 750 "$APP_ROOT/ops/kamiyo-agent-exec/promote-stage.sh" /usr/local/bin/kamiyo-agent-exec-stage
install -m 750 "$APP_ROOT/ops/kamiyo-agent-exec/guarded-promote.sh" /usr/local/bin/kamiyo-agent-exec-stage-guarded
install -m 750 "$APP_ROOT/ops/kamiyo-agent-exec/preflight.sh" /usr/local/bin/kamiyo-agent-exec-preflight
install -m 750 "$APP_ROOT/ops/kamiyo-agent-exec/watchdog.sh" /usr/local/bin/kamiyo-agent-exec-watchdog
sed "s|__KAMIYO_APP_ROOT__|$APP_ROOT|g" "$APP_ROOT/ops/kamiyo-agent-exec/assessment-growth.sh" >/usr/local/bin/kamiyo-agent-assessment-growth
chmod 750 /usr/local/bin/kamiyo-agent-assessment-growth

systemctl daemon-reload
systemctl enable --now kamiyo-agent-exec.service
systemctl enable --now kamiyo-agent-watchdog.timer
systemctl enable --now kamiyo-agent-assessment-growth.timer
systemctl start kamiyo-agent-watchdog.service
sleep 2
systemctl --no-pager --full status kamiyo-agent-exec.service | sed -n '1,30p'
/usr/local/bin/kamiyo-agent-exec-preflight "$ENV_FILE"
