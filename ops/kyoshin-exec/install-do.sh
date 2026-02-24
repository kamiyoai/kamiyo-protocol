#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

RUN_USER="${RUN_USER:-openclaw}"
REPO_URL="${REPO_URL:-https://github.com/kamiyo-ai/kamiyo-protocol.git}"
BRANCH="${BRANCH:-kamiyo/kyoshin-exec-canary}"
ENV_FILE="${ENV_FILE:-/etc/kamiyo/kyoshin-exec.env}"
UNIT_FILE="/etc/systemd/system/kamiyo-kyoshin-exec.service"
WATCHDOG_SERVICE_FILE="/etc/systemd/system/kamiyo-kyoshin-watchdog.service"
WATCHDOG_TIMER_FILE="/etc/systemd/system/kamiyo-kyoshin-watchdog.timer"

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
RUNTIME_DIR="${RUNTIME_DIR:-${RUN_HOME}/.openclaw/workspace/runtime/kyoshin-exec}"

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
pnpm --filter @kamiyo/kyoshin build
EOS

install -d -m 750 -o "$RUN_USER" -g "$RUN_USER" "$RUNTIME_DIR"
if [[ ! -f "$RUNTIME_DIR/swarm.registry.json" ]]; then
  cat >"$RUNTIME_DIR/swarm.registry.json" <<'JSON'
{
  "version": 1,
  "parent": "kyoshin",
  "agents": [
    {
      "id": "signal-hunter",
      "name": "Signal Hunter",
      "role": "opportunity scout",
      "mandate": "identify high-confidence paid opportunities and route executable leads",
      "mint": "KyoshinSignal1111111111111111111111111111111",
      "status": "active",
      "priority": 120,
      "jobSources": ["relevance", "near_market", "direct_api", "x402"]
    },
    {
      "id": "deal-executor",
      "name": "Deal Executor",
      "role": "execution operator",
      "mandate": "execute profitable assignments with strict budget controls",
      "mint": "KyoshinDeal11111111111111111111111111111111",
      "status": "active",
      "priority": 110,
      "jobSources": ["relevance", "near_market", "agent_ai", "x402", "direct_api"]
    },
    {
      "id": "research-prover",
      "name": "Research Prover",
      "role": "evidence analyst",
      "mandate": "validate execution quality and payment reliability before action",
      "mint": "KyoshinProof1111111111111111111111111111111",
      "status": "active",
      "priority": 100,
      "jobSources": ["relevance", "near_market", "direct_api", "agent_ai"]
    },
    {
      "id": "ops-keeper",
      "name": "Ops Keeper",
      "role": "reliability governor",
      "mandate": "enforce circuit breakers and treasury risk limits",
      "mint": "KyoshinOps111111111111111111111111111111111",
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
  cp "$APP_ROOT/ops/kyoshin-exec/kyoshin-exec.env.example" "$ENV_FILE"
fi

if grep -q '^KYOSHIN_HTTP_TOKEN=replace-with-random-token$' "$ENV_FILE"; then
  sed -i "s|^KYOSHIN_HTTP_TOKEN=.*|KYOSHIN_HTTP_TOKEN=$(openssl rand -hex 24)|" "$ENV_FILE"
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
  sed -i "s|^KAMIYO_SINGLE_INSTANCE_LOCK_PATH=.*|KAMIYO_SINGLE_INSTANCE_LOCK_PATH=$RUNTIME_DIR/db/kyoshin-exec.lock|" "$ENV_FILE"
else
  echo "KAMIYO_SINGLE_INSTANCE_LOCK_PATH=$RUNTIME_DIR/db/kyoshin-exec.lock" >>"$ENV_FILE"
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

chmod 600 "$ENV_FILE"
sed "s|__KAMIYO_APP_ROOT__|$APP_ROOT|g" "$APP_ROOT/ops/kyoshin-exec/kamiyo-kyoshin-exec.service" >"$UNIT_FILE"
chmod 644 "$UNIT_FILE"
install -m 644 "$APP_ROOT/ops/kyoshin-exec/kamiyo-kyoshin-watchdog.service" "$WATCHDOG_SERVICE_FILE"
install -m 644 "$APP_ROOT/ops/kyoshin-exec/kamiyo-kyoshin-watchdog.timer" "$WATCHDOG_TIMER_FILE"
install -m 750 "$APP_ROOT/ops/kyoshin-exec/promote-stage.sh" /usr/local/bin/kamiyo-kyoshin-exec-stage
install -m 750 "$APP_ROOT/ops/kyoshin-exec/guarded-promote.sh" /usr/local/bin/kamiyo-kyoshin-exec-stage-guarded
install -m 750 "$APP_ROOT/ops/kyoshin-exec/preflight.sh" /usr/local/bin/kamiyo-kyoshin-exec-preflight
install -m 750 "$APP_ROOT/ops/kyoshin-exec/watchdog.sh" /usr/local/bin/kamiyo-kyoshin-exec-watchdog

systemctl daemon-reload
systemctl enable --now kamiyo-kyoshin-exec.service
systemctl enable --now kamiyo-kyoshin-watchdog.timer
systemctl start kamiyo-kyoshin-watchdog.service
sleep 2
systemctl --no-pager --full status kamiyo-kyoshin-exec.service | sed -n '1,30p'
/usr/local/bin/kamiyo-kyoshin-exec-preflight "$ENV_FILE"
