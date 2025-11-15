# KAMIYO MCP Server - Quick Start Guide

**Get the MCP server running in 5 minutes**

## Prerequisites Check

```bash
# Check Python version (need 3.11+)
python3.11 --version

# Should show: Python 3.11.x or higher
```

## Installation (2 minutes)

```bash
# 1. Navigate to project root
cd /Users/dennisgoslar/Projekter/kamiyo

# 2. Install MCP dependencies
pip3.11 install -r requirements-mcp.txt

# 3. Install main KAMIYO dependencies (if not already installed)
pip3.11 install -r requirements.txt

# 4. Validate structure
python3.11 scripts/mcp/validate_structure.py
```

## Quick Test (1 minute)

```bash
# Set development environment
export ENVIRONMENT="development"
export MCP_JWT_SECRET="dev_test_secret"
export KAMIYO_API_URL="http://localhost:8000"

# Test server help
python3.11 -m mcp.server --help

# Start server (stdio mode)
python3.11 -m mcp.server
```

## Configuration (1 minute)

Create `.env` file in project root:

```bash
# Development
ENVIRONMENT=development
MCP_JWT_SECRET=dev_jwt_secret_change_in_production
KAMIYO_API_URL=http://localhost:8000
LOG_LEVEL=INFO

# Optional
STRIPE_SECRET_KEY=sk_test_...
DATABASE_URL=sqlite:///data/kamiyo.db
```

Load it:
```bash
source .env  # or use python-dotenv
```

## Claude Desktop Setup (1 minute)

Edit `~/.config/claude/mcp_config.json`:

```json
{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3.11",
      "args": [
        "/Users/dennisgoslar/Projekter/kamiyo/mcp/server.py"
      ],
      "env": {
        "KAMIYO_API_URL": "http://localhost:8000",
        "ENVIRONMENT": "development"
      }
    }
  }
}
```

Restart Claude Desktop.

## Test in Claude

Ask Claude:
```
Check KAMIYO MCP server health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "server_name": "kamiyo-security"
}
```

## Troubleshooting

### "fastmcp not installed"
```bash
pip3.11 install fastmcp
```

### "Database connection failed"
```bash
# Make sure KAMIYO API is running
cd /Users/dennisgoslar/Projekter/kamiyo
python3.11 api/main.py
```

### "Module not found: mcp"
```bash
# Run from project root
cd /Users/dennisgoslar/Projekter/kamiyo
export PYTHONPATH=.
```

## Available Commands

```bash
# Run server (stdio for Claude Desktop)
python3.11 -m mcp.server

# Run server (SSE for web agents)
python3.11 -m mcp.server --transport sse --port 8002

# Validate structure
python3.11 scripts/mcp/validate_structure.py

# Run full test suite
./scripts/mcp/test_local.sh
```

## Environment Variables Reference

| Variable | Required | Example |
|----------|----------|---------|
| `ENVIRONMENT` | No | `development` |
| `MCP_JWT_SECRET` | Yes (prod) | `your-secret-key` |
| `KAMIYO_API_URL` | No | `http://localhost:8000` |
| `LOG_LEVEL` | No | `INFO` |

## Next Steps

1. ✅ Phase 1 complete - Basic server working
2. 🚧 Phase 2 - Implement core tools (search_exploits, etc.)
3. ⏳ Phase 3 - Add authentication & subscriptions
4. ⏳ Phase 4 - Production deployment

## Getting Help

- Full docs: `mcp/README.md`
- Implementation summary: `MCP_PHASE_1_COMPLETE.md`
- Development plan: `MCP_DEVELOPMENT_PLAN.md`

---

**Status:** Phase 1 Complete ✅
**Last Updated:** 2025-10-28
