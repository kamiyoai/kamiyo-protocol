# Exploit Analysis & Report Generation Module

## Overview

This module generates comprehensive, engaging exploit reports from Kamiyo's aggregated exploit data for social media distribution.

**CRITICAL PRINCIPLE**: This module ONLY aggregates and presents confirmed exploit data. It does NOT perform:
- Vulnerability detection
- Smart contract code analysis
- Security scoring
- Exploit prediction

We follow the CLAUDE.md principles: **AGGREGATE, don't GENERATE** security insights.

## Architecture

```
social/analysis/
├── __init__.py                 # Module exports
├── report_generator.py         # Main report generation (ENTRY POINT)
├── data_models.py              # Report data structures
├── formatters.py               # Platform-specific formatters
├── historical_context.py       # Historical pattern analysis
└── README.md                   # This file
```

## Core Components

### 1. ReportGenerator (`report_generator.py`)

**Main entry point** for generating exploit reports.

```python
from social.analysis import ReportGenerator
from social.models import ExploitData

# Initialize generator
generator = ReportGenerator(db_connection=db)

# Generate comprehensive report
report = generator.analyze_exploit(
    exploit=exploit_data,
    report_format=ReportFormat.MEDIUM,
    include_historical=True
)
```

**Key Method**: `analyze_exploit(exploit, report_format, include_historical)`
- **Input**: `ExploitData` object from Kamiyo platform (already aggregated)
- **Output**: `ExploitReport` with executive summary, timeline, impact, context
- **Does**: Organizes data into engaging narrative
- **Does NOT**: Analyze code, detect vulnerabilities, predict exploits

### 2. Data Models (`data_models.py`)

Structured data types for reports:

```python
# Report formats
ReportFormat.SHORT    # 1-2 sentences, Twitter-friendly
ReportFormat.MEDIUM   # 1-2 paragraphs, Discord/Telegram
ReportFormat.LONG     # Full detailed report, Reddit/blog
ReportFormat.THREAD   # Twitter thread format

# Severity levels with visual indicators
SeverityLevel.LOW        # 🟢 < $100K
SeverityLevel.MEDIUM     # 🟡 $100K - $1M
SeverityLevel.HIGH       # 🟠 $1M - $10M
SeverityLevel.CRITICAL   # 🔴 > $10M

# Core report structure
ExploitReport:
    - executive_summary: str
    - timeline: List[TimelineEvent]
    - impact: ImpactSummary
    - historical_context: HistoricalContext
    - source_attribution: SourceAttribution
```

### 3. Formatters (`formatters.py`)

Platform-specific report formatting:

```python
from social.analysis import ReportFormatter

formatter = ReportFormatter()

# Twitter thread (list of tweets, each ≤280 chars)
tweets = formatter.format_for_twitter_thread(report)

# Reddit markdown post
reddit_post = formatter.format_for_reddit(report)

# Discord embed (dict with embed structure)
discord_embed = formatter.format_for_discord_embed(report)

# ASCII charts for text platforms
chart = formatter.format_ascii_chart(
    values=[5000000, 3000000, 1000000],
    labels=['Q1 Losses', 'Q2 Losses', 'Q3 Losses'],
    title='Flash Loan Attack Trend'
)
```

### 4. Historical Context (`historical_context.py`)

Queries Kamiyo database for historical patterns:

```python
from social.analysis import HistoricalContextAnalyzer, ExploitQuery

analyzer = HistoricalContextAnalyzer(db_connection=db)

# Find similar past exploits
query = ExploitQuery(
    exploit_type='Flash Loan',
    chain='Ethereum',
    time_period_days=365
)
similar = analyzer.find_similar_exploits(query, limit=5)

# Analyze trends
total_losses = analyzer.calculate_total_losses(query)
trend_direction, trend_pct = analyzer.analyze_trend('Flash Loan', 'Ethereum')
```

**IMPORTANT**: This only queries confirmed exploit data. No prediction or analysis.

## Report Structure

Every generated report includes:

### 1. Executive Summary
- 1-2 sentence overview (SHORT format)
- 1-2 paragraphs (MEDIUM/LONG formats)
- Includes severity, loss amount, exploit type

### 2. Timeline
- When exploit occurred (blockchain timestamp)
- When first reported by external source
- When aggregated by Kamiyo
- Recovery milestones (if applicable)

### 3. Impact Assessment
- 🟢🟡🟠🔴 Severity indicator
- Total loss amount in USD
- Recovery status and percentage
- Affected protocols/chains
- Number of affected users (if known)

### 4. Historical Context
- Similar past exploits (same type/chain)
- Total losses in category
- Trend analysis (increasing/decreasing/stable)
- Ranking ("3rd largest DeFi exploit this year")

### 5. Source Attribution
- Primary source (Rekt News, PeckShield, etc.)
- Source URLs for verification
- Additional confirming sources
- Kamiyo detection timestamp

### 6. Engagement Hooks
- Interesting facts to make report shareable
- Only uses confirmed data, never speculation
- Examples:
  - "This is the 3rd largest DeFi exploit this year"
  - "Flash loan attacks are up 40% this quarter"
  - "Detected within 5 minutes of occurrence"

## Usage Examples

### Basic Report Generation

```python
from datetime import datetime
from social.models import ExploitData
from social.analysis import ReportGenerator, ReportFormat

# Exploit data from Kamiyo platform (already aggregated)
exploit = ExploitData(
    tx_hash="0xabc123...",
    protocol="Uniswap V3",
    chain="Ethereum",
    loss_amount_usd=2_500_000,
    exploit_type="Flash Loan",
    timestamp=datetime.utcnow(),
    description="Flash loan attack via oracle manipulation",
    recovery_status="Partial Recovery - 40% recovered",
    source="Rekt News",
    source_url="https://rekt.news/uniswap-rekt/"
)

# Generate report
generator = ReportGenerator()
report = generator.analyze_exploit(
    exploit,
    report_format=ReportFormat.LONG,
    include_historical=True
)

print(report.executive_summary)
# Output: "🔴 CRITICAL - Uniswap V3 on Ethereum has been exploited..."
```

### Multi-Platform Report Generation

```python
# Generate for all platforms at once
reports = generator.generate_multi_platform_reports(exploit)

# Post to Twitter
for tweet in reports['twitter_thread']:
    twitter_client.post(tweet)

# Post to Reddit
reddit_client.submit(
    title=f"🔴 {exploit.protocol} - ${exploit.loss_amount_usd/1_000_000:.1f}M Lost",
    selftext=reports['reddit_post'],
    subreddit='CryptoCurrency'
)

# Post to Discord
discord_client.send_embed(reports['discord_embed'])
```

### Integration with Existing Post Generator

```python
from social.post_generator import PostGenerator
from social.analysis import ReportGenerator

# Generate detailed analysis report
analysis_generator = ReportGenerator()
report = analysis_generator.analyze_exploit(exploit)

# Use existing post generator for platform content
post_generator = PostGenerator()
social_post = post_generator.generate_post(
    exploit,
    platforms=[Platform.X_TWITTER, Platform.REDDIT]
)

# Enhance with analysis insights
enhanced_description = (
    f"{social_post.exploit_data.description}\n\n"
    f"Context: {report.historical_context.ranking}\n"
    f"Trend: {report.historical_context.trend_direction}"
)
```

### Custom Report Sections

```python
# Get individual report sections
sections = report.get_sections()

for section in sections:
    print(f"## {section.title}")
    print(section.content)
    print()

# Output:
# ## Executive Summary
# Uniswap V3 on Ethereum has been exploited...
#
# ## Timeline
# • 2025-10-14 10:00 UTC - Flash Loan attack executed...
# • 2025-10-14 10:05 UTC - Exploit reported by Rekt News...
#
# ## Impact Assessment
# Severity: 🔴 CRITICAL
# Total Loss: $2,500,000.00 USD
# ...
```

## Engagement Elements

### Severity Indicators
- 🟢 **LOW**: < $100K - Minor incident
- 🟡 **MEDIUM**: $100K - $1M - Significant loss
- 🟠 **HIGH**: $1M - $10M - Major exploit
- 🔴 **CRITICAL**: > $10M - Catastrophic event

### Trend Indicators
- 📈 **UP**: Increasing trend
- 📉 **DOWN**: Decreasing trend
- ➡️ **STABLE**: No significant change

### Visual Elements
```python
# ASCII bar charts for historical data
Loss Trend by Quarter
====================
Q1 2025 │████████████████████████████████ $5.0M
Q2 2025 │████████████████████ $3.2M
Q3 2025 │████████████ $1.8M
```

## What This Module Does NOT Do

### ❌ NO Vulnerability Detection
```python
# WRONG - We don't do this
def scan_smart_contract(contract_code):
    vulnerabilities = detect_reentrancy(contract_code)  # ❌ NO
    return vulnerabilities

# RIGHT - We only report confirmed exploits
def analyze_confirmed_exploit(exploit_data):
    report = organize_known_exploit_data(exploit_data)  # ✅ YES
    return report
```

### ❌ NO Security Scoring
```python
# WRONG - We don't do this
def calculate_protocol_safety_score(protocol):
    score = analyze_code_quality(protocol.code)  # ❌ NO
    return score

# RIGHT - We show historical exploit data
def show_protocol_exploit_history(protocol):
    past_exploits = query_confirmed_exploits(protocol)  # ✅ YES
    return past_exploits
```

### ❌ NO Exploit Prediction
```python
# WRONG - We don't do this
def predict_next_exploit(protocol):
    ml_model.predict(protocol.patterns)  # ❌ NO
    return predicted_exploit

# RIGHT - We show past patterns
def show_exploit_trends(exploit_type):
    historical_trend = query_past_exploits(exploit_type)  # ✅ YES
    return historical_trend
```

## Integration Points

### Input: ExploitData from Kamiyo
```python
# Comes from Kamiyo's aggregation system
ExploitData(
    tx_hash="0x...",           # Confirmed on blockchain
    protocol="Protocol Name",   # From external source
    chain="Ethereum",           # From blockchain
    loss_amount_usd=1000000,   # Calculated from on-chain data
    exploit_type="Flash Loan",  # Categorized by Kamiyo
    timestamp=datetime(...),    # Blockchain timestamp
    source="Rekt News",         # Attribution to source
    source_url="https://..."    # Verification link
)
```

### Output: Formatted Reports
```python
# Ready for social media posting
{
    'twitter_thread': ['tweet1', 'tweet2', 'tweet3'],
    'reddit_post': 'markdown_formatted_post',
    'discord_embed': {'title': '...', 'fields': [...]},
    'raw_report': ExploitReport(...)
}
```

### Works With: PostGenerator
```python
# Existing social/post_generator.py
from social.post_generator import PostGenerator
from social.analysis import ReportGenerator

# Analysis provides depth
analysis = ReportGenerator().analyze_exploit(exploit)

# Post generator provides platform templates
posts = PostGenerator().generate_post(exploit, platforms)

# Combine for best results
enhanced_content = merge_analysis_with_templates(analysis, posts)
```

## Testing

```bash
# Run example
python social/analysis/report_generator.py

# Output:
# Exploit Report Generator - Example Output
# ================================================================================
#
# 1. ANALYZING EXPLOIT...
# Report ID: report-a1b2c3d4e5f6
# Generated at: 2025-10-14 12:34:56 UTC
# Format: long
#
# 2. EXECUTIVE SUMMARY
# 🔴 CRITICAL - Uniswap V3 on Ethereum has been exploited...
# ...
```

## Performance Considerations

- **Report Generation**: < 100ms (without DB queries)
- **Historical Queries**: < 500ms (with indexed DB)
- **Twitter Thread**: 4-6 tweets typical
- **Reddit Post**: 1000-3000 words typical
- **Discord Embed**: Single rich embed

## Future Enhancements

### Planned (Stays within CLAUDE.md boundaries)
- ✅ More data sources (CertiK, Chainalysis)
- ✅ Multi-language support
- ✅ Custom report templates
- ✅ Video/image generation
- ✅ Automated posting workflows

### NOT Planned (Violates CLAUDE.md)
- ❌ Code vulnerability scanning
- ❌ Security risk scoring
- ❌ Exploit prediction models
- ❌ Smart contract analysis
- ❌ Automated security advice

## Dependencies

```python
# Core
from social.models import ExploitData, Platform
from datetime import datetime, timedelta
import uuid

# No external security analysis libraries
# No ML/AI prediction models
# No code analysis tools
```

## Support

For questions about:
- **Report generation**: See examples above
- **Platform formatting**: Check `formatters.py`
- **Historical data**: Check `historical_context.py`
- **Integration**: Check existing `post_generator.py`

## License

Part of Kamiyo Intelligence Platform - Exploit Intelligence Aggregator
