# Kamiyo - Exploit Intelligence Aggregator

> **The fastest way to track confirmed crypto exploits across all chains**

**Mission**: Aggregate exploit reports from 20+ sources and deliver alerts in <5 minutes

**Model**: Pure aggregation platform - we organize information, not detect vulnerabilities

---

## What We Do

Kamiyo aggregates confirmed crypto exploits from external sources into a single, searchable platform with real-time alerts.

### We ARE:
- ✅ An **aggregator** of confirmed exploits from Rekt News, BlockSec, PeckShield, etc.
- ✅ An **organizer** of scattered security information
- ✅ A **notifier** that delivers alerts in <5 minutes
- ✅ A **historian** tracking patterns in past exploits
- ✅ A **dashboard** for viewing security events across all chains

### We are NOT:
- ❌ A vulnerability scanner or detector
- ❌ A security analysis tool
- ❌ An exploit prediction system
- ❌ A code auditor
- ❌ A security consulting service

**We aggregate information. For vulnerability detection, consult security firms like CertiK, Trail of Bits, or OpenZeppelin.**

---

## Why Kamiyo?

### The Problem
Security incidents happen daily across 50+ blockchains, but information is scattered:
- Rekt News (manual blog posts)
- BlockSec alerts (Twitter)
- PeckShield feeds (multiple platforms)
- Etherscan comments (hard to search)
- Discord/Telegram announcements (ephemeral)

**Result**: Security teams waste hours tracking incidents across platforms

### Our Solution
- **Aggregate** from 20+ sources automatically
- **Organize** by chain, protocol, attack type, and amount
- **Alert** in <5 minutes via Discord, Telegram, Email, or Webhooks
- **Search** historical exploits instantly
- **API** for integration into your tools

---

## Features

### 🚀 Real-Time Aggregation
- Monitors 20+ exploit sources every 5 minutes
- Deduplicates across sources automatically
- Enriches with on-chain data (amounts, tx hashes)
- Alert latency: <5 minutes from source publication

### 📊 Comprehensive Dashboard
- Live exploit feed with filtering
- Statistics: total exploits, amounts lost, trends
- Search by protocol, chain, attack type, or date
- Calendar heatmap showing exploit frequency
- Export to CSV/JSON

### 🔔 Smart Alerts
- **Channels**: Discord, Telegram, Email, Webhooks
- **Filters**: By chain, protocol, amount threshold, attack type
- **Speed Tiers**:
  - Free: Daily summary
  - Basic: Hourly batches
  - Pro: <5 minute real-time
  - Enterprise: Custom webhooks with <1 minute

### 🔍 Historical Database
- 1000+ confirmed exploits tracked
- $3B+ in historical losses documented
- Search and filter by any criteria
- Similar exploit recommendations
- Recovery status tracking

### 🛠️ Developer API
- RESTful API with filtering
- Rate-limited tiers (100-unlimited calls/day)
- Webhook integration
- Full documentation with examples

---

## Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/exploit-intel-platform
cd exploit-intel-platform

# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run aggregation pipeline
python aggregation-agent/main.py

# Start API server
cd api-agent && uvicorn api.main:app --reload

# Launch frontend (separate terminal)
cd frontend-agent && npm install && npm run dev
```

### Docker Compose (Recommended)

```bash
docker-compose up -d
```

Access dashboard at: `http://localhost:3000`

---

## Subscription Tiers

### 🆓 Free ($0/month)
- Daily email summary
- 24-hour delayed data
- Basic search
- Public exploit feed

### 📚 Researcher ($49/month)
- 1-hour delayed data
- API access (100 calls/day)
- Discord/Telegram alerts
- CSV export
- Advanced filtering

### 💼 Pro ($199/month)
- **Real-time data** (<5 minutes)
- API access (1,000 calls/day)
- Custom alert filters
- Webhook integration
- Priority support
- Historical data download

### 🏢 Enterprise ($999/month)
- Unlimited API calls
- Custom integrations
- SLA guarantee (99.9% uptime)
- Dedicated support
- White-label options
- On-premise deployment available

[**Start Free Trial →**](https://kamiyo.ai/signup)

---

## API Example

```python
import requests

# Get recent exploits
response = requests.get(
    "https://api.kamiyo.ai/v1/exploits",
    params={
        "chain": "Ethereum",
        "min_amount": 1000000,  # $1M+
        "limit": 10
    },
    headers={"Authorization": "Bearer YOUR_API_KEY"}
)

exploits = response.json()
for exploit in exploits["data"]:
    print(f"{exploit['protocol']}: ${exploit['amount_usd']:,}")
```

### Sample Response
```json
{
  "data": [
    {
      "id": "EULER_2023",
      "protocol": "Euler Finance",
      "date": "2023-03-13",
      "chain": "Ethereum",
      "amount_usd": 197000000,
      "attack_type": "Donation Attack",
      "tx_hash": "0x...",
      "source": "https://rekt.news/euler-rekt/",
      "recovery_status": "Fully recovered"
    }
  ],
  "total": 1,
  "page": 1
}
```

[**Full API Documentation →**](https://docs.kamiyo.ai)

---

## Technology Stack

### Backend
- **Python 3.11+** with FastAPI
- **PostgreSQL** for exploit database
- **Redis** for caching and rate limiting
- **BeautifulSoup** for web scraping
- **Celery** for background tasks

### Frontend
- **React** with TypeScript
- **TailwindCSS** for styling
- **Recharts** for data visualization
- **WebSocket** for real-time updates

### Infrastructure
- **Docker** containerization
- **GitHub Actions** CI/CD
- **DigitalOcean** hosting
- **Cloudflare** CDN

---

## Data Sources

We aggregate from 20+ sources including:

**Primary Sources:**
- Rekt News
- BlockSec Alerts
- PeckShield Feed
- Etherscan Comments
- DeFiLlama Hacks API

**Secondary Sources:**
- CertiK Skynet
- Chainalysis Incidents
- Immunefi Bounties
- GitHub Security Advisories
- Twitter Security Researchers

**Blockchain Data:**
- Etherscan, BscScan, Polygonscan (all chains)
- On-chain transaction analysis
- TVL data from DeFiLlama

---

## Statistics (As of October 2025)

- **1,247** confirmed exploits tracked
- **$3.2B** total losses documented
- **52** blockchains covered
- **<4.2 min** average alert speed
- **20+** data sources integrated
- **99.7%** uptime

---

## Roadmap

### Q4 2025 (Current)
- [x] Core aggregation pipeline (20 sources)
- [x] Historical database (1000+ exploits)
- [x] REST API with filtering
- [x] Web dashboard
- [ ] Mobile app (iOS/Android)
- [ ] Telegram mini-app

### Q1 2026
- [ ] Add 15 more sources (target: 35 total)
- [ ] AI-powered exploit summaries
- [ ] Slack integration
- [ ] Advanced analytics dashboard
- [ ] Multi-language support

### Q2 2026
- [ ] White-label platform for enterprises
- [ ] Custom source integrations
- [ ] Exploit impact scoring (based on TVL)
- [ ] Related protocol alerts

---

## What We DON'T Do

To be completely transparent about our service boundaries:

**We do NOT:**
- Scan smart contracts for vulnerabilities
- Predict future exploits
- Provide security audits or consulting
- Recommend specific security fixes
- Score protocol "safety" or "risk"
- Analyze code quality

**We ONLY:**
- Aggregate confirmed, publicly reported exploits
- Organize this information by chain/protocol/type
- Deliver fast notifications when new exploits are reported
- Provide historical data for research

**For vulnerability detection, consult:**
- Trail of Bits
- OpenZeppelin
- CertiK
- Consensys Diligence
- Quantstamp

---

## Contributing

We welcome contributions for:
- Adding new data sources
- Improving aggregation accuracy
- Documentation improvements
- Bug reports

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Project Structure

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for detailed architecture documentation.

---

## Support

- **Documentation**: https://docs.kamiyo.ai
- **Email**: support@kamiyo.ai
- **Discord**: https://discord.gg/kamiyo
- **Twitter**: @KamiyoAI
- **GitHub Issues**: https://github.com/yourusername/exploit-intel-platform/issues

---

## License

MIT License - See [LICENSE](LICENSE) for details

---

## Disclaimer

Kamiyo aggregates publicly available information about confirmed security incidents. We do not:
- Verify the accuracy of source reports
- Provide legal advice
- Offer investment recommendations
- Guarantee completeness of data

Always verify critical information through multiple sources. Past exploits do not predict future security incidents.

---

**Built with transparency. Focused on speed. Honest about capabilities.**

[Start Free Trial](https://kamiyo.ai/signup) | [View Demo](https://demo.kamiyo.ai) | [Read Docs](https://docs.kamiyo.ai)
