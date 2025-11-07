# x402scan Registration Guide

## Prerequisites

- Oracle deployed and running
- PAYMENT_WALLET configured in .env
- Oracle accessible via public URL

## Registration Steps

1. Navigate to https://www.x402scan.com/resources/register

2. Enter your oracle URL:
   ```
   https://your-oracle-domain.com
   ```

3. x402scan will automatically discover your endpoints via `/.well-known/x402`

4. Verify the discovered resources:
   - `/exploits` - DeFi exploit intelligence
   - `/risk-score/{protocol}` - Protocol risk assessment

## Discovery Endpoint

Your oracle exposes x402 schema at:
```
GET https://your-oracle-domain.com/.well-known/x402
```

## Validation

Test discovery endpoint:
```bash
curl https://your-oracle-domain.com/.well-known/x402
```

Expected response structure:
```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "1000000",
      "resource": "https://your-oracle-domain.com/exploits",
      "payTo": "CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY",
      "asset": "SOL"
    }
  ]
}
```

## Troubleshooting

### 405 Method Not Allowed
Ensure your server supports GET requests to `/.well-known/x402`

### Invalid URL
- Use full URL with protocol (https://)
- Resource URLs must be absolute, not relative paths

### Payment Verification Failed
- Confirm PAYMENT_WALLET matches your Solana wallet
- Verify wallet can receive SOL on mainnet

## Support

Issues: https://github.com/kamiyo-ai/kamiyo/issues
Documentation: https://github.com/kamiyo-ai/kamiyo/tree/main/agents/defi-security-oracle
