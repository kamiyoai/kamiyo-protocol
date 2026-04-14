# @kamiyo/eliza-dkg

Bridge between KAMIYO escrow/reputation and OriginTrail Decentralized Knowledge Graph (DKG) for ElizaOS agents.

## Overview

This plugin combines KAMIYO's trust infrastructure (escrow, disputes, ZK reputation) with OriginTrail's DKG to create a verifiable knowledge layer for AI agent commerce.

**What it enables:**

- Quality attestations stored as Knowledge Assets on DKG
- Dispute outcomes become verifiable, queryable records
- ZK reputation commitments backed by DKG storage
- Cross-agent quality discovery via SPARQL queries
- Automatic sync of escrow events to DKG

## Installation

```bash
pnpm add @kamiyo/eliza-dkg
```

Peer dependency: `@elizaos/core >=1.0.0`

## Configuration

Set in agent config or environment:

| Variable | Description | Default |
|----------|-------------|---------|
| `DKG_ENDPOINT` | DKG node URL | `https://your-dkg-node.example.com` |
| `DKG_PORT` | DKG node port | `8900` |
| `DKG_BLOCKCHAIN` | Chain (base:8453, gnosis:100, otp:2043) | `base:8453` |
| `DKG_PRIVATE_KEY` | Signing key for DKG transactions | required |
| `DKG_EPOCHS` | Storage duration in epochs | `2` |
| `AUTO_PUBLISH_QUALITY` | Auto-publish quality attestations | `true` |
| `AUTO_PUBLISH_DISPUTES` | Auto-publish dispute outcomes | `true` |
| `KAMIYO_NETWORK` | Solana network | `mainnet` |
| `SOLANA_PRIVATE_KEY` | Solana keypair | required |
| `KAMIYO_QUALITY_THRESHOLD` | Min quality before auto-dispute | `80` |
| `KAMIYO_MIN_REPUTATION` | Min provider reputation to trust | `60` |

## Usage

```typescript
import { kamiyoDKGPlugin } from '@kamiyo/eliza-dkg';

const agent = createAgent({
  plugins: [kamiyoDKGPlugin],
});
```

## Actions

### DKG Publishing

| Action | Description |
|--------|-------------|
| `PUBLISH_QUALITY_TO_DKG` | Publish quality attestation for a provider |
| `PUBLISH_DISPUTE_TO_DKG` | Publish dispute resolution outcome |
| `PUBLISH_REPUTATION_COMMITMENT_TO_DKG` | Publish ZK reputation commitment |

### DKG Queries

| Action | Description |
|--------|-------------|
| `QUERY_PROVIDER_QUALITY` | Get provider's quality history from DKG |
| `FIND_TRUSTED_PROVIDERS` | Find providers above reputation threshold |
| `QUERY_REPUTATION_FROM_DKG` | Get agent's reputation commitment |

### KAMIYO (inherited from @kamiyo/eliza)

| Action | Description |
|--------|-------------|
| `CREATE_ESCROW` | Lock funds with timelock + quality threshold |
| `RELEASE_ESCROW` | Release on satisfactory delivery |
| `FILE_DISPUTE` | Trigger oracle arbitration |
| `CONSUME_API` | x402 API call with auto-payment |
| `GENERATE_REPUTATION_PROOF` | Groth16 proof of reputation tier |

## Providers

- `dkgQualityProvider` - Injects DKG quality data into agent context when interacting with services
- `walletProvider` - Agent wallet balance and address
- `escrowProvider` - Active escrow positions
- `reputationProvider` - Current reputation tier

## Evaluators

- `qualityPublisherEvaluator` - Auto-publishes quality to DKG after API interactions
- `qualityEvaluator` - Scores API responses, triggers auto-dispute
- `trustEvaluator` - Checks provider reputation before payment

## Services

- `dkgSyncService` - Background sync of escrow/dispute events to DKG
- `escrowMonitorService` - Monitors active escrows, auto-releases/disputes

## Schema

Quality attestations, disputes, and reputation commitments are stored as Schema.org-compliant Knowledge Assets:

```json
{
  "@context": "https://schema.org/",
  "@type": "Review",
  "@id": "urn:kamiyo:quality:provider-123-1706475600000",
  "itemReviewed": {
    "@type": "Service",
    "@id": "api.example.com"
  },
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": 85,
    "bestRating": 100,
    "worstRating": 0
  },
  "datePublished": "2026-01-28T19:00:00.000Z"
}
```

## SPARQL Queries

Query provider quality from DKG:

```sparql
PREFIX schema: <https://schema.org/>
SELECT ?rating ?date
WHERE {
  ?attestation a schema:Review ;
               schema:itemReviewed/schema:identifier "api.example.com" ;
               schema:reviewRating/schema:ratingValue ?rating ;
               schema:datePublished ?date .
}
ORDER BY DESC(?date)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ElizaOS Agent                                              │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │ @kamiyo/eliza   │  │ @kamiyo/eliza-dkg                │  │
│  │ - Escrow        │  │ - Quality → DKG                  │  │
│  │ - x402          │──│ - Disputes → DKG                 │  │
│  │ - ZK Reputation │  │ - Reputation → DKG               │  │
│  │ - Disputes      │  │ - SPARQL Queries                 │  │
│  └─────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐      ┌─────────────────────────────────┐
│ Solana          │      │ OriginTrail DKG                 │
│ - Escrow PDA    │      │ - Knowledge Assets              │
│ - KAMIYO token  │      │ - SPARQL endpoint               │
│ - Oracle voting │      │ - Multi-chain (Base, Gnosis)    │
└─────────────────┘      └─────────────────────────────────┘
```

## Value Proposition

| KAMIYO Provides | DKG Provides |
|-----------------|--------------|
| Escrow protection | Verifiable storage |
| Dispute resolution | Cross-agent discovery |
| ZK reputation proofs | Immutable audit trail |
| x402 micropayments | Semantic queries |

Together: End-to-end verifiable agent commerce with trustless payments and queryable quality history.

## References

- [OriginTrail DKG](https://docs.origintrail.io/)
- [ElizaOS Plugin System](https://elizaos.ai/docs/plugins)
- [KAMIYO Protocol](https://kamiyo.ai)
- [@elizaos/plugin-dkg](https://github.com/elizaos-plugins/plugin-dkg)
