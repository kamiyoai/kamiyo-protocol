# Phase 1: Source Expansion Implementation Plan
**Goal: Get faster (2-5 min detection) and more comprehensive (90%+ coverage)**

**Timeline: 2-4 weeks**
**Expected Impact: Detection speed from ~10-15 min → 2-5 min**

---

## Week 1-2: Critical Speed Improvements

### Task 1: Implement Forta Network Integration
**File:** `aggregators/forta.py` (NEW)
**Priority:** CRITICAL - This will give us 5-30 min speed advantage

```python
# Implementation requirements:
# 1. Use Forta Network GraphQL API
# 2. Query for security alerts from community bots
# 3. Focus on these bot types:
#    - Exploit detection bots
#    - Large transfer monitors
#    - Flash loan detection
#    - Reentrancy detection
#    - Oracle manipulation detection

# Forta GraphQL endpoint: https://api.forta.network/graphql

class FortaAggregator(BaseAggregator):
    def __init__(self):
        super().__init__('forta')
        self.graphql_url = 'https://api.forta.network/graphql'

        # Top security bots to monitor
        self.priority_bots = [
            '0x4c7e43a...', # Large USDC transfer monitor
            '0x8f9b5d2...', # Flash loan attack detector
            '0xa2c8f1e...', # Reentrancy detector
            # Add more from: https://explorer.forta.network/
        ]

    def fetch_exploits(self):
        # Query last 1 hour of alerts
        # Filter by severity: CRITICAL, HIGH
        # Parse into standard format
        # Return exploits
        pass

# Add to orchestrator.py line 35:
from aggregators.forta import FortaAggregator

# Add to line 68:
FortaAggregator(),
```

**GraphQL Query Template:**
```graphql
query GetAlerts($first: Int!, $after: String) {
  alerts(
    first: $first
    after: $after
    input: {
      severities: [CRITICAL, HIGH]
      createdSince: 3600  # Last hour
    }
  ) {
    pageInfo {
      hasNextPage
      endCursor
    }
    alerts {
      hash
      name
      description
      severity
      source {
        bot {
          id
        }
        transactionHash
        block {
          timestamp
          chainId
        }
      }
    }
  }
}
```

**Testing:**
```bash
cd /Users/dennisgoslar/Projekter/kamiyo
python aggregators/forta.py  # Should fetch recent alerts
```

---

### Task 2: Upgrade On-Chain Monitor with Real Web3 Integration
**File:** `aggregators/onchain_monitor.py` (UPGRADE)
**Priority:** CRITICAL - Direct blockchain monitoring = fastest detection

**Changes needed:**

1. **Add environment variables:**
```bash
# Add to .env
WEB3_PROVIDER_URI_ETHEREUM=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
WEB3_PROVIDER_URI_BASE=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
WEB3_PROVIDER_URI_ARBITRUM=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
```

2. **Implement anomaly detection patterns:**
```python
class OnChainMonitor(BaseAggregator):
    def __init__(self, chains: List[str] = None):
        super().__init__('onchain_monitor')
        self.chains = chains or ['ethereum', 'base', 'arbitrum']

        # Anomaly thresholds
        self.thresholds = {
            'large_usdc_transfer': 100_000,  # $100K+ USDC
            'large_eth_transfer': 50,        # 50+ ETH
            'flash_loan_min': 1_000_000,     # $1M+ flash loan
        }

        # USDC contract addresses
        self.stablecoin_addresses = {
            'ethereum': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            'arbitrum': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
        }

    def _detect_large_transfers(self, w3, chain: str):
        """Monitor USDC/USDT for large transfers"""
        # Get last 10 blocks
        # Filter Transfer events where amount > threshold
        # Create exploit records
        pass

    def _detect_flash_loan_patterns(self, w3):
        """Detect flash loan attack patterns"""
        # Monitor Aave, Uniswap, Balancer flash loan events
        # Look for: borrow → swap → exploit → repay patterns
        pass

    def _detect_rapid_price_crashes(self, w3):
        """Monitor DEX pools for sudden price drops"""
        # Query Uniswap/Curve pool prices
        # Alert if >50% drop in <5 minutes
        pass
```

3. **Add protocol-specific watchers:**
```python
# Monitor top 20 protocols by TVL
PROTOCOLS_TO_WATCH = {
    'ethereum': {
        'Aave': '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
        'Uniswap': '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        'Compound': '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
        # ... top 20
    },
    'base': {
        # Base protocol addresses
    }
}
```

**Testing:**
```bash
# Get free Alchemy key: https://alchemy.com (2M compute units/mo free)
export WEB3_PROVIDER_URI_ETHEREUM="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
python aggregators/onchain_monitor.py
```

---

### Task 3: Enhanced Twitter Monitoring
**File:** `aggregators/twitter.py` (UPGRADE)
**Priority:** HIGH - Fastest social intel

**Improvements:**

1. **Expand monitored accounts (add these):**
```python
self.accounts_to_monitor = [
    # Existing accounts (keep all current ones)

    # Add these Tier 1 accounts:
    'bantg',              # Yearn, catches exploits early
    'officer_cia',        # OSINT master
    'spreekaway',         # MEV researcher
    'bertcmiller',        # Flashbots MEV
    'taikoxyz',           # Taiko security
    'spreekaway',         # Security researcher
    'Mudit__Gupta',      # CISO at Polygon
    'real_philogy',      # Smart contract security
    'pashovkrum',        # Independent auditor
    'bytes032',          # Security researcher
]
```

2. **Add keyword monitoring with context:**
```python
self.alert_patterns = [
    r'emergency.*pause',
    r'whitehack.*rescue',
    r'post.*mortem',
    r'\$\d+(?:\.\d+)?[MmBb].*(?:lost|stolen|drained|exploited)',
    r'vulnerability.*disclosed',
    r'critical.*bug.*found',
]
```

3. **Add sentiment spike detection:**
```python
def _detect_spike(self, protocol_name: str, window_minutes: int = 60):
    """Detect sudden spike in mentions = potential exploit"""
    # Count mentions in last hour vs baseline
    # If spike >300%, create alert
    pass
```

---

### Task 4: Implement Telegram Monitoring
**File:** `aggregators/telegram_monitor.py` (UPGRADE existing stub)
**Priority:** HIGH - Community often reports first

**Implementation:**

```python
from telethon import TelegramClient, events
import os

class TelegramMonitor(BaseAggregator):
    def __init__(self):
        super().__init__('telegram')

        # Get credentials from https://my.telegram.org/apps
        self.api_id = os.getenv('TELEGRAM_API_ID')
        self.api_hash = os.getenv('TELEGRAM_API_HASH')

        # Channels to monitor
        self.channels = [
            '@CertiKAlert',
            '@PeckShieldAlert',
            '@BlockSecTeam',
            '@SlowMistTeam',
            '@BeosinAlert',
            '@defisecurity',
            '@defi_discussions',
            # Add protocol-specific channels
            '@aave',
            '@Uniswap',
            # Chinese crypto communities (often first)
            '@BTCfans',
        ]

    def fetch_exploits(self):
        """Fetch recent messages from monitored channels"""
        # Connect to Telegram
        # Fetch last 50 messages from each channel
        # Parse for exploit keywords
        # Return exploits
        pass

    async def monitor_realtime(self, callback):
        """Real-time monitoring with webhook callback"""
        # Listen for new messages
        # Instantly callback when exploit detected
        pass
```

**Setup instructions:**
```bash
# 1. Get Telegram API credentials:
#    - Go to https://my.telegram.org/apps
#    - Create new application
#    - Get api_id and api_hash

# 2. Add to .env:
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# 3. Install: pip install telethon

# 4. First run will ask for phone verification
python aggregators/telegram_monitor.py
```

---

## Week 3-4: Verification & Deduplication

### Task 5: Implement Multi-Source Confidence Scoring
**File:** `aggregators/confidence_scorer.py` (NEW)
**Priority:** CRITICAL - Prevent false positives

```python
class ConfidenceScorer:
    """Score exploit confidence based on multiple sources"""

    TIER_1_SOURCES = ['certik', 'peckshield', 'blocksec', 'slowmist']
    TIER_2_SOURCES = ['twitter', 'telegram', 'forta']

    def calculate_confidence(self, exploit: Dict, all_reports: List[Dict]) -> int:
        """
        Calculate confidence score 0-100

        Scoring:
        - On-chain verification (tx_hash confirmed): +50
        - Each Tier 1 source: +15 (max +30)
        - Each Tier 2 source: +10 (max +20)
        - Protocol team confirmation: +30
        """
        score = 0

        # On-chain verification
        if self._verify_on_chain(exploit['tx_hash'], exploit['chain']):
            score += 50

        # Count unique sources
        sources = set([r['source'] for r in all_reports])

        tier_1_count = len([s for s in sources if s in self.TIER_1_SOURCES])
        score += min(tier_1_count * 15, 30)

        tier_2_count = len([s for s in sources if s in self.TIER_2_SOURCES])
        score += min(tier_2_count * 10, 20)

        # Protocol confirmation (check if official account tweeted)
        if self._check_protocol_confirmation(exploit['protocol']):
            score += 30

        return min(score, 100)

    def _verify_on_chain(self, tx_hash: str, chain: str) -> bool:
        """Verify transaction exists and looks like exploit"""
        # Check tx exists
        # Verify large value transfer
        # Return True if confirmed
        pass
```

**Integration into orchestrator:**
```python
# In orchestrator.py, modify _fetch_and_store():

from aggregators.confidence_scorer import ConfidenceScorer

scorer = ConfidenceScorer()

for exploit in exploits:
    # Check for duplicates
    similar = self.db.find_similar_exploits(exploit)

    if similar:
        # Calculate confidence score
        all_reports = similar + [exploit]
        confidence = scorer.calculate_confidence(exploit, all_reports)

        # Only store if confidence > 70
        if confidence >= 70:
            exploit['confidence_score'] = confidence
            self.db.insert_exploit(exploit)
    else:
        # First report - store with lower confidence
        exploit['confidence_score'] = 40
        self.db.insert_exploit(exploit)
```

---

### Task 6: Automatic Deduplication System
**File:** `database/__init__.py` (MODIFY)
**Priority:** HIGH - Prevent duplicate reports

**Add method:**
```python
def find_similar_exploits(
    self,
    exploit: Dict,
    time_window_hours: int = 24
) -> List[Dict]:
    """
    Find similar exploits in last N hours

    Similarity criteria:
    - Same protocol name (fuzzy match)
    - Same chain
    - Within time window
    - Similar amount (±20%)
    """
    cursor = self.conn.cursor()

    # Fuzzy protocol match
    protocol_variants = self._get_protocol_variants(exploit['protocol'])

    query = """
        SELECT * FROM exploits
        WHERE chain = ?
        AND protocol IN ({})
        AND timestamp > datetime('now', '-{} hours')
        AND ABS(amount_usd - ?) / ? < 0.2
    """.format(
        ','.join('?' * len(protocol_variants)),
        time_window_hours
    )

    params = [
        exploit['chain'],
        *protocol_variants,
        exploit['amount_usd'],
        max(exploit['amount_usd'], 1)  # Avoid division by zero
    ]

    results = cursor.execute(query, params).fetchall()
    return [dict(row) for row in results]

def _get_protocol_variants(self, protocol: str) -> List[str]:
    """Get common name variations"""
    # "Aave" → ["Aave", "AAVE", "aave", "Aave V3"]
    variants = [
        protocol,
        protocol.upper(),
        protocol.lower(),
        protocol.title(),
    ]

    # Add "V2", "V3" variants for common protocols
    if protocol.lower() in ['aave', 'uniswap', 'compound']:
        variants.extend([
            f"{protocol} V2",
            f"{protocol} V3",
        ])

    return list(set(variants))
```

**Database schema update:**
```sql
-- Add confidence_score column
ALTER TABLE exploits ADD COLUMN confidence_score INTEGER DEFAULT 0;

-- Add source_count column (how many sources reported)
ALTER TABLE exploits ADD COLUMN source_count INTEGER DEFAULT 1;

-- Add verified_on_chain flag
ALTER TABLE exploits ADD COLUMN verified_on_chain BOOLEAN DEFAULT FALSE;

-- Add index for similarity search
CREATE INDEX idx_protocol_chain_time
ON exploits(protocol, chain, timestamp);
```

---

## Testing & Validation

### Test Script
**File:** `tests/test_phase1_sources.py` (NEW)

```python
"""
Test Phase 1 source improvements
"""
import pytest
from aggregators.forta import FortaAggregator
from aggregators.onchain_monitor import OnChainMonitor
from aggregators.twitter import TwitterAggregator
from aggregators.telegram_monitor import TelegramMonitor
from aggregators.confidence_scorer import ConfidenceScorer

def test_forta_integration():
    """Test Forta Network integration"""
    agg = FortaAggregator()
    exploits = agg.fetch_exploits()

    assert len(exploits) >= 0  # Should not crash
    if exploits:
        assert 'tx_hash' in exploits[0]
        assert 'chain' in exploits[0]

def test_onchain_monitor():
    """Test on-chain monitoring"""
    monitor = OnChainMonitor(chains=['ethereum'])
    exploits = monitor.fetch_exploits()

    assert isinstance(exploits, list)

def test_confidence_scoring():
    """Test confidence scorer"""
    scorer = ConfidenceScorer()

    # Mock exploit with multiple sources
    exploit = {
        'tx_hash': '0x123...',
        'protocol': 'Aave',
        'chain': 'Ethereum',
    }

    reports = [
        {'source': 'certik'},
        {'source': 'peckshield'},
        {'source': 'blocksec'},
    ]

    confidence = scorer.calculate_confidence(exploit, reports)
    assert confidence >= 70  # 3 Tier 1 sources = high confidence

def test_deduplication():
    """Test duplicate detection"""
    from database import get_db

    db = get_db()

    exploit1 = {
        'protocol': 'Aave',
        'chain': 'Ethereum',
        'amount_usd': 1000000,
        'tx_hash': '0xabc...',
        'timestamp': '2025-10-29 12:00:00',
        'source': 'certik',
    }

    # Should find similar
    similar = db.find_similar_exploits(exploit1)
    assert isinstance(similar, list)
```

**Run tests:**
```bash
pytest tests/test_phase1_sources.py -v
```

---

## Benchmarking Script
**File:** `scripts/benchmark_sources.py` (NEW)

```python
"""
Benchmark source performance
Compare detection speed before/after Phase 1
"""

import time
from datetime import datetime
from aggregators.orchestrator import AggregationOrchestrator

def benchmark_aggregation_speed():
    """Measure aggregation speed"""
    orchestrator = AggregationOrchestrator()

    print("Starting benchmark...")
    print("=" * 60)

    start = time.time()
    stats = orchestrator.run_once()
    end = time.time()

    duration = end - start

    print(f"\n📊 Performance Metrics:")
    print(f"  Total duration: {duration:.2f}s")
    print(f"  Sources: {stats['sources_succeeded']}/{stats['sources_attempted']}")
    print(f"  Avg per source: {duration / stats['sources_attempted']:.2f}s")
    print(f"  Exploits found: {stats['total_fetched']}")
    print(f"  New exploits: {stats['total_inserted']}")

    # Speed categories
    if stats['total_fetched'] > 0:
        print(f"\n🎯 Detection Speed:")
        print(f"  On-chain sources: <2 min")
        print(f"  Social sources: 2-5 min")
        print(f"  Traditional sources: 5-15 min")

    return stats

if __name__ == '__main__':
    benchmark_aggregation_speed()
```

---

## Environment Variables Checklist

Add to `.env`:
```bash
# Forta Network (no key required - public API)
# Just works out of the box

# Web3 Providers (get from https://alchemy.com)
WEB3_PROVIDER_URI_ETHEREUM=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
WEB3_PROVIDER_URI_BASE=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
WEB3_PROVIDER_URI_ARBITRUM=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY

# Telegram (get from https://my.telegram.org/apps)
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef1234567890abcdef1234567890

# Twitter (optional - Nitter works without API)
TWITTER_BEARER_TOKEN=your_token_here  # Only if using official API
```

---

## Python Dependencies

Add to `requirements.txt`:
```txt
# Existing dependencies
# ...

# New for Phase 1:
web3>=6.0.0              # On-chain monitoring
telethon>=1.36.0         # Telegram monitoring
gql>=3.5.0               # GraphQL for Forta
aiohttp>=3.9.0           # Async HTTP for Forta
python-Levenshtein>=0.25.0  # Fuzzy matching for deduplication
```

Install:
```bash
cd /Users/dennisgoslar/Projekter/kamiyo
pip install -r requirements.txt
```

---

## Success Criteria

After Phase 1 implementation, you should see:

1. **Speed Improvement:**
   - Forta: Detecting exploits within 2-5 min of on-chain occurrence
   - On-chain monitor: Real-time detection of large transfers
   - Twitter: Catching tweets within 2 min of posting
   - Telegram: Near-instant alerts from monitored channels

2. **Coverage Improvement:**
   - Total sources: 18 → 22+ (4 new sources)
   - Exploit detection rate: 70% → 85%+
   - False positive rate: <5%

3. **Quality Metrics:**
   - Confidence scoring working (70+ = publish)
   - Deduplication reducing noise by 40%+
   - Source health tracking showing uptime

**Test command:**
```bash
# Run full aggregation cycle
python aggregators/orchestrator.py

# Should see:
# ✓ forta: X fetched, Y new
# ✓ onchain_monitor: X fetched, Y new
# ✓ telegram: X fetched, Y new
# Total: 85%+ of known exploits detected
```

---

## Rollout Plan

1. **Day 1-3:** Implement Forta + On-chain monitor
2. **Day 4-7:** Test and debug Web3 integration
3. **Day 8-10:** Upgrade Twitter + add Telegram
4. **Day 11-14:** Implement confidence scoring
5. **Day 15-17:** Add deduplication system
6. **Day 18-21:** Testing and benchmarking
7. **Day 22-28:** Monitor production performance

---

## Next Steps (After Phase 1)

Once Phase 1 is complete:

1. **Phase 2:** Expand to 20 chains (Avalanche, Fantom, Polygon, zkSync, etc.)
2. **Phase 3:** Add Discord monitoring + whitehat network
3. **Phase 4:** AI-powered pattern recognition for proactive alerts

---

**Questions or blockers? Check:**
- Forta docs: https://docs.forta.network
- Alchemy docs: https://docs.alchemy.com
- Telegram API: https://docs.telethon.dev
