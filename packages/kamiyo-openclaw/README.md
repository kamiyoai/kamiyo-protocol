# @kamiyo/openclaw

OpenClaw plugin for Kizuna-powered agent payments plus retained KAMIYO protocol tools.

## Default posture

For new work, treat this plugin as an integration layer on top of Kizuna:

- price checks and paid-request execution
- Kizuna-backed x402 settlement flows
- Meishi verification hooks

Legacy escrow and oracle tools are still exposed where retained, but they are not the default product path.

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
            "kamiyo_x402_check_price",
            "kamiyo_x402_request",
            "kamiyo_meishi_verify_passport"
          ]
        }
      }
    ]
  }
}
```

## Config

- `rpcUrl`: Solana RPC URL
- `privateKey`: signer secret key in base64 or JSON byte array form
- `programId`: optional KAMIYO program ID override
- `apiBaseUrl`: optional KAMIYO API base URL
- `meishiProgramId`: optional Meishi program ID override
- `x402BaseUrl`: x402 base URL for challenge and settlement calls
- `x402TimeoutMs`: default x402 timeout in ms
- `x402MaxPriceSol`: max acceptable x402 price in SOL

## Tool Names

Kizuna and payment-facing tools:

- `kamiyo_x402_check_price`
- `kamiyo_x402_request`
- `kamiyo_x402_dispute`
- `kamiyo_x402_release`
- `kamiyo_x402_request_settlement`
- `kamiyo_meishi_issue_passport`
- `kamiyo_meishi_verify_passport`

Retained legacy tools:

- `kamiyo_staked_identity_create`
- `kamiyo_staked_identity_get`
- `kamiyo_escrow_create`
- `kamiyo_escrow_get`
- `kamiyo_escrow_dispute`
- `kamiyo_escrow_release`
- `kamiyo_oracle_consensus_preview`
- `kamiyo_oracle_registry`
