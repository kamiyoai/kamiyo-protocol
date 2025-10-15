# Aggregator Data Sources

This document lists all 14 exploit intelligence sources aggregated by the Kamiyo platform.

## Active Sources (14 Total)

### 1. DeFiLlama Hacks
- **File:** `defillama.py`
- **Type:** Public API
- **URL:** https://api.llama.fi/hacks
- **Coverage:** Comprehensive DeFi exploits across all chains
- **Data Quality:** High - verified amounts and dates
- **Update Frequency:** Real-time API
- **Authentication:** None required
- **Rate Limit:** None specified

### 2. Rekt News
- **File:** `rekt_news.py`
- **Type:** RSS Feed
- **URL:** https://rekt.news/feed.xml
- **Coverage:** Major exploits with detailed write-ups
- **Data Quality:** High - investigative journalism
- **Update Frequency:** Weekly (new exploits)
- **Authentication:** None required
- **Rate Limit:** Standard RSS

### 3. CertiK Skynet
- **File:** `certik.py`
- **Type:** Web Scraping + API (when available)
- **URL:** https://skynet.certik.com/alerts
- **Coverage:** Real-time security alerts across chains
- **Data Quality:** High - professional security firm
- **Update Frequency:** Real-time
- **Authentication:** None for public alerts
- **Rate Limit:** Respectful scraping (5 second delays)

### 4. Chainalysis
- **File:** `chainalysis.py`
- **Type:** Web Scraping (Blog)
- **URL:** https://www.chainalysis.com/blog/
- **Coverage:** Major exploits, state-sponsored attacks
- **Data Quality:** Very High - blockchain analytics leader
- **Update Frequency:** Weekly
- **Authentication:** None required
- **Rate Limit:** Standard web scraping

### 5. GitHub Security Advisories
- **File:** `github_advisories.py`
- **Type:** REST API
- **URL:** https://api.github.com/advisories
- **Coverage:** Software vulnerabilities in crypto/blockchain packages
- **Data Quality:** High - official CVE database
- **Update Frequency:** Real-time
- **Authentication:** Optional (GitHub token for higher limits)
- **Rate Limit:** 60/hour (unauthenticated), 5000/hour (authenticated)

### 6. Immunefi
- **File:** `immunefi.py`
- **Type:** Web Scraping
- **URL:** https://immunefi.com/explore/
- **Coverage:** Bug bounty payouts, whitehat disclosures
- **Data Quality:** High - confirmed vulnerabilities with payouts
- **Update Frequency:** Weekly
- **Authentication:** None required
- **Rate Limit:** Respectful scraping

### 7. ConsenSys Diligence
- **File:** `consensys.py`
- **Type:** Web Scraping (Blog)
- **URL:** https://consensys.io/diligence/blog/
- **Coverage:** Ethereum smart contract audits and disclosures
- **Data Quality:** Very High - leading Ethereum auditor
- **Update Frequency:** Monthly
- **Authentication:** None required
- **Rate Limit:** Standard web scraping

### 8. Trail of Bits
- **File:** `trailofbits.py`
- **Type:** Web Scraping (Blog)
- **URL:** https://blog.trailofbits.com/
- **Coverage:** Security research and audit findings
- **Data Quality:** Very High - elite security research
- **Update Frequency:** Monthly
- **Authentication:** None required
- **Rate Limit:** Standard web scraping

### 9. Quantstamp
- **File:** `quantstamp.py`
- **Type:** Web Scraping (Blog)
- **URL:** https://quantstamp.com/blog
- **Coverage:** Smart contract audit findings
- **Data Quality:** High - automated + manual audits
- **Update Frequency:** Monthly
- **Authentication:** None required
- **Rate Limit:** Standard web scraping

### 10. OpenZeppelin
- **File:** `openzeppelin.py`
- **Type:** Web Scraping (Blog)
- **URL:** https://blog.openzeppelin.com/
- **Coverage:** Smart contract security advisories
- **Data Quality:** Very High - industry standard libraries
- **Update Frequency:** Monthly
- **Authentication:** None required
- **Rate Limit:** Standard web scraping

### 11. SlowMist
- **File:** `slowmist.py`
- **Type:** Web Scraping (Hacked DB + Medium)
- **URL:** https://hacked.slowmist.io/
- **Coverage:** Comprehensive hack database, Asia-focused
- **Data Quality:** High - verified incidents
- **Update Frequency:** Daily
- **Authentication:** None required
- **Rate Limit:** Respectful scraping

### 12. HackerOne
- **File:** `hackerone.py`
- **Type:** API + Web Scraping
- **URL:** https://hackerone.com/hacktivity
- **Coverage:** Public vulnerability disclosures for crypto projects
- **Data Quality:** High - verified bug bounties
- **Update Frequency:** Real-time
- **Authentication:** Optional (API token for better access)
- **Rate Limit:** API limits apply with token

### 13. Twitter (Social Media)
- **File:** `twitter.py`
- **Type:** Twitter API v2
- **URL:** Twitter API
- **Coverage:** Real-time security alerts from researchers
- **Data Quality:** Medium - requires verification
- **Update Frequency:** Real-time
- **Authentication:** Required (Twitter API keys)
- **Rate Limit:** Twitter API limits

### 14. On-Chain Monitor
- **File:** `onchain_monitor.py`
- **Type:** Web3 RPC + Etherscan API
- **URL:** Multiple RPC endpoints
- **Coverage:** Direct blockchain monitoring for suspicious transactions
- **Data Quality:** High - raw blockchain data
- **Update Frequency:** Real-time (block-by-block)
- **Authentication:** Required (RPC/API keys)
- **Rate Limit:** Varies by provider

## Source Categories

### Real-Time Sources (5)
- DeFiLlama Hacks
- CertiK Skynet
- GitHub Advisories
- Twitter
- On-Chain Monitor

### Periodically Updated (9)
- Rekt News (Weekly)
- Chainalysis (Weekly)
- Immunefi (Weekly)
- ConsenSys Diligence (Monthly)
- Trail of Bits (Monthly)
- Quantstamp (Monthly)
- OpenZeppelin (Monthly)
- SlowMist (Daily)
- HackerOne (Daily)

## Coverage by Type

### Confirmed Exploits (Primary)
- DeFiLlama Hacks
- Rekt News
- CertiK Skynet
- Chainalysis
- SlowMist
- On-Chain Monitor

### Whitehat Disclosures (Secondary)
- Immunefi
- HackerOne
- ConsenSys Diligence
- Trail of Bits
- Quantstamp
- OpenZeppelin
- GitHub Advisories

### Real-Time Alerts (Tertiary)
- Twitter
- CertiK Skynet
- On-Chain Monitor

## Data Quality Tiers

### Tier 1 (Highest Quality)
- DeFiLlama Hacks
- Chainalysis
- ConsenSys Diligence
- Trail of Bits
- OpenZeppelin

### Tier 2 (High Quality)
- Rekt News
- CertiK Skynet
- Immunefi
- Quantstamp
- SlowMist
- HackerOne
- GitHub Advisories

### Tier 3 (Requires Verification)
- Twitter
- On-Chain Monitor (raw data)

## API Keys Required

The following sources work better with API keys (but can function without them):

1. **GitHub Advisories**
   - Variable: `GITHUB_TOKEN`
   - Benefit: 5000/hour vs 60/hour

2. **HackerOne**
   - Variable: `HACKERONE_API_TOKEN`
   - Benefit: Full API access vs limited scraping

3. **Twitter**
   - Variables: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_BEARER_TOKEN`
   - Benefit: Required for access

4. **On-Chain Monitor**
   - Variables: `INFURA_API_KEY`, `ETHERSCAN_API_KEY`, etc.
   - Benefit: Required for RPC access

## Deduplication Strategy

Exploits are deduplicated across sources using:
1. Transaction hash (primary key)
2. Protocol + Date + Chain (fallback)
3. Generated hash for sources without tx_hash

## Update Frequency

Orchestrator runs all aggregators every **5 minutes** by default.

Configurable in orchestrator:
```python
orchestrator.run_forever(interval_minutes=5)
```

## Testing Individual Sources

Each aggregator can be tested independently:

```bash
python aggregators/defillama.py
python aggregators/rekt_news.py
python aggregators/certik.py
# ... etc
```

## Adding New Sources

To add a new source:

1. Create new aggregator in `aggregators/[source].py`
2. Extend `BaseAggregator` class
3. Implement `fetch_exploits()` method
4. Add to `orchestrator.py` imports and aggregator list
5. Update this SOURCES.md file
6. Test with: `python aggregators/[source].py`

## CRITICAL: What We DO and DON'T Do

### We DO:
- Aggregate confirmed exploits from external sources
- Parse and normalize data into standard format
- Deduplicate across sources
- Track historical patterns
- Alert on new incidents

### We DON'T:
- Detect vulnerabilities ourselves
- Analyze smart contract code
- Predict future exploits
- Provide security recommendations
- Audit protocols

**We are an AGGREGATOR, not a SCANNER.**

## Source Reliability Monitoring

The orchestrator tracks:
- Success/failure rate per source
- Last successful fetch timestamp
- Average fetch duration
- Error messages

View health status:
```python
orchestrator.get_health_status()
```

## Legal & Ethical Considerations

All sources used are:
- Publicly accessible
- Used within their Terms of Service
- Rate-limited respectfully
- Properly attributed

We respect `robots.txt` and use reasonable delays between requests.

## Last Updated

This document was last updated: 2025-10-08 (Days 22-24 completion)
