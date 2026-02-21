#!/usr/bin/env bash
set -euo pipefail

if [ -z "${HOME:-}" ]; then
  HOME="$(getent passwd "$(id -u)" | cut -d: -f6)"
fi

RUNTIME_DIR="$HOME/.openclaw/workspace/runtime"
SEED_DIR="$RUNTIME_DIR/seed"
mkdir -p "$SEED_DIR"
chmod 700 "$RUNTIME_DIR" "$SEED_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/bootstrap-agent-ai.json" "$SEED_DIR/agent_ai.json"
cp "$SCRIPT_DIR/bootstrap-relevance.json" "$SEED_DIR/relevance.json"
cp "$SCRIPT_DIR/bootstrap-kore.json" "$SEED_DIR/kore.json"
cp "$SCRIPT_DIR/bootstrap-x402.json" "$SEED_DIR/x402.json"
cp "$SCRIPT_DIR/bootstrap-direct-api.json" "$SEED_DIR/direct_api.json"

cat > "$RUNTIME_DIR/marketplace-feeds.json" <<JSON
{
  "feeds": [
    {
      "id": "agent_ai_bootstrap",
      "source": "agent_ai",
      "enabled": true,
      "url": "file://$SEED_DIR/agent_ai.json",
      "authHeader": "Authorization",
      "authEnv": "KYO_AGENT_AI_API_KEY",
      "authPrefix": "Bearer"
    },
    {
      "id": "relevance_bootstrap",
      "source": "relevance",
      "enabled": true,
      "url": "file://$SEED_DIR/relevance.json",
      "authHeader": "Authorization",
      "authEnv": "KYO_RELEVANCE_API_KEY",
      "authPrefix": "Bearer"
    },
    {
      "id": "kore_bootstrap",
      "source": "kore",
      "enabled": true,
      "url": "file://$SEED_DIR/kore.json",
      "authHeader": "Authorization",
      "authEnv": "KYO_KORE_API_KEY",
      "authPrefix": "Bearer"
    },
    {
      "id": "x402_bootstrap",
      "source": "x402",
      "enabled": true,
      "url": "file://$SEED_DIR/x402.json",
      "authHeader": "Authorization",
      "authEnv": "KYO_X402_API_KEY",
      "authPrefix": "Bearer"
    },
    {
      "id": "direct_api_bootstrap",
      "source": "direct_api",
      "enabled": true,
      "url": "file://$SEED_DIR/direct_api.json",
      "authHeader": "Authorization",
      "authEnv": "KYO_DIRECT_API_KEY",
      "authPrefix": "Bearer"
    }
  ]
}
JSON

chmod 600 "$SEED_DIR/agent_ai.json" "$SEED_DIR/relevance.json" "$SEED_DIR/kore.json" "$SEED_DIR/x402.json" "$SEED_DIR/direct_api.json" "$RUNTIME_DIR/marketplace-feeds.json"
echo "Bootstrap seed installed at $RUNTIME_DIR"
