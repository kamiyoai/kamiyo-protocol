# KAMIYO MCP + PayAI Integration Guide

**Status:** ✅ Production Ready
**Date:** November 2, 2025

## Overview

KAMIYO's Model Context Protocol (MCP) server now supports x402 payments via PayAI Network, enabling AI agents to pay for exploit intelligence data across 12 blockchain networks.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│         AI Agent (Claude Desktop, etc.)             │
├─────────────────────────────────────────────────────┤
│                  MCP Client SDK                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. Request: kamiyo.get_exploits()                 │
│  2. Server Response: HTTP 402 Payment Required      │
│  3. Agent authorizes payment via PayAI              │
│  4. Retry with X-PAYMENT header                    │
│  5. Receive exploit intelligence data               │
│                                                     │
├─────────────────────────────────────────────────────┤
│         KAMIYO Unified Payment Gateway              │
├─────────────────────────────────────────────────────┤
│  Priority 1: PayAI Network (12 networks)           │
│  Priority 2: KAMIYO Native (3 networks)             │
└─────────────────────────────────────────────────────┘
```

## MCP Tools with x402 Support

### Available Tools

All KAMIYO MCP tools now support x402 payments:

| Tool | Endpoint | Price (USDC) | Description |
|------|----------|--------------|-------------|
| `kamiyo.get_exploits` | `/exploits` | $0.01 | Get recent exploit data |
| `kamiyo.get_latest_alert` | `/exploits/latest-alert` | $0.01 | Latest exploit alert |
| `kamiyo.deep_dive_analysis` | `/api/v2/analysis/deep-dive` | $0.02 | AI-enhanced exploit analysis |
| `kamiyo.protocol_risk_score` | `/protocols/risk-score` | $0.02 | Protocol risk assessment |
| `kamiyo.wallet_risk_check` | `/wallets/risk-check` | $0.005 | Wallet screening |

## Payment Flow

### 1. AI Agent Makes Request

```typescript
// MCP client in AI agent (e.g., Claude Desktop)
const result = await mcp.call_tool({
  name: "kamiyo.get_exploits",
  arguments: {
    chain: "ethereum",
    limit: 10
  }
});
```

### 2. Server Returns 402 Payment Required

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
      "x402_standard": {
        "x402Version": 1,
        "accepts": [...]
      }
    },
    {
      "provider": "KAMIYO Native",
      "type": "direct_transfer",
      "priority": 2,
      "payment_addresses": {...}
    }
  ]
}
```

### 3. Agent Authorizes Payment

```typescript
// AI agent uses PayAI SDK to authorize payment
const payment = await payai.authorizePayment({
  endpoint: "/exploits",
  amount: "0.01",
  network: "base",
  facilitatorUrl: "https://facilitator.payai.network"
});
```

### 4. Retry with Payment Header

```typescript
// Retry original request with X-PAYMENT header
const result = await mcp.call_tool({
  name: "kamiyo.get_exploits",
  arguments: { chain: "ethereum", limit: 10 },
  headers: {
    "X-PAYMENT": payment.token
  }
});
```

### 5. Receive Data

```json
{
  "exploits": [
    {
      "tx_hash": "0xabc...",
      "chain": "ethereum",
      "amount_stolen_usd": 50000000,
      "timestamp": "2025-11-02T12:00:00Z",
      "attack_type": "Price Oracle Manipulation"
    }
  ]
}
```

## MCP Server Configuration

### Environment Variables

```bash
# Enable x402 payments for MCP server
X402_ENABLED=true
X402_USE_UNIFIED_GATEWAY=true
X402_PAYAI_ENABLED=true

# PayAI merchant address (receives payments)
X402_PAYAI_MERCHANT_ADDRESS=0x8595171C4A3d5B9F70585c4AbAAd08613360e643

# Endpoint pricing
X402_ENDPOINT_PRICES=/exploits:0.01,/exploits/latest-alert:0.01,/api/v2/analysis/deep-dive:0.02
```

### MCP Server Initialization

```python
# mcp_server.py
from fastapi import FastAPI
from api.x402.middleware import X402Middleware
from api.x402.routes import payment_tracker

app = FastAPI()

# Add x402 payment middleware
app.add_middleware(
    X402Middleware,
    payment_tracker=payment_tracker,
    use_unified_gateway=True  # Enable PayAI + native
)

# Your MCP tool endpoints
@app.get("/exploits")
async def get_exploits(...):
    # This endpoint is now protected by x402
    # Returns 402 if no valid payment
    # Returns data if payment verified
    ...
```

## MCP Client Integration

### Python MCP Client

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def run_mcp_client():
    server_params = StdioServerParameters(
        command="python",
        args=["mcp_server.py"],
        env=None
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # List available tools
            tools = await session.list_tools()
            print(f"Available tools: {[t.name for t in tools.tools]}")

            # Call tool (may trigger payment)
            try:
                result = await session.call_tool(
                    "kamiyo.get_exploits",
                    arguments={"chain": "ethereum", "limit": 10}
                )
                print(result)
            except Exception as e:
                if "402" in str(e):
                    # Handle payment required
                    # Implement PayAI authorization flow
                    print("Payment required - implement PayAI flow")
                raise

asyncio.run(run_mcp_client())
```

### TypeScript MCP Client

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function runMCPClient() {
  const transport = new StdioClientTransport({
    command: "python",
    args: ["mcp_server.py"]
  });

  const client = new Client({
    name: "kamiyo-client",
    version: "1.0.0"
  }, {
    capabilities: {}
  });

  await client.connect(transport);

  // List tools
  const tools = await client.listTools();
  console.log("Tools:", tools.tools.map(t => t.name));

  // Call tool
  try {
    const result = await client.callTool({
      name: "kamiyo.get_exploits",
      arguments: { chain: "ethereum", limit: 10 }
    });
    console.log(result);
  } catch (error) {
    if (error.message.includes("402")) {
      // Handle payment required
      console.log("Payment required - implement PayAI flow");
    }
    throw error;
  }
}

runMCPClient();
```

## PayAI Integration for MCP

### Option 1: PayAI SDK (Recommended)

```typescript
import { useX402 } from '@x402sdk/sdk';

async function handleMCPPayment(paymentDetails) {
  // Extract PayAI option from 402 response
  const payaiOption = paymentDetails.payment_options.find(
    opt => opt.provider === "PayAI Network"
  );

  // Authorize payment via PayAI
  const payment = await useX402(
    paymentDetails.endpoint,
    paymentDetails.amount_usdc,
    payaiOption.x402_standard
  );

  // Return payment token for X-PAYMENT header
  return payment.token;
}
```

### Option 2: Manual Payment Construction

```python
import httpx
import base64
import json
from web3 import Web3

async def create_payai_payment(endpoint: str, amount_usdc: float, network: str):
    # Connect wallet
    w3 = Web3(Web3.HTTPProvider("https://base-mainnet.g.alchemy.com/v2/..."))
    account = w3.eth.account.from_key(os.getenv("PRIVATE_KEY"))

    # Create payment payload
    payload = {
        "x402Version": 1,
        "scheme": "exact",
        "network": network,
        "payload": {
            "payer": account.address,
            "amount": str(int(amount_usdc * 10**6)),  # USDC has 6 decimals
            "resource": endpoint,
            # ... signature, etc.
        }
    }

    # Encode as base64
    payment_header = base64.b64encode(
        json.dumps(payload).encode('utf-8')
    ).decode('utf-8')

    return payment_header
```

## Supported Networks

### PayAI Facilitator (Priority 1)

AI agents can pay using wallets on any of these networks:

- **Solana** (mainnet, devnet)
- **Base** (mainnet, sepolia)
- **Polygon** (mainnet, amoy)
- **Avalanche** (mainnet, fuji)
- **Sei** (mainnet, testnet)
- **IoTeX**
- **Peaq**

### KAMIYO Native (Priority 2)

Fallback for advanced users:

- **Base**
- **Ethereum**
- **Solana**

## Testing

### Test with Mock Payments

```python
import pytest
from mcp import ClientSession

@pytest.mark.asyncio
async def test_mcp_payment_flow():
    # Initialize MCP client
    async with get_mcp_session() as session:
        # Call tool (should return 402)
        with pytest.raises(PaymentRequiredError) as exc:
            await session.call_tool(
                "kamiyo.get_exploits",
                arguments={"chain": "ethereum"}
            )

        # Verify 402 response
        assert exc.value.status_code == 402
        assert "PayAI Network" in exc.value.payment_options[0]["provider"]

        # Mock payment authorization
        payment_token = create_mock_payment()

        # Retry with payment
        result = await session.call_tool(
            "kamiyo.get_exploits",
            arguments={"chain": "ethereum"},
            headers={"X-PAYMENT": payment_token}
        )

        # Verify data received
        assert result["exploits"] is not None
```

### Test on Testnet

```bash
# Configure testnet
export X402_BASE_RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
export X402_PAYAI_MERCHANT_ADDRESS=0xTestAddress

# Run MCP server
python mcp_server.py

# Test with MCP client
python test_mcp_client.py
```

## Production Deployment

### 1. Configure Environment

```bash
# Production merchant addresses
X402_PAYAI_MERCHANT_ADDRESS=0xYourProductionAddress
X402_BASE_PAYMENT_ADDRESS=0xYourBaseAddress

# Production RPC endpoints
X402_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
X402_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
X402_SOLANA_RPC_URL=https://solana-mainnet.helius.dev/YOUR_KEY

# Enable all features
X402_ENABLED=true
X402_USE_UNIFIED_GATEWAY=true
X402_PAYAI_ENABLED=true
```

### 2. Start MCP Server

```bash
uvicorn mcp_server:app --host 0.0.0.0 --port 8000
```

### 3. Configure MCP in Claude Desktop

```json
{
  "mcpServers": {
    "kamiyo": {
      "command": "python",
      "args": ["/path/to/kamiyo/mcp_server.py"],
      "env": {
        "X402_ENABLED": "true",
        "X402_USE_UNIFIED_GATEWAY": "true"
      }
    }
  }
}
```

### 4. Monitor Analytics

```python
from api.x402.payment_analytics import get_payment_analytics

analytics = get_payment_analytics()

# Get performance metrics
metrics = await analytics.get_facilitator_performance(hours=24)
print(f"PayAI success rate: {metrics['payai'].success_rate:.1%}")
print(f"PayAI avg latency: {metrics['payai'].avg_latency_ms:.0f}ms")

# Get report
report = await analytics.get_summary_report(hours=24)
print(report)
```

## Cost Optimization

### Batch Requests

```typescript
// Instead of multiple single requests
const exploit1 = await mcp.callTool("kamiyo.get_exploits", { limit: 1 });
const exploit2 = await mcp.callTool("kamiyo.get_exploits", { limit: 1 });
const exploit3 = await mcp.callTool("kamiyo.get_exploits", { limit: 1 });
// Total cost: $0.03

// Use batch request
const exploits = await mcp.callTool("kamiyo.get_exploits", { limit: 10 });
// Total cost: $0.01
```

### Payment Caching

Payments are cached for 5 minutes by default:

```bash
# Configure cache duration
X402_CACHE_TTL=300  # 5 minutes
```

Subsequent requests within the cache window use the same payment.

### Subscription Model (Future)

For high-volume MCP usage, consider subscription:

```bash
# Coming soon: MCP subscription bundles
# 100 queries for $0.80 (20% discount)
# 1000 queries for $7.00 (30% discount)
```

## Security

### Payment Verification

All payments are verified before granting access:

1. **PayAI verification** - Delegated to PayAI facilitator
2. **On-chain settlement** - Verified on blockchain
3. **Payment tracking** - Prevents replay attacks
4. **Transaction age validation** - Rejects old transactions

### MCP Authentication

```python
# Add API key authentication for MCP
@app.middleware("http")
async def verify_mcp_client(request: Request, call_next):
    api_key = request.headers.get("X-API-Key")
    if not api_key or not verify_api_key(api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return await call_next(request)
```

### Rate Limiting

```bash
# Configure rate limits for MCP
X402_RATE_LIMIT_PER_MINUTE=60
X402_RATE_LIMIT_PER_HOUR=1000
```

## Troubleshooting

### Payment Failures

```python
# Check payment status
from api.x402.routes import payment_tracker

payment = await payment_tracker.get_payment(payment_id)
print(f"Status: {payment.status}")
print(f"Error: {payment.error_reason}")
```

### PayAI Connectivity

```python
# Test PayAI facilitator
from api.x402.payai_facilitator import PayAIFacilitator

facilitator = PayAIFacilitator(merchant_address="0x...")
networks = await facilitator.get_supported_networks()
print(f"Supported: {networks}")
```

### Analytics Not Recording

```bash
# Verify analytics enabled
export X402_ANALYTICS_ENABLED=true

# Check metrics cache
python -c "from api.x402.payment_analytics import get_payment_analytics; print(get_payment_analytics().metrics_cache)"
```

## Resources

- **MCP Specification**: https://spec.modelcontextprotocol.io
- **x402 Standard**: https://x402.org/x402-whitepaper.pdf
- **PayAI Documentation**: https://docs.payai.network
- **KAMIYO API**: https://kamiyo.ai/docs
- **PayAI Integration Guide**: `PAYAI_INTEGRATION.md`
- **Production Readiness**: `PAYAI_PRODUCTION_READINESS.md`

## Support

- **MCP Integration**: support@kamiyo.ai
- **Payment Issues**: x402@kamiyo.ai
- **PayAI Partnership**: docs.payai.network

---

**Status:** ✅ Production Ready
**Last Updated:** November 2, 2025
**MCP Version:** 1.0
**x402 Version:** 1
