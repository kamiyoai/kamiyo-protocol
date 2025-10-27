# KAMIYO x402 Payment Facilitator Implementation

## Overview

This implementation transforms KAMIYO from a pure exploit intelligence aggregator into a hybrid x402 Payment Facilitator, enabling AI agents to pay for real-time exploit data using on-chain USDC payments.

## Architecture

### Core Components

1. **Payment Verifier** (`api/x402/payment_verifier.py`)
   - Multi-chain USDC payment verification
   - Supports Base, Ethereum, and Solana
   - Risk scoring for payment transactions

2. **Payment Tracker** (`api/x402/payment_tracker.py`)
   - Manages payment records and tokens
   - Tracks API usage per payment
   - Handles payment expiration

3. **x402 Middleware** (`api/x402/middleware.py`)
   - FastAPI middleware for HTTP 402 responses
   - Validates payment headers/tokens
   - Returns payment details when required

4. **API Routes** (`api/x402/routes.py`)
   - Payment verification endpoints
   - Token management
   - Payment statistics

5. **JavaScript SDK** (`sdk/kamiyo-x402-sdk.js`)
   - Easy integration for AI agents
   - Payment flow abstraction
   - Error handling for 402 responses

## Payment Flow

### 1. Agent Discovers Payment Requirement
```javascript
// Agent tries to access exploit data
const sdk = new KamiyoX402SDK();
try {
    const exploits = await sdk.getExploits();
} catch (error) {
    if (error instanceof PaymentRequiredError) {
        // Handle payment requirement
        console.log('Payment required:', error.paymentDetails);
    }
}
```

### 2. Agent Makes On-Chain Payment
- Send USDC to payment address on supported chain
- Get transaction hash from blockchain

### 3. Agent Verifies Payment
```javascript
const verification = await sdk.verifyPayment(txHash, 'base');
if (verification.is_valid) {
    console.log('Payment verified!');
}
```

### 4. Agent Generates Payment Token
```javascript
const tokenInfo = await sdk.generatePaymentToken(verification.payment_id);
sdk.setPaymentToken(tokenInfo.payment_token);
```

### 5. Agent Accesses Paid Data
```javascript
// Now all paid endpoints work
const exploits = await sdk.getExploits();
const stats = await sdk.getStats();
const chains = await sdk.getChains();
```

## Pricing Model

### Pay-Per-Use
- **$0.10 per API call** for real-time exploit data
- **1000 requests per $1.00** of USDC payment
- **Minimum payment**: $1.00 (1000 requests)

### Hybrid with Subscriptions
- **Pro tier** ($29/month): Includes 1000 x402 calls
- **Additional calls**: $0.05 per call
- **Free tier**: 24-hour delayed data (no x402 required)

## Supported Chains

### Base Network
- **RPC**: Mainnet Base RPC
- **USDC Contract**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Confirmations**: 6 blocks

### Ethereum Mainnet
- **RPC**: Infura/Mainnet
- **USDC Contract**: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- **Confirmations**: 12 blocks

### Solana
- **RPC**: Mainnet Beta
- **USDC Contract**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **Confirmations**: 32 slots

## Risk Scoring

### Payment Risk Factors
- **Transaction age**: Recent transactions lower risk
- **Sender reputation**: Known addresses have lower risk
- **Payment patterns**: Unusual patterns increase risk
- **Exploit correlation**: Payments to exploited protocols flagged

### Risk Levels
- **Low (0.0-0.3)**: Normal processing
- **Medium (0.3-0.7)**: Additional verification
- **High (0.7-1.0)**: Manual review required

## API Endpoints

### Public x402 Endpoints
- `GET /x402/supported-chains` - Get payment information
- `GET /x402/pricing` - Get pricing details

### Payment Management
- `POST /x402/verify-payment` - Verify on-chain payment
- `POST /x402/generate-token/{payment_id}` - Generate access token
- `GET /x402/payment/{payment_id}` - Get payment status
- `GET /x402/stats` - Get payment statistics

### Paid Data Endpoints (Require x402 Payment)
- `GET /exploits` - Real-time exploit data
- `GET /stats` - Current statistics
- `GET /chains` - Chain information
- `GET /health` - System health
- `GET /v2/analysis/risk` - Protocol risk scores

## Integration Examples

### AI Trading Bot
```javascript
class TradingBot {
    constructor() {
        this.sdk = new KamiyoX402SDK({
            apiBaseUrl: 'https://api.kamiyo.ai',
            paymentToken: process.env.KAMIYO_PAYMENT_TOKEN
        });
    }

    async monitorExploits() {
        const exploits = await this.sdk.getExploits({
            pageSize: 50,
            minAmount: 100000 // $100k+ exploits
        });

        // Adjust trading positions based on exploits
        exploits.data.forEach(exploit => {
            if (this.hasPosition(exploit.protocol)) {
                this.hedgePosition(exploit.protocol);
            }
        });
    }
}
```

### Security Research Tool
```javascript
class SecurityResearch {
    constructor() {
        this.sdk = new KamiyoX402SDK();
    }

    async analyzeProtocolRisk(protocol) {
        const riskScore = await this.sdk.getRiskScore(protocol);
        const recentExploits = await this.sdk.getExploits({
            protocol: protocol,
            days: 30
        });

        return {
            protocol,
            riskScore,
            recentExploits: recentExploits.data
        };
    }
}
```

## Security Considerations

### Payment Verification
- Multi-block confirmation requirements
- On-chain transaction validation
- USDC transfer event parsing

### API Security
- Rate limiting on payment endpoints
- Token expiration (24 hours)
- Request tracking and limits

### Risk Management
- Real-time exploit correlation
- Suspicious pattern detection
- Manual review for high-risk payments

## Deployment

### Environment Variables
```bash
# Blockchain RPC URLs
BASE_RPC_URL=https://mainnet.base.org
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Payment addresses
BASE_PAYMENT_ADDRESS=0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7
ETHEREUM_PAYMENT_ADDRESS=0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7
SOLANA_PAYMENT_ADDRESS=7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x

# Admin key for cleanup
ADMIN_API_KEY=your-admin-key-here
```

### Database Schema
```sql
-- Payment transactions table
CREATE TABLE payment_transactions (
    id SERIAL PRIMARY KEY,
    tx_hash VARCHAR(66) UNIQUE NOT NULL,
    chain VARCHAR(20) NOT NULL,
    amount_usdc DECIMAL(18,6) NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    status VARCHAR(20) NOT NULL,
    risk_score DECIMAL(3,2) DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT NOW(),
    verified_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    requests_remaining INTEGER DEFAULT 100
);

-- Payment access tokens table
CREATE TABLE payment_access_tokens (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    payment_tx_id INTEGER REFERENCES payment_transactions(id),
    expires_at TIMESTAMP NOT NULL,
    requests_remaining INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Testing

### Unit Tests
```bash
# Test payment verification
python -m pytest tests/x402/test_payment_verifier.py

# Test payment tracking
python -m pytest tests/x402/test_payment_tracker.py

# Test middleware
python -m pytest tests/x402/test_middleware.py
```

### Integration Tests
```bash
# Test full payment flow
python -m pytest tests/x402/test_integration.py

# Test SDK integration
node sdk/test-sdk-integration.js
```

## Monitoring

### Key Metrics
- **Payment success rate**: > 99%
- **API response time**: < 100ms p95
- **Payment verification time**: < 2 seconds
- **False positive rate**: < 1%

### Alerting
- Payment verification failures
- High-risk payment attempts
- Token expiration warnings
- API usage spikes

## Roadmap

### Phase 1: Core Implementation (Complete)
- ✅ Multi-chain payment verification
- ✅ x402 middleware
- ✅ JavaScript SDK
- ✅ Basic risk scoring

### Phase 2: Enhanced Security (Next)
- 🔄 Advanced risk scoring with ML
- 🔄 Exploit correlation engine
- 🔄 Fraud detection patterns

### Phase 3: Enterprise Features
- 📋 Bulk payment processing
- 📋 Custom pricing tiers
- 📋 Advanced analytics

### Phase 4: Expansion
- 📋 Additional blockchain support
- 📋 Cross-chain payment aggregation
- 📋 DeFi protocol integration

## Support

For integration support:
- **Documentation**: https://kamiyo.ai/docs/x402-payments
- **Support Email**: support@kamiyo.ai
- **GitHub Issues**: https://github.com/kamiyo-ai/kamiyo/issues

## License

This implementation is part of the KAMIYO platform. See LICENSE for details.