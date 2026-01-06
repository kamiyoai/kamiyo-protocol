# @kamiyo/switchboard

Switchboard On-Demand function for quality scoring in dispute resolution.

## Overview

Computes quality scores for API responses during Kamiyo disputes. Deployed as a Switchboard function that oracles execute to assess data quality.

**Scoring weights:**
- Semantic similarity: 40% (query vs response relevance)
- Completeness: 40% (expected fields and record count)
- Freshness: 20% (data recency)

## Installation

```bash
npm install @kamiyo/switchboard
```

## Usage

```typescript
import qualityScorer from '@kamiyo/switchboard';

const result = await qualityScorer({
  originalQuery: 'list all DeFi exploits from 2024',
  dataReceived: {
    exploits: [
      { protocol: 'Example', amount: 1000000, date: '2024-01-15' }
    ]
  },
  expectedCriteria: ['protocol', 'amount', 'date'],
  expectedRecordCount: 10
});

console.log(result.quality_score);      // 0-100
console.log(result.refund_percentage);  // 0-100
console.log(result.breakdown);          // { semantic, completeness, freshness }
```

## Refund Calculation

| Quality Score | Refund |
|---------------|--------|
| 80-100 | 0% |
| 50-79 | Sliding scale |
| 0-49 | 100% |

## Switchboard Deployment

```bash
# Build function
npm run build

# Deploy to Switchboard
sb function create --name kamiyo-quality \
  --container your-registry/kamiyo-quality:latest
```

## Development

```bash
npm run build
npm test
```

## License

MIT
