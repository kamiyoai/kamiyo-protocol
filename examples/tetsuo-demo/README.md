# KAMIYO x TETSUO Demo

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/kamiyo-ai/kamiyo-protocol?quickstart=1)

Quality-escrowed inference payments with ZK privacy proofs.

## Quick Start (Mock)

```bash
cd examples/tetsuo-demo && pnpm install
pnpm server  # terminal 1
pnpm demo    # terminal 2
```

## Mainnet Demo (Real)

```bash
export SOLANA_PRIVATE_KEY=<your-base58-key>
pnpm mainnet
```

Shows:
- Real escrow creation on mainnet (Solscan links)
- Real Groth16 proof generation (~800ms)
- Real ZK verification

## What It Does

Shows the KAMIYO escrow integration for TITS API:

1. **Standard inference** - No escrow, just call the API
2. **Escrowed inference** - Lock SOL, quality oracle settles payment
3. **ZK reputation proof** - Access premium tier by proving score >= 80 (without revealing actual score)
4. **Low quality refund** - Score below threshold triggers proportional refund

## Integration

Three lines to add to your inference endpoint:

```typescript
import { verifyEscrow, reportQuality } from '@kamiyo/tetsuo-inference';

// Before inference
const escrow = await verifyEscrow(req.headers['x-kamiyo-escrow']);
if (!escrow.valid) return res.status(402).json({ error: escrow.error });

// After inference
await reportQuality(escrowId, qualityScore);
```

For premium access:

```typescript
import { verifyReputationProof } from '@kamiyo/tetsuo-privacy';

const verified = await verifyReputationProof(req.headers['x-kamiyo-rep-proof'], {
  minThreshold: 80,
});
if (!verified) return res.status(403).json({ error: 'Insufficient reputation' });
```

## Settlement Logic

```
Score >= threshold: 100% to provider
Score 50-threshold: proportional split
Score < 50: 100% refund to user
```

## Endpoints

| Endpoint | Header | Description |
|----------|--------|-------------|
| `POST /v1/inference` | `X-Kamiyo-Escrow` (optional) | Standard inference |
| `POST /v1/inference/pro` | `X-Kamiyo-Rep-Proof` (required) | Premium tier |
