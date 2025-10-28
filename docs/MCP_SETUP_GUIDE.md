# KAMIYO MCP Setup Guide for Claude Desktop

Complete step-by-step guide to integrate KAMIYO security intelligence into Claude Desktop via the Model Context Protocol (MCP).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Subscribe to KAMIYO MCP](#subscribe-to-kamiyo-mcp)
3. [Get Your MCP Access Token](#get-your-mcp-access-token)
4. [Install the KAMIYO MCP Server](#install-the-kamiyo-mcp-server)
5. [Configure Claude Desktop](#configure-claude-desktop)
6. [Test the Integration](#test-the-integration)
7. [Troubleshooting](#troubleshooting)
8. [Platform-Specific Paths](#platform-specific-paths)

---

## Prerequisites

Before you begin, ensure you have:

- **Claude Desktop** installed ([download here](https://claude.ai/download))
- **Python 3.11+** installed on your system
- **Active KAMIYO subscription** (Personal, Team, or Enterprise tier)
- **Terminal/Command Prompt access** for installation commands

### Check Python Version

```bash
# macOS/Linux
python3.11 --version

# Windows
python --version
```

You should see Python 3.11.x or higher.

---

## 1. Subscribe to KAMIYO MCP

### Step 1.1: Visit Pricing Page

Go to [https://kamiyo.io/pricing](https://kamiyo.io/pricing)

### Step 1.2: Choose Your Plan

**Available MCP Subscription Tiers:**

| Tier | Price | Features |
|------|-------|----------|
| **Personal** | $19/month | Unlimited queries, 1 AI agent, real-time data from 20+ sources |
| **Team** | $99/month | 5 concurrent agents, team workspace, usage analytics, priority support |
| **Enterprise** | $299/month | Unlimited agents, custom tools, 99.9% SLA, dedicated support |

### Step 1.3: Complete Stripe Checkout

1. Click **"Subscribe"** on your chosen plan
2. Enter payment details in Stripe checkout
3. Complete payment
4. You'll receive a confirmation email from Stripe

**Note:** The x402 API ($0.01/query) does not include MCP access. You need a subscription plan for Claude Desktop integration.

---

## 2. Get Your MCP Access Token

After subscribing, you'll receive your MCP access token via webhook automation.

### Method 1: Email (Automatic)

Within 1-2 minutes of subscription, you'll receive an email with:

```
Subject: Your KAMIYO MCP Access Token

Your MCP Access Token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsInRpZXIiOiJ0ZWFtIiwic3Vic2NyaXB0aW9uX2lkIjoic3ViX2FiYzEyMyIsImlhdCI6MTY0NTU2MzQwMCwiZXhwIjoxNjc3MDk5NDAwLCJ2ZXJzaW9uIjoiMSIsInR5cGUiOiJtY3BfYWNjZXNzIn0.abc123...

Subscription Tier: Team
Valid Until: 2025-10-28

Keep this token secure - it provides access to KAMIYO security intelligence.
```

### Method 2: Dashboard (Manual)

1. Log in to [https://kamiyo.io/dashboard](https://kamiyo.io/dashboard)
2. Navigate to **"API Keys"** tab
3. Find **"MCP Access Token"** section
4. Click **"Reveal Token"** to view your token
5. Copy the token (starts with `eyJ...`)

**Security Note:** Your MCP token is shown only once during generation. If you lose it, you'll need to regenerate it from the dashboard.

---

## 3. Install the KAMIYO MCP Server

The MCP server is a Python application that Claude Desktop runs locally to connect to KAMIYO.

### Step 3.1: Download/Clone the Server

**Option A: Download from GitHub**

```bash
# Download the release
curl -L https://github.com/kamiyo-ai/kamiyo-mcp-server/archive/refs/heads/main.zip -o kamiyo-mcp.zip

# Extract
unzip kamiyo-mcp.zip
cd kamiyo-mcp-server-main
```

**Option B: Clone the Repository**

```bash
git clone https://github.com/kamiyo-ai/kamiyo-mcp-server.git
cd kamiyo-mcp-server
```

**Option C: Install via pip (coming soon)**

```bash
pip install kamiyo-mcp-server
```

### Step 3.2: Install Dependencies

```bash
# Navigate to the project directory
cd /path/to/kamiyo-mcp-server

# Install MCP dependencies
pip3.11 install -r requirements-mcp.txt

# Install main dependencies
pip3.11 install -r requirements.txt
```

**Dependencies installed:**
- `fastmcp>=0.2.0` - MCP SDK for Python
- `pydantic>=2.5.0` - Data validation
- `pyjwt>=2.8.0` - JWT authentication
- `stripe>=7.0.0` - Subscription management
- `httpx>=0.25.0` - HTTP client

### Step 3.3: Verify Installation

```bash
# Test the server
python3.11 -m mcp.server --help
```

You should see:

```
usage: server.py [-h] [--token TOKEN] [--transport {stdio,sse}] [--host HOST] [--port PORT]

KAMIYO MCP Server

optional arguments:
  -h, --help            show this help message and exit
  --token TOKEN         MCP authentication token (for testing)
  --transport {stdio,sse}
                        MCP transport protocol (default: stdio for Claude Desktop)
  --host HOST           Host to bind to (for SSE transport)
  --port PORT           Port to bind to (for SSE transport)
```

---

## 4. Configure Claude Desktop

Now you'll configure Claude Desktop to use the KAMIYO MCP server.

### Step 4.1: Locate Configuration File

The configuration file location varies by platform:

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

### Step 4.2: Create/Edit Configuration

Open the configuration file in your text editor:

**macOS/Linux:**
```bash
# Using nano
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Or VS Code
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows (PowerShell):**
```powershell
notepad $env:APPDATA\Claude\claude_desktop_config.json
```

### Step 4.3: Add KAMIYO MCP Server

If the file is **empty or doesn't exist**, create it with:

```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3.11",
      "args": [
        "-m",
        "mcp.server"
      ],
      "cwd": "/absolute/path/to/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "YOUR_JWT_SECRET_FROM_EMAIL",
        "KAMIYO_API_URL": "https://api.kamiyo.io",
        "ENVIRONMENT": "production"
      }
    }
  }
}
```

If the file **already has other MCP servers**, add KAMIYO to the existing `mcpServers` object:

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "...",
      "args": ["..."]
    },
    "kamiyo-security": {
      "command": "python3.11",
      "args": [
        "-m",
        "mcp.server"
      ],
      "cwd": "/absolute/path/to/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "YOUR_JWT_SECRET_FROM_EMAIL",
        "KAMIYO_API_URL": "https://api.kamiyo.io",
        "ENVIRONMENT": "production"
      }
    }
  }
}
```

### Step 4.4: Update Configuration Values

Replace the following placeholders:

1. **`/absolute/path/to/kamiyo-mcp-server`**: Full path to where you installed the MCP server
   - Example (macOS): `/Users/yourname/kamiyo-mcp-server`
   - Example (Windows): `C:\Users\yourname\kamiyo-mcp-server`
   - Example (Linux): `/home/yourname/kamiyo-mcp-server`

2. **`YOUR_JWT_SECRET_FROM_EMAIL`**: Your MCP access token from Step 2
   - This is the long token starting with `eyJ...`

### Step 4.5: Optional Environment Variables

You can add these optional settings:

```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3.11",
      "args": ["-m", "mcp.server"],
      "cwd": "/absolute/path/to/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "YOUR_JWT_SECRET",
        "KAMIYO_API_URL": "https://api.kamiyo.io",
        "ENVIRONMENT": "production",
        "LOG_LEVEL": "INFO",
        "STRIPE_SECRET_KEY": "sk_live_...",
        "DATABASE_URL": "sqlite:///data/kamiyo.db"
      }
    }
  }
}
```

**Environment Variables Explained:**

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_JWT_SECRET` | **Yes** | Your MCP access token |
| `KAMIYO_API_URL` | No | API endpoint (default: https://api.kamiyo.io) |
| `ENVIRONMENT` | No | Environment mode (default: production) |
| `LOG_LEVEL` | No | Logging level (default: INFO) |
| `STRIPE_SECRET_KEY` | No | For subscription validation |
| `DATABASE_URL` | No | Local cache database |

---

## 5. Test the Integration

### Step 5.1: Restart Claude Desktop

1. **Quit Claude Desktop completely** (don't just close the window)
   - macOS: Cmd+Q or Right-click dock icon → Quit
   - Windows: Right-click taskbar icon → Close
   - Linux: Quit from menu

2. **Restart Claude Desktop**

### Step 5.2: Verify MCP Server Loaded

Claude Desktop should automatically start the MCP server. Look for:

1. In Claude Desktop's settings/preferences, check **MCP Servers** section
2. You should see **"kamiyo-security"** listed as **"Connected"** or **"Active"**

### Step 5.3: Test with a Query

In a new chat with Claude, try these test queries:

**Test 1: Health Check**
```
Check the KAMIYO MCP server health status
```

Expected response:
```
The KAMIYO MCP server is healthy and operational:
- Status: healthy
- Version: 1.0.0
- Server Name: kamiyo-security
- Environment: production
- API Connection: connected
- Database: connected
```

**Test 2: Search Exploits**
```
Search for recent Uniswap exploits
```

Expected response:
```
I found [X] Uniswap exploits in the KAMIYO database:

1. [Protocol Name] - [Chain]
   Amount Lost: $[amount] USD
   Date: [timestamp]
   Category: [attack type]
   Source: [source name]

[Additional exploits listed...]
```

**Test 3: Protocol Risk Assessment**
```
Assess the security risk of Curve Finance on Ethereum
```

Expected response will vary based on your subscription tier:
- **Personal**: Basic risk score and level
- **Team**: + Recent exploit summary
- **Enterprise**: + Detailed recommendations and peer comparison

### Step 5.4: Verify Subscription Tier

Ask Claude:
```
What is my KAMIYO subscription tier?
```

Claude should respond with your tier (Personal, Team, or Enterprise) based on the JWT token.

---

## 6. Troubleshooting

### Problem: "MCP server not found" or "Connection failed"

**Solution 1: Verify Python Path**

```bash
# Find your Python 3.11 path
which python3.11  # macOS/Linux
where python  # Windows
```

Update the `command` in your config to the full path:

```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "/usr/local/bin/python3.11",  // Full path
      "args": ["-m", "mcp.server"],
      ...
    }
  }
}
```

**Solution 2: Verify Working Directory**

Make sure `cwd` points to the correct directory:

```bash
# Test by running manually
cd /absolute/path/to/kamiyo-mcp-server
python3.11 -m mcp.server
```

If this works, the path is correct for your config.

### Problem: "Invalid JWT token" or "Authentication failed"

**Solution 1: Verify Token**

Check that your `MCP_JWT_SECRET` is correct:
- Should start with `eyJ`
- Should be on a single line (no line breaks)
- Should match the token from your email exactly

**Solution 2: Regenerate Token**

1. Go to [https://kamiyo.io/dashboard/api-keys](https://kamiyo.io/dashboard/api-keys)
2. Click **"Regenerate MCP Token"**
3. Copy the new token
4. Update `MCP_JWT_SECRET` in your config
5. Restart Claude Desktop

### Problem: "Subscription inactive" or "Tier access denied"

**Solution: Verify Subscription Status**

1. Check your Stripe subscription at [https://kamiyo.io/dashboard/billing](https://kamiyo.io/dashboard/billing)
2. Ensure payment is up to date
3. If subscription is canceled, renew it
4. Wait 1-2 minutes for webhook to process
5. Restart Claude Desktop

### Problem: "Database connection failed"

**Solution: Check Database Setup**

The MCP server uses a local SQLite database for caching:

```bash
# Create data directory
mkdir -p /absolute/path/to/kamiyo-mcp-server/data

# Test database
cd /absolute/path/to/kamiyo-mcp-server
python3.11 -c "from database import get_db; db = get_db(); print('Database OK')"
```

### Problem: "KAMIYO API connection failed"

**Solution: Test API Connection**

```bash
# Test API endpoint
curl https://api.kamiyo.io/health

# Expected response: {"status":"healthy"}
```

If API is down, check [https://status.kamiyo.io](https://status.kamiyo.io)

### Problem: Python ModuleNotFoundError

**Solution: Reinstall Dependencies**

```bash
cd /absolute/path/to/kamiyo-mcp-server

# Clean install
pip3.11 uninstall -y fastmcp pydantic pyjwt stripe httpx
pip3.11 install -r requirements-mcp.txt
pip3.11 install -r requirements.txt
```

### Problem: Claude Desktop doesn't show MCP tools

**Solution: Enable Developer Tools**

1. Open Claude Desktop preferences
2. Go to **Advanced** settings
3. Enable **"Show MCP Tools"** or **"Developer Mode"**
4. Restart Claude Desktop

### Getting Additional Help

If you're still experiencing issues:

1. **Check Logs:**
   - MCP server logs: Look in Claude Desktop's console output
   - Check `/tmp/kamiyo-mcp.log` (if logging is enabled)

2. **Community Support:**
   - Discord: [https://discord.gg/kamiyo](https://discord.gg/kamiyo)
   - GitHub Issues: [https://github.com/kamiyo-ai/kamiyo-mcp-server/issues](https://github.com/kamiyo-ai/kamiyo-mcp-server/issues)

3. **Email Support:**
   - Personal tier: support@kamiyo.io (48h response)
   - Team tier: priority@kamiyo.io (24h response)
   - Enterprise tier: dedicated@kamiyo.io (4h response, SLA)

---

## 7. Platform-Specific Paths

### macOS

**Claude Desktop Config:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Example Installation Path:**
```
/Users/yourname/kamiyo-mcp-server
```

**Example Config:**
```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "/usr/local/bin/python3.11",
      "args": ["-m", "mcp.server"],
      "cwd": "/Users/yourname/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "eyJ..."
      }
    }
  }
}
```

### Windows

**Claude Desktop Config:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

Or full path:
```
C:\Users\YourName\AppData\Roaming\Claude\claude_desktop_config.json
```

**Example Installation Path:**
```
C:\Users\YourName\kamiyo-mcp-server
```

**Example Config:**
```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "C:\\Python311\\python.exe",
      "args": ["-m", "mcp.server"],
      "cwd": "C:\\Users\\YourName\\kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "eyJ..."
      }
    }
  }
}
```

**Note:** Use double backslashes (`\\`) in Windows paths.

### Linux

**Claude Desktop Config:**
```
~/.config/Claude/claude_desktop_config.json
```

**Example Installation Path:**
```
/home/yourname/kamiyo-mcp-server
```

**Example Config:**
```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "/usr/bin/python3.11",
      "args": ["-m", "mcp.server"],
      "cwd": "/home/yourname/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "eyJ..."
      }
    }
  }
}
```

---

## Available MCP Tools

Once configured, Claude can use these KAMIYO security intelligence tools:

### 1. `search_crypto_exploits`

Search the exploit database for security incidents.

**Parameters:**
- `query`: Search term (protocol, vulnerability type, chain)
- `limit`: Max results (default: 10, capped by tier)
- `since`: Date filter (ISO 8601)
- `chain`: Blockchain filter

**Example:**
```
Search for flash loan attacks on Ethereum since January 2024
```

### 2. `assess_defi_protocol_risk`

Assess security risk for DeFi protocols.

**Parameters:**
- `protocol_name`: Protocol to assess
- `chain`: Optional blockchain filter
- `time_window_days`: Days of history (1-365)

**Example:**
```
Assess the security risk of Uniswap on Arbitrum over the last 180 days
```

### 3. `monitor_wallet` (Team+ only)

Check wallet interactions with exploited protocols.

**Parameters:**
- `wallet_address`: Ethereum/EVM or Solana address
- `chain`: Blockchain to scan
- `lookback_days`: Days to check (1-365)

**Example:**
```
Check if wallet 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 has interacted with exploited protocols
```

### 4. `health_check`

Check MCP server status (no authentication required).

**Example:**
```
Check KAMIYO MCP server health
```

---

## Subscription Tier Access

Different tools and features are available based on your subscription tier:

| Feature | Personal | Team | Enterprise |
|---------|----------|------|------------|
| `search_crypto_exploits` | Max 50 results | Max 200 results | Max 1000 results |
| `assess_defi_protocol_risk` | Basic risk score | + Recent exploits | + Recommendations |
| `monitor_wallet` | ❌ Upgrade required | ✅ Full access | ✅ Full access |
| Data delay | Real-time | Real-time | Real-time |
| Concurrent agents | 1 | 5 | Unlimited |
| Support | Email | Priority | Dedicated |

---

## Next Steps

Now that you have KAMIYO integrated with Claude Desktop:

1. **Explore the tools:** Try different queries to understand capabilities
2. **Automate workflows:** Use Claude to monitor protocols, assess risks, check wallets
3. **Team collaboration:** (Team+ only) Share workspace with team members
4. **API access:** Combine MCP with x402 API for custom integrations
5. **Provide feedback:** Help us improve by reporting issues or suggesting features

---

## Additional Resources

- **API Documentation:** [https://kamiyo.io/api-docs](https://kamiyo.io/api-docs)
- **MCP Quick Start:** `/mcp/QUICK_START.md` in the repository
- **Tool Usage Guide:** `/mcp/TOOL_USAGE_GUIDE.md`
- **GitHub Repository:** [https://github.com/kamiyo-ai/kamiyo-mcp-server](https://github.com/kamiyo-ai/kamiyo-mcp-server)
- **Status Page:** [https://status.kamiyo.io](https://status.kamiyo.io)

---

**Version:** 1.0.0
**Last Updated:** 2025-10-28
**Support:** support@kamiyo.io
