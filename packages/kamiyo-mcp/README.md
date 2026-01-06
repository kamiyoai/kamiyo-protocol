# @kamiyo/mcp

MCP server for Kamiyo escrow operations. Provides tools for Claude Desktop and other MCP clients.

## Tools

| Tool | Description |
|------|-------------|
| `create_escrow` | Create payment escrow |
| `check_escrow_status` | Get escrow status |
| `verify_payment` | Verify payment received |
| `assess_data_quality` | Score API response quality (0-100) |
| `estimate_refund` | Calculate refund based on quality |
| `file_dispute` | File dispute with evidence |
| `get_api_reputation` | Get provider reputation |
| `call_api_with_escrow` | Full workflow: escrow, call, assess, dispute |

## Installation

```bash
cd packages/kamiyo-mcp
npm install
npm run build
```

## Configuration

Create `.env`:

```bash
KAMIYO_PROGRAM_ID=8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM
AGENT_PRIVATE_KEY=<base58_or_json_array>
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kamiyo": {
      "command": "node",
      "args": ["/path/to/packages/kamiyo-mcp/dist/index.js"],
      "env": {
        "KAMIYO_PROGRAM_ID": "8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM",
        "AGENT_PRIVATE_KEY": "your_base58_private_key",
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

## Usage

```
User: Create an escrow for 0.001 SOL with provider ABC...
Claude: Creating escrow...
Result: Escrow created at E7x... (0.001 SOL, expires in 1h)
```

## Development

```bash
npm run dev    # Watch mode
npm run build  # Compile
npm test       # Run tests
```

## License

MIT
