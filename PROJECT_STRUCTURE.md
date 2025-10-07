# Exploit Intelligence Aggregator - Project Structure

## Core Mission
**We aggregate confirmed exploit information from external sources. We do NOT detect vulnerabilities or predict exploits.**

---

## Project Architecture

```
exploit-intel-platform/
├── aggregation-agent/        # Pull exploits from external sources
│   ├── aggregators/           # Source-specific fetchers
│   │   ├── rekt_news.py      # Rekt News feed parser
│   │   ├── blocksec.py       # BlockSec alerts
│   │   ├── peckshield.py     # PeckShield Twitter/feed
│   │   └── base.py           # Base aggregator class
│   ├── processors/            # Data organization
│   │   ├── deduplicator.py   # Remove duplicate reports
│   │   ├── categorizer.py    # Categorize by chain/type
│   │   └── enricher.py       # Add metadata (TVL, etc)
│   └── data/                  # Aggregated data storage
│
├── processing-agent/          # Process and organize exploit data
│   ├── processors/            # Data processing pipelines
│   │   ├── chain_identifier.py  # Identify blockchain from tx
│   │   ├── amount_calculator.py # Calculate USD loss from on-chain
│   │   └── timeline_builder.py  # Reconstruct event timeline
│   └── database/              # Processed exploit database
│
├── api-agent/                 # REST API for data access
│   ├── api/
│   │   ├── main.py           # FastAPI application
│   │   ├── routes.py         # API endpoints
│   │   └── subscriptions.py # Subscription management
│   └── models/               # Data models
│
├── frontend-agent/            # Web dashboard
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Dashboard pages
│   │   └── services/         # API clients
│   └── public/
│
├── monitoring-agent/          # Alert system
│   ├── alerts/
│   │   ├── discord.py        # Discord webhooks
│   │   ├── telegram.py       # Telegram bot
│   │   └── email.py          # Email notifications
│   └── filters/              # User alert filters
│
├── intelligence/              # Historical reference data
│   ├── historical_exploits.json  # Past exploits (reference only)
│   ├── exploits/             # Individual exploit records
│   └── monitoring/           # Monitoring reports
│
├── dashboard/                 # Simple status dashboard
│   └── index.html
│
└── tools/                     # Utility scripts
    ├── protocol_monitor.py   # Monitor protocol status
    └── expand_exploit_database.py  # Add historical data

```

---

## What Each Component Does

### Aggregation Agent
**Purpose:** Fetch confirmed exploit reports from external sources
- **Does:** Scrape Rekt News, BlockSec, PeckShield, Etherscan
- **Does NOT:** Scan code, detect vulnerabilities, predict exploits

### Processing Agent
**Purpose:** Organize and categorize aggregated exploits
- **Does:** Deduplicate, categorize by chain/type, calculate USD amounts
- **Does NOT:** Analyze security, score risk, recommend fixes

### API Agent
**Purpose:** Serve organized exploit data via REST API
- **Does:** Provide filtered access to historical exploits, manage subscriptions
- **Does NOT:** Provide security analysis or vulnerability assessments

### Frontend Agent
**Purpose:** Display exploit information in user-friendly dashboard
- **Does:** Show exploit feed, statistics, search/filter
- **Does NOT:** Show security scores, risk ratings, or vulnerability predictions

### Monitoring Agent
**Purpose:** Send real-time alerts for new exploits
- **Does:** Notify users when new exploits are aggregated
- **Does NOT:** Alert on vulnerabilities or potential threats

### Intelligence Directory
**Purpose:** Store historical exploit reference data
- **Does:** Maintain database of past exploits with metadata
- **Does NOT:** Contain vulnerability detection patterns or scanning logic

---

## Data Flow

```
External Sources → Aggregation Agent → Processing Agent → Database
                                                            ↓
                                            ← API Agent ← Storage
                                            ↓
                                        Frontend + Alerts
```

1. **Aggregation:** Pull confirmed exploits from external sources (every 5 minutes)
2. **Processing:** Deduplicate, categorize, enrich with on-chain data
3. **Storage:** Save to database with full metadata
4. **API:** Serve via REST endpoints with filtering
5. **Display:** Show on dashboard + send alerts

---

## What We Track

### Per Exploit:
- Protocol name
- Date/time
- Blockchain(s)
- Amount lost (USD)
- Attack type category
- Transaction hash(es)
- Source URL (Rekt News, etc)
- Recovery status

### Aggregated Stats:
- Total exploits tracked
- Total amount lost
- Exploits per chain
- Exploits per month
- Top exploited protocols
- Most common attack types

---

## What We DON'T Track

- ❌ Vulnerability detection results
- ❌ Security scores or ratings
- ❌ Predicted exploits
- ❌ Code quality metrics
- ❌ Risk assessments
- ❌ False positives (we only report confirmed exploits)

---

## Technology Stack

### Backend:
- **Python 3.11+** - Core language
- **FastAPI** - REST API
- **PostgreSQL** - Primary database
- **Redis** - Caching
- **BeautifulSoup** - Web scraping
- **Feedparser** - RSS feeds

### Frontend:
- **React** - UI framework
- **TailwindCSS** - Styling
- **Recharts** - Data visualization
- **WebSocket** - Real-time updates

### Infrastructure:
- **Docker** - Containerization
- **Docker Compose** - Local development
- **GitHub Actions** - CI/CD
- **DigitalOcean** - Hosting (planned)

---

## Configuration

### Environment Variables:
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost/exploits

# API Keys (for fetching only, not scanning)
ETHERSCAN_API_KEY=your_key
DEFILLAMA_API_KEY=your_key

# Alerts
DISCORD_WEBHOOK_URL=your_webhook
TELEGRAM_BOT_TOKEN=your_token

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60
```

---

## Development Workflow

### Adding a New Exploit Source:

1. Create new aggregator in `aggregation-agent/aggregators/`
2. Inherit from `BaseAggregator`
3. Implement `fetch_exploits()` method
4. Return list of `ExploitReport` objects
5. Add to aggregation pipeline

### Example:
```python
from aggregators.base import BaseAggregator, ExploitReport

class NewSourceAggregator(BaseAggregator):
    def fetch_exploits(self) -> List[ExploitReport]:
        # Fetch from source
        # Parse into ExploitReport objects
        # Return list
        pass
```

---

## Testing

### What We Test:
- Aggregators fetch data correctly
- Deduplication works
- API endpoints return correct data
- Alerts send successfully

### What We DON'T Test:
- Vulnerability detection (we don't do it)
- Security analysis (not our service)
- Scanner accuracy (we don't have scanners)

---

## Deployment

### Production Checklist:
- [ ] All aggregators functional
- [ ] Database migrations applied
- [ ] API rate limiting configured
- [ ] Frontend deployed
- [ ] Alert systems tested
- [ ] Monitoring enabled
- [ ] Backups configured

---

## Revenue Model

### What We Charge For:
1. **Speed** - Real-time alerts (<5 min)
2. **Organization** - All sources in one place
3. **Filtering** - Custom alert criteria
4. **API Access** - Integrate into your tools
5. **Historical Data** - Search past exploits

### What We DON'T Charge For:
- Security analysis (we don't provide it)
- Vulnerability detection (we don't do it)
- Risk assessment (not our expertise)
- Code auditing (not our capability)

---

## Subscription Tiers

### Free ($0/month)
- Daily email summary
- 24h delayed data
- Basic search

### Researcher ($49/month)
- 1h delayed data
- API access (100 calls/day)
- Discord/Telegram alerts
- CSV export

### Pro ($199/month)
- Real-time data (<5 min)
- API access (1000 calls/day)
- Custom filters
- Webhook integration

### Enterprise ($999/month)
- Unlimited API calls
- Custom integrations
- SLA guarantee
- White-label options

---

## Success Metrics

### Track These:
- Sources aggregated (target: 20+)
- Exploits tracked (target: 1000+)
- Alert latency (target: <5 min)
- User subscriptions (target: 200+)
- API calls/day (target: 10,000+)

### DON'T Track These:
- Vulnerabilities "found" (we don't find any)
- Security "accuracy" (not applicable)
- Prediction success (we don't predict)
- False positive rate (not relevant to aggregation)

---

## Core Principles (From CLAUDE.md)

1. **Only Report Confirmed Exploits**
   - Must have transaction hash
   - Must be verified by reputable source
   - Never speculate or predict

2. **No Security Analysis**
   - Don't claim to find vulnerabilities
   - Don't score security risks
   - Don't recommend fixes

3. **Aggregate, Don't Generate**
   - Pull from external sources
   - Organize and present clearly
   - Never create original security claims

4. **Speed Over Depth**
   - Value is in being FAST
   - Not in being SMART about security
   - First to organize, not first to discover

---

## Contact & Support

- **GitHub:** https://github.com/yourusername/exploit-intel-platform
- **Email:** support@kamiyo.ai
- **Discord:** [Community Server]

---

*Last Updated: 2025-10-07*
