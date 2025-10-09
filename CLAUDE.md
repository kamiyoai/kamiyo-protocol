# CLAUDE.md - Exploit Intelligence Aggregator Guidelines

## CRITICAL: What This Project IS and IS NOT

### ✅ This Project IS:
- **An AGGREGATOR** of confirmed, verified exploits from external sources
- **An ORGANIZER** of scattered security information into one place
- **A NOTIFIER** that alerts users to confirmed incidents
- **A HISTORIAN** that tracks patterns in past exploits
- **A DASHBOARD** for viewing security events across chains

### ❌ This Project is NOT:
- A vulnerability scanner or detector
- A security analysis tool
- An exploit prediction system
- A code auditor
- A security consulting service

## Core Principles (NEVER VIOLATE)

1. **Only Report Confirmed Exploits**
   - Must have transaction hash on blockchain
   - Must be verified by reputable source
   - Never speculate or predict

2. **No Security Analysis**
   - Don't claim to find vulnerabilities
   - Don't score security risks
   - Don't recommend fixes
   - Don't evaluate code quality

3. **Aggregate, Don't Generate**
   - Pull from: Rekt News, BlockSec, PeckShield, Etherscan, trusted X sources
   - Organize and present clearly
   - Add context from multiple sources
   - Never create original security claims

4. **Speed Over Depth**
   - Value is in being FAST to aggregate
   - Not in being SMART about security
   - First to organize, not first to discover

## Technical Boundaries

### ALLOWED Technologies:
```python
# Data aggregation
- Web scraping (BeautifulSoup, requests)
- RSS feed parsing
- API consumption
- Database storage (PostgreSQL, SQLite)

# Data processing
- Deduplication
- Categorization by chain/protocol/type
- Timeline reconstruction from blockchain
- Dollar amount calculation from on-chain data

# Presentation
- REST API (FastAPI)
- WebSocket for real-time updates
- Email/Discord/Telegram notifications
- Web dashboard (React)
```

### FORBIDDEN Technologies:
```python
# Do NOT implement:
- AST parsing for vulnerability detection
- Pattern matching for bug finding
- Symbolic execution
- Formal verification
- Any "scanner" functionality
- Any "detector" functionality
- Security scoring algorithms
- Vulnerability prediction models
```

## When Claude Code Tries to Add "Features"

If Claude Code suggests adding:
- **"Vulnerability detection"** → REJECT. Say: "We only aggregate confirmed exploits"
- **"Security scoring"** → REJECT. Say: "We don't evaluate security"
- **"Code analysis"** → REJECT. Say: "We aggregate external reports only"
- **"Predictive models"** → REJECT. Say: "We report history, not predictions"
- **"Pattern matching for bugs"** → REJECT. Say: "We match historical exploits, not find new ones"

## Project Structure (KEEP SIMPLE)

```
exploit-intel-aggregator/
├── aggregators/        # Pull from external sources
│   ├── rekt_news.py
│   ├── blocksec.py
│   ├── peckshield.py
│   └── etherscan.py
├── processors/         # Organize and categorize
│   ├── deduplicator.py
│   ├── categorizer.py
│   └── enricher.py
├── api/               # Serve organized data
│   ├── routes.py
│   └── subscriptions.py
├── frontend/          # Display organized data
│   └── dashboard/
└── alerts/            # Notify about new data
    ├── discord.py
    ├── telegram.py
    └── email.py
```

## Revenue Model (KEEP HONEST)

### What We Charge For:
- **Speed**: Get alerts faster than checking manually
- **Organization**: All exploits in one place
- **Filtering**: Only see what matters to you
- **API Access**: Integrate into your tools
- **Historical Data**: Search past exploits

### What We DON'T Charge For:
- Security analysis (we don't provide it)
- Vulnerability detection (we don't do it)
- Risk assessment (not our expertise)
- Security consulting (not our service)
- Code auditing (not our capability)

## Response Templates

When asked about capabilities:

**Q: "Can you scan my smart contract?"**
A: "No, we aggregate confirmed exploits from external sources. We don't scan code."

**Q: "Is my protocol safe?"**
A: "We can show you historical exploits in similar protocols, but we don't assess security."

**Q: "Can you find vulnerabilities?"**
A: "No, we aggregate reports of exploits that already happened. For vulnerability detection, consult security firms."

## Success Metrics

### Track These:
- Sources aggregated (target: 20+)
- Exploits tracked (target: 1000+)
- Alert speed (target: <5 minutes from source)
- User subscriptions (target: 200+)
- API calls/day (target: 10,000+)

### DON'T Track These:
- Vulnerabilities "found" (we don't find any)
- Security "accuracy" (not applicable)
- Prediction success (we don't predict)
- False positive rate (not relevant to aggregation)

## Final Warning

Every time you're tempted to add "smart" security features, remember:
- Slither exists and is free
- Real security tools take years to build
- False positives destroy trust immediately
- Our value is in AGGREGATION, not ANALYSIS

Stay focused. Stay honest. Build what actually provides value.