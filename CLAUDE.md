# Development Guidelines

## Communication Style

Write like an expert developer:
- No emojis
- No marketing language
- No verbose explanations
- No AI-sounding phrases
- Technical details only
- Concise responses

## Code Quality Standards

### Documentation
- Technical specifications, not marketing
- Code examples with actual implementation
- No phrases like "revolutionary", "game-changing", "cutting-edge"
- No self-references or meta-commentary

### Commit Messages
- Imperative mood: "Add feature" not "Added feature"
- Describe what and why, not how
- No emojis or decorative elements

### Code Comments
- Explain why, not what
- Technical rationale only
- No obvious comments

## Project: Exploit Intelligence Aggregator

### Core Function
Aggregate confirmed exploits from external sources:
- Rekt News, BlockSec, PeckShield, Etherscan
- Verified on-chain data only
- No predictive analysis
- No vulnerability detection

### Technical Stack
```
aggregators/     # Pull from sources
processors/      # Deduplicate, categorize
api/            # FastAPI endpoints
frontend/       # React dashboard
alerts/         # Discord, Telegram, Email
```

### What This Does
- Aggregates confirmed exploits
- Organizes security data
- Provides API access
- Sends alerts

### What This Does Not Do
- Vulnerability scanning
- Security analysis
- Code auditing
- Exploit prediction

## Revenue Model
- API access
- Real-time alerts
- Historical data search
- Subscription tiers

## Success Metrics
- Sources aggregated: 20+
- Exploits tracked: 1000+
- Alert speed: <5 min
- API calls/day: 10,000+

## Technical Boundaries

### Allowed
- Web scraping
- API consumption
- Data deduplication
- Categorization
- On-chain data parsing

### Not Allowed
- AST parsing for vulnerabilities
- Pattern matching for bugs
- Symbolic execution
- Formal verification
- Security scoring algorithms
