![header](https://github.com/user-attachments/assets/6ad065ce-a087-488e-bf2a-101059a911b0)

# KAMIYO リスクオーディター | Risk Auditor

Token approval auditing and DeFi security intelligence agent with x402 micropayments on Solana.

## Features

### Approval Auditing
- Scans wallet addresses across 7 EVM chains
- Detects active token approvals via blockchain explorer APIs
- Identifies risk factors (unlimited, stale, exploited protocols)
- Generates ERC20 revocation transactions

### Risk Detection
- **Unlimited Approvals**: MAX_UINT256 allowances
- **Stale Approvals**: Approvals older than 6 months
- **Exploited Protocols**: Cross-references KAMIYO exploit database
- **Suspicious Spenders**: Known scam address flagging

### Security Intelligence
- Real-time exploit data aggregation
- Protocol risk scoring (0-100 scale)
- Historical security incident tracking
- 14+ blockchain network coverage

## API Endpoints

### GET /approval-audit

Audit wallet token approvals and identify risks.

**Query Parameters:**
- `wallet` (required): Ethereum address (0x...)
- `chains` (optional): Comma-separated chain names (default: ethereum)

**Supported Chains:**
- ethereum, polygon, base, arbitrum, optimism, bsc, avalanche

**Example Request:**
```bash
curl "https://risk-auditor.kamiyo.ai/approval-audit?wallet=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb&chains=ethereum,polygon" \
  -H "X-PAYMENT: <base64_encoded_x402_payment>"
```

**Response:**
```json
{
  "success": true,
  "wallet": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "chains": ["ethereum", "polygon"],
  "approvals": [
    {
      "token_address": "0x...",
      "token_symbol": "USDC",
      "token_name": "USD Coin",
      "spender_address": "0x...",
      "allowance": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      "is_unlimited": true,
      "last_updated": "2024-01-15T10:30:00Z",
      "transaction_hash": "0x..."
    }
  ],
  "risk_flags": {
    "0x...-0x...": [
      {
        "type": "unlimited",
        "severity": "high",
        "description": "Unlimited approval granted to 0x..."
      }
    ]
  },
  "revoke_tx_data": [
    {
      "to": "0x...",
      "data": "0x095ea7b3...",
      "value": "0",
      "chainId": 1,
      "token_address": "0x...",
      "spender_address": "0x...",
      "description": "Revoke USDC approval for 0x..."
    }
  ],
  "total_approvals": 12,
  "risky_approvals": 5,
  "timestamp": "2025-11-07T14:00:00Z"
}
```

### GET /exploits

Get recent exploit data from KAMIYO intelligence.

**Query Parameters:**
- `protocol` (optional): Filter by protocol name
- `chain` (optional): Filter by blockchain
- `limit` (optional): Results limit (1-100, default: 50)

### GET /risk-score/:protocol

Calculate security risk score for a DeFi protocol.

**Path Parameters:**
- `protocol` (required): Protocol name

**Query Parameters:**
- `chain` (optional): Filter by specific chain

### GET /health

Service health check and feature status.

## x402 Payment Protocol

All endpoints except `/health` require x402 payment:

- **Network**: Solana mainnet
- **Price**: 0.001 SOL per request
- **Payment Wallet**: `CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY`

### Payment Flow

```
┌──────────┐                                    ┌────────────────┐
│  Client  │                                    │  Risk Auditor  │
└─────┬────┘                                    └────────┬───────┘
      │                                                  │
      │  1. Create Solana transfer (0.001 SOL)          │
      │     to CE4BW1g1vuaS8h...                        │
      │ ────────────────────────────────────────────►   │
      │                  Solana RPC                      │
      │                                                  │
      │  2. Get transaction signature                   │
      │ ◄────────────────────────────────────────────   │
      │                                                  │
      │  3. API Request with X-PAYMENT header           │
      │     ┌───────────────────────────────────┐       │
      │     │ X-PAYMENT: base64({               │       │
      │     │   x402Version: 1,                 │       │
      │     │   payload: {                      │       │
      │     │     signature: "5KW...",          │       │
      │     │     amount: "1000000",            │       │
      │     │     recipient: "CE4BW..."         │       │
      │     │   }                               │       │
      │     │ })                                │       │
      │     └───────────────────────────────────┘       │
      │ ────────────────────────────────────────────►   │
      │                                                  │
      │                                         ┌────────▼────────┐
      │                                         │ x402Middleware  │
      │                                         │  1. Parse       │
      │                                         │  2. Verify sig  │
      │                                         │  3. Check cache │
      │                                         └────────┬────────┘
      │                                                  │
      │  4. Response with approval data                 │
      │ ◄────────────────────────────────────────────   │
      │     { approvals: [...], risk_flags: {} }        │
      │                                                  │
      │  5. Additional requests use cached payment      │
      │     (1 hour TTL, multiple requests per tx)      │
      │ ────────────────────────────────────────────►   │
      │ ◄────────────────────────────────────────────   │
      │                                                  │
```

**Payment Header Format:**
```
X-PAYMENT: <base64_encoded_json>
```

JSON structure:
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "solana-mainnet",
  "payload": {
    "signature": "5KW...",
    "amount": "1000000",
    "recipient": "CE4BW1g1vuaS8hRQAGEABPi5PCuKBfJUporJxmdinCsY"
  }
}
```

## Setup

### Prerequisites
- Node.js >= 18.0.0
- Etherscan API keys (for approval scanning)
- Solana wallet for x402 payments

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server
PORT=3000
LOG_LEVEL=info

# x402 Payments
PAYMENT_WALLET=your_solana_wallet
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Blockchain Explorer APIs
ETHERSCAN_API_KEY=your_key
POLYGONSCAN_API_KEY=your_key
BSCSCAN_API_KEY=your_key
ARBISCAN_API_KEY=your_key
OPTIMISTIC_ETHERSCAN_API_KEY=your_key
BASESCAN_API_KEY=your_key
SNOWTRACE_API_KEY=your_key
```

### Build and Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Risk Auditor API                         │
│                    (Express.js + x402 Payments)                 │
└────────────┬────────────────────────────────────┬───────────────┘
             │                                    │
     ┌───────▼─────────┐                 ┌────────▼────────┐
     │  /approval-audit│                 │ /risk-score     │
     │    Endpoint     │                 │  /exploits      │
     └───────┬─────────┘                 └────────┬────────┘
             │                                    │
    ┌────────▼──────────────────────────┐        │
    │   ApprovalsRouteHandler           │        │
    │   ┌───────────────────────────┐   │        │
    │   │ 1. Scan Approvals         │   │        │
    │   │ 2. Detect Risks           │   │        │
    │   │ 3. Generate Revocations   │   │        │
    │   └───────────────────────────┘   │        │
    └─┬─────────┬──────────┬────────────┘        │
      │         │          │                      │
┌─────▼─────┐ ┌▼──────────▼───┐     ┌───────────▼──────────┐
│ Approval  │ │ RiskDetector  │     │    DataService       │
│  Scanner  │ │               │     │  (Exploit Database)  │
└─────┬─────┘ └───────┬───────┘     └──────────┬───────────┘
      │               │                        │
      │      ┌────────▼────────┐               │
      │      │ Exploit History │◄──────────────┘
      │      │   Cross-Ref     │
      │      └─────────────────┘
      │
┌─────▼─────────────────────────────────────────────────┐
│            Blockchain Explorer APIs                   │
│  Etherscan │ Polygonscan │ Arbiscan │ Basescan │ ... │
└───────────────────────────────────────────────────────┘
```

### Data Flow: Approval Auditing

```
User Request
    │
    ├─► wallet: 0x742d35...
    ├─► chains: [ethereum, polygon]
    └─► x402: payment signature
         │
         ▼
    ┌─────────────────┐
    │ ApprovalScanner │
    └────────┬────────┘
             │
    ┌────────▼──────────────────────────────┐
    │  1. Fetch approval events from        │
    │     Etherscan/Polygonscan             │
    │  2. Query current allowances          │
    │  3. Filter active approvals           │
    └────────┬──────────────────────────────┘
             │
             ├─► Token: USDC, Spender: 0x1234...
             ├─► Allowance: MAX_UINT256
             └─► Last Updated: 180 days ago
                      │
                      ▼
              ┌───────────────┐
              │ RiskDetector  │
              └───────┬───────┘
                      │
          ┌───────────┼───────────┐
          │           │           │
    ┌─────▼─────┐ ┌──▼────┐ ┌────▼─────────┐
    │ Unlimited │ │ Stale │ │  Exploited   │
    │ Approval  │ │ (6mo) │ │  Protocol    │
    └─────┬─────┘ └───┬───┘ └──────┬───────┘
          │           │            │
          └───────────┼────────────┘
                      │
            Risk Flags Generated
                      │
                      ▼
        ┌──────────────────────────┐
        │  TransactionGenerator    │
        │  ERC20: approve(addr, 0) │
        └──────────┬───────────────┘
                   │
    ┌──────────────▼────────────────┐
    │  Revocation Transaction Data  │
    │  ┌────────────────────────┐   │
    │  │ to: 0xToken...         │   │
    │  │ data: 0x095ea7b3...    │   │
    │  │ chainId: 1             │   │
    │  └────────────────────────┘   │
    └───────────────────────────────┘
```

### Services

**ApprovalScanner** (`src/services/approval-scanner.ts`)
- Fetches token approval events from blockchain explorers
- Queries current allowances via RPC
- 1-minute caching layer

**RiskDetector** (`src/services/risk-detector.ts`)
- Analyzes approvals for risk factors
- Integrates KAMIYO exploit database
- Severity classification (critical/high/medium/low)

**TransactionGenerator** (`src/services/tx-generator.ts`)
- Creates ERC20 revocation transactions
- EIP-155 chain ID support
- Batch transaction support

**DataService** (`src/services/data-service.ts`)
- Exploit data aggregation
- Circuit breaker pattern for failover
- 5-minute cache with TTL

### Security Features

- Zod schema validation for all inputs
- Rate limiting (60 req/min per IP)
- Security headers middleware
- Request ID tracking
- Structured JSON logging
- Input sanitization

## Testing

The implementation has been validated against:

1. **Etherscan API Compatibility**: Approval data matches Etherscan for major tokens
2. **Risk Detection Accuracy**: Correctly identifies unlimited approvals (MAX_UINT256)
3. **Transaction Generation**: Valid ERC20 approve(spender, 0) calldata
4. **x402 Integration**: Solana payment verification and caching

## Bounty Compliance

### Technical Specifications Met

- **Inputs**: `wallet` address and `chains` array
- **Outputs**: `approvals[]`, `risk_flags`, `revoke_tx_data[]`
- **Risk Detection**: Unlimited + stale + exploited protocol checking
- **Transaction Data**: Valid ERC20 revocation transactions with proper encoding

### Deployment

**Production URL:** `https://risk-auditor.kamiyo.ai`

Access via x402 payment protocol (0.001 SOL per request)

## License

MIT

## Author

KAMIYO Security Intelligence
dev@kamiyo.ai
