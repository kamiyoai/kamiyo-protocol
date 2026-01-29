# @kamiyo/agents

KAMIYO agent SDK built on Claude Agent SDK. Direct integration with the KAMIYO protocol for autonomous agent payments, escrow, and reputation.

## Philosophy

> "Don't bother with any framework but Claude SDK or Codex SDK"

This package provides a thin wrapper around the Claude Agent SDK with KAMIYO protocol tools. No intermediate frameworks.

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

## Why Not ElizaOS/LangChain/etc?

Frameworks add complexity without proportional value. Claude SDK provides:

- Native tool calling
- Multi-turn conversations
- Extended thinking
- Direct control

KAMIYO protocol tools work the same whether you use this package or call Claude SDK directly. This package just bundles the common patterns.

## License

MIT
