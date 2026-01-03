# @mitama/langchain

LangChain tools for Mitama Protocol - Agent Identity and Conflict Resolution on Solana.

## Installation

```bash
npm install @mitama/langchain @mitama/sdk @langchain/core
```

## Usage

```typescript
import { createMitamaTools } from '@mitama/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { Connection, Keypair } from '@solana/web3.js';

// Setup
const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = { publicKey: keypair.publicKey, signTransaction, signAllTransactions };

// Create tools
const tools = createMitamaTools({ connection, wallet });

// Use with LangChain agent
const llm = new ChatOpenAI({ model: 'gpt-4' });
const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
const executor = AgentExecutor.fromAgentAndTools({ agent, tools });

// Execute
const result = await executor.invoke({
  input: "Create a 0.1 SOL payment agreement with provider ABC for order-123"
});
```

## Available Tools

| Tool | Description |
|------|-------------|
| `mitama_create_agreement` | Create a payment escrow with a provider |
| `mitama_release_funds` | Release funds to provider on successful delivery |
| `mitama_dispute_agreement` | Dispute for oracle arbitration |
| `mitama_get_agreement_status` | Check agreement status and details |
| `mitama_get_balance` | Get wallet SOL balance |

## CrewAI Integration

```python
from crewai import Agent, Task, Crew
from crewai_tools import tool
import subprocess
import json

@tool("Create Mitama Agreement")
def create_agreement(provider: str, amount: float, transaction_id: str) -> str:
    """Create a payment agreement with a service provider."""
    # Call the Node.js tool via subprocess or use Solana Python SDK
    result = subprocess.run([
        'npx', 'ts-node', '-e',
        f'''
        const {{ createMitamaTools }} = require("@mitama/langchain");
        // ... implementation
        '''
    ], capture_output=True, text=True)
    return result.stdout

agent = Agent(
    role='Payment Manager',
    goal='Handle service payments securely',
    tools=[create_agreement]
)
```

## License

MIT
