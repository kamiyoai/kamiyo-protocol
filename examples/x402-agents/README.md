# KAMIYO x402 Agent Examples

Production-ready AI agents demonstrating KAMIYO security intelligence integration via x402 payments. These examples show how to build autonomous agents that protect DeFi users and assets.

## Available Agents

### 1. Security Monitoring Agent
**Use Case**: Real-time security monitoring for DeFi protocols
**Cost**: ~$0.24/day ($0.01/hour × 24)
**Features**:
- Continuous monitoring for new exploits
- Automatic alerts via Discord/Slack webhooks
- Risk-based severity levels (Critical/High/Medium)
- Configurable check intervals

[→ View Demo](./security-monitor/)

### 2. DeFi Risk Assessment Agent
**Use Case**: Pre-transaction risk assessment
**Cost**: $0.01 per protocol check
**Features**:
- Calculate risk scores from exploit history
- Weighted scoring (recent exploits, total loss, time)
- Go/no-go recommendations
- Detailed assessment reports

[→ View Demo](./defi-risk-agent/)

### 3. Portfolio Guardian Agent
**Use Case**: Portfolio security monitoring
**Cost**: ~$0.01 per protocol per check
**Features**:
- Monitor multiple DeFi positions
- Proactive threat detection
- Position-specific risk analysis
- Automatic withdrawal recommendations

[→ View Demo](./portfolio-guardian/)

## Quick Start

### Prerequisites

- Node.js 16+ or 18+
- Base wallet with USDC for API payments
- Optional: Discord/Slack webhook for alerts

### Installation

```bash
# Clone the repository
git clone https://github.com/kamiyo-ai/kamiyo.git
cd kamiyo/examples/x402-agents

# Install dependencies (in each agent directory)
cd security-monitor
npm install

# Or install all at once
npm install --prefix security-monitor
npm install --prefix defi-risk-agent
npm install --prefix portfolio-guardian
```

### Configuration

Create a `.env` file in each agent directory:

```bash
# Required
WALLET_PRIVATE_KEY=0x...                    # Base wallet private key
BASE_RPC_URL=https://mainnet.base.org       # Base RPC endpoint

# Optional
DISCORD_WEBHOOK_URL=https://discord.com/... # For Discord alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/... # For Slack alerts
```

### Running Agents

```bash
# Security Monitor
cd security-monitor
node agent.js

# DeFi Risk Agent
cd defi-risk-agent
node agent.js "Uniswap V3" ethereum

# Portfolio Guardian
cd portfolio-guardian
node agent.js
```

## How x402 Payments Work

All agents use x402 protocol for automated micropayments:

1. **Request without payment** → Receives 402 Payment Required
2. **Agent sends USDC** → Transfers USDC to KAMIYO payment address
3. **Verify payment** → Confirms transaction on-chain
4. **Generate token** → Receives payment token for multiple requests
5. **Make requests** → Uses token until expired or depleted

### Payment Economics

| Agent | Interval | Requests/Day | Daily Cost |
|-------|----------|--------------|------------|
| Security Monitor | 1 hour | 24 | $0.24 |
| DeFi Risk Agent | On-demand | Variable | $0.01/check |
| Portfolio Guardian | 30 min | 48 per position | $0.48/position |

**Cost savings with payment tokens**:
- $1 USDC = 100 API requests
- Tokens valid for 24 hours
- Automatic token renewal when expired

## x402scan Integration

These agents are designed to work with x402scan:

- **Discover** KAMIYO on [x402scan.com](https://www.x402scan.com)
- **Deploy** agents directly from x402scan interface
- **Monitor** agent transactions and usage
- **Share** your agent configurations with the community

## Architecture

```
┌─────────────────┐
│   Your Agent    │
└────────┬────────┘
         │ 1. Request (no payment)
         ├─────────────────────────>
         │                          ┌──────────────┐
         │ 2. 402 Payment Required  │              │
         │<─────────────────────────┤  KAMIYO API  │
         │                          │              │
         │ 3. Send USDC on Base     └──────────────┘
         ├────────────────────────>
         │                          ┌──────────────┐
         │ 4. Verify + Token        │   Base L2    │
         │<─────────────────────────┤              │
         │                          └──────────────┘
         │ 5. Request with token
         ├─────────────────────────>
         │ 6. Security data
         │<─────────────────────────
```

## Customization

### Modify Check Intervals

```javascript
// In agent.js
const CONFIG = {
  CHECK_INTERVAL: 3600000, // Change to 30 min: 1800000
  // ... rest of config
};
```

### Adjust Risk Thresholds

```javascript
// Security Monitor
const THRESHOLDS = {
  CRITICAL: 10_000_000,  // Lower to alert more often
  HIGH: 1_000_000,
  MEDIUM: 100_000
};

// DeFi Risk Agent
const WEIGHTS = {
  RECENT_EXPLOITS: 0.4,  // Adjust weight distribution
  TOTAL_EXPLOITS: 0.3,
  TOTAL_LOSS: 0.2,
  DAYS_SINCE_LAST: 0.1
};
```

### Add Custom Webhooks

```javascript
async sendCustomAlert(data) {
  await axios.post('https://your-webhook.com', {
    alert: data,
    timestamp: new Date().toISOString()
  });
}
```

## Production Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY agent.js .
CMD ["node", "agent.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  security-monitor:
    build: ./security-monitor
    environment:
      - WALLET_PRIVATE_KEY=${WALLET_PRIVATE_KEY}
      - DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL}
    restart: unless-stopped

  portfolio-guardian:
    build: ./portfolio-guardian
    environment:
      - WALLET_PRIVATE_KEY=${WALLET_PRIVATE_KEY}
      - PORTFOLIO_FILE=/data/portfolio.json
    volumes:
      - ./data:/data
    restart: unless-stopped
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kamiyo-security-monitor
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: agent
        image: kamiyo/security-monitor:latest
        env:
        - name: WALLET_PRIVATE_KEY
          valueFrom:
            secretKeyRef:
              name: kamiyo-secrets
              key: wallet-key
```

## Monitoring & Logging

### Structured Logging

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'agent.log' }),
    new winston.transports.Console()
  ]
});

logger.info('Agent started', {
  agent: 'security-monitor',
  version: '1.0.0'
});
```

### Metrics Collection

```javascript
const promClient = require('prom-client');

const requestCounter = new promClient.Counter({
  name: 'kamiyo_api_requests_total',
  help: 'Total KAMIYO API requests'
});

const alertCounter = new promClient.Counter({
  name: 'security_alerts_total',
  help: 'Total security alerts triggered'
});
```

## Security Best Practices

1. **Private Key Management**
   - Never commit private keys to version control
   - Use environment variables or secret managers
   - Rotate keys periodically

2. **Webhook Security**
   - Validate webhook signatures
   - Use HTTPS endpoints only
   - Rate limit webhook calls

3. **Error Handling**
   - Implement retry logic with exponential backoff
   - Log all errors for debugging
   - Graceful degradation when API unavailable

4. **Payment Security**
   - Monitor USDC balance
   - Set maximum payment limits
   - Alert on unexpected payment failures

## Troubleshooting

### Payment Token Expired

```
Error: 402 Payment Required
```

**Solution**: Token expired after 24 hours. Agent will automatically create new payment.

### Insufficient Confirmations

```
Error: Transaction has 3/6 required confirmations
```

**Solution**: Wait for more block confirmations. Base requires 6 confirmations (~30 seconds).

### Wallet Balance Too Low

```
Error: insufficient funds for transfer
```

**Solution**: Add more USDC to your Base wallet.

### Rate Limit Exceeded

```
Error: 429 Too Many Requests
```

**Solution**: Increase check interval or reduce request frequency.

## Support

- **Documentation**: [kamiyo.ai/api-docs](https://kamiyo.ai/api-docs)
- **x402scan**: [x402scan.com](https://www.x402scan.com)
- **GitHub**: [github.com/kamiyo-ai/kamiyo](https://github.com/kamiyo-ai/kamiyo)
- **Email**: integrations@kamiyo.ai
- **Discord**: [discord.gg/kamiyo](https://discord.gg/kamiyo)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

### Ideas for New Agents

- **MEV Protection Agent**: Monitor for sandwich attacks
- **Smart Contract Auditor**: Analyze new contract deployments
- **Flash Loan Detector**: Track suspicious flash loan activity
- **Rug Pull Predictor**: Analyze token liquidity patterns
- **Bridge Security Monitor**: Monitor cross-chain bridges

## License

MIT License - See [LICENSE](../../LICENSE) for details.

---

Built with ❤️ by the KAMIYO team • Powered by x402 • Securing DeFi one agent at a time
