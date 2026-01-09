# @kamiyo/langchain

LangChain tools for KAMIYO Protocol. Enables LLM agents to create escrow payments, release funds, and file disputes on Solana.

## Installation

```bash
npm install @kamiyo/langchain @kamiyo/sdk @langchain/core @solana/web3.js
```

## Quick Start

```typescript
import { createKamiyoTools } from '@kamiyo/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const keypair = Keypair.fromSecretKey(/* your key */);

const wallet = {
  publicKey: keypair.publicKey,
  signTransaction: async (tx) => { tx.sign(keypair); return tx; },
  signAllTransactions: async (txs) => { txs.forEach(t => t.sign(keypair)); return txs; },
};

const tools = createKamiyoTools({ connection, wallet });

const llm = new ChatOpenAI({ model: 'gpt-4' });
const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
const executor = AgentExecutor.fromAgentAndTools({ agent, tools });

await executor.invoke({
  input: "Create a 0.1 SOL agreement with provider ABC123 for order-456"
});
```

## Tools

### kamiyo_create_agreement

Creates a payment escrow with a provider. Funds are locked until released or disputed.

**Parameters:**
- `provider` - Provider's Solana wallet address (base58)
- `amount` - Amount in SOL
- `timeLockSeconds` - Lock duration before provider can claim
- `transactionId` - Unique ID for this transaction

**Returns:**
```json
{
  "success": true,
  "signature": "5xYz...",
  "agreementAddress": "E7xK...",
  "transactionId": "order-456",
  "amount": 0.1,
  "provider": "ABC123..."
}
```

### kamiyo_release_funds

Releases escrowed funds to provider after successful delivery.

**Parameters:**
- `transactionId` - Transaction ID of the agreement
- `provider` - Provider's wallet address

**Returns:**
```json
{
  "success": true,
  "signature": "3aB...",
  "transactionId": "order-456",
  "action": "released"
}
```

### kamiyo_dispute_agreement

Marks agreement as disputed for oracle arbitration. Oracles vote on quality and determine settlement.

**Parameters:**
- `transactionId` - Transaction ID to dispute

**Returns:**
```json
{
  "success": true,
  "signature": "7cD...",
  "transactionId": "order-456",
  "action": "disputed",
  "nextStep": "Oracles will evaluate and provide quality scores"
}
```

### kamiyo_get_agreement_status

Checks current status of an agreement.

**Parameters:**
- `transactionId` - Transaction ID to check

**Returns:**
```json
{
  "success": true,
  "address": "E7xK...",
  "agent": "8xYz...",
  "api": "ABC123...",
  "amount": 0.1,
  "status": "active",
  "createdAt": 1704067200,
  "expiresAt": 1704153600
}
```

### kamiyo_get_balance

Returns wallet SOL balance.

**Returns:**
```json
{
  "success": true,
  "balance": 1.5,
  "address": "8xYz..."
}
```

## Environment Setup

```typescript
import { createKamiyoToolsFromEnv } from '@kamiyo/langchain';

// Reads RPC_URL from env, defaults to devnet
const tools = createKamiyoToolsFromEnv(secretKeyBytes);
```

Environment variables:
- `RPC_URL` - Solana RPC endpoint (default: devnet)

## Dispute Resolution

When an agreement is disputed, oracles vote on quality (0-100%). Settlement is proportional:

| Quality | Agent Refund | Provider Payment |
|---------|--------------|------------------|
| 80-100% | 0% | 100% |
| 65-79% | 35% | 65% |
| 50-64% | 75% | 25% |
| 0-49% | 100% | 0% |

## Example: Payment Agent

```typescript
const systemPrompt = `You are a payment agent. When asked to pay for services:
1. Check your balance with kamiyo_get_balance
2. Create an agreement with kamiyo_create_agreement
3. After service delivery, release with kamiyo_release_funds
4. If service was poor, dispute with kamiyo_dispute_agreement`;

const tools = createKamiyoTools({ connection, wallet });
const agent = await createOpenAIToolsAgent({
  llm: new ChatOpenAI({ model: 'gpt-4' }),
  tools,
  prompt: ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}'],
  ]),
});

const executor = AgentExecutor.fromAgentAndTools({ agent, tools });

// Agent handles the full payment flow
await executor.invoke({
  input: "Pay 0.05 SOL to provider XYZ for data-request-789"
});
```

## License

MIT
