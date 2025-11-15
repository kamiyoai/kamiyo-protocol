# x402 Infrastructure JavaScript SDK

Official JavaScript/TypeScript client for x402 payment verification API.

## Installation

```bash
npm install @x402/sdk
# or
yarn add @x402/sdk
```

## Quick Start

```javascript
import { X402Client } from '@x402/sdk';

// Initialize client
const client = new X402Client({
  apiKey: 'x402_live_XXXXX'
});

// Verify payment
const result = await client.verifyPayment({
  txHash: '5KZ7xQjDPh4A7V9X...',
  chain: 'solana',
  expectedAmount: 1.00
});

if (result.success) {
  console.log(`✓ Verified: ${result.amountUsdc} USDC`);
  console.log(`  From: ${result.fromAddress}`);
  console.log(`  Risk Score: ${result.riskScore}`);
} else {
  console.log(`✗ Failed: ${result.error}`);
}
```

## Features

- Multi-chain USDC verification (Solana, Base, Ethereum, and more)
- Simple, intuitive API
- Works in Node.js and browsers
- TypeScript support
- Comprehensive error handling
- Production-ready

## Usage

### Initialize Client

```javascript
const client = new X402Client({
  apiKey: 'x402_live_XXXXX',  // Required
  baseUrl: 'https://kamiyo.ai/api/v1/x402'  // Optional (for testing)
});
```

### Verify Payment

```javascript
const result = await client.verifyPayment({
  txHash: 'transaction_hash_here',
  chain: 'solana',  // or 'base', 'ethereum', etc.
  expectedAmount: 1.00  // Optional
});

console.log(result);
// {
//   success: true,
//   txHash: '...',
//   chain: 'solana',
//   amountUsdc: 1.00,
//   fromAddress: '...',
//   toAddress: '...',
//   confirmations: 32,
//   riskScore: 0.1
// }
```

### Check Usage

```javascript
const usage = await client.getUsage();

console.log(`Tier: ${usage.tier}`);
console.log(`Used: ${usage.verifications_used}/${usage.verifications_limit}`);
console.log(`Remaining: ${usage.verifications_remaining}`);
```

### Get Supported Chains

```javascript
const chains = await client.getSupportedChains();

console.log(`Your tier: ${chains.tier}`);
console.log(`Enabled chains: ${chains.enabled_chains.join(', ')}`);
```

## Error Handling

```javascript
import { X402Client, X402QuotaExceeded, X402AuthError, X402Error } from '@x402/sdk';

try {
  const result = await client.verifyPayment({
    txHash: '...',
    chain: 'solana'
  });

} catch (error) {
  if (error instanceof X402QuotaExceeded) {
    console.log('Monthly quota exceeded - upgrade your plan');
  } else if (error instanceof X402AuthError) {
    console.log('Invalid API key');
  } else if (error instanceof X402Error) {
    console.log(`API Error: ${error.message}`);
  } else {
    console.log(`Unexpected error: ${error.message}`);
  }
}
```

## CommonJS Usage

```javascript
const { X402Client } = require('@x402/sdk');

const client = new X402Client({ apiKey: 'x402_live_XXXXX' });

client.verifyPayment({
  txHash: '...',
  chain: 'solana'
}).then(result => {
  console.log('Success:', result.success);
});
```

## TypeScript

The SDK includes TypeScript type definitions:

```typescript
import { X402Client } from '@x402/sdk';

const client = new X402Client({ apiKey: 'x402_live_XXXXX' });

const result = await client.verifyPayment({
  txHash: '...',
  chain: 'solana',
  expectedAmount: 1.00
});

// TypeScript knows the result type
if (result.success) {
  console.log(result.amountUsdc); // number
}
```

## API Reference

### `X402Client(options)`

Constructor options:
- `apiKey` (string, required): Your x402 API key
- `baseUrl` (string, optional): Custom API URL

### `client.verifyPayment(params)`

Verify on-chain USDC payment.

Parameters:
- `txHash` (string): Transaction hash to verify
- `chain` (string): Blockchain network
- `expectedAmount` (number, optional): Expected payment amount in USDC

Returns: Promise<VerificationResult>

### `client.getUsage()`

Get current usage statistics.

Returns: Promise<UsageStats>

### `client.getSupportedChains()`

Get chains available for your tier.

Returns: Promise<ChainInfo>

## Examples

### Express.js Middleware

```javascript
import express from 'express';
import { X402Client } from '@x402/sdk';

const app = express();
const x402 = new X402Client({ apiKey: process.env.X402_API_KEY });

async function requirePayment(req, res, next) {
  const txHash = req.headers['x-payment-tx'];

  if (!txHash) {
    return res.status(402).json({ error: 'Payment Required' });
  }

  try {
    const result = await x402.verifyPayment({
      txHash,
      chain: 'solana',
      expectedAmount: 0.10
    });

    if (!result.success) {
      return res.status(402).json({ error: 'Payment verification failed' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

app.get('/premium-data', requirePayment, (req, res) => {
  res.json({ data: 'Premium content' });
});
```

### Next.js API Route

```javascript
import { X402Client } from '@x402/sdk';

const x402 = new X402Client({ apiKey: process.env.X402_API_KEY });

export default async function handler(req, res) {
  const { txHash } = req.body;

  const result = await x402.verifyPayment({
    txHash,
    chain: 'solana'
  });

  if (result.success) {
    res.json({ access: 'granted', data: '...' });
  } else {
    res.status(402).json({ error: 'Payment Required' });
  }
}
```

## Pricing Tiers

- **Free**: 1,000 verifications/month, 2 chains
- **Starter**: 50,000 verifications/month, 3 chains ($99/mo)
- **Pro**: 500,000 verifications/month, 6 chains ($299/mo)
- **Enterprise**: Unlimited, all chains ($999/mo)

## Support

- Documentation: https://kamiyo.ai/docs/x402
- Issues: https://github.com/kamiyo-ai/x402-js/issues
- Email: support@kamiyo.ai

## License

MIT
