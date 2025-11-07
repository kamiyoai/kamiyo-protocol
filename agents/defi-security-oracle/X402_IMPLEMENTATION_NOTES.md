# x402 Implementation for security-oracle.kamiyo.ai

## Current Status

Oracle is deployed at https://security-oracle.kamiyo.ai/
Payment wallet configured: CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY

## Missing: /.well-known/x402 Endpoint

The endpoint needs to be added to match api.kamiyo.ai pattern.

## Implementation Requirements (from api.kamiyo.ai)

### 1. HTTP Status Code
Return **402 Payment Required** (not 200)

### 2. Supported Methods
GET and POST only (no HEAD/OPTIONS required)

### 3. Response Format
```javascript
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana",  // NOT "base"
      "maxAmountRequired": "1000000",  // 0.001 SOL in lamports
      "resource": "https://security-oracle.kamiyo.ai/exploits",
      "description": "Real-time DeFi exploit intelligence from 20+ sources",
      "mimeType": "application/json",
      "payTo": "CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY",
      "maxTimeoutSeconds": 300,
      "asset": "SOL",  // NOT USDC token address
      "outputSchema": { /* ... */ },
      "extra": { /* ... */ }
    }
  ]
}
```

## Code to Add (in src or wherever server is defined)

```javascript
app.get('/.well-known/x402', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(402).json({
        x402Version: 1,
        accepts: [
            {
                scheme: 'exact',
                network: 'solana',
                maxAmountRequired: String(PRICE_PER_REQUEST_SOL * 1_000_000_000),
                resource: `${baseUrl}/exploits`,
                description: 'Real-time DeFi exploit intelligence from 20+ sources',
                mimeType: 'application/json',
                payTo: PAYMENT_WALLET,
                maxTimeoutSeconds: 300,
                asset: 'SOL',
                outputSchema: {
                    input: {
                        type: 'http',
                        method: 'GET',
                        queryParams: {
                            protocol: { type: 'string', required: false, description: 'Filter by protocol name' },
                            chain: { type: 'string', required: false, description: 'Filter by blockchain' },
                            limit: { type: 'integer', required: false, description: 'Maximum results (default: 50)' }
                        }
                    },
                    output: {
                        success: { type: 'boolean', description: 'Request status' },
                        count: { type: 'integer', description: 'Number of exploits returned' },
                        exploits: { type: 'array', description: 'List of exploit records' },
                        timestamp: { type: 'string', description: 'Response timestamp' }
                    }
                },
                extra: {
                    provider: 'KAMIYO',
                    version: '2.0.0',
                    sources_count: 20,
                    documentation: 'https://github.com/kamiyo-ai/kamiyo/tree/main/agents/defi-security-oracle'
                }
            },
            {
                scheme: 'exact',
                network: 'solana',
                maxAmountRequired: String(PRICE_PER_REQUEST_SOL * 1_000_000_000),
                resource: `${baseUrl}/risk-score/{protocol}`,
                description: 'Calculate risk score for DeFi protocols',
                mimeType: 'application/json',
                payTo: PAYMENT_WALLET,
                maxTimeoutSeconds: 300,
                asset: 'SOL',
                outputSchema: {
                    input: {
                        type: 'http',
                        method: 'GET',
                        pathParams: {
                            protocol: { type: 'string', required: true, description: 'Protocol name' }
                        },
                        queryParams: {
                            chain: { type: 'string', required: false, description: 'Filter by blockchain' }
                        }
                    },
                    output: {
                        success: { type: 'boolean', description: 'Request status' },
                        risk_score: { type: 'object', description: 'Risk assessment' },
                        data_points: { type: 'integer', description: 'Exploits analyzed' },
                        timestamp: { type: 'string', description: 'Response timestamp' }
                    }
                },
                extra: {
                    provider: 'KAMIYO',
                    version: '2.0.0',
                    algorithm: 'Weighted: frequency(40%) + loss(30%) + recency(30%)',
                    documentation: 'https://github.com/kamiyo-ai/kamiyo/tree/main/agents/defi-security-oracle'
                }
            }
        ]
    });
});
```

## Validation

After deploying, verify:
```bash
curl -i https://security-oracle.kamiyo.ai/.well-known/x402
```

Expected:
- HTTP 402 status
- JSON response with x402Version and accepts array
- payTo wallet: CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY

## x402scan Registration

Once endpoint returns 402 correctly:
1. Go to https://www.x402scan.com/resources/register
2. Enter: https://security-oracle.kamiyo.ai/
3. x402scan will discover via /.well-known/x402
4. Verify both endpoints appear in listing
