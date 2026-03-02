# @kamiyo/openclaw

OpenClaw plugin that exposes KAMIYO primitives as optional agent tools:

- Staked identity
- Escrowed payments
- Private oracle consensus
- Meishi passports
- x402 paid requests and settlement hooks

Compatibility: OpenClaw `3.1+`

## Install

```bash
openclaw plugins install @kamiyo/openclaw
```

Then enable the plugin and opt in to tools in OpenClaw config.

```json
{
  "plugins": {
    "entries": {
      "kamiyo": {
        "enabled": true,
        "config": {
          "rpcUrl": "https://api.mainnet-beta.solana.com",
          "privateKey": "<base64-or-json-secret>",
          "x402BaseUrl": "https://x402.kamiyo.ai"
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
            "kamiyo_staked_identity_create",
            "kamiyo_escrow_create",
            "kamiyo_oracle_consensus_preview",
            "kamiyo_meishi_verify_passport",
            "kamiyo_x402_request"
          ]
        }
      }
    ]
  }
}
```

## Config

- `rpcUrl`: Solana RPC URL.
- `privateKey`: Signer secret key in base64 or JSON byte array form.
- `programId`: Optional KAMIYO program ID override.
- `apiBaseUrl`: Optional KAMIYO API base URL.
- `meishiProgramId`: Optional Meishi program ID override.
- `x402BaseUrl`: x402 base URL for challenge/settlement calls.
- `x402TimeoutMs`: default x402 timeout (ms).
- `x402MaxPriceSol`: max acceptable x402 price (SOL).

If no private key is configured, read tools still work, and write tools return a signer-required error.

## Tool Names

- `kamiyo_staked_identity_create`
- `kamiyo_staked_identity_get`
- `kamiyo_escrow_create`
- `kamiyo_escrow_get`
- `kamiyo_escrow_dispute`
- `kamiyo_escrow_release`
- `kamiyo_oracle_consensus_preview`
- `kamiyo_oracle_registry`
- `kamiyo_meishi_issue_passport`
- `kamiyo_meishi_verify_passport`
- `kamiyo_x402_check_price`
- `kamiyo_x402_request`
- `kamiyo_x402_dispute`
- `kamiyo_x402_release`
- `kamiyo_x402_request_settlement`
