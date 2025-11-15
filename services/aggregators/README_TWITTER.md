# Twitter/X Aggregator

## Overview

The Twitter aggregator monitors security researchers and alert accounts on Twitter/X for real-time exploit mentions. This is a high-value source as security researchers often report exploits before official channels.

## Implementation Status

✅ **Code Complete** - Full implementation with parsing, validation, and Nitter scraping
⚠️ **Production Note** - Public Nitter instances have variable uptime

## Monitored Accounts (12)

The aggregator monitors these trusted security accounts:

1. **@pcaversaccio** - Smart contract security expert
2. **@samczsun** - Paradigm security researcher
3. **@zachxbt** - On-chain investigator
4. **@PeckShieldAlert** - Real-time exploit alerts
5. **@CertiKAlert** - CertiK security alerts
6. **@BlockSecTeam** - BlockSec monitoring team
7. **@slowmist_team** - SlowMist alerts
8. **@HalbornSecurity** - Halborn security firm
9. **@immunefi** - Bug bounty platform
10. **@BeosinAlert** - Beosin security alerts
11. **@AnciliaInc** - On-chain monitoring
12. **@runtime_xyz** - Formal verification

## Nitter Instances (8 Fallbacks)

The aggregator uses free Nitter instances (Twitter frontends) to avoid API costs:

1. https://nitter.net
2. https://nitter.poast.org
3. https://nitter.privacydev.net
4. https://nitter.unixfox.eu
5. https://nitter.42l.fr
6. https://nitter.fdn.fr
7. https://nitter.1d4.us
8. https://nitter.kavin.rocks

**Note**: Public Nitter instances have variable uptime. The aggregator tries all instances in order until one succeeds.

## How It Works

1. **Fetch tweets** from monitored accounts via Nitter
2. **Filter** for exploit-related keywords (hack, exploit, stolen, drain, etc.)
3. **Parse** tweet content to extract:
   - Protocol name
   - Dollar amount lost
   - Blockchain/chain
   - Transaction hash (if mentioned)
   - Exploit category
4. **Validate** and deduplicate
5. **Store** in database with source attribution

## Features

### Exploit Detection
- Keywords: exploit, hack, rugpull, drain, stolen, vulnerability, attack, breach
- Amount parsing: "$5.2M", "5.2 million", "5.2M stolen"
- Chain detection: Ethereum, BSC, Arbitrum, etc.
- Category classification: Flash Loan, Reentrancy, Oracle Manipulation, etc.

### Reliability
- **8 Nitter instances** with automatic fallback
- **2-second delays** between accounts (rate limiting)
- **Deduplication** via SHA256 hashing
- **Error handling** - continues even if individual tweets fail
- **Validation** - only stores valid exploits with required fields

### Performance
- Fetches last 20 tweets per account
- Processes ~12 accounts in ~24 seconds
- Gracefully handles Nitter downtime

## Current Limitations

### Nitter Instance Availability
As of 2025, many public Nitter instances face:
- Rate limiting (429 errors)
- Downtime (503 errors)
- Connection issues

**Impact**: May return 0 results if all instances are down
**Mitigation**:
- Uses 8 different instances
- Graceful failure (doesn't crash)
- Will work when instances come back online

### Alternative Solutions (Future)

1. **Twitter API v2** ($100/month)
   - Guaranteed uptime
   - Official support
   - Higher rate limits
   - Code ready: see `_fetch_from_api()` method

2. **Self-hosted Nitter** (Free, requires VPS)
   - Full control
   - No rate limits
   - Requires maintenance
   - ~$5/month hosting

3. **Twitter Scraping Service** ($50-200/month)
   - Brightdata, ScraperAPI, etc.
   - Managed solution
   - Higher reliability

## Testing

### Basic Test (No Network)
```bash
python3 aggregators/twitter.py
```

Expected output:
```
✅ TwitterAggregator initializes correctly
✅ Monitoring 12 accounts
✅ Tweet parsing works
✅ Exploit validation works
✅ All code structure tests passed!
```

### Live Test (With Network)
```python
from aggregators.twitter import TwitterAggregator

agg = TwitterAggregator()
agg.accounts_to_monitor = ['PeckShieldAlert']  # Test with one account
exploits = agg.fetch_exploits()

print(f"Found {len(exploits)} exploits")
```

**Note**: May return 0 if Nitter instances are down (this is expected)

## Integration

The Twitter aggregator is integrated into the main orchestrator:

```python
# aggregators/orchestrator.py
from aggregators.twitter import TwitterAggregator

self.aggregators = [
    # ... other aggregators ...
    TwitterAggregator(),  # 18th source
]
```

It runs every 5 minutes alongside other aggregators.

## Configuration

### Add/Remove Accounts

Edit `aggregators/twitter.py`:

```python
self.accounts_to_monitor = [
    'PeckShieldAlert',
    'CertiKAlert',
    # Add more accounts here
]
```

### Adjust Rate Limiting

Edit the delay in `_fetch_from_nitter()`:

```python
time.sleep(2)  # Change this value (seconds)
```

### Add More Nitter Instances

Find working instances at: https://github.com/zedeus/nitter/wiki/Instances

Add to `nitter_instances` list in `_fetch_from_nitter()`.

## Troubleshooting

### Issue: Returns 0 exploits
**Cause**: All Nitter instances are down or rate-limited
**Solution**:
- Check Nitter instance status manually
- Wait and try again later
- Consider paid Twitter API

### Issue: HTTP 429 errors
**Cause**: Rate limiting from Nitter instance
**Solution**: Aggregator automatically tries next instance

### Issue: HTTP 503/502 errors
**Cause**: Nitter instance is down
**Solution**: Aggregator automatically tries next instance

### Issue: Connection timeouts
**Cause**: Network issues or instance unavailable
**Solution**: Aggregator handles gracefully, tries next instance

## Recommended Next Steps

1. **Monitor in production** - See how many exploits we actually catch
2. **Track Nitter uptime** - Log success rates per instance
3. **Consider Twitter API** - If Nitter proves unreliable
4. **Add more accounts** - Expand monitoring list based on quality

## Cost Comparison

| Method | Monthly Cost | Reliability | Setup |
|--------|-------------|-------------|-------|
| Nitter (current) | $0 | Variable | ✅ Done |
| Twitter API v2 | $100 | High | Easy |
| Self-hosted Nitter | $5 | High | Medium |
| Scraping Service | $50-200 | High | Easy |

**Recommendation**: Start with free Nitter (done), upgrade to Twitter API if we prove the value.

## Success Metrics

Track these to evaluate effectiveness:

- **Exploits found**: How many unique exploits from Twitter?
- **First reports**: How often is Twitter the first source?
- **Uptime**: % of successful fetches vs failures
- **Latency**: Time from tweet to database entry

After 1 week of production data, decide if Twitter API investment is worth it.
