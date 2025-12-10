# @kamiyo/naori-middleware

HTTP 402 Payment Required middleware for Express.js with Naori escrow integration.

## Installation

```bash
npm install @kamiyo/naori-middleware
```

## Quick Start

```typescript
import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { NaoriPaymentMiddleware } from '@kamiyo/naori-middleware';

const app = express();
const connection = new Connection('https://api.devnet.solana.com');

app.use('/api/*', NaoriPaymentMiddleware({
  realm: 'my-api',
  programId: new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n'),
  connection,
  price: 0.001,
  qualityGuarantee: true
}));

app.get('/api/data', (req, res) => {
  // Request has passed payment verification
  // Access escrow info via req.escrow
  res.json({ data: 'protected content' });
});
```

## Features

- **RFC 9110 Compliant**: Implements HTTP 402 Payment Required
- **Automatic Verification**: Validates escrow accounts on-chain
- **Quality Guarantee**: Optional quality guarantee with dispute resolution
- **Type Safe**: Full TypeScript support with type definitions

## API Reference

### NaoriPaymentMiddleware(options)

Creates Express middleware for HTTP 402 payment verification.

**Options:**
- `realm` (string): API realm identifier
- `programId` (PublicKey): Solana escrow program ID
- `connection` (Connection): Solana connection
- `price` (number): Price in SOL
- `qualityGuarantee` (boolean, optional): Enable quality guarantee

### getEscrowInfo(req)

Extract escrow information from authenticated request.

```typescript
import { getEscrowInfo } from '@kamiyo/naori-middleware';

app.get('/api/data', (req, res) => {
  const escrow = getEscrowInfo(req);
  console.log(`Payment: ${escrow.amount} SOL`);
  res.json({ data: 'protected' });
});
```

## License

MIT
