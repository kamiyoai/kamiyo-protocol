# @kamiyo/agents

Claude Agent SDK wrapper with KAMIYO protocol tools and OriginTrail DKG integration.

## Installation

```bash
pnpm add @kamiyo/agents
```

## Usage

```typescript
import { createKamiyoAgent, createKamiyoTools } from '@kamiyo/agents';
import { KamiyoClient } from '@kamiyo/sdk';

const kamiyoClient = new KamiyoClient({ connection, wallet });

const agent = createKamiyoAgent({
  name: 'my-agent',
  apiKey: process.env.ANTHROPIC_API_KEY,
  systemPrompt: 'You are an autonomous agent that can create escrows and handle payments.',
  tools: createKamiyoTools({
    sdk: {
      createEscrow: (params) => kamiyoClient.initializeEscrow(params),
      releaseEscrow: (id) => kamiyoClient.releaseEscrow(id),
      fileDispute: (id, reason) => kamiyoClient.markDisputed(id, reason),
      getReputation: (entity) => kamiyoClient.getReputation(entity),
      getEscrow: (id) => kamiyoClient.getEscrow(id),
    },
  }),
});

const result = await agent.run('Create an escrow for 1 SOL with provider abc...');
console.log(result.finalResponse);
```

## Tools

### Escrow Tools

| Tool | Description |
|------|-------------|
| `create_escrow` | Create payment escrow for service agreements |
| `release_escrow` | Release funds after service delivery |
| `file_dispute` | File dispute for unsatisfactory service |
| `get_reputation` | Query on-chain reputation scores |
| `get_escrow` | Get escrow account details |

### Settlement Tools (x402)

For agents using x402 paid APIs:

```typescript
import { createKamiyoAgent, createSettlementTools } from '@kamiyo/agents';
import { SettlementClient } from '@kamiyo/settlement';

const settlement = new SettlementClient({ connection, wallet });

const agent = createKamiyoAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  tools: createSettlementTools({ client: settlement }),
});

// Agent can now autonomously request refunds for SLA violations
await agent.run('The API call timed out after 30 seconds. Request a settlement.');
```

| Tool | Description |
|------|-------------|
| `request_settlement` | Request refund for SLA violation (latency, timeout, errors) |
| `check_settlement` | Check status of a settlement request |
| `respond_settlement` | Accept or contest a settlement (for providers) |

### DKG Tools (OriginTrail)

For agents consuming trust data from the Decentralized Knowledge Graph:

```typescript
import { createKamiyoAgent, createDKGTools } from '@kamiyo/agents';
import DKG from 'dkg.js';

const dkg = new DKG({
  endpoint: 'https://dkg-positron-gateway.origintrail.io',
  blockchain: 'base:8453',
});

const agent = createKamiyoAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  systemPrompt: 'You verify provider reputation before making payments.',
  tools: createDKGTools({ dkg }),
});

// Agent can query trust data before transacting
await agent.run('Check the quality score for provider 0x7f3a...');
```

| Tool | Description |
|------|-------------|
| `query_provider_quality` | Get quality attestations and average rating for a provider |
| `query_trusted_entities` | Find entities trusted by a source via trust edges |
| `verify_hub_entity` | Verify a stake-backed hub (oracle, provider, aggregator) |
| `get_knowledge_asset` | Retrieve a Knowledge Asset by UAL |
| `query_dispute_history` | Get dispute outcomes involving an agent |
| `find_verified_hubs` | Find verified hub entities by stake and type |

## Custom Tools

Add your own tools:

```typescript
agent.addTool({
  name: 'search_web',
  description: 'Search the web for information',
  parameters: {
    query: { type: 'string', description: 'Search query', required: true },
  },
  handler: async (params) => {
    const results = await searchWeb(params.query);
    return { success: true, data: results };
  },
});
```

## License

MIT
