# PayAI Network Integration Guide

## Overview

KAMIYO now supports **hybrid multi-facilitator payments** via the x402 protocol:
- **PayAI Network** (recommended): Best UX, multi-chain support, instant settlement
- **KAMIYO Native**: Full control, custom risk scoring, direct on-chain verification

## Architecture

```
┌─────────────────────────────────────────────────────┐
│         KAMIYO Unified Payment Gateway              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Priority 1: PayAI Facilitator                     │
│  ├─ Supports: Solana, Base, Polygon, Avalanche     │
│  ├─ Settlement: ~2 seconds                          │
│  ├─ UX: Wallet integration (Phantom, MetaMask)     │
│  └─ Header: X-PAYMENT (x402 standard)              │
│                                                     │
│  Priority 2: KAMIYO Native                          │
│  ├─ Supports: Base, Ethereum, Solana               │
│  ├─ Settlement: Manual on-chain verification        │
│  ├─ UX: Direct USDC transfer                       │
│  └─ Header: x-payment-tx + x-payment-chain         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Environment Configuration

Add PayAI merchant address to your `.env`:

```bash
# PayAI Integration
X402_PAYAI_ENABLED=true
X402_PAYAI_MERCHANT_ADDRESS=0xYourMerchantAddress

# Existing KAMIYO Native config
X402_BASE_PAYMENT_ADDRESS=0xYourBaseAddress
X402_ETHEREUM_PAYMENT_ADDRESS=0xYourEthAddress
X402_SOLANA_PAYMENT_ADDRESS=YourSolanaAddress

# Pricing
X402_ENDPOINT_PRICES=/exploits:0.01,/protocols/risk-score:0.02
```

### 2. Initialize Middleware

```python
from api.x402.middleware import X402Middleware
from api.x402.payment_tracker import PaymentTracker
from api.database import SessionLocal

# Create payment tracker
db = SessionLocal()
payment_tracker = PaymentTracker(db=db)

# Initialize middleware with unified gateway
middleware = X402Middleware(
    app,
    payment_tracker=payment_tracker,
    use_unified_gateway=True  # Enables PayAI + native
)

app.add_middleware(middleware)
```

### 3. Client Integration (x402 Standard)

#### Option A: PayAI Facilitator (Recommended)

**JavaScript/TypeScript:**
```typescript
import { useX402 } from '@x402sdk/sdk'

const response = await fetch('https://kamiyo.ai/exploits')

if (response.status === 402) {
  const paymentDetails = await response.json()

  // Use PayAI option (priority 1)
  const payaiOption = paymentDetails.payment_options[0]

  // SDK handles wallet connection and payment
  const payment = await useX402(
    paymentDetails.endpoint,
    paymentDetails.amount_usdc,
    'https://facilitator.payai.network'
  )

  // Retry with payment token
  const finalResponse = await fetch('https://kamiyo.ai/exploits', {
    headers: {
      'X-PAYMENT': payment.token
    }
  })
}
```

**Python:**
```python
import httpx
import base64
import json

response = httpx.get('https://kamiyo.ai/exploits')

if response.status_code == 402:
    payment_details = response.json()
    payai_option = payment_details['payment_options'][0]

    # User signs payment via wallet
    # (Payment signing handled by client-side wallet)
    payment_header = create_payment_authorization(payai_option)

    # Retry with X-PAYMENT header
    final_response = httpx.get(
        'https://kamiyo.ai/exploits',
        headers={'X-PAYMENT': payment_header}
    )
```

#### Option B: KAMIYO Native (Advanced)

```python
import httpx
from web3 import Web3

response = httpx.get('https://kamiyo.ai/exploits')

if response.status_code == 402:
    payment_details = response.json()
    native_option = payment_details['payment_options'][1]  # Priority 2

    # Send USDC to payment address
    payment_address = native_option['payment_addresses']['base']
    tx_hash = send_usdc(payment_address, 0.01)

    # Retry with transaction headers
    final_response = httpx.get(
        'https://kamiyo.ai/exploits',
        headers={
            'x-payment-tx': tx_hash,
            'x-payment-chain': 'base'
        }
    )
```

## API Reference

### HTTP 402 Response Format

```json
{
  "payment_required": true,
  "endpoint": "/exploits",
  "amount_usdc": 0.01,
  "payment_options": [
    {
      "provider": "PayAI Network",
      "type": "facilitator",
      "priority": 1,
      "recommended": true,
      "supported_chains": ["solana", "base", "polygon", "avalanche"],
      "wallet_support": ["Phantom", "Backpack", "MetaMask"],
      "x402_standard": {
        "x402Version": 1,
        "error": "X-PAYMENT header is required",
        "accepts": [
          {
            "scheme": "exact",
            "network": "base",
            "maxAmountRequired": "10000",
            "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "payTo": "0xMerchantAddress",
            "resource": "/exploits",
            "description": "KAMIYO Security Intelligence"
          }
        ]
      }
    },
    {
      "provider": "KAMIYO Native",
      "type": "direct_transfer",
      "priority": 2,
      "recommended": false,
      "supported_chains": ["base", "ethereum", "solana"],
      "payment_addresses": {
        "base": "0xBaseAddress",
        "ethereum": "0xEthAddress",
        "solana": "SolanaAddress"
      }
    }
  ]
}
```

### Payment Request Headers

#### PayAI (x402 Standard)
```
X-PAYMENT: <base64-encoded payment payload>
```

#### KAMIYO Native
```
x-payment-tx: <transaction hash>
x-payment-chain: base|ethereum|solana
```

## Analytics Dashboard

Monitor payment facilitator performance:

```python
from api.x402.payment_analytics import get_payment_analytics

analytics = get_payment_analytics()

# Get 24-hour performance metrics
metrics = await analytics.get_facilitator_performance(hours=24)

print(f"PayAI Success Rate: {metrics['payai'].success_rate:.1%}")
print(f"PayAI Avg Latency: {metrics['payai'].avg_latency_ms:.0f}ms")
print(f"Native Success Rate: {metrics['kamiyo_native'].success_rate:.1%}")

# Get facilitator split
split = await analytics.get_facilitator_split(hours=24)
print(f"PayAI: {split['payai']:.1f}% | Native: {split['kamiyo_native']:.1f}%")

# Generate full report
report = await analytics.get_summary_report(hours=24)
print(report)
```

## Testing

Run integration tests:

```bash
# Install test dependencies
pip install pytest pytest-asyncio

# Run PayAI integration tests
pytest api/x402/tests/test_payment_gateway.py -v

# Test specific scenario
pytest api/x402/tests/test_payment_gateway.py::TestUnifiedPaymentGateway::test_payai_payment_success -v
```

## Deployment Checklist

### Production Environment

- [ ] Set production merchant addresses in `.env`
- [ ] Enable PayAI: `X402_PAYAI_ENABLED=true`
- [ ] Configure RPC endpoints for all chains
- [ ] Test 402 response format in staging
- [ ] Monitor analytics for first 24 hours
- [ ] Set up alerts for payment failures

### PayAI Partnership

- [ ] Apply for PayAI merchant directory listing
- [ ] Submit merchant profile (logo, description, pricing)
- [ ] Verify facilitator URL in production
- [ ] Co-marketing campaign (tweet, blog post)
- [ ] Monitor traffic from PayAI ecosystem

## Troubleshooting

### PayAI payments failing

**Symptom:** Users see "PayAI verification failed"

**Debug:**
```python
# Check PayAI facilitator connectivity
from api.x402.payai_facilitator import PayAIFacilitator

facilitator = PayAIFacilitator(merchant_address='0xTest')
supported = await facilitator.get_supported_networks()
print(f"PayAI supports: {supported}")
```

**Common issues:**
- Invalid merchant address
- Network not supported by PayAI
- Facilitator URL misconfigured

### Native payments working but PayAI not

**Solution:** Gateway falls back to native automatically. Check logs:
```bash
grep "PayAI" api/logs/x402.log
```

### Analytics not recording

**Debug:**
```python
from api.x402.payment_analytics import get_payment_analytics

analytics = get_payment_analytics()
print(f"Cached records: {len(analytics.metrics_cache['payai'])}")
```

## Supported Networks

### PayAI Facilitator
- Solana (mainnet, devnet)
- Base (mainnet, sepolia)
- Polygon (mainnet, amoy)
- Avalanche (mainnet, fuji)
- Sei (mainnet, testnet)
- IoTeX
- Peaq

### KAMIYO Native
- Base (mainnet)
- Ethereum (mainnet)
- Solana (mainnet)

## Pricing

Default pricing per endpoint (configurable via `X402_ENDPOINT_PRICES`):

| Endpoint | Price (USDC) | Description |
|----------|--------------|-------------|
| `/exploits` | $0.01 | Real-time exploit data |
| `/exploits/latest-alert` | $0.01 | Latest exploit alert |
| `/protocols/risk-score` | $0.02 | Protocol risk assessment |
| `/wallets/risk-check` | $0.005 | Wallet screening |

## Security Considerations

### PayAI Facilitator
- Payment verification delegated to PayAI
- On-chain settlement handled by facilitator
- Low risk score for PayAI-verified payments (0.1)

### KAMIYO Native
- Direct on-chain verification
- Custom risk scoring based on exploit intelligence
- Higher latency but full control

## Resources

- **x402 Specification:** https://x402.org/x402-whitepaper.pdf
- **PayAI Documentation:** https://docs.payai.network
- **PayAI Facilitator:** https://facilitator.payai.network
- **KAMIYO API Docs:** https://kamiyo.ai/docs/x402-payments
- **Support:** support@kamiyo.ai

## Changelog

### v1.0.0 (November 2, 2025)
- ✅ PayAI facilitator client (`payai_facilitator.py`)
- ✅ Unified payment gateway (`payment_gateway.py`)
- ✅ Multi-facilitator 402 responses
- ✅ Payment analytics tracking
- ✅ Integration tests
- ✅ Backward compatibility with native-only mode
