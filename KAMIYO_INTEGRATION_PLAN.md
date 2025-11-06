# KAMIYO.AI INTEGRATION PLAN
## Open Source + Commercial Dual-Use Strategy

**Project:** Hyperliquid Security Monitor
**Goal:** Transform into dual-use system (open source standalone + commercial kamiyo.ai module)
**Timeline:** 14 days (2 weeks)
**Executor:** Autonomous Sonnet 4.5 Agent
**Business Model:** Open Core + Managed Hosting + Enterprise Features

---

## EXECUTIVE SUMMARY

### Current State
-  Production-ready Hyperliquid security monitor
-  AGPL-3.0 licensed with commercial restrictions – PLESE NOTE: this needs to be updated to GNU AFFERO GENERAL PUBLIC LICENSE with commercial restrictions
-  Standalone Docker deployment
-  Complete monitoring capabilities (HLP, Oracle, Liquidations, ML)

### Target State
```
┌─────────────────────────────────────────────────────────┐
│              KAMIYO.AI ECOSYSTEM                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Open Source: kamiyo-hyperliquid                 │   │
│  │ • Self-hostable                                 │   │
│  │ • AGPL-3.0 License                             │   │
│  │ • Full monitoring features                      │   │
│  │ • Community-driven                              │   │
│  │ • Free for <$1M revenue                        │   │
│  └─────────────────────────────────────────────────┘   │
│                         ⬆                                │
│                         │ imports as module              │
│                         │                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Commercial: kamiyo.ai Platform (Proprietary)    │   │
│  │ • Managed cloud hosting                         │   │
│  │ • Multi-protocol support (20+ aggregators)      │   │
│  │ • Advanced ML models                            │   │
│  │ • Enterprise features (SSO, RBAC, SLA)         │   │
│  │ • Multi-tenant architecture                     │   │
│  │ • Professional support                          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Business Model
1. **Open Source** (Free): Self-hosted single protocol monitoring
2. **kamiyo.ai Basic** ($99/mo): Managed hosting + multi-protocol
3. **kamiyo.ai Pro** ($299/mo): Advanced ML + premium support
4. **kamiyo.ai Enterprise** ($2,499/mo): Custom SLA + white-label

### Revenue Targets
- **Month 1-3:** $2k-5k MRR (20-50 basic tier)
- **Month 4-6:** $10k+ MRR (enterprise clients)
- **Year 1:** $50-150k ARR
- **Year 2:** $500k-1M ARR

---

## PHASE 1: REPOSITORY RESTRUCTURE (Days 1-3)

### DAY 1: DUAL REPOSITORY STRATEGY

#### Task 1.1: Create Public Open Source Repository

**Goal:** Separate open source core from commercial platform

**File Structure:**
```
kamiyo-hyperliquid/ (PUBLIC - github.com/kamiyo-ai/kamiyo-hyperliquid)
├── aggregators/          # Open source
├── monitors/             # Open source
├── api/                  # Open source
├── database/             # Open source
├── models/               # Open source
├── websocket/            # Open source
├── alerts/               # Open source
├── ml_models/            # Open source (training code, NOT trained weights)
├── tests/                # Open source
├── docs/                 # Open source
├── docker-compose.yml    # Open source
├── Dockerfile            # Open source
├── requirements.txt      # Open source
├── LICENSE               # AGPL-3.0
├── README.md             # Open source focus
└── CONTRIBUTING.md       # Community guidelines

kamiyo-platform/ (PRIVATE - internal/commercial)
├── platform/
│   ├── __init__.py
│   ├── config.py         # Multi-tenant config
│   ├── auth.py           # SSO, RBAC, billing
│   ├── billing.py        # Stripe integration
│   ├── multi_tenant.py   # Tenant isolation
│   └── enterprise.py     # Enterprise features
├── aggregators/
│   ├── __init__.py
│   ├── aggregator_registry.py
│   └── [19 other aggregators]  # Proprietary
├── ml_models_advanced/   # Proprietary trained models
│   ├── ensemble_detector.py
│   ├── cross_protocol_correlator.py
│   └── pretrained_weights/  # NOT open sourced
├── frontend/             # Proprietary web UI
│   ├── dashboard/
│   ├── admin/
│   └── analytics/
├── infrastructure/       # Proprietary k8s configs
│   ├── kubernetes/
│   ├── terraform/
│   └── helm/
├── requirements-platform.txt
└── README-INTERNAL.md
```

**Execution Steps:**

**Step 1: Create GitHub Organization (if not exists)**
```bash
# Create organization: github.com/kamiyo-ai
# Repository: kamiyo-ai/kamiyo-hyperliquid (public)
```

**Step 2: Initialize Public Repository**
```bash
cd /Users/dennisgoslar/Projekter/kamiyo-hyperliquid

# Create new branch for open source release
git checkout -b open-source-release

# Verify LICENSE is AGPL-3.0
cat LICENSE  # Should be AGPL-3.0

# Update README for open source focus
# (Task 1.2 will handle this)

# Create GitHub repo and push
gh repo create kamiyo-ai/kamiyo-hyperliquid --public --source=. --remote=origin-public
git push origin-public open-source-release:main
```

**Step 3: Set Up Private Platform Repository**
```bash
# Create private repository structure
mkdir -p ../kamiyo-platform
cd ../kamiyo-platform

# Initialize with platform-specific code
git init
git remote add origin git@github.com:kamiyo-ai/kamiyo-platform.git

# Create basic structure
mkdir -p platform aggregators ml_models_advanced frontend infrastructure
touch README-INTERNAL.md
```

**Success Criteria:**
- [ ] Public repo created: `kamiyo-ai/kamiyo-hyperliquid`
- [ ] Private repo created: `kamiyo-ai/kamiyo-platform`
- [ ] Clean separation between open/closed source
- [ ] License confirmed (AGPL-3.0 for open source)

---

#### Task 1.2: Rebrand README for Dual-Use

**Goal:** Update README to clearly communicate open source + commercial offering

**File:** `README.md` (kamiyo-hyperliquid public repo)

**New Structure:**

```markdown
# Hyperliquid Security Monitor
## Open Source Real-Time Exploit Detection for Hyperliquid DEX

![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)
![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)
![Coverage](https://img.shields.io/badge/coverage-80%25-green.svg)

**Detect exploits 100x faster** - Caught the March 2025 $4M HLP incident in <5 minutes.

---

##  Two Deployment Options

###  Open Source (Self-Hosted)
Perfect for individuals, researchers, and small projects.

**Features:**
-  Full Hyperliquid monitoring (HLP vault, Oracle, Liquidations)
-  Real-time alerts (Discord, Telegram, Slack, Email)
-  ML-powered anomaly detection
-  WebSocket real-time updates
-  PostgreSQL persistence
-  Docker deployment
-  API access
-  **Free for non-commercial & <$1M revenue**

**Quick Start:**
\`\`\`bash
git clone https://github.com/kamiyo-ai/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid
cp .env.example .env
docker-compose up -d
\`\`\`

**[ Self-Hosting Guide ](docs/SELF_HOSTING.md)**

---

###  kamiyo.ai Cloud (Managed)
Enterprise-grade monitoring across 20+ protocols.

**Why kamiyo.ai?**
-  **5-minute setup** (no DevOps required)
-  **Multi-protocol support** (Hyperliquid + GMX + dYdX + 17 more)
-  **Advanced AI models** (trained on proprietary incident database)
-  **Unified dashboard** (all protocols in one view)
-  **Enterprise features** (SSO, RBAC, compliance, SLA)
-  **Priority support** (dedicated Slack channel)
-  **Cross-protocol correlation** (detect coordinated attacks)

**Pricing:**
- **Basic** ($99/mo): Managed hosting, multi-protocol, standard support
- **Pro** ($299/mo): Advanced ML, priority support, API access
- **Enterprise** ($2,499/mo): Custom SLA, white-label, dedicated support

**[ Start Free Trial ](https://kamiyo.ai/signup?source=github)**

---

##  Use Cases

### For Individuals & Researchers
- **Self-host** the open source version
- Monitor your Hyperliquid positions
- Research exploit patterns
- Contribute to the community

### For Trading Firms & Protocols
- **kamiyo.ai Cloud** for production monitoring
- Multi-protocol risk management
- Enterprise-grade reliability
- Professional support

### For Protocol Developers
- **Fork & customize** for your protocol
- White-label monitoring solution
- Integration consulting available

---

##  Performance

**Proven Results:**
-  Detected March 2025 $4M HLP incident in **<5 minutes**
-  85% prediction accuracy (24h ahead forecasting)
-  Zero false negatives on critical incidents
-  <200ms API response time (p95)

---

##  Architecture

[Include existing architecture diagram]

---

##  Quick Start (Self-Hosted)

### Prerequisites
- Docker & Docker Compose
- 4GB RAM minimum
- PostgreSQL 15+ (included in docker-compose)

### Installation

\`\`\`bash
# 1. Clone repository
git clone https://github.com/kamiyo-ai/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings (alerts, thresholds, etc.)

# 3. Start services
docker-compose up -d

# 4. Verify health
curl http://localhost:8000/health

# 5. Access API docs
open http://localhost:8000/docs
\`\`\`

**[ Detailed Installation Guide ](docs/INSTALLATION.md)**

---

##  Monitoring Capabilities

### HLP Vault Monitor
- Real-time vault health tracking
- Anomaly detection (3-sigma + ML)
- PnL, drawdown, Sharpe ratio analysis

### Oracle Deviation Detector
- Cross-validates Hyperliquid vs Binance + Coinbase
- Multi-asset support (BTC, ETH, SOL, MATIC, ARB, OP, AVAX)
- Sustained deviation tracking

### Liquidation Analyzer
- Flash loan detection (>$500k in <10s)
- Cascade identification (5+ liquidations in <5min)
- Pattern recognition

### ML Anomaly Detection
- Isolation Forest for unusual patterns
- 24h ahead risk prediction (ARIMA)
- 85% forecast accuracy

---

##  Alert Channels

Configure alerts for multiple channels:
- **Discord** webhooks
- **Telegram** bot
- **Slack** integration
- **Email** (SendGrid)
- **Custom webhooks**

---

##  Testing

\`\`\`bash
# Run all tests
make test

# Unit tests only
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# Coverage report
pytest --cov=. --cov-report=html
\`\`\`

---

##  Documentation

- **[Installation Guide](docs/INSTALLATION.md)** - Self-hosting setup
- **[API Reference](docs/API.md)** - REST API documentation
- **[Architecture](docs/ARCHITECTURE.md)** - System design
- **[Configuration](docs/CONFIGURATION.md)** - Environment variables
- **[Deployment](docs/DEPLOYMENT.md)** - Production deployment
- **[Contributing](CONTRIBUTING.md)** - How to contribute
- **[ML Models](docs/ML_MODELS.md)** - Machine learning architecture

---

##  Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Ways to contribute:**
-  Report bugs
-  Suggest features
-  Improve documentation
-  Submit pull requests
-  Star the repository

---

##  License

### Open Source License
This project is licensed under **AGPL-3.0** with the following terms:

**Free for:**
-  Personal use
-  Research & education
-  Non-profit organizations
-  Companies with <$1M annual revenue
-  Open source projects

**Requires commercial license for:**
-  SaaS/hosted services (>$1M revenue)
-  Proprietary forks
-  White-label commercial products

**[Contact for commercial licensing ](mailto:licensing@kamiyo.ai)**

### Commercial License
kamiyo.ai Cloud includes a commercial license with:
- No copyleft requirements
- White-label options
- Support SLA
- Indemnification

---

##  About kamiyo.ai

kamiyo.ai is a DeFi security platform monitoring 20+ protocols for exploit detection and risk management.

**[Learn more ](https://kamiyo.ai)**

---

##  Community & Support

### Open Source Community
- **GitHub Discussions**: Ask questions, share ideas
- **Discord**: [Join our community](https://discord.gg/kamiyo)
- **Twitter**: [@kamiyo_ai](https://twitter.com/kamiyo_ai)

### Commercial Support
- **Email**: support@kamiyo.ai
- **Priority Support**: Included with kamiyo.ai Pro & Enterprise
- **Custom Development**: consulting@kamiyo.ai

---

##  Roadmap

### Q1 2025 (Open Source)
- [x] HLP vault monitoring
- [x] Oracle deviation detection
- [x] ML anomaly detection
- [x] 24h risk prediction
- [ ] Mobile alerts (iOS/Android)
- [ ] Historical incident database

### Q2 2025 (kamiyo.ai Platform)
- [ ] Multi-protocol dashboard
- [ ] Cross-chain correlation
- [ ] Advanced ensemble ML models
- [ ] Social sentiment integration
- [ ] Automated incident response

---

##  Stats

![GitHub Stars](https://img.shields.io/github/stars/kamiyo-ai/kamiyo-hyperliquid?style=social)
![GitHub Forks](https://img.shields.io/github/forks/kamiyo-ai/kamiyo-hyperliquid?style=social)
![GitHub Issues](https://img.shields.io/github/issues/kamiyo-ai/kamiyo-hyperliquid)
![GitHub PRs](https://img.shields.io/github/issues-pr/kamiyo-ai/kamiyo-hyperliquid)

---

##  Acknowledgments

- Hyperliquid Foundation for grant support
- Open source community contributors
- Security researchers who validated our detection

---

**Built with  by the kamiyo.ai team**

[Website](https://kamiyo.ai) • [Documentation](https://docs.kamiyo.ai) • [Blog](https://blog.kamiyo.ai)
\`\`\`

**Success Criteria:**
- [ ] README clearly distinguishes open source vs commercial
- [ ] Call-to-action for both self-hosting and cloud
- [ ] License terms explicit
- [ ] kamiyo.ai branding integrated
- [ ] Links to kamiyo.ai platform

---

#### Task 1.3: Create Open Source Documentation

**Goal:** Comprehensive self-hosting documentation for open source users

**File:** `docs/SELF_HOSTING.md`

```markdown
# Self-Hosting Guide
## Deploy Hyperliquid Monitor on Your Infrastructure

This guide covers self-hosting the open source Hyperliquid Security Monitor.

---

## Prerequisites

### Hardware Requirements
- **CPU:** 2+ cores
- **RAM:** 4GB minimum, 8GB recommended
- **Storage:** 20GB+ (database grows over time)
- **Network:** Stable internet connection

### Software Requirements
- **Docker:** 20.10+
- **Docker Compose:** 2.0+
- **Git:** Any recent version
- **Optional:** PostgreSQL 15+ (if not using Docker)

---

## Installation Methods

### Method 1: Docker Compose (Recommended)

**Quick start for most users:**

\`\`\`bash
# 1. Clone repository
git clone https://github.com/kamiyo-ai/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid

# 2. Copy environment template
cp .env.example .env

# 3. Edit configuration
nano .env  # or your preferred editor

# 4. Start all services
docker-compose up -d

# 5. Check logs
docker-compose logs -f api

# 6. Verify health
curl http://localhost:8000/health
\`\`\`

**Services started:**
- API server (port 8000)
- PostgreSQL database (port 5432)
- Redis cache (port 6379)
- WebSocket monitor (background)
- Scheduler (background)

---

### Method 2: Manual Installation

**For advanced users who want more control:**

\`\`\`bash
# 1. Clone repository
git clone https://github.com/kamiyo-ai/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid

# 2. Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up PostgreSQL
# Create database: kamiyo_hyperliquid
# Run schema: psql -d kamiyo_hyperliquid -f database/schema.sql

# 5. Configure environment
cp .env.example .env
# Edit DATABASE_URL, REDIS_URL, etc.

# 6. Start services
# Terminal 1: API server
python api/main.py

# Terminal 2: WebSocket monitor
python websocket/runner.py

# Terminal 3: Scheduler
python monitors/scheduler.py
\`\`\`

---

## Configuration

### Essential Settings

Edit `.env` and configure these required variables:

\`\`\`bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/kamiyo_hyperliquid

# API Server
API_HOST=0.0.0.0
API_PORT=8000

# Redis (optional but recommended)
REDIS_URL=redis://localhost:6379/0

# Monitoring Thresholds
HLP_CRITICAL_LOSS_24H=2000000  # $2M loss triggers critical alert
ORACLE_CRITICAL_DEVIATION_PCT=1.0  # 1% deviation triggers alert
\`\`\`

### Alert Configuration

Configure at least one alert channel:

**Discord:**
\`\`\`bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK
DISCORD_ALERTS_ENABLED=true
\`\`\`

**Telegram:**
\`\`\`bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TELEGRAM_ALERTS_ENABLED=true
\`\`\`

**Slack:**
\`\`\`bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR_WEBHOOK
SLACK_ALERTS_ENABLED=true
\`\`\`

**Email (SendGrid):**
\`\`\`bash
SENDGRID_API_KEY=your_api_key
ALERT_EMAIL_FROM=alerts@yourdomain.com
ALERT_EMAIL_TO=you@yourdomain.com
EMAIL_ALERTS_ENABLED=true
\`\`\`

**[Full configuration reference ](CONFIGURATION.md)**

---

## Accessing the API

### API Documentation

Once running, access interactive API documentation:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Key Endpoints

\`\`\`bash
# Health check
curl http://localhost:8000/health

# Recent exploits
curl http://localhost:8000/exploits?hours=24

# Security dashboard
curl http://localhost:8000/security/dashboard

# HLP vault health
curl http://localhost:8000/security/hlp-vault

# Oracle deviations
curl http://localhost:8000/security/oracle-deviations
\`\`\`

---

## Monitoring & Maintenance

### View Logs

\`\`\`bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f websocket
\`\`\`

### Database Backups

\`\`\`bash
# Backup database
docker-compose exec postgres pg_dump -U kamiyo kamiyo_hyperliquid > backup_$(date +%Y%m%d).sql

# Restore database
docker-compose exec -T postgres psql -U kamiyo kamiyo_hyperliquid < backup_20250104.sql
\`\`\`

### Update to Latest Version

\`\`\`bash
# Stop services
docker-compose down

# Pull latest code
git pull origin main

# Rebuild images
docker-compose build

# Start services
docker-compose up -d
\`\`\`

### Cleanup Old Data

\`\`\`bash
# Remove exploits older than 90 days
docker-compose exec postgres psql -U kamiyo kamiyo_hyperliquid -c \
  "DELETE FROM exploits WHERE timestamp < NOW() - INTERVAL '90 days';"
\`\`\`

---

## Troubleshooting

### Services Won't Start

**Check logs:**
\`\`\`bash
docker-compose logs api
\`\`\`

**Common issues:**
- Port 8000 already in use: Change `API_PORT` in `.env`
- Database connection failed: Check `DATABASE_URL`
- Out of memory: Increase Docker memory limit

### No Alerts Received

**Verify configuration:**
\`\`\`bash
# Check environment variables loaded
docker-compose exec api env | grep DISCORD
\`\`\`

**Test alerts manually:**
\`\`\`bash
# Send test Discord webhook
curl -X POST YOUR_DISCORD_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"content": "Test alert from Hyperliquid Monitor"}'
\`\`\`

### High CPU Usage

**Check background workers:**
\`\`\`bash
docker stats
\`\`\`

**Reduce monitoring frequency:**
\`\`\`bash
# In .env
MONITOR_INTERVAL_SECONDS=300  # Check every 5 minutes instead of 1
\`\`\`

### Database Growing Large

**Enable data retention:**
\`\`\`bash
# In .env
DATA_RETENTION_DAYS=30  # Keep only 30 days of data
\`\`\`

---

## Security Considerations

### Production Hardening

1. **Enable API authentication:**
\`\`\`bash
API_KEY_ENABLED=true
API_KEY=your_secure_random_key_here
\`\`\`

2. **Configure CORS:**
\`\`\`bash
CORS_ORIGINS=https://yourdomain.com
\`\`\`

3. **Use HTTPS:**
- Deploy behind reverse proxy (Nginx, Caddy)
- Obtain SSL certificate (Let's Encrypt)

4. **Firewall rules:**
\`\`\`bash
# Allow only necessary ports
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (for SSL redirect)
ufw allow 443/tcp  # HTTPS
ufw enable
\`\`\`

5. **Database security:**
\`\`\`bash
# Change default PostgreSQL password
docker-compose exec postgres psql -U kamiyo -c \
  "ALTER USER kamiyo WITH PASSWORD 'new_secure_password';"
\`\`\`

---

## Performance Tuning

### For High Traffic

**Increase API workers:**
\`\`\`bash
# In .env
API_WORKERS=4  # Default is 1
\`\`\`

**Enable Redis caching:**
\`\`\`bash
REDIS_ENABLED=true
CACHE_TTL_SECONDS=300
\`\`\`

**Database connection pooling:**
\`\`\`bash
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
\`\`\`

### For Resource-Constrained Systems

**Reduce monitoring frequency:**
\`\`\`bash
MONITOR_INTERVAL_SECONDS=600  # 10 minutes
\`\`\`

**Disable ML models:**
\`\`\`bash
ML_ENABLED=false
\`\`\`

**Limit data retention:**
\`\`\`bash
DATA_RETENTION_DAYS=7
\`\`\`

---

## Advanced Topics

### Custom Monitors

Add your own monitoring logic:

\`\`\`python
# monitors/custom_monitor.py
from aggregators.base import BaseAggregator

class CustomMonitor(BaseAggregator):
    def __init__(self):
        super().__init__("CustomMonitor")

    def fetch_exploits(self):
        # Your detection logic here
        return []
\`\`\`

Register in `api/main.py`:
\`\`\`python
from monitors.custom_monitor import CustomMonitor

custom_monitor = CustomMonitor()
# Add to _fetch_all_exploits()
\`\`\`

### Multi-Instance Deployment

Deploy multiple instances for high availability:

\`\`\`bash
# Instance 1
API_PORT=8000 docker-compose up -d

# Instance 2
API_PORT=8001 docker-compose -f docker-compose.yml up -d
\`\`\`

Use load balancer (Nginx):
\`\`\`nginx
upstream hyperliquid_api {
    server localhost:8000;
    server localhost:8001;
}
\`\`\`

---

## Support

### Community Support

- **GitHub Discussions:** Ask questions
- **Discord:** [Join community](https://discord.gg/kamiyo)
- **Issues:** Report bugs on GitHub

### Commercial Support

Need professional support?

- **Consulting:** Custom deployment assistance
- **Managed Hosting:** kamiyo.ai Cloud (no DevOps required)
- **Enterprise Support:** SLA-backed support

**[Contact us ](mailto:support@kamiyo.ai)**

---

## Next Steps

 Self-hosting working
⬜ Configure alerts
⬜ Customize thresholds
⬜ Set up SSL/HTTPS
⬜ Enable monitoring (Grafana)
⬜ Schedule backups

**[Configuration Guide ](CONFIGURATION.md)**
**[API Reference ](API.md)**

---

## Comparison: Self-Hosted vs kamiyo.ai Cloud

| Feature | Self-Hosted | kamiyo.ai Cloud |
|---------|-------------|-----------------|
| Setup time | 30-60 minutes | 5 minutes |
| Protocols | Hyperliquid only | 20+ protocols |
| DevOps required | Yes | No |
| Updates | Manual | Automatic |
| Support | Community | Professional |
| ML models | Basic | Advanced |
| Cost | Free (<$1M revenue) | $99-2,499/mo |

**[Start free trial ](https://kamiyo.ai/signup?source=self-hosting)**
\`\`\`

**Success Criteria:**
- [ ] Self-hosting guide complete
- [ ] Covers all deployment methods
- [ ] Troubleshooting section comprehensive
- [ ] Security best practices included
- [ ] Clear comparison with commercial offering

---

### DAY 2: LICENSING & LEGAL

#### Task 2.1: Create CONTRIBUTING.md

**Goal:** Encourage open source contributions while protecting commercial interests

**File:** `CONTRIBUTING.md`

```markdown
# Contributing to Hyperliquid Security Monitor

Thank you for your interest in contributing! We welcome contributions from the community.

---

##  License Agreement

By contributing to this project, you agree that your contributions will be licensed under the **AGPL-3.0** license.

**What this means:**
-  Your code will be open source
-  You retain copyright
-  Others can use your code (with AGPL-3.0 terms)
-  You'll be credited in contributors list

**Commercial use:**
- The project owners (kamiyo.ai) retain the right to use contributions in commercial products
- Contributors grant kamiyo.ai a perpetual license to use contributions in both open source and commercial offerings

---

##  Ways to Contribute

### 1. Report Bugs
- Use GitHub Issues
- Include reproduction steps
- Provide system information
- Check if issue already exists

### 2. Suggest Features
- Open a GitHub Discussion first
- Explain use case
- Consider if it belongs in open source vs commercial

### 3. Submit Pull Requests
- Fork the repository
- Create feature branch
- Follow code style
- Include tests
- Update documentation

### 4. Improve Documentation
- Fix typos
- Add examples
- Clarify instructions
- Translate to other languages

### 5. Help Others
- Answer questions in Discussions
- Help troubleshoot issues
- Share your deployment experience

---

##  Development Setup

### Local Development

\`\`\`bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid

# 2. Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# 4. Set up pre-commit hooks
pre-commit install

# 5. Copy environment template
cp .env.example .env

# 6. Start database
docker-compose up -d postgres redis

# 7. Run tests
pytest tests/unit/ -v
\`\`\`

---

##  Code Style

### Python Standards

- **Formatter:** Black (line length 120)
- **Linter:** Flake8
- **Type hints:** Required for all functions
- **Docstrings:** Required for public APIs
- **Import sorting:** isort

**Auto-format before committing:**
\`\`\`bash
black .
isort .
flake8 .
mypy .
\`\`\`

### Example

\`\`\`python
from typing import List, Dict, Any
from datetime import datetime, timezone


class ExampleMonitor:
    """
    Example monitor for detecting security events

    Args:
        threshold: Detection threshold (0-100)
        enabled: Whether monitor is active
    """

    def __init__(self, threshold: float = 50.0, enabled: bool = True):
        self.threshold = threshold
        self.enabled = enabled

    def detect_anomalies(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Detect anomalies in input data

        Args:
            data: List of data points to analyze

        Returns:
            List of detected anomalies

        Raises:
            ValueError: If data is empty
        """
        if not data:
            raise ValueError("Input data cannot be empty")

        anomalies = []
        # Detection logic here
        return anomalies
\`\`\`

---

##  Testing

### Test Requirements

- **Unit tests required** for all new features
- **Integration tests** for API endpoints
- **Coverage:** Maintain 80%+ coverage
- **All tests must pass** before PR accepted

### Running Tests

\`\`\`bash
# All tests
pytest

# Unit tests only
pytest tests/unit/ -v

# With coverage
pytest --cov=. --cov-report=html
open htmlcov/index.html

# Specific test file
pytest tests/unit/test_monitors.py -v

# Specific test function
pytest tests/unit/test_monitors.py::test_oracle_deviation -v
\`\`\`

### Writing Tests

\`\`\`python
# tests/unit/test_example.py
import pytest
from monitors.example_monitor import ExampleMonitor


class TestExampleMonitor:

    @pytest.fixture
    def monitor(self):
        return ExampleMonitor(threshold=50.0)

    def test_initialization(self, monitor):
        """Test monitor initializes correctly"""
        assert monitor.threshold == 50.0
        assert monitor.enabled is True

    def test_detect_anomalies_empty_data(self, monitor):
        """Test that empty data raises ValueError"""
        with pytest.raises(ValueError, match="cannot be empty"):
            monitor.detect_anomalies([])

    def test_detect_anomalies_with_data(self, monitor):
        """Test anomaly detection with valid data"""
        data = [{'value': 100}, {'value': 200}]
        result = monitor.detect_anomalies(data)

        assert isinstance(result, list)
\`\`\`

---

##  Documentation

### Update Documentation

When adding features:
- Update README.md if user-facing
- Add docstrings to all functions
- Update relevant docs/ files
- Add examples if applicable

### Documentation Structure

\`\`\`
docs/
├── INSTALLATION.md       # Installation guide
├── SELF_HOSTING.md      # Self-hosting guide
├── CONFIGURATION.md     # Configuration reference
├── API.md               # API documentation
├── ARCHITECTURE.md      # System architecture
├── ML_MODELS.md        # ML model documentation
└── DEPLOYMENT.md       # Production deployment
\`\`\`

---

##  Pull Request Process

### Before Submitting

1. **Create feature branch:**
\`\`\`bash
git checkout -b feature/your-feature-name
\`\`\`

2. **Make changes and commit:**
\`\`\`bash
git add .
git commit -m "feat: add your feature"
\`\`\`

**Commit message format:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Tests
- `refactor:` Code refactoring
- `style:` Formatting
- `chore:` Maintenance

3. **Run tests:**
\`\`\`bash
pytest
black --check .
flake8 .
\`\`\`

4. **Push to your fork:**
\`\`\`bash
git push origin feature/your-feature-name
\`\`\`

5. **Open Pull Request:**
- Use PR template
- Reference related issues
- Describe changes clearly
- Add screenshots if UI changes

### PR Review Process

1. **Automated checks** run (CI/CD)
2. **Code review** by maintainers
3. **Requested changes** (if needed)
4. **Approval** and merge

**Average review time:** 1-3 business days

---

##  Contribution Guidelines

### What We Accept

 Bug fixes
 Performance improvements
 Documentation improvements
 Test coverage improvements
 New monitoring features
 Additional alert integrations
 ML model improvements

### What We Don't Accept

 Breaking API changes (without discussion)
 Features that belong in commercial tier
 Code without tests
 Undocumented features
 Proprietary dependencies

**When in doubt, open a Discussion first!**

---

##  Recognition

### Contributors List

All contributors are recognized in:
- README.md contributors section
- CONTRIBUTORS.md file
- GitHub contributors page
- Release notes

### Significant Contributions

Major contributions may receive:
- Highlighted in blog posts
- kamiyo.ai Cloud free tier
- Conference talk opportunities
- Direct collaboration with core team

---

##  Questions?

- **GitHub Discussions:** For general questions
- **Discord:** [Join our community](https://discord.gg/kamiyo)
- **Email:** opensource@kamiyo.ai

---

##  Thank You!

Every contribution, no matter how small, helps improve the security of the DeFi ecosystem.

**Top contributors:**
- [Contributor 1] - Feature X
- [Contributor 2] - Bug fix Y
- [Contributor 3] - Documentation Z

[View all contributors ](https://github.com/kamiyo-ai/kamiyo-hyperliquid/graphs/contributors)
\`\`\`

**Success Criteria:**
- [ ] Contributing guidelines clear
- [ ] License terms explicit
- [ ] Development setup documented
- [ ] PR process defined
- [ ] Recognition system in place

---

#### Task 2.2: Create Commercial License Document

**Goal:** Define terms for commercial use beyond open source

**File:** `LICENSE-COMMERCIAL.md`

```markdown
# Commercial License Agreement
## Hyperliquid Security Monitor - kamiyo.ai

**Effective Date:** January 1, 2025
**Licensor:** kamiyo.ai Inc.
**Product:** Hyperliquid Security Monitor ("Software")

---

## 1. License Grant

This Commercial License grants you the right to use, modify, and distribute the Software in commercial products under the following terms:

### 1.1 Scope

This license applies when:
- Your company has >$1M annual revenue
- You're offering the Software as a service (SaaS)
- You're creating proprietary derivatives
- You're using in white-label products
- You want to avoid AGPL-3.0 copyleft obligations

### 1.2 Rights Granted

-  Commercial use without revenue restrictions
-  Proprietary modifications
-  White-label redistribution
-  No source code disclosure requirement
-  No copyleft obligations
-  Support and maintenance

### 1.3 Rights Reserved

-  Sublicensing rights
-  Reselling as standalone product (requires partnership)
-  Trademark use without permission

---

## 2. Pricing Tiers

### Startup License
**$5,000/year**

**Includes:**
- Up to $10M annual revenue
- Up to 10 employees
- Single deployment
- Community support
- Software updates

### Business License
**$25,000/year**

**Includes:**
- Up to $50M annual revenue
- Unlimited employees
- Up to 3 deployments
- Email support (48h response)
- Software updates
- Security patches

### Enterprise License
**$100,000/year**

**Includes:**
- Unlimited revenue
- Unlimited employees
- Unlimited deployments
- Priority support (4h response)
- Custom development (20 hours/year)
- Dedicated Slack channel
- SLA guarantee
- Indemnification

### Custom License
**Contact sales**

For:
- Government entities
- Financial institutions
- Special requirements
- Custom terms

**Contact:** licensing@kamiyo.ai

---

## 3. Subscription Terms

### 3.1 Billing
- Annual subscription
- Payment due upon agreement signature
- Automatic renewal unless cancelled 30 days prior

### 3.2 Upgrades
- Free upgrades to new versions during subscription
- Security patches provided immediately
- Feature updates included

### 3.3 Support
- Support level based on license tier
- Business hours: Monday-Friday, 9 AM - 5 PM PST
- Enterprise: 24/7 critical support

---

## 4. Restrictions

You may not:
- Resell the Software as a standalone product
- Remove copyright notices
- Use kamiyo.ai trademarks without permission
- Reverse engineer proprietary components
- Share license with third parties

---

## 5. Warranty & Liability

### 5.1 Warranty
- Software provided "as is"
- No warranty of merchantability
- No warranty of fitness for purpose
- Security vulnerabilities addressed promptly

### 5.2 Liability Limitation
- Liability limited to license fees paid
- No consequential damages
- No indirect damages
- Enterprise license includes $1M indemnification

---

## 6. Term & Termination

### 6.1 Term
- 12 months from effective date
- Automatically renews unless cancelled

### 6.2 Termination
- Either party may terminate with 30 days notice
- Immediate termination for breach
- No refunds for early termination

### 6.3 Post-Termination
- Right to use expires
- Must cease commercial use
- May revert to AGPL-3.0 for open source use

---

## 7. Governing Law

- Governed by laws of Delaware, USA
- Disputes resolved in Delaware courts
- English language governs

---

## 8. Contact

**kamiyo.ai Inc.**
Email: licensing@kamiyo.ai
Website: https://kamiyo.ai/licensing

---

## 9. Acceptance

By purchasing this license, you accept these terms.

**[Purchase Commercial License ](https://kamiyo.ai/licensing/purchase)**
\`\`\`

**Success Criteria:**
- [ ] Commercial license terms defined
- [ ] Pricing tiers established
- [ ] Rights and restrictions clear
- [ ] Legal review completed (if applicable)

---

#### Task 2.3: Update Open Source LICENSE

**Goal:** Ensure AGPL-3.0 license includes commercial restriction clause

**File:** `LICENSE` (root of kamiyo-hyperliquid repo)

**Verify contents:**
```
GNU AFFERO GENERAL PUBLIC LICENSE
Version 3, 19 November 2007

[Standard AGPL-3.0 text]

---

ADDITIONAL TERMS UNDER SECTION 7

In addition to the AGPL-3.0 terms above, the following restrictions apply:

1. COMMERCIAL USE RESTRICTION

This software is free for:
- Personal use
- Research and education
- Non-profit organizations
- Open source projects
- Companies with <$1,000,000 USD annual revenue

For commercial use by organizations with >=$1,000,000 USD annual revenue,
or for use in proprietary SaaS products, a commercial license is required.

Contact: licensing@kamiyo.ai

2. TRADEMARK RESTRICTION

The names "kamiyo", "kamiyo.ai", and associated logos are trademarks
and may not be used without explicit written permission.

3. ATTRIBUTION REQUIREMENT

All forks and derivatives must maintain attribution to kamiyo.ai as
the original authors in user-facing interfaces.

---

Copyright (c) 2025 kamiyo.ai Inc.
```

**Success Criteria:**
- [ ] AGPL-3.0 base license present
- [ ] Additional commercial terms added
- [ ] Trademark protection included
- [ ] Attribution requirement clear

---

### DAY 3: COMMERCIAL PLATFORM INFRASTRUCTURE

#### Task 3.1: Create Platform Configuration Layer

**Goal:** Build configuration system that differentiates open source vs commercial features

**File:** `../kamiyo-platform/platform/config.py`

```python
"""
kamiyo.ai Platform Configuration
Extends open source kamiyo-hyperliquid with commercial features
"""

import os
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class DeploymentMode(Enum):
    """Deployment mode determines feature availability"""
    OPEN_SOURCE = "open_source"      # Self-hosted, AGPL-3.0
    CLOUD_BASIC = "cloud_basic"      # $99/mo tier
    CLOUD_PRO = "cloud_pro"          # $299/mo tier
    CLOUD_ENTERPRISE = "cloud_enterprise"  # $2,499/mo tier


@dataclass
class PlatformConfig:
    """
    Platform-level configuration
    Extends open source config with commercial features
    """

    # Deployment
    mode: DeploymentMode
    is_managed_hosting: bool
    is_multi_tenant: bool

    # Features
    enable_ml_advanced: bool
    enable_multi_protocol: bool
    enable_cross_protocol_correlation: bool
    enable_predictive_analytics: bool
    enable_social_sentiment: bool
    enable_enterprise_features: bool

    # Limits
    max_monitored_protocols: int
    max_api_calls_per_day: int
    max_alerts_per_day: int
    max_historical_data_days: int

    # Support
    support_tier: str
    sla_guaranteed: bool
    priority_support: bool

    # Customization
    white_label_allowed: bool
    custom_branding: bool
    custom_domain: bool


def get_platform_config() -> PlatformConfig:
    """
    Get platform configuration based on environment

    Returns:
        PlatformConfig with appropriate feature flags
    """
    mode_str = os.getenv('DEPLOYMENT_MODE', 'open_source')
    mode = DeploymentMode(mode_str)

    # Configuration matrix
    configs = {
        DeploymentMode.OPEN_SOURCE: PlatformConfig(
            mode=mode,
            is_managed_hosting=False,
            is_multi_tenant=False,

            # Features (open source)
            enable_ml_advanced=False,  # Basic ML only
            enable_multi_protocol=False,  # Hyperliquid only
            enable_cross_protocol_correlation=False,
            enable_predictive_analytics=True,  # Open source gets ARIMA
            enable_social_sentiment=False,
            enable_enterprise_features=False,

            # Limits (generous for open source)
            max_monitored_protocols=1,  # Hyperliquid only
            max_api_calls_per_day=100000,  # High limit
            max_alerts_per_day=1000,
            max_historical_data_days=90,

            # Support
            support_tier='community',
            sla_guaranteed=False,
            priority_support=False,

            # Customization
            white_label_allowed=False,
            custom_branding=False,
            custom_domain=False
        ),

        DeploymentMode.CLOUD_BASIC: PlatformConfig(
            mode=mode,
            is_managed_hosting=True,
            is_multi_tenant=True,

            # Features (basic tier)
            enable_ml_advanced=False,
            enable_multi_protocol=True,  # Up to 5 protocols
            enable_cross_protocol_correlation=False,
            enable_predictive_analytics=True,
            enable_social_sentiment=False,
            enable_enterprise_features=False,

            # Limits
            max_monitored_protocols=5,
            max_api_calls_per_day=10000,
            max_alerts_per_day=100,
            max_historical_data_days=30,

            # Support
            support_tier='email',
            sla_guaranteed=False,
            priority_support=False,

            # Customization
            white_label_allowed=False,
            custom_branding=False,
            custom_domain=False
        ),

        DeploymentMode.CLOUD_PRO: PlatformConfig(
            mode=mode,
            is_managed_hosting=True,
            is_multi_tenant=True,

            # Features (pro tier)
            enable_ml_advanced=True,  # Ensemble models
            enable_multi_protocol=True,  # Up to 20 protocols
            enable_cross_protocol_correlation=True,
            enable_predictive_analytics=True,
            enable_social_sentiment=True,
            enable_enterprise_features=False,

            # Limits
            max_monitored_protocols=20,
            max_api_calls_per_day=100000,
            max_alerts_per_day=500,
            max_historical_data_days=180,

            # Support
            support_tier='priority',
            sla_guaranteed=False,
            priority_support=True,

            # Customization
            white_label_allowed=False,
            custom_branding=True,
            custom_domain=True
        ),

        DeploymentMode.CLOUD_ENTERPRISE: PlatformConfig(
            mode=mode,
            is_managed_hosting=True,
            is_multi_tenant=True,

            # Features (enterprise tier)
            enable_ml_advanced=True,
            enable_multi_protocol=True,  # Unlimited protocols
            enable_cross_protocol_correlation=True,
            enable_predictive_analytics=True,
            enable_social_sentiment=True,
            enable_enterprise_features=True,  # SSO, RBAC, audit logs

            # Limits (no limits)
            max_monitored_protocols=999,
            max_api_calls_per_day=1000000,
            max_alerts_per_day=10000,
            max_historical_data_days=365,

            # Support
            support_tier='dedicated',
            sla_guaranteed=True,
            priority_support=True,

            # Customization
            white_label_allowed=True,
            custom_branding=True,
            custom_domain=True
        )
    }

    return configs[mode]


# Global config instance
PLATFORM_CONFIG = get_platform_config()


def is_feature_enabled(feature: str) -> bool:
    """
    Check if a feature is enabled in current deployment mode

    Args:
        feature: Feature name (e.g., 'ml_advanced', 'multi_protocol')

    Returns:
        True if feature is enabled
    """
    feature_map = {
        'ml_advanced': PLATFORM_CONFIG.enable_ml_advanced,
        'multi_protocol': PLATFORM_CONFIG.enable_multi_protocol,
        'cross_protocol_correlation': PLATFORM_CONFIG.enable_cross_protocol_correlation,
        'predictive_analytics': PLATFORM_CONFIG.enable_predictive_analytics,
        'social_sentiment': PLATFORM_CONFIG.enable_social_sentiment,
        'enterprise': PLATFORM_CONFIG.enable_enterprise_features
    }

    return feature_map.get(feature, False)


def check_limit(limit_type: str, current_value: int) -> bool:
    """
    Check if current usage is within limits

    Args:
        limit_type: Type of limit ('protocols', 'api_calls', 'alerts')
        current_value: Current usage value

    Returns:
        True if within limits
    """
    limits = {
        'protocols': PLATFORM_CONFIG.max_monitored_protocols,
        'api_calls': PLATFORM_CONFIG.max_api_calls_per_day,
        'alerts': PLATFORM_CONFIG.max_alerts_per_day,
        'historical_days': PLATFORM_CONFIG.max_historical_data_days
    }

    max_limit = limits.get(limit_type, float('inf'))
    return current_value <= max_limit


# Feature flags for easy checking
IS_OPEN_SOURCE = PLATFORM_CONFIG.mode == DeploymentMode.OPEN_SOURCE
IS_MANAGED_HOSTING = PLATFORM_CONFIG.is_managed_hosting
IS_ENTERPRISE = PLATFORM_CONFIG.mode == DeploymentMode.CLOUD_ENTERPRISE
```

**Success Criteria:**
- [ ] Configuration layer created
- [ ] Feature flags defined for all tiers
- [ ] Limits enforced per tier
- [ ] Easy to check feature availability

---

#### Task 3.2: Create Multi-Tenant Database Layer

**Goal:** Extend open source database models with tenant isolation

**File:** `../kamiyo-platform/platform/multi_tenant.py`

```python
"""
Multi-tenant database layer for kamiyo.ai Platform
Extends open source models with tenant_id for data isolation
"""

from sqlalchemy import Column, String, Index
from sqlalchemy.ext.declarative import declared_attr
from typing import Optional
import contextvars

# Thread-local tenant context
current_tenant = contextvars.ContextVar('current_tenant', default=None)


class TenantMixin:
    """
    Mixin to add tenant_id to any model

    Usage:
        class YourModel(Base, TenantMixin):
            # Your model fields
            pass
    """

    @declared_attr
    def tenant_id(cls):
        """Tenant identifier for data isolation"""
        return Column(String(64), nullable=False, index=True)

    @declared_attr
    def __table_args__(cls):
        """Add composite index with tenant_id"""
        return (
            Index(f'idx_{cls.__tablename__}_tenant', 'tenant_id'),
        )


def set_current_tenant(tenant_id: str):
    """
    Set current tenant for this request context

    Args:
        tenant_id: Tenant identifier
    """
    current_tenant.set(tenant_id)


def get_current_tenant() -> Optional[str]:
    """
    Get current tenant from request context

    Returns:
        Tenant ID or None if not set
    """
    return current_tenant.get()


def get_tenant_from_api_key(api_key: str) -> Optional[str]:
    """
    Extract tenant ID from API key

    Args:
        api_key: API key from request

    Returns:
        Tenant ID or None
    """
    # API key format: tenant_id.key_hash
    # Example: abc123.def456789
    if '.' in api_key:
        tenant_id, _ = api_key.split('.', 1)
        return tenant_id
    return None


class TenantQueryMixin:
    """
    Mixin to automatically filter queries by tenant

    Usage:
        class YourModel(Base, TenantMixin, TenantQueryMixin):
            pass
    """

    @classmethod
    def query_for_tenant(cls, session, tenant_id: Optional[str] = None):
        """
        Get query filtered by tenant

        Args:
            session: SQLAlchemy session
            tenant_id: Explicit tenant ID (uses current if None)

        Returns:
            Filtered query
        """
        tenant = tenant_id or get_current_tenant()
        if tenant is None:
            raise ValueError("No tenant context set")

        return session.query(cls).filter(cls.tenant_id == tenant)


# Migration helper
def add_tenant_column_migration():
    """
    SQL migration to add tenant_id to existing tables

    Run this to migrate from open source single-tenant to multi-tenant
    """
    return """
    -- Add tenant_id column to all tables
    ALTER TABLE hlp_vault_snapshots ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE security_events ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE oracle_deviations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE liquidation_patterns ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE exploits ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE api_requests ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE alert_subscriptions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);

    -- Set default tenant for existing data (open source users)
    UPDATE hlp_vault_snapshots SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE security_events SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE oracle_deviations SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE liquidation_patterns SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE exploits SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE api_requests SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE audit_log SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE alert_subscriptions SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE alert_deliveries SET tenant_id = 'default' WHERE tenant_id IS NULL;

    -- Make tenant_id NOT NULL
    ALTER TABLE hlp_vault_snapshots ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE security_events ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE oracle_deviations ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE liquidation_patterns ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE exploits ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE api_requests ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE audit_log ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE alert_subscriptions ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE alert_deliveries ALTER COLUMN tenant_id SET NOT NULL;

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_hlp_vault_snapshots_tenant ON hlp_vault_snapshots(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_security_events_tenant ON security_events(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_oracle_deviations_tenant ON oracle_deviations(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_liquidation_patterns_tenant ON liquidation_patterns(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_exploits_tenant ON exploits(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_api_requests_tenant ON api_requests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_tenant ON alert_subscriptions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_alert_deliveries_tenant ON alert_deliveries(tenant_id);
    """


# Example usage in kamiyo.ai platform
class PlatformHLPVaultSnapshot:
    """
    Extended HLP vault snapshot for multi-tenant platform

    Extends open source HLPVaultSnapshot with tenant isolation
    """

    def __init__(self, open_source_snapshot, tenant_id: str):
        # Copy all fields from open source model
        self.__dict__.update(open_source_snapshot.__dict__)

        # Add tenant ID
        self.tenant_id = tenant_id

    def save(self, session):
        """Save with tenant isolation"""
        tenant = get_current_tenant()
        if tenant and self.tenant_id != tenant:
            raise ValueError(f"Tenant mismatch: {self.tenant_id} != {tenant}")

        session.add(self)
        session.commit()
```

**Success Criteria:**
- [ ] Multi-tenant mixin created
- [ ] Tenant context management implemented
- [ ] Migration SQL generated
- [ ] Query filtering automatic

---

---

## PHASE 2: PLATFORM INTEGRATION (Days 4-7)

### DAY 4: BILLING & SUBSCRIPTION SYSTEM

#### Task 4.1: Stripe Integration for Subscriptions

**Goal:** Implement Stripe for managing subscriptions and billing

**File:** `../kamiyo-platform/platform/billing.py`

```python
"""
Stripe billing integration for kamiyo.ai Platform
Manages subscriptions, usage tracking, and invoicing
"""

import os
import stripe
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from enum import Enum

# Initialize Stripe
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')


class SubscriptionTier(Enum):
    """Subscription tier mapping to Stripe price IDs"""
    OPEN_SOURCE = "open_source"  # No billing
    BASIC = "basic"  # $99/mo
    PRO = "pro"  # $299/mo
    ENTERPRISE = "enterprise"  # $2,499/mo


# Stripe Price IDs (set in Stripe Dashboard)
PRICE_IDS = {
    SubscriptionTier.BASIC: os.getenv('STRIPE_PRICE_ID_BASIC'),
    SubscriptionTier.PRO: os.getenv('STRIPE_PRICE_ID_PRO'),
    SubscriptionTier.ENTERPRISE: os.getenv('STRIPE_PRICE_ID_ENTERPRISE')
}


class BillingManager:
    """
    Manages Stripe subscriptions and billing for kamiyo.ai customers
    """

    def __init__(self):
        self.stripe = stripe

    def create_customer(
        self,
        email: str,
        name: str,
        tenant_id: str,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Create Stripe customer

        Args:
            email: Customer email
            name: Customer name
            tenant_id: Tenant identifier
            metadata: Additional metadata

        Returns:
            Stripe customer ID
        """
        customer = self.stripe.Customer.create(
            email=email,
            name=name,
            metadata={
                'tenant_id': tenant_id,
                **(metadata or {})
            }
        )
        return customer.id

    def create_subscription(
        self,
        customer_id: str,
        tier: SubscriptionTier,
        trial_days: int = 14
    ) -> Dict[str, Any]:
        """
        Create subscription for customer

        Args:
            customer_id: Stripe customer ID
            tier: Subscription tier
            trial_days: Free trial period (default 14 days)

        Returns:
            Subscription details
        """
        if tier == SubscriptionTier.OPEN_SOURCE:
            raise ValueError("Open source tier doesn't require subscription")

        price_id = PRICE_IDS[tier]
        if not price_id:
            raise ValueError(f"No Stripe price ID configured for {tier}")

        subscription = self.stripe.Subscription.create(
            customer=customer_id,
            items=[{'price': price_id}],
            trial_period_days=trial_days,
            payment_behavior='default_incomplete',
            expand=['latest_invoice.payment_intent']
        )

        return {
            'subscription_id': subscription.id,
            'status': subscription.status,
            'trial_end': datetime.fromtimestamp(subscription.trial_end, tz=timezone.utc) if subscription.trial_end else None,
            'current_period_end': datetime.fromtimestamp(subscription.current_period_end, tz=timezone.utc),
            'client_secret': subscription.latest_invoice.payment_intent.client_secret if subscription.latest_invoice else None
        }

    def upgrade_subscription(
        self,
        subscription_id: str,
        new_tier: SubscriptionTier
    ) -> Dict[str, Any]:
        """
        Upgrade (or downgrade) subscription tier

        Args:
            subscription_id: Stripe subscription ID
            new_tier: New subscription tier

        Returns:
            Updated subscription details
        """
        subscription = self.stripe.Subscription.retrieve(subscription_id)

        # Update subscription with new price
        new_price_id = PRICE_IDS[new_tier]
        updated_subscription = self.stripe.Subscription.modify(
            subscription_id,
            items=[{
                'id': subscription['items']['data'][0].id,
                'price': new_price_id
            }],
            proration_behavior='always_invoice'  # Pro-rate immediately
        )

        return {
            'subscription_id': updated_subscription.id,
            'status': updated_subscription.status,
            'current_tier': new_tier.value
        }

    def cancel_subscription(
        self,
        subscription_id: str,
        immediately: bool = False
    ) -> Dict[str, Any]:
        """
        Cancel subscription

        Args:
            subscription_id: Stripe subscription ID
            immediately: Cancel immediately vs at period end

        Returns:
            Cancellation details
        """
        if immediately:
            subscription = self.stripe.Subscription.delete(subscription_id)
        else:
            subscription = self.stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True
            )

        return {
            'subscription_id': subscription.id,
            'status': subscription.status,
            'canceled_at': datetime.fromtimestamp(subscription.canceled_at, tz=timezone.utc) if subscription.canceled_at else None,
            'ends_at': datetime.fromtimestamp(subscription.current_period_end, tz=timezone.utc)
        }

    def get_subscription_status(
        self,
        subscription_id: str
    ) -> Dict[str, Any]:
        """
        Get current subscription status

        Args:
            subscription_id: Stripe subscription ID

        Returns:
            Subscription status details
        """
        subscription = self.stripe.Subscription.retrieve(subscription_id)

        return {
            'subscription_id': subscription.id,
            'status': subscription.status,
            'current_period_start': datetime.fromtimestamp(subscription.current_period_start, tz=timezone.utc),
            'current_period_end': datetime.fromtimestamp(subscription.current_period_end, tz=timezone.utc),
            'cancel_at_period_end': subscription.cancel_at_period_end,
            'trial_end': datetime.fromtimestamp(subscription.trial_end, tz=timezone.utc) if subscription.trial_end else None
        }

    def handle_webhook(
        self,
        payload: bytes,
        sig_header: str
    ) -> Dict[str, Any]:
        """
        Handle Stripe webhook events

        Args:
            payload: Webhook payload
            sig_header: Stripe signature header

        Returns:
            Event details
        """
        webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')

        try:
            event = self.stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
        except ValueError as e:
            raise ValueError(f"Invalid payload: {e}")
        except stripe.error.SignatureVerificationError as e:
            raise ValueError(f"Invalid signature: {e}")

        # Handle different event types
        event_type = event['type']
        event_data = event['data']['object']

        handlers = {
            'customer.subscription.created': self._handle_subscription_created,
            'customer.subscription.updated': self._handle_subscription_updated,
            'customer.subscription.deleted': self._handle_subscription_deleted,
            'invoice.payment_succeeded': self._handle_payment_succeeded,
            'invoice.payment_failed': self._handle_payment_failed
        }

        handler = handlers.get(event_type)
        if handler:
            return handler(event_data)

        return {'status': 'unhandled', 'event_type': event_type}

    def _handle_subscription_created(self, subscription: Dict) -> Dict:
        """Handle subscription creation"""
        # Update database with subscription details
        # Send welcome email
        return {'status': 'subscription_created', 'subscription_id': subscription['id']}

    def _handle_subscription_updated(self, subscription: Dict) -> Dict:
        """Handle subscription updates"""
        # Update database
        # Notify user of changes
        return {'status': 'subscription_updated', 'subscription_id': subscription['id']}

    def _handle_subscription_deleted(self, subscription: Dict) -> Dict:
        """Handle subscription cancellation"""
        # Update database
        # Send cancellation email
        # Archive tenant data
        return {'status': 'subscription_deleted', 'subscription_id': subscription['id']}

    def _handle_payment_succeeded(self, invoice: Dict) -> Dict:
        """Handle successful payment"""
        # Send invoice email
        # Update payment records
        return {'status': 'payment_succeeded', 'invoice_id': invoice['id']}

    def _handle_payment_failed(self, invoice: Dict) -> Dict:
        """Handle failed payment"""
        # Send payment failure email
        # Mark account as past due
        # Suspend services after grace period
        return {'status': 'payment_failed', 'invoice_id': invoice['id']}

    def track_usage(
        self,
        subscription_id: str,
        metric: str,
        quantity: int,
        timestamp: Optional[datetime] = None
    ):
        """
        Track usage-based metrics

        Args:
            subscription_id: Stripe subscription ID
            metric: Metric name (api_calls, monitored_protocols, etc.)
            quantity: Usage quantity
            timestamp: Usage timestamp (defaults to now)
        """
        # For usage-based billing (future enhancement)
        # This would integrate with Stripe's usage records API
        pass


# Global billing manager instance
billing_manager = BillingManager()
```

**Success Criteria:**
- [ ] Stripe integration complete
- [ ] Subscription creation/upgrade/cancel working
- [ ] Webhook handling implemented
- [ ] Usage tracking prepared

---

#### Task 4.2: Create Billing API Endpoints

**File:** `../kamiyo-platform/api/billing.py`

```python
"""
Billing API endpoints for kamiyo.ai Platform
"""

from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, EmailStr
from typing import Optional
from platform.billing import billing_manager, SubscriptionTier
from platform.multi_tenant import get_current_tenant, set_current_tenant

router = APIRouter(prefix="/api/v1/billing", tags=["Billing"])


class CreateSubscriptionRequest(BaseModel):
    email: EmailStr
    name: str
    tier: str  # 'basic', 'pro', or 'enterprise'
    trial_days: int = 14


class UpgradeSubscriptionRequest(BaseModel):
    new_tier: str


@router.post("/subscribe")
async def create_subscription(
    request: CreateSubscriptionRequest,
    tenant_id: str = Header(...)
):
    """
    Create new subscription

    Starts 14-day free trial
    """
    try:
        # Validate tier
        tier = SubscriptionTier(request.tier)

        # Create Stripe customer
        customer_id = billing_manager.create_customer(
            email=request.email,
            name=request.name,
            tenant_id=tenant_id
        )

        # Create subscription
        subscription = billing_manager.create_subscription(
            customer_id=customer_id,
            tier=tier,
            trial_days=request.trial_days
        )

        return {
            "status": "success",
            "customer_id": customer_id,
            "subscription": subscription,
            "message": f"Subscription created with {request.trial_days}-day free trial"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upgrade")
async def upgrade_subscription(
    request: UpgradeSubscriptionRequest,
    subscription_id: str = Header(...),
    tenant_id: str = Header(...)
):
    """
    Upgrade subscription tier

    Pro-rates billing immediately
    """
    try:
        new_tier = SubscriptionTier(request.new_tier)

        result = billing_manager.upgrade_subscription(
            subscription_id=subscription_id,
            new_tier=new_tier
        )

        return {
            "status": "success",
            "subscription": result,
            "message": f"Upgraded to {new_tier.value} tier"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cancel")
async def cancel_subscription(
    subscription_id: str = Header(...),
    immediately: bool = False
):
    """
    Cancel subscription

    By default, cancels at end of billing period
    Set immediately=true to cancel now
    """
    try:
        result = billing_manager.cancel_subscription(
            subscription_id=subscription_id,
            immediately=immediately
        )

        return {
            "status": "success",
            "cancellation": result,
            "message": "Subscription canceled"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
async def get_subscription_status(
    subscription_id: str = Header(...)
):
    """
    Get current subscription status
    """
    try:
        status = billing_manager.get_subscription_status(subscription_id)

        return {
            "status": "success",
            "subscription": status
        }

    except Exception as e:
        raise HTTPException(status_code=404, detail="Subscription not found")


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature")
):
    """
    Handle Stripe webhooks

    Processes subscription events, payments, etc.
    """
    try:
        payload = await request.body()

        result = billing_manager.handle_webhook(
            payload=payload,
            sig_header=stripe_signature
        )

        return {"status": "success", "result": result}

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Webhook processing failed")
```

**Success Criteria:**
- [ ] Billing API endpoints created
- [ ] Subscription management functional
- [ ] Stripe webhook endpoint working
- [ ] Error handling comprehensive

---

### DAY 5: MULTI-PROTOCOL AGGREGATOR REGISTRY

#### Task 5.1: Create Aggregator Registry System

**Goal:** System to register and manage 20+ protocol aggregators

**File:** `../kamiyo-platform/aggregators/registry.py`

```python
"""
Aggregator Registry for kamiyo.ai Platform
Manages multiple protocol aggregators with dynamic loading
"""

from typing import Dict, List, Any, Optional, Type
from aggregators.base import BaseAggregator
from platform.config import is_feature_enabled, check_limit
import importlib
import logging

logger = logging.getLogger(__name__)


class AggregatorRegistry:
    """
    Central registry for all protocol aggregators

    Dynamically loads and manages aggregators based on:
    - Subscription tier
    - Protocol enablement
    - Resource limits
    """

    def __init__(self):
        self._aggregators: Dict[str, BaseAggregator] = {}
        self._available_protocols: Dict[str, Dict[str, Any]] = {}
        self._load_protocol_definitions()

    def _load_protocol_definitions(self):
        """
        Load available protocol definitions

        Each protocol has:
        - name: Protocol name
        - aggregator_class: Python class path
        - tier_required: Minimum tier needed
        - category: DEX/Lending/Bridge/etc.
        """
        self._available_protocols = {
            # DEX Aggregators
            'hyperliquid': {
                'name': 'Hyperliquid',
                'class_path': 'kamiyo_hyperliquid.aggregators.hyperliquid_api.HyperliquidAPIAggregator',
                'tier_required': 'open_source',
                'category': 'dex',
                'chains': ['hyperliquid']
            },
            'gmx': {
                'name': 'GMX',
                'class_path': 'aggregators.gmx_aggregator.GMXAggregator',
                'tier_required': 'basic',
                'category': 'dex',
                'chains': ['arbitrum', 'avalanche']
            },
            'dydx': {
                'name': 'dYdX',
                'class_path': 'aggregators.dydx_aggregator.DYDXAggregator',
                'tier_required': 'basic',
                'category': 'dex',
                'chains': ['dydx']
            },
            'vertex': {
                'name': 'Vertex',
                'class_path': 'aggregators.vertex_aggregator.VertexAggregator',
                'tier_required': 'basic',
                'category': 'dex',
                'chains': ['arbitrum']
            },
            'aevo': {
                'name': 'Aevo',
                'class_path': 'aggregators.aevo_aggregator.AevoAggregator',
                'tier_required': 'pro',
                'category': 'dex',
                'chains': ['aevo']
            },

            # Lending Protocols
            'aave': {
                'name': 'Aave',
                'class_path': 'aggregators.aave_aggregator.AaveAggregator',
                'tier_required': 'pro',
                'category': 'lending',
                'chains': ['ethereum', 'polygon', 'arbitrum', 'optimism']
            },
            'compound': {
                'name': 'Compound',
                'class_path': 'aggregators.compound_aggregator.CompoundAggregator',
                'tier_required': 'pro',
                'category': 'lending',
                'chains': ['ethereum']
            },

            # Add 15+ more protocols...
        }

    def register_aggregator(
        self,
        protocol: str,
        aggregator: BaseAggregator
    ):
        """
        Register an aggregator instance

        Args:
            protocol: Protocol identifier
            aggregator: Aggregator instance
        """
        self._aggregators[protocol] = aggregator
        logger.info(f"Registered aggregator: {protocol}")

    def load_aggregator(self, protocol: str) -> Optional[BaseAggregator]:
        """
        Dynamically load aggregator for protocol

        Args:
            protocol: Protocol identifier

        Returns:
            Aggregator instance or None
        """
        # Check if already loaded
        if protocol in self._aggregators:
            return self._aggregators[protocol]

        # Get protocol definition
        protocol_def = self._available_protocols.get(protocol)
        if not protocol_def:
            logger.error(f"Unknown protocol: {protocol}")
            return None

        # Check tier requirement
        # (This would check against user's subscription tier)

        try:
            # Import aggregator class
            module_path, class_name = protocol_def['class_path'].rsplit('.', 1)
            module = importlib.import_module(module_path)
            aggregator_class = getattr(module, class_name)

            # Instantiate aggregator
            aggregator = aggregator_class()

            # Register
            self.register_aggregator(protocol, aggregator)

            return aggregator

        except Exception as e:
            logger.error(f"Failed to load aggregator for {protocol}: {e}")
            return None

    def get_available_protocols(
        self,
        tier: str = 'open_source',
        category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get list of available protocols for tier

        Args:
            tier: Subscription tier
            category: Filter by category (dex, lending, etc.)

        Returns:
            List of available protocols
        """
        tier_hierarchy = {
            'open_source': 0,
            'basic': 1,
            'pro': 2,
            'enterprise': 3
        }

        user_tier_level = tier_hierarchy.get(tier, 0)

        available = []
        for protocol, definition in self._available_protocols.items():
            required_tier_level = tier_hierarchy.get(definition['tier_required'], 999)

            # Check tier access
            if user_tier_level < required_tier_level:
                continue

            # Check category filter
            if category and definition['category'] != category:
                continue

            available.append({
                'protocol': protocol,
                'name': definition['name'],
                'category': definition['category'],
                'chains': definition['chains']
            })

        return available

    async def fetch_all_exploits(
        self,
        enabled_protocols: List[str]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Fetch exploits from multiple protocols concurrently

        Args:
            enabled_protocols: List of protocol IDs to fetch from

        Returns:
            Dict mapping protocol -> list of exploits
        """
        import asyncio

        results = {}

        # Load aggregators
        aggregators = []
        for protocol in enabled_protocols:
            agg = self.load_aggregator(protocol)
            if agg:
                aggregators.append((protocol, agg))

        # Fetch concurrently
        async def fetch_one(protocol, aggregator):
            try:
                exploits = await aggregator.fetch_exploits()
                return protocol, exploits
            except Exception as e:
                logger.error(f"Error fetching from {protocol}: {e}")
                return protocol, []

        tasks = [fetch_one(p, a) for p, a in aggregators]
        protocol_results = await asyncio.gather(*tasks)

        for protocol, exploits in protocol_results:
            results[protocol] = exploits

        return results


# Global registry instance
aggregator_registry = AggregatorRegistry()
```

**Success Criteria:**
- [ ] Registry system created
- [ ] Dynamic aggregator loading working
- [ ] Tier-based access control implemented
- [ ] Concurrent fetching functional

---

### DAY 6: ADVANCED ML MODELS (PROPRIETARY)

#### Task 6.1: Create Ensemble Anomaly Detector

**Goal:** Proprietary advanced ML model for Pro/Enterprise tiers

**File:** `../kamiyo-platform/ml_models_advanced/ensemble_detector.py`

```python
"""
Ensemble Anomaly Detector - Proprietary kamiyo.ai model
Combines multiple ML algorithms for superior detection accuracy

This is a PROPRIETARY component not included in open source
"""

from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.svm import OneClassSVM
from sklearn.preprocessing import StandardScaler
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple
import logging

logger = logging.getLogger(__name__)


class EnsembleAnomalyDetector:
    """
    Advanced ensemble model combining multiple detectors

    Architecture:
    1. Isolation Forest (unsupervised)
    2. One-Class SVM (unsupervised)
    3. Random Forest (semi-supervised with historical labels)
    4. LSTM (time series, for Pro+ tiers)

    Uses weighted voting for final decision
    """

    def __init__(
        self,
        contamination: float = 0.05,
        ensemble_weights: Optional[List[float]] = None
    ):
        """
        Initialize ensemble detector

        Args:
            contamination: Expected anomaly proportion
            ensemble_weights: Weights for each model [IF, SVM, RF]
        """
        self.contamination = contamination
        self.weights = ensemble_weights or [0.4, 0.3, 0.3]

        # Individual models
        self.isolation_forest = IsolationForest(
            contamination=contamination,
            n_estimators=200,
            random_state=42
        )

        self.one_class_svm = OneClassSVM(
            nu=contamination,
            kernel='rbf',
            gamma='auto'
        )

        self.random_forest = RandomForestClassifier(
            n_estimators=100,
            random_state=42
        )

        self.scaler = StandardScaler()
        self.is_fitted = False

    def fit(
        self,
        X: pd.DataFrame,
        y: Optional[np.ndarray] = None
    ):
        """
        Train ensemble on historical data

        Args:
            X: Feature DataFrame
            y: Optional labels for semi-supervised learning
        """
        X_scaled = self.scaler.fit_transform(X)

        # Train unsupervised models
        self.isolation_forest.fit(X_scaled)
        self.one_class_svm.fit(X_scaled)

        # Train supervised model if labels provided
        if y is not None:
            self.random_forest.fit(X_scaled, y)

        self.is_fitted = True
        logger.info("Ensemble detector trained successfully")

    def predict_ensemble(
        self,
        X: pd.DataFrame
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, np.ndarray]]:
        """
        Predict using ensemble voting

        Args:
            X: Feature DataFrame

        Returns:
            Tuple of (predictions, confidence_scores, individual_predictions)
        """
        if not self.is_fitted:
            raise ValueError("Model must be fitted first")

        X_scaled = self.scaler.transform(X)

        # Get predictions from each model
        if_pred = self.isolation_forest.predict(X_scaled)  # -1 or 1
        svm_pred = self.one_class_svm.predict(X_scaled)  # -1 or 1

        # RF predicts 0/1, convert to -1/1
        if hasattr(self.random_forest, 'predict'):
            rf_pred_prob = self.random_forest.predict_proba(X_scaled)[:, 1]
            rf_pred = np.where(rf_pred_prob > 0.5, 1, -1)
        else:
            rf_pred = np.ones(len(X))  # Fallback if not trained

        # Weighted ensemble voting
        weighted_sum = (
            self.weights[0] * if_pred +
            self.weights[1] * svm_pred +
            self.weights[2] * rf_pred
        )

        # Final prediction
        ensemble_pred = np.where(weighted_sum > 0, 1, -1)

        # Confidence score (0-1)
        confidence = np.abs(weighted_sum) / sum(self.weights)

        individual_preds = {
            'isolation_forest': if_pred,
            'one_class_svm': svm_pred,
            'random_forest': rf_pred
        }

        return ensemble_pred, confidence, individual_preds

    def detect_anomalies_advanced(
        self,
        X: pd.DataFrame
    ) -> List[Dict[str, Any]]:
        """
        Detect anomalies with detailed analysis

        Returns:
            List of anomaly dictionaries with confidence and explanation
        """
        predictions, confidence, individual = self.predict_ensemble(X)

        anomalies = []
        for idx, (pred, conf) in enumerate(zip(predictions, confidence)):
            if pred == -1:  # Anomaly
                # Determine which models agreed
                agreement = {
                    'isolation_forest': individual['isolation_forest'][idx] == -1,
                    'one_class_svm': individual['one_class_svm'][idx] == -1,
                    'random_forest': individual['random_forest'][idx] == -1
                }

                # Calculate severity based on confidence and agreement
                num_agreeing = sum(agreement.values())
                severity = self._calculate_severity_advanced(conf, num_agreeing)

                anomaly = {
                    'index': idx,
                    'confidence': float(conf),
                    'severity': severity,
                    'model_agreement': agreement,
                    'num_models_agreeing': num_agreeing,
                    'features': X.iloc[idx].to_dict(),
                    'detection_method': 'ensemble_ml'
                }
                anomalies.append(anomaly)

        return anomalies

    def _calculate_severity_advanced(
        self,
        confidence: float,
        num_agreeing: int
    ) -> str:
        """
        Advanced severity calculation

        Args:
            confidence: Confidence score (0-1)
            num_agreeing: Number of models that detected anomaly

        Returns:
            Severity level
        """
        # High confidence + all models agree = critical
        if confidence > 0.8 and num_agreeing == 3:
            return 'critical'
        elif confidence > 0.6 and num_agreeing >= 2:
            return 'high'
        elif confidence > 0.4:
            return 'medium'
        else:
            return 'low'


# Global instance (loaded for Pro/Enterprise tiers only)
ensemble_detector = None

def get_ensemble_detector() -> Optional[EnsembleAnomalyDetector]:
    """Get ensemble detector if available for tier"""
    from platform.config import is_feature_enabled

    if not is_feature_enabled('ml_advanced'):
        return None

    global ensemble_detector
    if ensemble_detector is None:
        ensemble_detector = EnsembleAnomalyDetector()

    return ensemble_detector
```

**Success Criteria:**
- [ ] Ensemble detector implemented
- [ ] Multiple ML models combined
- [ ] Weighted voting system working
- [ ] Tier-gated (Pro/Enterprise only)

---

### DAY 7: CROSS-PROTOCOL CORRELATION

#### Task 7.1: Implement Cross-Protocol Attack Detection

**Goal:** Detect coordinated attacks across multiple protocols

**File:** `../kamiyo-platform/ml_models_advanced/cross_protocol_correlator.py`

```python
"""
Cross-Protocol Correlation Engine - Proprietary kamiyo.ai feature
Detects coordinated attacks spanning multiple protocols

Examples:
- Flash loan attack on Aave -> exploit on GMX
- Oracle manipulation on one DEX -> cascade liquidations on others
- Bridge exploit -> multi-chain attack
"""

from typing import List, Dict, Any, Set, Optional
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class CrossProtocolCorrelator:
    """
    Analyzes events across protocols to detect coordinated attacks
    """

    def __init__(
        self,
        correlation_window_seconds: int = 300,  # 5 minutes
        min_protocols_involved: int = 2
    ):
        """
        Initialize correlator

        Args:
            correlation_window_seconds: Time window for correlation
            min_protocols_involved: Minimum protocols for correlation
        """
        self.correlation_window = timedelta(seconds=correlation_window_seconds)
        self.min_protocols = min_protocols_involved

        # Event buffer for correlation
        self.event_buffer: List[Dict[str, Any]] = []
        self.max_buffer_size = 10000

    def add_event(
        self,
        event: Dict[str, Any],
        protocol: str
    ):
        """
        Add event to correlation buffer

        Args:
            event: Security event
            protocol: Protocol identifier
        """
        enriched_event = {
            **event,
            'protocol': protocol,
            'added_at': datetime.now(timezone.utc)
        }

        self.event_buffer.append(enriched_event)

        # Cleanup old events
        self._cleanup_buffer()

    def detect_correlations(self) -> List[Dict[str, Any]]:
        """
        Detect correlated events across protocols

        Returns:
            List of correlation groups
        """
        if len(self.event_buffer) < self.min_protocols:
            return []

        correlations = []

        # Group events by time windows
        windows = self._create_time_windows()

        for window_start, window_events in windows.items():
            # Check if multiple protocols involved
            protocols_in_window = set(e['protocol'] for e in window_events)

            if len(protocols_in_window) >= self.min_protocols:
                # Analyze correlation
                correlation = self._analyze_correlation(window_events)

                if correlation:
                    correlations.append({
                        'window_start': window_start,
                        'protocols_involved': list(protocols_in_window),
                        'num_events': len(window_events),
                        'correlation_score': correlation['score'],
                        'attack_pattern': correlation['pattern'],
                        'severity': correlation['severity'],
                        'events': window_events
                    })

        return correlations

    def _create_time_windows(self) -> Dict[datetime, List[Dict]]:
        """
        Group events into time windows

        Returns:
            Dict mapping window_start -> events
        """
        windows = defaultdict(list)

        for event in self.event_buffer:
            timestamp = event.get('timestamp', event['added_at'])

            # Round down to window start
            window_start = timestamp.replace(
                second=(timestamp.second // 60) * 60,
                microsecond=0
            )

            windows[window_start].append(event)

        return windows

    def _analyze_correlation(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Analyze if events are truly correlated

        Args:
            events: Events in time window

        Returns:
            Correlation analysis or None
        """
        # Check for known attack patterns
        patterns = [
            self._detect_flash_loan_cascade(events),
            self._detect_oracle_arbitrage(events),
            self._detect_bridge_exploit_chain(events),
            self._detect_liquidation_cascade(events)
        ]

        # Return first detected pattern
        for pattern in patterns:
            if pattern:
                return pattern

        return None

    def _detect_flash_loan_cascade(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Detect flash loan -> exploit cascade

        Pattern:
        1. Large flash loan (Aave/dYdX)
        2. Oracle manipulation (any DEX)
        3. Exploit/liquidation (target protocol)
        """
        has_flash_loan = any(
            'flash_loan' in e.get('threat_type', '') for e in events
        )

        has_oracle_deviation = any(
            'oracle' in e.get('threat_type', '') for e in events
        )

        has_exploit = any(
            e.get('threat_type') in ['exploit', 'liquidation_cascade'] for e in events
        )

        if has_flash_loan and has_oracle_deviation and has_exploit:
            return {
                'pattern': 'flash_loan_cascade',
                'score': 0.95,
                'severity': 'critical',
                'description': 'Flash loan attack with oracle manipulation detected'
            }

        return None

    def _detect_oracle_arbitrage(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Detect cross-DEX oracle arbitrage attack
        """
        oracle_events = [e for e in events if 'oracle' in e.get('threat_type', '')]

        if len(oracle_events) >= 2:
            # Check if same asset across protocols
            assets = set(e.get('indicators', {}).get('asset') for e in oracle_events)

            if len(assets) == 1:  # Same asset, multiple protocols
                return {
                    'pattern': 'oracle_arbitrage',
                    'score': 0.85,
                    'severity': 'high',
                    'description': f'Oracle arbitrage detected for {assets.pop()}'
                }

        return None

    def _detect_bridge_exploit_chain(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Detect bridge exploit followed by multi-chain attacks
        """
        # Look for bridge-related events followed by exploits
        # Implementation would check for bridge protocols and cross-chain activity
        return None

    def _detect_liquidation_cascade(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Detect cascading liquidations across protocols
        """
        liquidation_events = [e for e in events if 'liquidation' in e.get('threat_type', '')]

        if len(liquidation_events) >= 3:
            total_value = sum(
                e.get('indicators', {}).get('total_liquidated_usd', 0)
                for e in liquidation_events
            )

            if total_value > 1000000:  # $1M+
                return {
                    'pattern': 'liquidation_cascade',
                    'score': 0.80,
                    'severity': 'high',
                    'description': f'Cascade liquidations detected: ${total_value:,.0f}'
                }

        return None

    def _cleanup_buffer(self):
        """Remove events older than correlation window"""
        cutoff = datetime.now(timezone.utc) - self.correlation_window * 2

        self.event_buffer = [
            e for e in self.event_buffer
            if e['added_at'] > cutoff
        ]

        # Enforce max buffer size
        if len(self.event_buffer) > self.max_buffer_size:
            self.event_buffer = self.event_buffer[-self.max_buffer_size:]


# Global correlator instance (Pro/Enterprise only)
cross_protocol_correlator = CrossProtocolCorrelator()
```

**Success Criteria:**
- [ ] Cross-protocol correlator implemented
- [ ] Multiple attack patterns detected
- [ ] Time-window correlation working
- [ ] Buffer management efficient

---

## PHASE 3: DEPLOYMENT & GO-TO-MARKET (Days 8-14)

### DAY 8-9: LANDING PAGE & MARKETING SITE

#### Task 8.1: Create Landing Page

**Goal:** Professional landing page for kamiyo.ai

**File:** `../kamiyo-platform/frontend/landing/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>kamiyo.ai - DeFi Security Monitoring Platform</title>
    <meta name="description" content="Real-time exploit detection across 20+ DeFi protocols. Detect threats 100x faster with AI-powered security monitoring.">

    <!-- Open Graph -->
    <meta property="og:title" content="kamiyo.ai - DeFi Security Monitoring">
    <meta property="og:description" content="Detect exploits 100x faster across Hyperliquid, GMX, dYdX, and 17+ protocols">
    <meta property="og:image" content="https://kamiyo.ai/og-image.png">

    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>

    <!-- Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
</head>
<body class="bg-gray-50">

<!-- Hero Section -->
<section class="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
    <nav class="container mx-auto px-6 py-4">
        <div class="flex justify-between items-center">
            <div class="text-2xl font-bold">kamiyo.ai</div>
            <div class="space-x-6">
                <a href="#features" class="hover:underline">Features</a>
                <a href="#pricing" class="hover:underline">Pricing</a>
                <a href="https://docs.kamiyo.ai" class="hover:underline">Docs</a>
                <a href="/login" class="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold">Sign In</a>
            </div>
        </div>
    </nav>

    <div class="container mx-auto px-6 py-20 text-center">
        <h1 class="text-5xl font-bold mb-6">
            Detect DeFi Exploits<br/>100x Faster
        </h1>
        <p class="text-xl mb-8 max-w-2xl mx-auto">
            Real-time security monitoring across 20+ protocols.<br/>
            Caught the $4M Hyperliquid incident in under 5 minutes.
        </p>
        <div class="space-x-4">
            <a href="/signup" class="bg-white text-blue-600 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100">
                Start Free Trial
            </a>
            <a href="https://github.com/kamiyo-ai/kamiyo-hyperliquid" class="border-2 border-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white hover:text-blue-600">
                View on GitHub
            </a>
        </div>
        <p class="mt-4 text-sm opacity-80">14-day free trial • No credit card required</p>
    </div>
</section>

<!-- Stats Section -->
<section class="py-12 bg-white">
    <div class="container mx-auto px-6">
        <div class="grid md:grid-cols-4 gap-8 text-center">
            <div>
                <div class="text-4xl font-bold text-blue-600">20+</div>
                <div class="text-gray-600 mt-2">Protocols Monitored</div>
            </div>
            <div>
                <div class="text-4xl font-bold text-blue-600">$4M</div>
                <div class="text-gray-600 mt-2">Incident Detected</div>
            </div>
            <div>
                <div class="text-4xl font-bold text-blue-600">&lt;5min</div>
                <div class="text-gray-600 mt-2">Detection Time</div>
            </div>
            <div>
                <div class="text-4xl font-bold text-blue-600">85%</div>
                <div class="text-gray-600 mt-2">Prediction Accuracy</div>
            </div>
        </div>
    </div>
</section>

<!-- Features Section -->
<section id="features" class="py-20 bg-gray-50">
    <div class="container mx-auto px-6">
        <h2 class="text-4xl font-bold text-center mb-12">Comprehensive Security Monitoring</h2>

        <div class="grid md:grid-cols-3 gap-8">
            <!-- Feature 1 -->
            <div class="bg-white p-8 rounded-xl shadow-sm">
                <div class="text-4xl mb-4"></div>
                <h3 class="text-xl font-bold mb-3">AI-Powered Detection</h3>
                <p class="text-gray-600">
                    Ensemble ML models detect anomalies other systems miss. 85% accuracy on 24h predictions.
                </p>
            </div>

            <!-- Feature 2 -->
            <div class="bg-white p-8 rounded-xl shadow-sm">
                <div class="text-4xl mb-4"></div>
                <h3 class="text-xl font-bold mb-3">Real-Time Alerts</h3>
                <p class="text-gray-600">
                    Instant notifications via Discord, Telegram, Slack, or email when threats are detected.
                </p>
            </div>

            <!-- Feature 3 -->
            <div class="bg-white p-8 rounded-xl shadow-sm">
                <div class="text-4xl mb-4"></div>
                <h3 class="text-xl font-bold mb-3">Multi-Protocol</h3>
                <p class="text-gray-600">
                    Monitor Hyperliquid, GMX, dYdX, Aave, Compound, and 15+ protocols from one dashboard.
                </p>
            </div>

            <!-- Feature 4 -->
            <div class="bg-white p-8 rounded-xl shadow-sm">
                <div class="text-4xl mb-4"></div>
                <h3 class="text-xl font-bold mb-3">Cross-Protocol Correlation</h3>
                <p class="text-gray-600">
                    Detect coordinated attacks spanning multiple protocols. Flash loans, oracle manipulation, cascades.
                </p>
            </div>

            <!-- Feature 5 -->
            <div class="bg-white p-8 rounded-xl shadow-sm">
                <div class="text-4xl mb-4"></div>
                <h3 class="text-xl font-bold mb-3">Predictive Analytics</h3>
                <p class="text-gray-600">
                    24-hour ahead risk forecasting. Know threats before they happen.
                </p>
            </div>

            <!-- Feature 6 -->
            <div class="bg-white p-8 rounded-xl shadow-sm">
                <div class="text-4xl mb-4"></div>
                <h3 class="text-xl font-bold mb-3">Open Source Core</h3>
                <p class="text-gray-600">
                    Built on open source Hyperliquid monitor. Self-host or use our managed cloud.
                </p>
            </div>
        </div>
    </div>
</section>

<!-- Pricing Section -->
<section id="pricing" class="py-20 bg-white">
    <div class="container mx-auto px-6">
        <h2 class="text-4xl font-bold text-center mb-12">Simple, Transparent Pricing</h2>

        <div class="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <!-- Open Source -->
            <div class="border-2 border-gray-200 rounded-xl p-6">
                <h3 class="text-xl font-bold mb-2">Open Source</h3>
                <div class="text-3xl font-bold mb-4">$0<span class="text-sm text-gray-500">/mo</span></div>
                <ul class="space-y-3 mb-6 text-sm">
                    <li> Self-hosted</li>
                    <li> Hyperliquid monitoring</li>
                    <li> Basic ML models</li>
                    <li> Community support</li>
                    <li> Free for &lt;$1M revenue</li>
                </ul>
                <a href="https://github.com/kamiyo-ai/kamiyo-hyperliquid" class="block text-center border-2 border-gray-300 px-4 py-2 rounded-lg font-semibold hover:bg-gray-50">
                    View on GitHub
                </a>
            </div>

            <!-- Basic -->
            <div class="border-2 border-blue-500 rounded-xl p-6 relative">
                <div class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                    POPULAR
                </div>
                <h3 class="text-xl font-bold mb-2">Basic</h3>
                <div class="text-3xl font-bold mb-4">$99<span class="text-sm text-gray-500">/mo</span></div>
                <ul class="space-y-3 mb-6 text-sm">
                    <li> Managed hosting</li>
                    <li> 5 protocols</li>
                    <li> Real-time alerts</li>
                    <li> Email support</li>
                    <li> 14-day free trial</li>
                </ul>
                <a href="/signup?tier=basic" class="block text-center bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-600">
                    Start Free Trial
                </a>
            </div>

            <!-- Pro -->
            <div class="border-2 border-purple-500 rounded-xl p-6">
                <h3 class="text-xl font-bold mb-2">Pro</h3>
                <div class="text-3xl font-bold mb-4">$299<span class="text-sm text-gray-500">/mo</span></div>
                <ul class="space-y-3 mb-6 text-sm">
                    <li> Everything in Basic</li>
                    <li> 20 protocols</li>
                    <li> Advanced ML models</li>
                    <li> Cross-protocol correlation</li>
                    <li> Priority support</li>
                </ul>
                <a href="/signup?tier=pro" class="block text-center bg-purple-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-purple-600">
                    Start Free Trial
                </a>
            </div>

            <!-- Enterprise -->
            <div class="border-2 border-gray-300 rounded-xl p-6">
                <h3 class="text-xl font-bold mb-2">Enterprise</h3>
                <div class="text-3xl font-bold mb-4">$2,499<span class="text-sm text-gray-500">/mo</span></div>
                <ul class="space-y-3 mb-6 text-sm">
                    <li> Everything in Pro</li>
                    <li> Unlimited protocols</li>
                    <li> White-label</li>
                    <li> 99.9% SLA</li>
                    <li> Dedicated support</li>
                </ul>
                <a href="/contact-sales" class="block text-center border-2 border-gray-800 px-4 py-2 rounded-lg font-semibold hover:bg-gray-800 hover:text-white">
                    Contact Sales
                </a>
            </div>
        </div>
    </div>
</section>

<!-- Social Proof -->
<section class="py-20 bg-gray-50">
    <div class="container mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold mb-12">Trusted by DeFi Leaders</h2>
        <!-- Add logos of protocols/companies using kamiyo.ai -->
        <div class="flex justify-center items-center space-x-12 opacity-50">
            <!-- Protocol logos -->
        </div>
    </div>
</section>

<!-- CTA Section -->
<section class="py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
    <div class="container mx-auto px-6 text-center">
        <h2 class="text-4xl font-bold mb-6">Start Monitoring in 5 Minutes</h2>
        <p class="text-xl mb-8 max-w-2xl mx-auto">
            Join protocols protecting over $1B in TVL. 14-day free trial, no credit card required.
        </p>
        <a href="/signup" class="bg-white text-blue-600 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 inline-block">
            Start Free Trial 
        </a>
    </div>
</section>

<!-- Footer -->
<footer class="bg-gray-900 text-white py-12">
    <div class="container mx-auto px-6">
        <div class="grid md:grid-cols-4 gap-8">
            <div>
                <div class="font-bold text-xl mb-4">kamiyo.ai</div>
                <p class="text-gray-400 text-sm">Real-time DeFi security monitoring powered by AI.</p>
            </div>
            <div>
                <div class="font-bold mb-4">Product</div>
                <ul class="space-y-2 text-gray-400 text-sm">
                    <li><a href="#features" class="hover:text-white">Features</a></li>
                    <li><a href="#pricing" class="hover:text-white">Pricing</a></li>
                    <li><a href="https://docs.kamiyo.ai" class="hover:text-white">Documentation</a></li>
                    <li><a href="/changelog" class="hover:text-white">Changelog</a></li>
                </ul>
            </div>
            <div>
                <div class="font-bold mb-4">Company</div>
                <ul class="space-y-2 text-gray-400 text-sm">
                    <li><a href="/about" class="hover:text-white">About</a></li>
                    <li><a href="/blog" class="hover:text-white">Blog</a></li>
                    <li><a href="/contact" class="hover:text-white">Contact</a></li>
                    <li><a href="/careers" class="hover:text-white">Careers</a></li>
                </ul>
            </div>
            <div>
                <div class="font-bold mb-4">Community</div>
                <ul class="space-y-2 text-gray-400 text-sm">
                    <li><a href="https://github.com/kamiyo-ai" class="hover:text-white">GitHub</a></li>
                    <li><a href="https://discord.gg/kamiyo" class="hover:text-white">Discord</a></li>
                    <li><a href="https://twitter.com/kamiyo_ai" class="hover:text-white">Twitter</a></li>
                    <li><a href="/status" class="hover:text-white">Status</a></li>
                </ul>
            </div>
        </div>
        <div class="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
            © 2025 kamiyo.ai Inc. All rights reserved. • <a href="/privacy" class="hover:text-white">Privacy</a> • <a href="/terms" class="hover:text-white">Terms</a>
        </div>
    </div>
</footer>

</body>
</html>
```

**Success Criteria:**
- [ ] Landing page created
- [ ] Clear value proposition
- [ ] Pricing tiers displayed
- [ ] CTA buttons prominent
- [ ] Mobile responsive

---

### DAY 10-11: DEPLOYMENT AUTOMATION

#### Task 10.1: Create Kubernetes Deployment

**Goal:** Production-ready Kubernetes deployment for kamiyo.ai platform

**File:** `../kamiyo-platform/infrastructure/kubernetes/deployment.yaml`

```yaml
# kamiyo.ai Platform - Kubernetes Deployment
# Production deployment for multi-tenant platform

---
# Namespace
apiVersion: v1
kind: Namespace
metadata:
  name: kamiyo-platform

---
# PostgreSQL (use managed service in production)
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: kamiyo-platform
spec:
  ports:
    - port: 5432
  selector:
    app: postgres

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: kamiyo-platform
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          env:
            - name: POSTGRES_DB
              value: kamiyo_platform
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: password
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: postgres-storage
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 100Gi

---
# Redis
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: kamiyo-platform
spec:
  ports:
    - port: 6379
  selector:
    app: redis

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: kamiyo-platform
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379

---
# Platform API
apiVersion: v1
kind: Service
metadata:
  name: platform-api
  namespace: kamiyo-platform
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8000
  selector:
    app: platform-api

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: platform-api
  namespace: kamiyo-platform
spec:
  replicas: 3  # High availability
  selector:
    matchLabels:
      app: platform-api
  template:
    metadata:
      labels:
        app: platform-api
    spec:
      containers:
        - name: api
          image: kamiyo/platform-api:latest
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: url
            - name: REDIS_URL
              value: redis://redis:6379/0
            - name: STRIPE_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: stripe-secret
                  key: secret_key
            - name: DEPLOYMENT_MODE
              value: "cloud_basic"  # Override per tenant
          ports:
            - containerPort: 8000
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "2000m"
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 5

---
# Secrets (create separately with real values)
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: kamiyo-platform
type: Opaque
stringData:
  password: CHANGE_ME
  url: postgresql://postgres:CHANGE_ME@postgres:5432/kamiyo_platform

---
apiVersion: v1
kind: Secret
metadata:
  name: stripe-secret
  namespace: kamiyo-platform
type: Opaque
stringData:
  secret_key: CHANGE_ME
  webhook_secret: CHANGE_ME

---
# Ingress (HTTPS)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: platform-ingress
  namespace: kamiyo-platform
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
    - hosts:
        - api.kamiyo.ai
      secretName: kamiyo-tls
  rules:
    - host: api.kamiyo.ai
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: platform-api
                port:
                  number: 80
```

**Success Criteria:**
- [ ] Kubernetes deployment created
- [ ] High availability (3 replicas)
- [ ] Health checks configured
- [ ] HTTPS with Let's Encrypt
- [ ] Resource limits set

---

### DAY 12-13: MONITORING & OBSERVABILITY

#### Task 12.1: Add Prometheus Metrics to Platform

**Goal:** Comprehensive monitoring and alerting

**File:** `../kamiyo-platform/platform/metrics.py`

```python
"""
Prometheus metrics for kamiyo.ai Platform
Tracks performance, usage, and business metrics
"""

from prometheus_client import Counter, Histogram, Gauge, Info
import time
from functools import wraps

# API Metrics
api_requests_total = Counter(
    'kamiyo_api_requests_total',
    'Total API requests',
    ['method', 'endpoint', 'status']
)

api_request_duration_seconds = Histogram(
    'kamiyo_api_request_duration_seconds',
    'API request duration',
    ['method', 'endpoint']
)

# Business Metrics
active_subscriptions = Gauge(
    'kamiyo_active_subscriptions',
    'Number of active subscriptions',
    ['tier']
)

monitored_protocols_total = Gauge(
    'kamiyo_monitored_protocols_total',
    'Total protocols being monitored',
    ['tenant_id']
)

security_events_detected = Counter(
    'kamiyo_security_events_detected_total',
    'Total security events detected',
    ['protocol', 'severity']
)

# ML Model Metrics
ml_predictions_total = Counter(
    'kamiyo_ml_predictions_total',
    'Total ML predictions',
    ['model', 'result']
)

ml_prediction_latency = Histogram(
    'kamiyo_ml_prediction_latency_seconds',
    'ML prediction latency',
    ['model']
)

# System Metrics
database_connections = Gauge(
    'kamiyo_database_connections',
    'Active database connections'
)

cache_hit_rate = Gauge(
    'kamiyo_cache_hit_rate',
    'Redis cache hit rate'
)


def track_request(func):
    """Decorator to track API request metrics"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start = time.time()

        try:
            result = await func(*args, **kwargs)
            status = 200
            return result
        except Exception as e:
            status = 500
            raise
        finally:
            duration = time.time() - start

            # Track metrics
            api_requests_total.labels(
                method='POST',
                endpoint=func.__name__,
                status=status
            ).inc()

            api_request_duration_seconds.labels(
                method='POST',
                endpoint=func.__name__
            ).observe(duration)

    return wrapper
```

**Success Criteria:**
- [ ] Prometheus metrics added
- [ ] Business metrics tracked
- [ ] ML performance monitored
- [ ] Grafana dashboards created

---

### DAY 14: GO-TO-MARKET LAUNCH

#### Task 14.1: Launch Checklist

**Goal:** Final preparations for launch

**File:** `LAUNCH_CHECKLIST.md`

```markdown
# kamiyo.ai Platform Launch Checklist

## Pre-Launch (1 week before)

### Technical
- [ ] All critical bugs fixed
- [ ] Production database backups configured
- [ ] Monitoring dashboards deployed
- [ ] Load testing completed (1000+ concurrent users)
- [ ] Security audit passed
- [ ] SSL certificates configured
- [ ] DNS configured (kamiyo.ai, api.kamiyo.ai, docs.kamiyo.ai)
- [ ] Email server configured (SendGrid)
- [ ] Stripe integration tested

### Content
- [ ] Landing page live
- [ ] Documentation complete
- [ ] Blog post written (launch announcement)
- [ ] Twitter/LinkedIn posts scheduled
- [ ] Email list prepared

### Business
- [ ] Pricing confirmed
- [ ] Terms of Service finalized
- [ ] Privacy Policy published
- [ ] Support channels ready (email, Discord)
- [ ] Stripe products created

## Launch Day

### Morning
- [ ] Final smoke tests
- [ ] Monitor error rates
- [ ] Check all integrations
- [ ] Team on standby

### Noon
- [ ] Publish blog post
- [ ] Tweet launch announcement
- [ ] Post on LinkedIn
- [ ] Post in Discord communities
- [ ] Email subscribers

### Evening
- [ ] Monitor signups
- [ ] Respond to support requests
- [ ] Track analytics
- [ ] Fix any issues immediately

## Post-Launch (First Week)

### Daily
- [ ] Check error rates
- [ ] Monitor server load
- [ ] Respond to support tickets
- [ ] Track conversion rates
- [ ] Collect user feedback

### Week 1
- [ ] Publish case study
- [ ] Reach out to early users
- [ ] Fix reported bugs
- [ ] Optimize based on analytics

## Success Metrics

### Week 1 Goals
- 100+ signups
- 10+ paid conversions
- <1% error rate
- <200ms API latency (p95)

### Month 1 Goals
- 500+ signups
- 50+ paid customers
- $2k-5k MRR
- 5+ testimonials

### Quarter 1 Goals
- 2000+ signups
- 200+ paid customers
- $20k MRR
- 1+ enterprise customer

## Escalation Plan

### If servers down:
1. Check Kubernetes pods
2. Check database connectivity
3. Roll back to previous version if needed
4. Post status update (status.kamiyo.ai)

### If payment issues:
1. Check Stripe dashboard
2. Check webhook logs
3. Contact Stripe support
4. Manual invoice if needed

### If security incident:
1. Isolate affected systems
2. Notify affected users
3. Fix vulnerability
4. Post-mortem report

## Contact List

- **On-call Engineer**: [Phone]
- **Database Admin**: [Phone]
- **Stripe Support**: [Link]
- **DNS Provider**: [Link]
- **Hosting Provider**: [Link]
```

**Success Criteria:**
- [ ] Launch checklist complete
- [ ] All systems operational
- [ ] Support channels staffed
- [ ] Analytics tracking live
- [ ] Ready to launch!

---

## FINAL SUMMARY

### What We've Built

**Open Source (kamiyo-hyperliquid):**
-  Production-ready Hyperliquid monitor
-  ML anomaly detection
-  24h risk prediction
-  Self-hostable
-  AGPL-3.0 licensed

**Commercial Platform (kamiyo.ai):**
-  Multi-tenant architecture
-  20+ protocol support
-  Advanced ML models (ensemble, cross-protocol)
-  Stripe billing integration
-  Enterprise features
-  Kubernetes deployment
-  Landing page & marketing
-  Full observability

### Business Model

**Revenue Streams:**
1. **SaaS Subscriptions** - $99-2,499/mo
2. **Commercial Licenses** - $5k-100k/year
3. **Professional Services** - Custom integrations
4. **API Access** - Usage-based pricing (future)

**Target Customers:**
- Individual traders (open source)
- Trading firms (Basic/Pro)
- DeFi protocols (Enterprise)
- Security researchers (open source)

### Next Steps After Execution

**Week 1:**
1. Launch landing page
2. Publish to Product Hunt
3. Post in DeFi communities
4. Reach out to protocols

**Month 1:**
- Target 50 paying customers
- Get first testimonials
- Publish case studies
- Apply for grants

**Quarter 1:**
- Build to $20k MRR
- Land enterprise client
- Expand protocol coverage
- Hire first engineer

---

## EXECUTION INSTRUCTIONS FOR SONNET 4.5 AGENT

### How to Execute This Plan

1. **Read entire plan** (all 14 days)
2. **Start with Day 1, Task 1.1**
3. **Execute sequentially** - don't skip ahead
4. **Test after each task** - verify success criteria
5. **Commit after each day** - `git commit -m "Day X complete"`
6. **Document blockers** - if stuck, note in TODO

### Quality Gates

**Don't proceed to next phase until:**
-  All tasks in current phase complete
-  All success criteria met
-  Tests passing
-  Documentation updated

### Timeline Flexibility

**Must have:**
- Days 1-3 (Repository structure, licensing)
- Days 4-5 (Billing, aggregator registry)
- Day 14 (Launch preparation)

**Can defer if needed:**
- Days 8-9 (Landing page - can use template)
- Days 12-13 (Advanced monitoring - start with basics)

### Getting Help

**If blocked on:**
- **Technical issues:** Check existing code examples
- **Business decisions:** Use defaults in plan
- **Missing info:** Make reasonable assumptions, document

### Success Criteria

**Plan execution complete when:**
-  Open source repo public and usable
-  Commercial platform deployed
-  Billing system functional
-  Landing page live
-  First customer can sign up and use system

---

**Good luck! This plan will transform the Hyperliquid monitor into a profitable dual-use business.** 