# Advanced Trading Bot with x402 Quality Guarantees

Sophisticated trading bot demonstrating complex multi-phase reasoning with quality-guaranteed data feeds.

## Key Features

### 4-Phase Decision Making

1. **Multi-Source Data Gathering**
   - Queries 3+ data sources in parallel
   - Real-time quality assessment
   - Automatic dispute filing for poor data
   - x402 sliding-scale refunds

2. **Quality-Weighted Consensus**
   - Weights data by quality scores
   - Filters low-quality sources
   - Builds consensus from 80%+ quality data
   - Sentiment analysis across sources

3. **Risk-Adjusted Decisions**
   - Composite risk scoring
   - Portfolio exposure limits
   - Market volatility adjustment
   - Quality-based position sizing

4. **Cost-Benefit Validation**
   - ROI analysis for data purchases
   - Expected profit vs data cost
   - x402 refund impact calculation
   - Negative ROI protection

## Complex Reasoning Demonstrated

### Quality-Weighted Consensus
```
Source A: 95% quality → 0.475 weight
Source B: 85% quality → 0.425 weight
Source C: 60% quality → Filtered out (disputed)

Consensus Price = (Price_A × 0.475) + (Price_B × 0.425)
```

### Risk Scoring Algorithm
```
Risk Score = 100 - (
  dataQuality × 40% +
  confidence × 40% +
  (1 - portfolioExposure) × 10% +
  (1 - marketVolatility) × 10%
)
```

### Position Sizing
```
Max Position = Portfolio × 30%
Risk-Adjusted Size = Max Position × (1 - Risk Score / 100)

Example:
Portfolio: 1.0 SOL
Risk Score: 25/100
Position: 1.0 × 0.3 × 0.75 = 0.225 SOL
```

## Example Output

```
======================================================================
ADVANCED TRADING BOT - x402 Quality-Guaranteed Data Feeds
======================================================================

Symbol: SOL/USDC
Portfolio: 1.0000 SOL
Min Data Quality: 80%
Max Data Cost: 0.001 SOL/source

======================================================================
MARKET ANALYSIS FOR SOL/USDC
======================================================================

[Phase 1] Multi-Source Data Gathering
----------------------------------------------------------------------

  → Querying: High-Frequency Oracle
    Expected Quality: 95%
    Max Cost: 0.0005 SOL
    ✓ Received data
    Quality Score: 97/100
    Actual Cost: 0.0005 SOL

  → Querying: Aggregated DEX Data
    Expected Quality: 85%
    Max Cost: 0.0003 SOL
    ✓ Received data
    Quality Score: 88/100
    Actual Cost: 0.0003 SOL

  → Querying: Community Sentiment
    Expected Quality: 70%
    Max Cost: 0.0002 SOL
    ✓ Received data
    Quality Score: 73/100
    ⚠ Quality below threshold - Dispute filed
    Refund: 27%

[Phase 2] Quality-Weighted Consensus Building
----------------------------------------------------------------------

  Quality-Weighted Consensus:
    Price: $102.45
    Sentiment: 78%
    Average Data Quality: 93%
    Sources Used: 2/3

  Signal: BUY (72% confidence)
    - Strong bullish sentiment (78%)
    - High data quality (93%)
    - Consensus from 2 sources

[Phase 3] Risk-Adjusted Decision Making
----------------------------------------------------------------------

  Risk Assessment:
    Data Quality Risk: 7%
    Confidence Risk: 28%
    Portfolio Exposure: 30%
    Market Volatility: 15%
    Composite Risk Score: 23/100

  Decision: EXECUTE
  Position Size: 0.2310 SOL

[Phase 4] Cost-Benefit Analysis
----------------------------------------------------------------------

  Financial Analysis:
    Data Investment: 0.000946 SOL
    Expected Profit: 0.004620 SOL
    Net Profit: 0.003674 SOL
    ROI: 388%

  Dispute Refunds:
    Disputed Sources: 1
    Refund Amount: 0.000054 SOL
    Effective Data Cost: 0.000892 SOL

  ✓ Positive cost-benefit ratio

======================================================================
FINAL DECISION
======================================================================

Action: EXECUTE TRADE
Amount: 0.2310 SOL
Risk Score: 23/100
Data Investment: 0.000946 SOL

Reasoning:
  1. Strong bullish sentiment (78%)
  2. High data quality (93%)
  3. Consensus from 2 sources
  4. Low risk score (23) - Execute
  5. Favorable ROI (388%)
  6. x402 quality refunds: 0.000054 SOL

======================================================================
KEY INSIGHTS
======================================================================

x402 Quality Advantages:
  - Automatic refunds for low-quality data
  - Quality-weighted consensus building
  - Cost-benefit validation
  - Risk-adjusted position sizing
  - Multi-source verification

Traditional Trading Bot Issues Solved:
  ✓ No refunds for bad data → x402 sliding-scale refunds
  ✓ Trust single source → Multi-source quality weighting
  ✓ Fixed data costs → Cost-benefit optimization
  ✓ No quality assurance → Automatic dispute filing
  ✓ Blind execution → Risk-adjusted decision making
```

## Running the Example

```bash
# Install dependencies
npm install

# Run the bot
npm start
```

## Integration with x402Resolve

This bot uses x402Resolve for:

1. **Quality-Guaranteed Data**
   - Creates escrow for each data source
   - Assesses quality on receipt
   - Files disputes automatically
   - Receives sliding-scale refunds

2. **Cost Optimization**
   - Only pays for quality data
   - Refunds for poor quality
   - ROI validation before trading

3. **Risk Management**
   - Quality scores inform risk calculations
   - Poor data filtered from decisions
   - Multi-source verification

## Key Innovations

- **4-phase reasoning pipeline** (gather → consensus → risk → validate)
- **Quality-weighted voting** instead of simple averaging
- **Automatic cost-benefit analysis** factoring in x402 refunds
- **Risk-adjusted position sizing** based on data quality
- **ROI protection** prevents trading when data costs too high

## Comparison to Traditional Bots

| Feature | Traditional Bot | x402 Trading Bot |
|---------|----------------|------------------|
| Bad data handling | No recourse | Auto refund |
| Data quality | Unknown | Scored 0-100 |
| Cost management | Fixed | Refund-adjusted |
| Risk calculation | Price only | Quality-weighted |
| Decision making | Single source | Multi-source consensus |

## License

MIT
