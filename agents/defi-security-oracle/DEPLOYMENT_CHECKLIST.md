# Deployment Checklist

## Configuration

- [x] PAYMENT_WALLET configured: `CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY`
- [x] x402 discovery endpoint added: `/.well-known/x402`
- [ ] Oracle deployed to production URL
- [ ] .env file created from .env.example

## x402scan Registration

### Required Steps

1. Deploy oracle to production
2. Verify discovery endpoint:
   ```bash
   curl https://your-oracle-url.com/.well-known/x402
   ```

3. Register at https://www.x402scan.com/resources/register
4. Enter oracle base URL

### API Compatibility

The oracle follows api.kamiyo.ai patterns:

- Returns 402 status for .well-known endpoint (not 200)
- Uses Solana network (not Base)
- Accepts SOL payments (not USDC)
- Payment wallet: CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY
- Price: 0.001 SOL per request

### Discovery Response Structure

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "1000000",
      "resource": "https://oracle-url/exploits",
      "payTo": "CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY",
      "asset": "SOL"
    }
  ]
}
```

## Testing

Verify endpoints respond with 402:
```bash
curl -i https://your-oracle-url.com/exploits
curl -i https://your-oracle-url.com/risk-score/Uniswap
```

Expected: HTTP 402 Payment Required

## Production URLs

Development: http://localhost:3000
Production: TBD (deploy to Render/Railway/Fly.io)

## Next Steps

1. Deploy to production hosting
2. Configure production .env
3. Register on x402scan
4. Test payment flow end-to-end
5. Execute marketing launch
