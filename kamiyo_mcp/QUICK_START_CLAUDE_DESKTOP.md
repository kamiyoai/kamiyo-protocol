# KAMIYO MCP - Claude Desktop Quick Start

Get KAMIYO security intelligence running in Claude Desktop in 5 minutes.

## Prerequisites

- Active KAMIYO subscription (Personal/Team/Enterprise)
- Python 3.11+ installed
- Claude Desktop installed

## 1. Get Your MCP Token (1 minute)

After subscribing at [kamiyo.ai/pricing](https://kamiyo.ai/pricing), check your email for:

```
Subject: Your KAMIYO MCP Access Token

Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Tier: [Your subscription tier]
```

Or get it from: [kamiyo.ai/dashboard/api-keys](https://kamiyo.ai/dashboard/api-keys)

## 2. Install MCP Server (2 minutes)

```bash
# Download/clone the server
git clone https://github.com/kamiyo-ai/kamiyo-mcp-server.git
cd kamiyo-mcp-server

# Install dependencies
pip3.11 install -r requirements-mcp.txt
pip3.11 install -r requirements.txt

# Verify installation
python3.11 -m mcp.server --help
```

## 3. Configure Claude Desktop (1 minute)

### macOS

Edit: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3.11",
      "args": ["-m", "mcp.server"],
      "cwd": "/Users/yourname/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "YOUR_TOKEN_HERE",
        "KAMIYO_API_URL": "https://api.kamiyo.ai",
        "ENVIRONMENT": "production"
      }
    }
  }
}
```

### Windows

Edit: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "C:\\Python311\\python.exe",
      "args": ["-m", "mcp.server"],
      "cwd": "C:\\Users\\YourName\\kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "YOUR_TOKEN_HERE",
        "KAMIYO_API_URL": "https://api.kamiyo.ai",
        "ENVIRONMENT": "production"
      }
    }
  }
}
```

### Linux

Edit: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "/usr/bin/python3.11",
      "args": ["-m", "mcp.server"],
      "cwd": "/home/yourname/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "YOUR_TOKEN_HERE",
        "KAMIYO_API_URL": "https://api.kamiyo.ai",
        "ENVIRONMENT": "production"
      }
    }
  }
}
```

**Replace:**
- `/Users/yourname/kamiyo-mcp-server` with your actual installation path
- `YOUR_TOKEN_HERE` with your MCP token from step 1

## 4. Test Integration (1 minute)

1. **Restart Claude Desktop** (Quit completely, then reopen)

2. **Test with queries:**

```
Check KAMIYO MCP server health
```

Expected: Server status showing "healthy"

```
Search for recent Uniswap exploits
```

Expected: List of Uniswap security incidents

```
Assess the risk of Curve Finance on Ethereum
```

Expected: Risk score, level, and recommendations (varies by tier)

## Example Queries

### Search Exploits
```
Show me flash loan attacks from the last 30 days
Find exploits on Arbitrum worth over $1M
Search for reentrancy vulnerabilities in 2024
```

### Assess Protocol Risk
```
What's the security risk of Aave on Polygon?
Assess Compound protocol safety over the last 6 months
Compare security track records of Uniswap vs SushiSwap
```

### Monitor Wallet (Team+ only)
```
Check if wallet 0x742d35... has exposure to exploited protocols
Monitor my wallet for interactions with risky protocols
```

## Troubleshooting

### "MCP server not found"

1. Verify Python path:
   ```bash
   which python3.11  # macOS/Linux
   where python     # Windows
   ```

2. Use full path in config:
   ```json
   "command": "/usr/local/bin/python3.11"
   ```

### "Invalid token"

1. Regenerate at [kamiyo.ai/dashboard/api-keys](https://kamiyo.ai/dashboard/api-keys)
2. Update `MCP_JWT_SECRET` in config
3. Restart Claude Desktop

### "Subscription inactive"

1. Check billing at [kamiyo.ai/dashboard/billing](https://kamiyo.ai/dashboard/billing)
2. Ensure payment is current
3. Wait 2 minutes for webhook processing

## Subscription Tiers

| Tier | Price | Features |
|------|-------|----------|
| Personal | $19/mo | 1 agent, unlimited queries, real-time data |
| Team | $99/mo | 5 agents, wallet monitoring, priority support |
| Enterprise | $299/mo | Unlimited agents, custom tools, 99.9% SLA |

## Available Tools

- **search_crypto_exploits**: Query exploit database
- **assess_defi_protocol_risk**: Risk analysis for protocols
- **monitor_wallet**: Check wallet exposure (Team+ only)
- **health_check**: Server status

## Full Documentation

- **Setup Guide:** `/docs/MCP_SETUP_GUIDE.md`
- **API Docs:** [kamiyo.ai/api-docs](https://kamiyo.ai/api-docs)
- **Tool Usage:** `/mcp/TOOL_USAGE_GUIDE.md`

## Support

- Email: support@kamiyo.ai
- Discord: [discord.gg/kamiyo](https://discord.gg/kamiyo)
- GitHub: [github.com/kamiyo-ai/kamiyo-mcp-server](https://github.com/kamiyo-ai/kamiyo-mcp-server)

---

**Ready in 5 minutes. Start protecting your AI agents with KAMIYO security intelligence.**
