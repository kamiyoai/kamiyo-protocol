# @kamiyo/eliza-trust-provider

Bridges KAMIYO on-chain economic trust signals into ElizaOS `@elizaos/plugin-trust`.

It provides:
- Providers for `trustProfile` and `securityStatus` context.
- A `kamiyo-trust-evidence-bridge` service that converts on-chain state changes into `TrustInteraction` records and forwards them to the plugin-trust TrustEngine when available.

## Installation

This package is intended to be used alongside:
- `@kamiyo/eliza`
- `@elizaos/plugin-trust` (optional)

## Runtime Settings

- `KAMIYO_NETWORK`: `mainnet` | `devnet` | `localnet` (default: `mainnet`)
- `SOLANA_PRIVATE_KEY`: Solana keypair as base64, JSON array, or comma-separated bytes
- `KAMIYO_TRUST_EVIDENCE_SYNC`: `manual` | `periodic` (default: `manual`)
- `KAMIYO_TRUST_SYNC_INTERVAL`: periodic sync interval in ms (default: `300000`)
- `KAMIYO_TRUST_EVIDENCE_WEIGHT`: impact multiplier (default: `1.0`)

## Evidence Semantics

The bridge records evidence about the on-chain entity as interactions of the form:
- `sourceEntityId`: the on-chain entity (base58 address)
- `targetEntityId`: the current agent (`runtime.agentId`)

This matches plugin-trust's default pattern where the evidence source is the entity being evaluated.

