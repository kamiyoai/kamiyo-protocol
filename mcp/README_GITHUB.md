# KAMIYO MCP Server for Claude Desktop

**Real-time crypto exploit intelligence for your AI agents**

Integrate KAMIYO security intelligence into Claude Desktop via the Model Context Protocol (MCP). Get unlimited access to exploit data from 20+ sources through your subscription.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/kamiyo-ai/kamiyo-mcp-server)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## Features

- **Unlimited Security Queries:** Search 20+ exploit sources in real-time
- **Protocol Risk Assessment:** AI-powered security analysis for DeFi protocols
- **Wallet Monitoring:** Check wallet exposure to exploited protocols (Team+)
- **Subscription Tiers:** Personal ($19/mo), Team ($99/mo), Enterprise ($299/mo)
- **Claude Desktop Integration:** Seamless MCP integration in 5 minutes
- **Cross-Platform:** Works on macOS, Windows, and Linux

---

## Quick Start (5 minutes)

### 1. Subscribe

Visit [kamiyo.io/pricing](https://kamiyo.io/pricing) and choose your tier:

- **Personal** ($19/mo): 1 agent, unlimited queries, real-time data
- **Team** ($99/mo): 5 agents, wallet monitoring, priority support
- **Enterprise** ($299/mo): Unlimited agents, custom tools, 99.9% SLA

### 2. Get Your MCP Token

After subscribing, check your email for:

```
Subject: Your KAMIYO MCP Access Token

Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Or retrieve from: [kamiyo.io/dashboard/api-keys](https://kamiyo.io/dashboard/api-keys)

### 3. Install the Server

```bash
# Clone this repository
git clone https://github.com/kamiyo-ai/kamiyo-mcp-server.git
cd kamiyo-mcp-server

# Install dependencies
pip3.11 install -r requirements-mcp.txt
pip3.11 install -r requirements.txt

# Verify installation
python3.11 -m mcp.server --help
```

### 4. Configure Claude Desktop

**macOS:** Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** Edit `%APPDATA%\Claude\claude_desktop_config.json`

**Linux:** Edit `~/.config/Claude/claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3.11",
      "args": ["-m", "mcp.server"],
      "cwd": "/absolute/path/to/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "YOUR_TOKEN_HERE",
        "KAMIYO_API_URL": "https://api.kamiyo.io",
        "ENVIRONMENT": "production"
      }
    }
  }
}
```

**Replace:**
- `/absolute/path/to/kamiyo-mcp-server` with your installation path
- `YOUR_TOKEN_HERE` with your MCP token from step 2

### 5. Test Integration

1. **Restart Claude Desktop**
2. **Try these queries:**

```
Check KAMIYO MCP server health
```

```
Search for recent Uniswap exploits
```

```
Assess the security risk of Curve Finance on Ethereum
```

---

## Available Tools

### `search_crypto_exploits`

Search the exploit database for security incidents.

```python
search_crypto_exploits(
    query="Uniswap",         # Protocol, vulnerability, chain
    limit=50,                # Max results (capped by tier)
    since="2024-01-01",      # ISO 8601 date filter
    chain="Ethereum"         # Blockchain filter
)
```

**Tier Limits:**
- Personal: Max 50 results
- Team: Max 200 results
- Enterprise: Max 1000 results

### `assess_defi_protocol_risk`

Assess security risk for DeFi protocols.

```python
assess_defi_protocol_risk(
    protocol_name="Curve",
    chain="Ethereum",
    time_window_days=180
)
```

**Returns:**
- Personal: Basic risk score and level
- Team: + Recent exploit summaries
- Enterprise: + Detailed recommendations and peer comparison

### `monitor_wallet` (Team+ only)

Check wallet interactions with exploited protocols.

```python
monitor_wallet(
    wallet_address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    chain="ethereum",
    lookback_days=90
)
```

**Access:** Team and Enterprise tiers only

### `health_check`

Check MCP server status (no authentication required).

```python
health_check()
```

---

## Example Queries

### Search Exploits

```
Show me flash loan attacks from the last 30 days
```

```
Find exploits on Arbitrum worth over $1M
```

```
Search for reentrancy vulnerabilities in 2024
```

### Assess Protocol Risk

```
What's the security risk of Aave on Polygon?
```

```
Assess Compound protocol safety over the last 6 months
```

```
Compare security track records of Uniswap vs SushiSwap
```

### Monitor Wallet (Team+)

```
Check if wallet 0x742d35... has exposure to exploited protocols
```

```
Monitor my wallet for interactions with risky protocols
```

---

## Subscription Tiers

| Feature | Personal | Team | Enterprise |
|---------|----------|------|------------|
| **Price** | $19/month | $99/month | $299/month |
| **AI Agents** | 1 | 5 | Unlimited |
| **Search Results** | Max 50 | Max 200 | Max 1000 |
| **Risk Assessment** | Basic | + Recent exploits | + Recommendations |
| **Wallet Monitoring** | ❌ | ✅ | ✅ |
| **Data Sources** | 20+ | 20+ | 20+ |
| **Data Delay** | Real-time | Real-time | Real-time |
| **Support** | Email | Priority | Dedicated |
| **SLA** | ❌ | ❌ | 99.9% |

---

## Requirements

- **Python:** 3.11 or higher
- **Claude Desktop:** Latest version
- **Operating System:** macOS, Windows, or Linux
- **Subscription:** Active KAMIYO subscription (Personal/Team/Enterprise)

---

## Installation

### macOS

```bash
# Install Python 3.11+ (if not installed)
brew install python@3.11

# Clone repository
git clone https://github.com/kamiyo-ai/kamiyo-mcp-server.git
cd kamiyo-mcp-server

# Install dependencies
pip3.11 install -r requirements-mcp.txt
pip3.11 install -r requirements.txt

# Verify
python3.11 -m mcp.server --help
```

### Windows

```powershell
# Install Python 3.11+ from python.org

# Clone repository
git clone https://github.com/kamiyo-ai/kamiyo-mcp-server.git
cd kamiyo-mcp-server

# Install dependencies
python -m pip install -r requirements-mcp.txt
python -m pip install -r requirements.txt

# Verify
python -m mcp.server --help
```

### Linux

```bash
# Install Python 3.11+ (Ubuntu/Debian)
sudo apt update
sudo apt install python3.11 python3.11-pip

# Clone repository
git clone https://github.com/kamiyo-ai/kamiyo-mcp-server.git
cd kamiyo-mcp-server

# Install dependencies
pip3.11 install -r requirements-mcp.txt
pip3.11 install -r requirements.txt

# Verify
python3.11 -m mcp.server --help
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_JWT_SECRET` | **Yes** | - | Your MCP access token |
| `KAMIYO_API_URL` | No | `https://api.kamiyo.io` | API endpoint |
| `ENVIRONMENT` | No | `production` | Environment mode |
| `LOG_LEVEL` | No | `INFO` | Logging verbosity |
| `STRIPE_SECRET_KEY` | No | - | For subscription validation |
| `DATABASE_URL` | No | `sqlite:///data/kamiyo.db` | Local cache |

### Claude Desktop Config Paths

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

---

## Troubleshooting

### "MCP server not found"

**Solution:** Use full path to Python

```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "/usr/local/bin/python3.11",  // Full path
      "args": ["-m", "mcp.server"],
      "cwd": "/Users/yourname/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "..."
      }
    }
  }
}
```

Find your Python path:

```bash
# macOS/Linux
which python3.11

# Windows
where python
```

### "Invalid token" or "Authentication failed"

**Solutions:**

1. **Verify token is correct:**
   - Check email for full token
   - Ensure token is on single line (no line breaks)
   - Token should start with `eyJ`

2. **Regenerate token:**
   - Visit [kamiyo.io/dashboard/api-keys](https://kamiyo.io/dashboard/api-keys)
   - Click "Regenerate MCP Token"
   - Update config with new token
   - Restart Claude Desktop

### "Subscription inactive"

**Solutions:**

1. **Check subscription status:**
   - Visit [kamiyo.io/dashboard/billing](https://kamiyo.io/dashboard/billing)
   - Ensure payment is current
   - Verify subscription is active

2. **Renew subscription:**
   - Update payment method if needed
   - Wait 2 minutes for webhook processing
   - Restart Claude Desktop

### "Database connection failed"

**Solution:** Create data directory

```bash
# Create data directory
mkdir -p /path/to/kamiyo-mcp-server/data

# Test database
cd /path/to/kamiyo-mcp-server
python3.11 -c "from database import get_db; db = get_db(); print('Database OK')"
```

### "ModuleNotFoundError"

**Solution:** Reinstall dependencies

```bash
cd /path/to/kamiyo-mcp-server

# Clean install
pip3.11 uninstall -y fastmcp pydantic pyjwt stripe httpx
pip3.11 install -r requirements-mcp.txt
pip3.11 install -r requirements.txt
```

---

## Documentation

- **Full Setup Guide:** [docs/MCP_SETUP_GUIDE.md](docs/MCP_SETUP_GUIDE.md)
- **API Documentation:** [kamiyo.io/api-docs](https://kamiyo.io/api-docs)
- **Tool Usage Guide:** [mcp/TOOL_USAGE_GUIDE.md](mcp/TOOL_USAGE_GUIDE.md)
- **Quick Start:** [mcp/QUICK_START_CLAUDE_DESKTOP.md](mcp/QUICK_START_CLAUDE_DESKTOP.md)

---

## Support

### Community

- **Discord:** [discord.gg/kamiyo](https://discord.gg/kamiyo)
- **GitHub Issues:** [github.com/kamiyo-ai/kamiyo-mcp-server/issues](https://github.com/kamiyo-ai/kamiyo-mcp-server/issues)

### Email Support

- **Personal Tier:** support@kamiyo.io (48h response time)
- **Team Tier:** priority@kamiyo.io (24h response time)
- **Enterprise Tier:** dedicated@kamiyo.io (4h response time, SLA)

### Status

Check service status at: [status.kamiyo.io](https://status.kamiyo.io)

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Security

Found a security vulnerability? Please email security@kamiyo.io instead of opening a public issue.

---

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

---

## Links

- **Website:** [kamiyo.io](https://kamiyo.io)
- **Pricing:** [kamiyo.io/pricing](https://kamiyo.io/pricing)
- **API Docs:** [kamiyo.io/api-docs](https://kamiyo.io/api-docs)
- **Dashboard:** [kamiyo.io/dashboard](https://kamiyo.io/dashboard)
- **Status:** [status.kamiyo.io](https://status.kamiyo.io)

---

**Built by KAMIYO** | Real-time security intelligence for AI agents

**Ready in 5 minutes. Start protecting your AI agents today.**
