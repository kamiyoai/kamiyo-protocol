# Hyperliquid Security Monitor

Real-time exploit detection and anomaly monitoring for Hyperliquid DEX.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![Tests](https://img.shields.io/badge/tests-89/110_passed-brightgreen.svg)
![Coverage](https://img.shields.io/badge/coverage-81%25-brightgreen.svg)

## Features

- Real-time monitoring of HLP vault, oracle prices, and liquidation events
- ML-based anomaly detection using Isolation Forest and ARIMA
- Multi-source oracle validation across Binance, Coinbase, and Hyperliquid
- RESTful API and WebSocket support for live updates
- Multi-channel alerting (Discord, Telegram, Slack, Email)
- Prometheus metrics and health check endpoints

## Quick Start

```bash
git clone https://github.com/kamiyo-ai/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid
cp .env.example .env
docker-compose up -d
```

Verify:
```bash
curl http://localhost:8000/health
```

## Architecture

```
Hyperliquid API
       |
       v
 +------------+     +------------+     +------------+
 | HLP Vault  |     |  Oracle    |     |Liquidation |
 |  Monitor   |     |  Monitor   |     |  Analyzer  |
 +------------+     +------------+     +------------+
       |                  |                  |
       +------------------+------------------+
                          |
                          v
                   +-----------+
                   |  Alerts   |
                   |  REST API |
                   +-----------+
```

### WebSocket Real-Time Monitoring

```
wss://api.hyperliquid.xyz/ws
            │
            ▼
    ┌───────────────┐
    │ WS Client     │  Auto-reconnect, health checks
    └───────┬───────┘
            │
    ┌───────▼───────┐
    │Circuit Breaker│  Prevent cascade failures
    └───────┬───────┘
            │
    ┌───────▼───────┐
    │Message Buffer │  10K queue, no data loss
    └───────┬───────┘
            │
    ┌───────▼───────┐
    │   Handlers    │  Route by channel/type
    └───────┬───────┘
            │
    ┌───────▼───────┐
    │Monitors/Alerts│  Liquidations, oracle, trades
    └───────────────┘
```

## Monitoring Capabilities

**HLP Vault Monitor**
- Track vault health, PnL, and Sharpe ratio
- Detect 3-sigma anomalies
- ML-powered risk prediction (24h ahead)

**Oracle Deviation Detector**
- Cross-validate prices across exchanges
- Monitor BTC, ETH, SOL, MATIC, ARB, OP, AVAX
- Alert on sustained deviations

**Liquidation Analyzer**
- Detect flash loans (>$500k in <10s)
- Identify liquidation cascades
- Pattern recognition for exploit detection

## API

Get security status:
```bash
curl http://localhost:8000/security/dashboard
```

Monitor HLP vault:
```bash
curl http://localhost:8000/security/hlp-vault
```

Check oracle deviations:
```bash
curl http://localhost:8000/security/oracle-deviations
```

Query events:
```bash
curl http://localhost:8000/security/events?severity=critical
```

API documentation: http://localhost:8000/docs

## Testing

```bash
# All tests
pytest tests/ -v

# Unit tests
pytest tests/unit/ -v

# Historical incident validation
pytest tests/historical/ -v
```

**Test Status**: 89/110 tests passing (81%)

Core functionality covered:
- WebSocket resilience (circuit breaker, message buffer)
- ML anomaly detection and risk prediction
- API endpoints and authentication
- Alert system integration
- Feature engineering

See [Testing Guide](docs/TESTING_GUIDE.md) for details.

## Configuration

Key environment variables:
- `HLP_VAULT_ADDRESS` - HLP vault contract address
- `POSTGRES_*` - Database connection
- `DISCORD_WEBHOOK_URL` - Alert webhook
- `ANOMALY_THRESHOLD` - ML sensitivity (default: 3.0)

See `.env.example` for full configuration.

## Documentation

- [Self-Hosting Guide](docs/SELF_HOSTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [ML Models](docs/ML_MODELS.md)
- [Architecture Decision Records](docs/adr/)
- [Testing Guide](docs/TESTING_GUIDE.md)
- [Alert Setup](docs/ALERTS_SETUP.md)

## License

AGPL-3.0 with commercial restrictions.

Free for personal use, research, education, and non-profit organizations.
Commercial use (SaaS, white-label products) requires a commercial license.

Contact: licensing@kamiyo.ai

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

- Issues: https://github.com/kamiyo-ai/kamiyo-hyperliquid/issues
- Security: security@kamiyo.ai
