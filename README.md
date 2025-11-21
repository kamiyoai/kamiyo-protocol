# Mitama

Open source autonomous agent framework for Solana.

## Overview

Mitama provides core abstractions and interfaces for building autonomous agents on Solana with PDA-based identities, reputation tracking, and strategy testing.

### Features

- PDA-based agent identities
- On-chain reputation system
- Strategy testing framework interfaces
- TypeScript SDK
- Clean, extensible architecture

## Installation

```bash
npm install @mitama/core @mitama/sdk
```

## Quick Start

```typescript
import { MitamaSDK, AgentType } from '@mitama/sdk';
import { Keypair } from '@solana/web3.js';

const wallet = Keypair.generate();
const sdk = new MitamaSDK({
  solanaRpc: 'https://api.devnet.solana.com',
  wallet
});

const agent = await sdk.createAgent(
  wallet.publicKey,
  'MyTradingBot',
  AgentType.Trading,
  1_000_000_000  // 1 SOL stake
);

console.log('Agent created:', agent.pda.toString());
```

## Package Structure

### @mitama/core

Core interfaces and type definitions for the Mitama framework:

- Agent identity types
- Reputation system interfaces
- Strategy execution interfaces
- Payment provider abstractions

### @mitama/sdk

TypeScript SDK for interacting with Mitama agents:

- Agent creation and management
- Reputation queries
- Strategy execution
- Provider implementations

## Documentation

- [Quick Start Guide](docs/QUICKSTART.md)
- [API Reference](docs/API.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Contributing Guidelines](CONTRIBUTING.md)

## Examples

See the `examples/` directory for complete working examples:

- Basic agent creation
- Strategy implementation
- Reputation tracking

## License

MIT License - see [LICENSE](LICENSE) for details.

## Enterprise Features

For production-ready infrastructure, AI integration, and commercial support:

**KAMIYO Platform** provides:
- Daydreams AI cognitive framework integration
- Production API and infrastructure
- Surfpool strategy validation on devnet fork
- MEV protection
- PostgreSQL + pgvector memory system
- Monitoring and observability
- Professional support and SLA

Visit [kamiyo.ai](https://kamiyo.ai) or contact license@kamiyo.ai

---

Built by [KAMIYO](https://kamiyo.ai)
