# @kamiyo/mcp-server

MCP server for autonomous agent payments. Provides tools for:

- **Payment escrow** - Lock funds until service delivered
- **Quality assessment** - Score API responses automatically
- **Dispute resolution** - Oracle arbitration when quality is poor
- **Provider reputation** - On-chain trust scores
- **x402 payments** - HTTP 402 protocol support

Works with Claude Desktop, OpenClaw, and any MCP-compatible client.

## Use Cases

- AI agents paying for API calls with quality guarantees
- Autonomous systems that need refunds when services fail
- Multi-agent coordination with escrow-protected payments
- Any agent that needs a wallet with dispute resolution

## Quick Start

**Remote (hosted)**: Connect to `https://api.kamiyo.ai/mcp` with OAuth 2.0

**Local (your wallet)**: Install and configure with your Solana keypair

## Remote MCP Server

Connect directly to the hosted MCP server at `https://api.kamiyo.ai/mcp`.

### Authentication

The server uses OAuth 2.0 with Dynamic Client Registration (DCR):

1. Register a client at `https://api.kamiyo.ai/oauth/register`
2. Authorize at `https://api.kamiyo.ai/oauth/authorize`
3. Exchange code for tokens at `https://api.kamiyo.ai/oauth/token`

PKCE (S256) is required. Access tokens expire in 1 hour; refresh tokens in 30 days.

### Scopes

| Scope | Description |
|-------|-------------|
| `mcp:tools` | All tools |
| `mcp:tools:escrow` | Escrow and dispute tools only |
| `mcp:tools:x402` | x402 payment tools only |

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/oauth-authorization-server` | GET | OAuth metadata |
| `/oauth/register` | POST | Dynamic client registration |
| `/oauth/authorize` | GET | Authorization |
| `/oauth/token` | POST | Token exchange |
| `/mcp` | POST | MCP JSON-RPC |
| `/mcp` | GET | MCP SSE stream |
| `/mcp/health` | GET | Health check |

## Local Installation

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

### get_token_price

Gets current price and market data for a cryptocurrency token.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| symbol | string | yes | Token symbol (e.g., SOL, BTC, KAMIYO) |
| chain | string | no | Blockchain filter (solana, ethereum, base) |

### get_trending_tokens

Gets trending tokens by volume and activity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| chain | string | no | Filter by blockchain |
| limit | number | no | Max results (default: 10) |

### web_search

Searches the web for information.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | yes | Search query |
| limit | number | no | Max results (default: 5) |

### crypto_news

Searches for cryptocurrency news from trusted sources.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | no | Search topic (default: cryptocurrency) |
| limit | number | no | Max results (default: 5) |

### x402_check_pricing

Checks if an endpoint uses x402 payment and returns pricing options.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | string | yes | API endpoint URL |

Returns `{ free: true }` or `{ free: false, options: [...] }` with payment networks and amounts.

### x402_fetch

Fetches from an x402-protected endpoint, handling payment automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | string | yes | Endpoint URL |
| method | string | no | HTTP method (default: GET) |
| body | string | no | Request body (JSON) |
| headers | object | no | Additional headers |

Requires local MCP server with wallet configured. Remote server returns error directing to local setup.

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
2. Funds are locked in on-chain escrow (Solana)
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

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your AI Agent                            │
│  (Claude, OpenClaw, LangChain, custom)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ MCP Protocol
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   @kamiyo/mcp-server                         │
│                                                              │
│  Tools:                                                      │
│  - create_escrow        - assess_data_quality               │
│  - check_escrow_status  - estimate_refund                   │
│  - verify_payment       - file_dispute                      │
│  - get_api_reputation   - x402_fetch                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ Solana RPC
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  KAMIYO Protocol (Solana)                    │
│                                                              │
│  On-chain:                                                   │
│  - Escrow accounts (time-locked)                            │
│  - Oracle registry (dispute arbitration)                    │
│  - Reputation scores (provider trust)                       │
└─────────────────────────────────────────────────────────────┘
```

## Integration with Other Frameworks

### OpenClaw / Generic MCP Client

Any MCP client can connect to the remote server or run locally:

```javascript
// Remote (OAuth required)
const client = new MCPClient('https://api.kamiyo.ai/mcp');

// Local (stdio)
const client = spawn('node', ['path/to/kamiyo-mcp/dist/index.js']);
```

### LangChain

```typescript
import { KamiyoTools } from '@kamiyo/langchain';

const tools = KamiyoTools.fromEnv();
const agent = createReactAgent({ llm, tools });
```

### Vercel AI SDK

```typescript
import { createKamiyoTools } from '@kamiyo/vercel-ai';

const tools = createKamiyoTools({ wallet: keypair });
const result = await generateText({ model, tools, prompt });
```

## Privacy

See [Privacy Policy](https://github.com/kamiyo-ai/kamiyo-protocol/blob/main/docs/PRIVACY.md).

## Support

- GitHub Issues: https://github.com/kamiyo-ai/kamiyo-protocol/issues
- Email: support@kamiyo.ai

## License

MIT
