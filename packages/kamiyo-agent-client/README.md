# @kamiyo/mitama-agent-client

Autonomous agent SDK for Mitama payment and quality verification.

Enables AI agents to transact end-to-end without human intervention with built-in quality guarantees and automatic dispute resolution.

## Installation

```bash
npm install @kamiyo/mitama-agent-client
```

## Quick Start

```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AutonomousServiceAgent } from '@kamiyo/mitama-agent-client';

const agent = new AutonomousServiceAgent({
  keypair: agentKeypair,
  connection: new Connection('https://api.devnet.solana.com'),
  programId: new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n'),
  qualityThreshold: 85,
  maxPrice: 0.001,
  autoDispute: true
});

const result = await agent.consumeAPI(
  'http://api.example.com/data',
  { query: 'latest exploits' },
  { exploit_id: '', protocol: '', amount_usd: 0 }
);

console.log(`Quality: ${result.quality}%`);
console.log(`Cost: ${result.cost} SOL`);
console.log(`Disputed: ${result.disputed}`);
```

## Features

### Autonomous Operation

Agent handles entire payment flow without human intervention:

1. Price negotiation
2. Escrow creation
3. Service consumption
4. Quality assessment
5. Dispute filing
6. Refund collection

### Quality Assessment

Multi-factor scoring:
- Completeness (40%): All expected fields present
- Accuracy (30%): Data matches ground truth
- Freshness (30%): Data age within acceptable limits

### Automatic Disputes

If quality < threshold:
- Agent files dispute automatically
- Provides structured evidence
- Waits for oracle resolution
- Collects refund based on quality score

## Configuration

```typescript
interface AgentConfig {
  keypair: Keypair;           // Agent's Solana keypair
  connection: Connection;     // Solana RPC connection
  programId: PublicKey;       // Escrow program ID
  qualityThreshold: number;   // Minimum acceptable quality (0-100)
  maxPrice: number;           // Maximum SOL per transaction
  autoDispute: boolean;       // Automatically file disputes
}
```

## Use Cases

### Security Intelligence Agent

```typescript
const securityAgent = new AutonomousServiceAgent({
  qualityThreshold: 90,
  maxPrice: 0.001,
  autoDispute: true
});

const exploits = await securityAgent.consumeAPI(
  'https://api.kamiyo.ai/mitama/exploits/latest',
  { chain: 'ethereum', severity: 'critical' },
  {
    exploit_id: '',
    protocol: '',
    chain: '',
    amount_lost_usd: 0,
    timestamp: '',
    tx_hash: ''
  }
);
```

### Protocol Risk Assessment Agent

```typescript
const riskAgent = new AutonomousServiceAgent({
  qualityThreshold: 95,
  maxPrice: 0.005,
  autoDispute: true
});

const assessment = await riskAgent.consumeAPI(
  'https://api.kamiyo.ai/mitama/protocol/assess-risk',
  { protocol_address: '0x...', chain: 'ethereum' },
  {
    risk_score: 0,
    risk_level: '',
    analysis: {},
    recommendations: []
  }
);
```

## Response Format

```typescript
interface ConsumeResult<T> {
  data: T;              // Received data
  quality: number;      // Quality score (0-100)
  cost: number;         // Actual cost in SOL
  disputed: boolean;    // Whether dispute was filed
}
```

## Error Handling

```typescript
try {
  const result = await agent.consumeAPI(endpoint, query, schema);
} catch (error) {
  if (error.message.includes('exceeds max')) {
    // Price too high
  } else if (error.message.includes('failed')) {
    // Service unavailable
  }
}
```

## Examples

See `/examples/autonomous-agent-demo/` for complete implementation.

## Integration with Mitama

Agent automatically integrates with Mitama dispute resolution:

1. Payment via Solana escrow
2. Quality verification on response
3. Dispute filing if quality < threshold
4. Oracle assessment and resolution
5. Sliding-scale refund based on quality

## License

MIT
