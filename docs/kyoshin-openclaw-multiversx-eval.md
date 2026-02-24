# Kyoshin Adapter Evaluation: OpenClaw + MultiversX Repos

## Repos reviewed

- `openclaw/openclaw`
- `multiversx/mx-openclaw-relayer`
- `sasurobert/multiversx-acp-adapter`
- `sasurobert/multiversx-openclaw-skills`

## Direct fit for current Kyoshin goals

### 1. `openclaw/openclaw`
Usefulness: **high (control-plane integration)**

- Useful for agent orchestration and channel/gateway control-plane patterns.
- Not a drop-in revenue executor or Solana staking router.
- Best use in Kyoshin: upstream command/control surface and tool invocation boundary.

### 2. `mx-openclaw-relayer`
Usefulness: **medium (design pattern), low (direct reuse)**

- Strong relayer + quota pattern (identity checks, per-agent quotas, gas-drain prevention).
- Chain-specific to MultiversX relayed transactions.
- Best use in Kyoshin: apply the quota/verification architecture for Solana-side relaying.

### 3. `multiversx-acp-adapter`
Usefulness: **medium (ACP shape), low (direct reuse)**

- Useful ACP checkout/session contract shape.
- Implemented for MultiversX assets/wallet handoff semantics.
- Best use in Kyoshin: mirror endpoint semantics for a Solana-native ACP/x402 adapter.

### 4. `multiversx-openclaw-skills`
Usefulness: **low for runtime, medium for skill packaging**

- Primarily a skills/docs bundle.
- No direct execution runtime value for current Solana-focused Kyoshin.

## Recommendation

1. Keep Kyoshin execution runtime Solana-native (implemented in this rewrite).
2. Add adapter boundaries so OpenClaw can trigger/inspect jobs without controlling treasury policy.
3. Reuse relayer quota/identity guard ideas from `mx-openclaw-relayer` when introducing delegated execution endpoints.
4. Treat MultiversX ACP artifacts as protocol-reference, not production dependency in the Solana execution path.

## OpenClaw swarm guide: what was adopted vs rejected

Adopted now:

- OpenClaw as control plane and artifact loop (`ops/openclaw/*`) while Kyoshin runtime handles execution and treasury policy.
- Explicit runtime guard bridge (`kyoshin-runtime-bridge.py`) from OpenClaw loop to Kyoshin `/health` + `/status`.
- Zero-inference loop mode by default (`KYO_ENABLE_AGENT_HEARTBEAT=false`) so autonomy can run without Anthropic/OpenAI usage.
- Systemd timer + strict runtime guards + learnings capture from degraded cycles.

Rejected:

- Mandatory Anthropic/OpenAI keys in core loop.
- Messaging-channel-first orchestration (WhatsApp/Telegram) as a requirement for execution runtime.
- Generic swarm prompts that can execute without hard budget/margin policy.
