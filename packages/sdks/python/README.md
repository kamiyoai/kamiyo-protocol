# x402 Infrastructure Python SDK

Official Python client for x402 payment verification API.

## Installation

```bash
pip install x402-python
```

## Quick Start

```python
from x402 import X402Client

# Initialize client with your API key
client = X402Client(api_key="x402_live_XXXXX")

# Verify a payment
result = client.verify_payment(
    tx_hash="5KZ7xQjDPh4A7V9X...",
    chain="solana",
    expected_amount=1.00
)

if result.success:
    print(f"Payment verified: {result.amount_usdc} USDC from {result.from_address}")
else:
    print(f"Verification failed: {result.error}")
```

## Features

- Multi-chain USDC verification (Solana, Base, Ethereum, and more)
- Simple, intuitive API
- Type hints for better IDE support
- Comprehensive error handling
- Production-ready

## Usage

### Verify Payment

```python
from x402 import X402Client

client = X402Client(api_key="x402_live_XXXXX")

result = client.verify_payment(
    tx_hash="transaction_hash_here",
    chain="solana",  # or "base", "ethereum", etc.
    expected_amount=1.00  # Optional
)

if result.success:
    print(f"✓ Verified: {result.amount_usdc} USDC")
    print(f"  From: {result.from_address}")
    print(f"  To: {result.to_address}")
    print(f"  Confirmations: {result.confirmations}")
    print(f"  Risk Score: {result.risk_score}")
else:
    print(f"✗ Failed: {result.error}")
    print(f"  Error Code: {result.error_code}")
```

### Check Usage

```python
usage = client.get_usage()

print(f"Tier: {usage['tier']}")
print(f"Verifications used: {usage['verifications_used']}/{usage['verifications_limit']}")
print(f"Remaining: {usage['verifications_remaining']}")
```

### Get Supported Chains

```python
chains = client.get_supported_chains()

print(f"Your tier: {chains['tier']}")
print(f"Enabled chains: {chains['enabled_chains']}")
```

### Context Manager

```python
with X402Client(api_key="x402_live_XXXXX") as client:
    result = client.verify_payment(
        tx_hash="...",
        chain="solana"
    )
```

## Error Handling

```python
from x402 import X402Client, X402QuotaExceeded, X402AuthError

try:
    client = X402Client(api_key="x402_live_XXXXX")
    result = client.verify_payment(tx_hash="...", chain="solana")

except X402QuotaExceeded:
    print("Monthly quota exceeded - upgrade your plan")

except X402AuthError:
    print("Invalid API key")

except Exception as e:
    print(f"Error: {e}")
```

## API Reference

### `X402Client`

**Constructor:**
- `api_key` (str): Your x402 API key
- `base_url` (str, optional): Custom API URL
- `timeout` (int, optional): Request timeout in seconds (default: 30)

**Methods:**

#### `verify_payment(tx_hash, chain, expected_amount=None)`

Verify on-chain USDC payment.

**Parameters:**
- `tx_hash` (str): Transaction hash to verify
- `chain` (str): Blockchain network (`solana`, `base`, `ethereum`, etc.)
- `expected_amount` (float, optional): Expected payment amount in USDC

**Returns:** `VerificationResult`

#### `get_usage()`

Get current usage statistics.

**Returns:** dict with usage information

#### `get_supported_chains()`

Get chains available for your tier.

**Returns:** dict with chain information

## Pricing Tiers

- **Free**: 1,000 verifications/month, Solana + Base
- **Starter**: 50,000 verifications/month, + Ethereum ($99/mo)
- **Pro**: 500,000 verifications/month, 6 chains ($299/mo)
- **Enterprise**: Unlimited, all chains ($999/mo)

## Support

- Documentation: https://kamiyo.ai/docs/x402
- Issues: https://github.com/kamiyo-ai/x402-python/issues
- Email: support@kamiyo.ai

## License

MIT License
