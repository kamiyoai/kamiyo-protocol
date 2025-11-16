# WebSocket Real-time Monitoring Guide

Complete guide for setting up and using the Hyperliquid WebSocket real-time monitoring system.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [Monitored Data Streams](#monitored-data-streams)
6. [Alert Integration](#alert-integration)
7. [Usage Examples](#usage-examples)
8. [Troubleshooting](#troubleshooting)
9. [Performance](#performance)

---

## Overview

The WebSocket monitoring system provides **real-time security monitoring** for Hyperliquid by connecting to the official WebSocket API and processing live data streams.

**Key Features:**
- ✅ Real-time price monitoring for oracle deviation detection
- ✅ Live liquidation tracking for HLP vault and monitored addresses
- ✅ Flash loan attack detection (<10 second patterns)
- ✅ Cascade liquidation detection
- ✅ Automatic reconnection with exponential backoff
- ✅ Multi-channel alert integration
- ✅ Low latency (<100ms from event to alert)

**vs REST API Polling:**

| Feature | WebSocket | REST Polling |
|---------|-----------|--------------|
| Latency | <100ms | 1-60s (poll interval) |
| Resource Usage | Low | High (constant requests) |
| Real-time Events | ✅ Yes | ❌ No |
| Rate Limiting | None | Yes (60/min default) |
| Missed Events | ❌ No | ✅ Yes (between polls) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Hyperliquid WebSocket API                  │
│             wss://api.hyperliquid.xyz/ws                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Real-time data streams
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              HyperliquidWebSocketClient                     │
│  • Connection management                                    │
│  • Auto-reconnection                                        │
│  • Subscription handling                                    │
│  • Message routing                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Parsed messages
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  WebSocketHandlers                          │
│  • handle_all_mids()     → Oracle deviation detection       │
│  • handle_trades()       → Large trade detection            │
│  • handle_user_fills()   → Liquidation monitoring           │
│  • handle_l2_book()      → Order book analysis              │
│  • handle_user_fundings() → Funding rate monitoring         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Security events
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              HyperliquidAlertManager                        │
│  • Multi-channel alerts (Telegram, Discord, Slack, etc.)    │
│  • Severity-based filtering                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Step 1: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 2: Configure Environment

Add to `.env`:

```bash
# WebSocket Configuration
WEBSOCKET_ENABLED=true
WEBSOCKET_URL=wss://api.hyperliquid.xyz/ws
WEBSOCKET_AUTO_RECONNECT=true

# Monitored Addresses
HLP_VAULT_ADDRESS=0xdfc24b077bc1425ad1dea75bcb6f8158e10df303
MONITORED_ADDRESSES=0x1234...,0x5678...

# Alert Configuration (see ALERTS_SETUP.md)
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
ALERT_MIN_SEVERITY=high
```

### Step 3: Start WebSocket Monitor

```bash
# Run directly
python websocket/runner.py

# Run in background
nohup python websocket/runner.py > websocket.log 2>&1 &

# Run with Docker (recommended)
docker-compose up -d websocket
```

### Step 4: Verify Connection

Check logs:

```bash
# Direct run
tail -f websocket.log

# Docker
docker-compose logs -f websocket

# Expected output:
# INFO - Connecting to Hyperliquid WebSocket: wss://api.hyperliquid.xyz/ws
# INFO - ✅ WebSocket connected successfully
# INFO - Subscribed to: {'type': 'allMids'}
# INFO - Subscribed to: {'type': 'userFills', 'user': '0x...'}
```

---

## Configuration

### Environment Variables

```bash
# Enable/disable WebSocket monitoring
WEBSOCKET_ENABLED=true

# WebSocket endpoint (mainnet or testnet)
WEBSOCKET_URL=wss://api.hyperliquid.xyz/ws
# For testnet:
# WEBSOCKET_URL=wss://api.hyperliquid-testnet.xyz/ws

# Auto-reconnect on disconnection
WEBSOCKET_AUTO_RECONNECT=true

# HLP Vault to monitor
HLP_VAULT_ADDRESS=0xdfc24b077bc1425ad1dea75bcb6f8158e10df303

# Additional addresses to monitor (comma-separated)
MONITORED_ADDRESSES=0x1234...,0x5678...,0x9abc...
```

### Command Line Options

```bash
python websocket/runner.py --help

Options:
  --testnet             Use testnet instead of mainnet
  --duration SECONDS    Run for specific duration (for testing)
  --hlp-vault ADDRESS   Override HLP vault address
  --addresses ADDRS     Comma-separated addresses to monitor
```

**Examples:**

```bash
# Run on mainnet
python websocket/runner.py

# Run on testnet
python websocket/runner.py --testnet

# Test for 60 seconds
python websocket/runner.py --duration 60

# Monitor custom addresses
python websocket/runner.py --addresses 0x123...,0x456...
```

---

## Monitored Data Streams

### 1. All Mids (Price Updates)

**Subscription:** `{"type": "allMids"}`

**Purpose:** Real-time oracle deviation detection

**Message Format:**
```json
{
  "channel": "allMids",
  "data": {
    "mids": {
      "BTC": "43250.0",
      "ETH": "2250.5",
      "SOL": "98.75"
    }
  }
}
```

**Triggers Alerts:**
- Oracle deviation >0.5% (WARNING)
- Oracle deviation >1.0% (CRITICAL)

### 2. User Fills (Liquidations)

**Subscription:** `{"type": "userFills", "user": "0x..."}`

**Purpose:** Monitor HLP vault and addresses for liquidations

**Message Format:**
```json
{
  "channel": "userFills",
  "data": {
    "isSnapshot": false,
    "user": "0x...",
    "fills": [
      {
        "coin": "BTC",
        "px": "43250.0",
        "sz": "1.5",
        "side": "B",
        "time": 1699000000000,
        "liquidation": true,
        "closedPnl": "-50000.0"
      }
    ]
  }
}
```

**Triggers Alerts:**
- Flash loan attack (2+ liquidations in 10s, >$500k)
- Cascade liquidation (5+ liquidations in 5min)
- Large liquidation (>$500k single)

### 3. Trades

**Subscription:** `{"type": "trades", "coin": "BTC"}`

**Purpose:** Detect unusual trading patterns

**Message Format:**
```json
{
  "channel": "trades",
  "data": [
    {
      "coin": "BTC",
      "side": "B",
      "px": "43250.0",
      "sz": "10.5",
      "time": 1699000000000,
      "hash": "0x..."
    }
  ]
}
```

**Triggers Alerts:**
- Large trade (>$1M single trade)

### 4. Order Book (L2)

**Subscription:** `{"type": "l2Book", "coin": "BTC"}`

**Purpose:** Detect order book manipulation

**Message Format:**
```json
{
  "channel": "l2Book",
  "data": {
    "coin": "BTC",
    "time": 1699000000000,
    "levels": [
      [
        {"px": "43250.0", "sz": "1.5", "n": 3},
        {"px": "43240.0", "sz": "2.0", "n": 5}
      ],
      [
        {"px": "43260.0", "sz": "1.0", "n": 2},
        {"px": "43270.0", "sz": "3.5", "n": 7}
      ]
    ]
  }
}
```

**Use Case:** Future spoofing/manipulation detection

### 5. User Fundings

**Subscription:** `{"type": "userFundings", "user": "0x..."}`

**Purpose:** Monitor funding rate manipulation

**Message Format:**
```json
{
  "channel": "userFundings",
  "data": {
    "isSnapshot": false,
    "user": "0x...",
    "fundings": [
      {
        "time": 1699000000000,
        "coin": "BTC",
        "fundingRate": "0.0001",
        "szi": "10.0",
        "usdc": "-10.5"
      }
    ]
  }
}
```

**Triggers Alerts:**
- Extreme funding rate (>1% or <-1%)

---

## Alert Integration

WebSocket monitoring automatically triggers alerts through the multi-channel alert system.

### Alert Flow

```
WebSocket Event → Handler Analysis → Alert Decision → Multi-channel Delivery
     ↓                    ↓                 ↓                    ↓
 Liquidation     Pattern Detection     Severity Check      Telegram
 detected       (flash loan, cascade)  (high/critical)     Discord
                                                            Slack
                                                            Email
```

### Example Alerts

**Flash Loan Attack Detection:**
```
⚡ Flash Loan Attack Detected ($750,000)

Potential flash loan attack: $750,000 liquidated in 8.5s across 3 positions.

📊 Details:
• Total Value: $750,000
• Duration: 8.5s
• Liquidations: 3
• Assets: BTC, ETH
• Action: Investigate transaction sequence

Timestamp: 2025-11-03 14:23:45 UTC
```

**Cascade Liquidation:**
```
⚠️ Cascade Liquidation: BTC ($1,250,000)

5 liquidations detected in 300s. Total value: $1,250,000

📊 Details:
• Count: 5 liquidations
• Duration: 5m 0s
• Price Impact: BTC: 2.5%
• Action: Monitor market stability
```

**Oracle Deviation:**
```
📊 Oracle Deviation: BTC (1.25%)

Real-time price deviation detected on BTC.

📊 Details:
• Deviation: 1.25%
• Hyperliquid: $43,250.00
• Last Known: $42,700.00
• Duration: <1s (real-time)
```

---

## Usage Examples

### Example 1: Basic Monitoring

```python
# websocket/runner.py will handle this automatically
import asyncio
from websocket.runner import HyperliquidWebSocketRunner

async def main():
    runner = HyperliquidWebSocketRunner(use_testnet=False)
    await runner.run()

if __name__ == '__main__':
    asyncio.run(main())
```

### Example 2: Custom Handler

```python
import asyncio
from websocket.client import HyperliquidWebSocketClient, SubscriptionType

async def my_custom_handler(data):
    print(f"Received data: {data}")

async def main():
    client = HyperliquidWebSocketClient()

    # Register custom handler
    client.register_handler(
        SubscriptionType.TRADES,
        my_custom_handler
    )

    await client.connect()
    await client.subscribe_trades("BTC")
    await client.run()

asyncio.run(main())
```

### Example 3: Programmatic Control

```python
import asyncio
from websocket.runner import HyperliquidWebSocketRunner

async def main():
    # Create runner
    runner = HyperliquidWebSocketRunner(
        use_testnet=False,
        monitored_addresses=["0x123...", "0x456..."]
    )

    # Run for 5 minutes
    await runner.run_for_duration(300)

    # Get statistics
    stats = runner.get_stats()
    print(f"Messages received: {stats['websocket']['messages_received']}")
    print(f"Liquidations tracked: {stats['handlers']['recent_liquidations']}")

asyncio.run(main())
```

### Example 4: Docker Deployment

Add to `docker-compose.yml`:

```yaml
services:
  websocket:
    build: .
    command: python websocket/runner.py
    environment:
      - WEBSOCKET_ENABLED=true
      - HLP_VAULT_ADDRESS=${HLP_VAULT_ADDRESS}
      - MONITORED_ADDRESSES=${MONITORED_ADDRESSES}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
    networks:
      - kamiyo-network
```

Then:

```bash
docker-compose up -d websocket
docker-compose logs -f websocket
```

---

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect to WebSocket

**Solutions:**
1. Check internet connectivity
2. Verify WebSocket URL is correct
3. Check if Hyperliquid API is operational
4. Ensure no firewall blocking WebSocket connections

**Test:**
```bash
# Test WebSocket connectivity
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  wss://api.hyperliquid.xyz/ws
```

### Reconnection Loops

**Problem:** Constantly reconnecting

**Possible Causes:**
- Rate limiting (>1000 subscriptions per IP)
- Network instability
- Invalid subscriptions

**Solutions:**
1. Check subscription count: should be <1000
2. Verify monitored addresses are valid
3. Check network stability
4. Review logs for specific error messages

### No Alerts Received

**Problem:** WebSocket connected but no alerts

**Solutions:**
1. Verify alert configuration (see `ALERTS_SETUP.md`)
2. Check `ALERT_MIN_SEVERITY` setting
3. Verify monitored addresses are active
4. Check logs for handler errors

```bash
# Check logs
docker-compose logs websocket | grep -i "alert\|error"
```

### High CPU/Memory Usage

**Problem:** WebSocket process using too many resources

**Solutions:**
1. Reduce number of monitored addresses
2. Remove unnecessary subscriptions (L2 book, trades for many assets)
3. Increase hardware resources
4. Check for message processing bottlenecks

---

## Performance

### Resource Usage

| Metric | Value |
|--------|-------|
| CPU (idle) | <5% |
| CPU (active) | 10-20% |
| Memory | 50-100 MB |
| Network (receive) | ~10-50 KB/s |
| Network (send) | ~1 KB/s |

### Latency

| Event | Time to Alert |
|-------|---------------|
| Price update → Oracle deviation alert | <100ms |
| Liquidation → Flash loan alert | <500ms |
| Connection loss → Reconnect | 5s (first attempt) |

### Scaling

**Maximum Subscriptions:** 1000 per IP (Hyperliquid limit)

**Recommended Configuration:**
- 1 allMids subscription
- 10-50 userFills subscriptions (monitored addresses)
- 5-10 trades subscriptions (major assets)
- Total: ~100 subscriptions

**To Monitor More Addresses:**
Use multiple IPs or servers to bypass the 1000 subscription limit.

---

## Best Practices

### 1. Always Enable Auto-Reconnect

```bash
WEBSOCKET_AUTO_RECONNECT=true
```

This ensures monitoring continues even if connection is lost.

### 2. Monitor Critical Addresses Only

Don't subscribe to every address. Focus on:
- HLP vault
- High-value wallets
- Known liquidation targets

### 3. Use with REST API for Redundancy

Run both WebSocket monitoring and periodic REST API checks:

```yaml
services:
  api:
    command: uvicorn api.main:app --host 0.0.0.0
  websocket:
    command: python websocket/runner.py
```

### 4. Set Appropriate Alert Thresholds

```bash
# Production
ALERT_MIN_SEVERITY=high  # Only critical events

# Development
ALERT_MIN_SEVERITY=info  # All events
```

### 5. Monitor the Monitor

Set up external monitoring to ensure WebSocket is running:

```bash
# Cron job to check WebSocket process
*/5 * * * * pgrep -f "websocket/runner.py" || systemctl restart kamiyo-websocket
```

---

## API Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Max Subscriptions | 1000 per IP | Enforced by Hyperliquid |
| Connection Limit | None documented | Use responsibly |
| Message Rate | None documented | ~100 msg/s typical |
| Reconnection | No limit | Use exponential backoff |

---

## FAQ

**Q: Can I monitor multiple addresses?**
A: Yes, up to 1000 subscriptions per IP. Each `userFills` subscription = 1 subscription.

**Q: How do I add more coins to monitor?**
A: Edit the `major_assets` list in `websocket/runner.py` or add subscriptions programmatically.

**Q: Does this replace the REST API monitors?**
A: No, use both for redundancy. WebSocket is real-time, REST API is a safety net.

**Q: Can I run multiple WebSocket clients?**
A: Yes, but each client counts toward the 1000 subscription limit per IP.

**Q: What happens if I exceed 1000 subscriptions?**
A: The SDK will raise an error. You'll need to use multiple IPs or reduce subscriptions.

**Q: How do I monitor testnet?**
A: Use `--testnet` flag or set `WEBSOCKET_URL=wss://api.hyperliquid-testnet.xyz/ws`

---

## Support

- **Documentation:** `/docs` folder
- **Issues:** https://github.com/mizuki-tamaki/kamiyo-hyperliquid/issues
- **Examples:** `websocket/runner.py`

---

*Last Updated: 2025-11-03*
