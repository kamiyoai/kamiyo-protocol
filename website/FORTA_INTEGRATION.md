# Forta Network Integration

**Status:** ✅ Completed
**Date:** October 18, 2025
**New Source Count:** 19 aggregators (was 18)

---

## What Was Added

### New Aggregator: Forta Network

Added Forta Network as the 19th data source for confirmed blockchain exploits and security incidents.

**File:** `aggregators/forta.py`

---

## What is Forta Network?

Forta is a **decentralized threat detection network** for Web3 that monitors blockchain activity in real-time using detection bots. It provides:

- Real-time security alerts across multiple EVM chains
- High-confidence exploit detection from specialized bots
- Verified transaction hashes for confirmed incidents
- Metadata-rich alerts with severity levels (CRITICAL, HIGH, MEDIUM, LOW)

---

## How It Works

### 1. GraphQL API Integration

Forta provides a GraphQL API endpoint:
- **Endpoint:** `https://api.forta.network/graphql`
- **Authentication:** Bearer token (API key required)
- **Query:** Fetches CRITICAL and HIGH severity alerts from the last 7 days

### 2. Exploit Detection Bots

The aggregator filters alerts from high-confidence detection bots:

- **Exploit Detector Bot** - General exploit detection
- **Smart Price Change Bot** - Abnormal price movements
- **Flash Loan Detector Bot** - Flash loan attacks
- **Reentrancy Bot** - Reentrancy vulnerabilities
- **Oracle Manipulation Bot** - Oracle price manipulation

### 3. Data Normalization

Each Forta alert is parsed into standard exploit format:

```python
{
    'tx_hash': '0xabc...',           # Transaction hash from blockchain
    'chain': 'Ethereum',             # Mapped from chain_id
    'protocol': 'Uniswap',           # Extracted from alert name/protocol field
    'amount_usd': 1500000.0,         # Parsed from metadata or description
    'timestamp': datetime(...),      # Block timestamp or alert creation time
    'source': 'forta',
    'source_url': 'https://explorer.forta.network/alert/...',
    'category': 'Flash Loan',        # Categorized from alert text
    'description': '...',
    'recovery_status': None
}
```

---

## Supported Chains

Forta monitors 12+ EVM chains:

- Ethereum (1)
- BSC (56)
- Polygon (137)
- Avalanche (43114)
- Arbitrum (42161)
- Optimism (10)
- Fantom (250)
- Base (8453)
- Cronos (25)
- Gnosis (100)
- Linea (59144)
- Scroll (534352)

---

## Configuration

### Environment Variable

```bash
# Required to enable Forta aggregator
FORTA_API_KEY=your-api-key-here
```

### Getting an API Key

1. Visit: https://app.forta.network/
2. Sign up for an account
3. Generate API key from dashboard
4. Set in environment variables

**Note:** If `FORTA_API_KEY` is not set, the aggregator gracefully skips and logs a warning (does not fail).

---

## Integration Points

### 1. Added to Orchestrator

**File:** `website/aggregators/orchestrator.py`

```python
from aggregators.forta import FortaAggregator

self.aggregators = [
    # ... 18 existing aggregators ...
    FortaAggregator(),    # 19th source - decentralized threat detection network
]
```

### 2. Updated Health Endpoint

**File:** `pages/api/health.js`

```javascript
total_sources: 19  // Updated: Added Forta Network as 19th source
```

---

## Testing

### Local Test

```bash
cd /Users/dennisgoslar/Projekter/kamiyo/website

# Set API key
export FORTA_API_KEY=your-api-key-here

# Run aggregator test
python3 aggregators/forta.py
```

Expected output:
```
INFO - Fetching from Forta Network GraphQL API
INFO - Fetched X alerts from Forta
INFO - Fetched X exploits from Forta Network

Fetched X exploits from Forta Network:

1. Uniswap
   Chain: Ethereum
   Amount: $1,500,000
   Date: 2025-10-15 14:32
   Category: Flash Loan
   TX: 0xabc123...
```

### Without API Key

```bash
# Without API key, aggregator skips gracefully
unset FORTA_API_KEY
python3 aggregators/forta.py
```

Expected output:
```
⚠️  Forta API key not set!
Set FORTA_API_KEY environment variable to test this aggregator.
Get an API key from: https://app.forta.network/
```

---

## Benefits

### 1. Real-Time Detection
- Alerts appear within minutes of on-chain events
- Faster than manual blog aggregation

### 2. High Confidence
- Alerts from verified, specialized bots
- Reduced false positives compared to general monitoring

### 3. Rich Metadata
- Transaction hashes (verifiable on-chain)
- Severity levels (CRITICAL, HIGH)
- Detailed descriptions from security experts

### 4. Multi-Chain Coverage
- Single API covers 12+ EVM chains
- Consistent data format across chains

---

## Category Detection

The aggregator automatically categorizes exploits:

- **Flash Loan** - Flash loan attacks
- **Reentrancy** - Reentrancy exploits
- **Oracle Manipulation** - Price oracle manipulation
- **Access Control** - Privilege escalation
- **Bridge Exploit** - Cross-chain bridge attacks
- **Phishing** - Token phishing scams
- **Rugpull** - Exit scams
- **MEV** - MEV attacks (sandwich, frontrun)
- **Smart Contract Bug** - General vulnerabilities
- **Drain** - Fund draining attacks

---

## Limitations

### 1. API Key Required
- Not free (may require paid plan for high volume)
- Need to sign up and manage API key

### 2. Bot-Dependent
- Quality depends on which detection bots are active
- Some exploits may be missed if no bot covers them

### 3. Alert Filtering
- Currently filters to CRITICAL and HIGH severity only
- May need adjustment based on data quality

---

## Future Improvements

### 1. Dynamic Bot Selection
- Monitor bot performance
- Automatically add/remove bots based on accuracy

### 2. Severity Thresholds
- Make severity filtering configurable
- Test MEDIUM severity alerts for value

### 3. Alert Deduplication
- Same exploit may trigger multiple bots
- Add deduplication logic in aggregator

### 4. Metadata Parsing
- Improve amount extraction from metadata
- Better protocol name extraction

---

## Impact on System

### Source Count: 18 → 19

**Previous sources:**
1. DefiLlama
2. Rekt News
3. CertiK
4. Chainalysis
5. GitHub Advisories
6. Immunefi
7. Consensys
8. Trail of Bits
9. Quantstamp
10. OpenZeppelin
11. SlowMist
12. HackerOne
13. Cosmos Security
14. Arbitrum Security
15. PeckShield
16. BlockSec
17. Beosin
18. Twitter

**New source:**
19. **Forta Network** ⭐

---

## Production Deployment

### Render.com Setup

1. **Add environment variable:**
   - Go to Render Dashboard → kamiyo-api service
   - Click "Environment"
   - Add: `FORTA_API_KEY` = your-api-key

2. **Deploy:**
   - Manual: Click "Manual Deploy" → "Deploy latest commit"
   - Auto: Push to main branch

3. **Monitor:**
   - Check logs for: `Fetched X exploits from Forta Network`
   - Should see in orchestrator output

---

## Files Changed

1. ✅ **Created:** `aggregators/forta.py` (New aggregator)
2. ✅ **Updated:** `website/aggregators/orchestrator.py` (Added Forta to list)
3. ✅ **Updated:** `pages/api/health.js` (Updated total_sources to 19)
4. ✅ **Created:** `FORTA_INTEGRATION.md` (This file)

---

## Summary

Successfully integrated Forta Network as the 19th data source for Kamiyo's exploit aggregation system. This adds real-time, decentralized threat detection across 12+ EVM chains with high-confidence alerts from specialized security bots.

**Next Steps:**
1. Add `FORTA_API_KEY` to production environment
2. Monitor data quality and adjust bot filters if needed
3. Consider adding more specialized detection bots
4. Evaluate alert volume and adjust severity thresholds

---

**✅ Integration Complete!** Kamiyo now aggregates from 19 authoritative sources. 🚀
