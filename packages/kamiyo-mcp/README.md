# @kamiyo/mcp-server

MCP server for KAMIYO Protocol. Provides escrow, dispute, and reputation tools for Claude Desktop and other MCP clients.

## Installation

```bash
npm install
npm run build
```

## Configuration

### Environment Variables

```bash
KAMIYO_PROGRAM_ID=8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# One of:
AGENT_PRIVATE_KEY=<base58_key>
AGENT_KEYPAIR_PATH=./keypair.json
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "kamiyo": {
      "command": "node",
      "args": ["/absolute/path/to/packages/kamiyo-mcp/dist/index.js"],
      "env": {
        "KAMIYO_PROGRAM_ID": "8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM",
        "AGENT_PRIVATE_KEY": "your_base58_private_key",
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

Restart Claude Desktop after editing.

## Tools

### create_escrow

Creates a payment escrow with a provider.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| api | string | yes | Provider wallet address |
| amount | number | yes | Payment in SOL (min 0.001) |
| timeLock | number | no | Expiry in seconds (default: 3600) |

### check_escrow_status

Gets escrow details and status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| escrowAddress | string | no | Escrow PDA address |
| transactionId | string | no | Transaction ID (one required) |

### verify_payment

Confirms escrow is active and funded.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| transactionId | string | yes | Transaction ID |

### assess_data_quality

Scores API response quality (0-100) based on expected fields.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| apiResponse | object | yes | Response JSON to assess |
| expectedCriteria | string[] | yes | Fields to check (e.g., ["data.name"]) |

### estimate_refund

Calculates refund amount based on quality score.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| amount | number | yes | Original payment in SOL |
| qualityScore | number | yes | Quality score (0-100) |

### file_dispute

Files a dispute with evidence for oracle arbitration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| transactionId | string | yes | Escrow to dispute |
| qualityScore | number | yes | Quality assessment |
| refundPercentage | number | yes | Requested refund (0-100) |
| evidence | object | yes | Supporting evidence |

### get_api_reputation

Gets provider reputation and transaction history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| apiProvider | string | yes | Provider wallet address |

### call_api_with_escrow

Full workflow: creates escrow, calls API, assesses quality, auto-disputes if needed.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| apiUrl | string | yes | API endpoint |
| apiProvider | string | yes | Provider wallet |
| amount | number | yes | Payment in SOL |
| expectedCriteria | string[] | no | Quality check fields |
| timeLock | number | no | Escrow expiry (default: 3600) |
| autoDispute | boolean | no | Auto-dispute on low quality (default: true) |
| qualityThreshold | number | no | Threshold for dispute (default: 50) |

## Usage Examples

### Create Escrow

```
User: Create an escrow for 0.01 SOL with provider 8xYz...

Claude: I'll create an escrow for 0.01 SOL.

[calls create_escrow]

Escrow created:
- Address: E7xK...
- Amount: 0.01 SOL
- Expires: 1 hour
- Transaction: 5abc...
```

### Protected API Call

```
User: Call api.example.com/data with 0.005 SOL, expect fields data.price and data.name

Claude: I'll make a protected API call with escrow.

[calls call_api_with_escrow]

API call complete:
- Quality score: 85/100
- All expected fields present
- Funds released to provider
```

### File Dispute

```
User: The response was missing required fields. Dispute it.

Claude: I'll file a dispute for the incomplete response.

[calls file_dispute]

Dispute filed:
- Quality: 35%
- Expected refund: 100%
- Status: Awaiting oracle votes
```

## Development

```bash
npm run dev     # Watch mode
npm run build   # Compile TypeScript
npm test        # Run tests
```

## How It Works

1. Agent calls `call_api_with_escrow` or `create_escrow`
2. Funds are locked in on-chain escrow
3. If using full workflow, API is called and response assessed
4. Quality >= threshold: funds released to provider
5. Quality < threshold: dispute filed automatically
6. Oracles vote on quality, settlement proportional to median score

## Settlement Table

| Quality | Agent Refund | Provider Payment |
|---------|--------------|------------------|
| 80-100% | 0% | 100% |
| 65-79% | 35% | 65% |
| 50-64% | 75% | 25% |
| 0-49% | 100% | 0% |

## License

MIT
