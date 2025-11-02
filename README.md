# KAMIYO x PayAI Integration

Production x402 payment gateway enabling crypto payments across 12 blockchain networks.

## Features

- Multi-chain USDC payments (Solana, Base, Polygon, Avalanche, Sei, IoTeX, Peaq)
- Dual payment modes: PayAI Network facilitator + direct on-chain verification
- x402 standard HTTP 402 Payment Required implementation
- Real-time payment analytics
- Model Context Protocol (MCP) compatible

## Quick Start

```bash
pip install -r requirements.txt
cp .env.payai.example .env
# Edit .env with your configuration
uvicorn api.main:app --reload
```

## Configuration

Required environment variables:

```bash
X402_PAYAI_ENABLED=true
X402_PAYAI_MERCHANT_ADDRESS=0xYourAddress
X402_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
X402_ENDPOINT_PRICES=/exploits:0.01,/api/v2/analysis:0.02
```

See `.env.payai.example` for complete configuration.

## Usage

### Payment Flow

1. Client requests protected endpoint
2. Server returns 402 with payment options
3. Client authorizes payment (PayAI or direct transfer)
4. Client retries with payment proof
5. Server verifies and grants access

### Python Example

```python
import httpx

response = httpx.get("https://api.kamiyo.ai/exploits")

if response.status_code == 402:
    payment_details = response.json()
    # Authorize payment via PayAI
    payment_token = authorize_payment(payment_details)
    # Retry with payment
    response = httpx.get(
        "https://api.kamiyo.ai/exploits",
        headers={"X-PAYMENT": payment_token}
    )
```

See `examples/` for complete implementations.

## API

### Protected Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/exploits` | $0.01 | Recent exploit data |
| `/exploits/latest-alert` | $0.01 | Latest exploit alert |
| `/api/v2/analysis/deep-dive` | $0.02 | Deep analysis |

### Payment Headers

PayAI: `X-PAYMENT: <base64-encoded-payload>`
Direct: `x-payment-tx: <tx-hash>`, `x-payment-chain: <network>`

## Testing

```bash
pytest api/x402/tests/ -v
```

All tests pass (31/31).

## Architecture

```
Client → X402Middleware → UnifiedPaymentGateway
                              ├─ PayAI Facilitator (priority 1)
                              └─ Direct On-Chain (priority 2)
```

## Documentation

- [Integration Guide](PAYAI_INTEGRATION.md)
- [Production Readiness](PAYAI_PRODUCTION_READINESS.md)
- [MCP Integration](MCP_PAYAI_INTEGRATION.md)

## License

AGPL-3.0 with commercial use restriction. Contact licensing@kamiyo.ai for commercial licensing.
