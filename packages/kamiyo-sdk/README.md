# @kamiyo/sdk

TypeScript SDK for KAMIYO - Agent Identity and Conflict Resolution Protocol on Solana.

## Installation

```bash
npm install @kamiyo/sdk
```

## Usage

```typescript
import { KamiyoClient, AgentType } from '@kamiyo/sdk';
import { Connection, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const keypair = Keypair.generate();
const wallet = new Wallet(keypair);

const client = new KamiyoClient({ connection, wallet });

// Create agent with 0.5 SOL stake
const signature = await client.createAgent({
  name: 'TradingBot',
  agentType: AgentType.Trading,
  stakeAmount: new BN(500_000_000)
});

// Fetch agent
const [agentPDA] = client.getAgentPDA(wallet.publicKey);
const agent = await client.getAgent(agentPDA);

// Create escrow agreement
await client.createAgreement({
  provider: providerPubkey,
  amount: new BN(100_000_000),
  timeLockSeconds: 86400,
  transactionId: 'order-123'
});

// Release funds on success
await client.releaseFunds('order-123', providerPubkey);

// Or dispute for arbitration
await client.markDisputed('order-123');
```

## API

### KamiyoClient

```typescript
constructor(config: {
  connection: Connection;
  wallet: Wallet;
  programId?: PublicKey;
})
```

### Agent Operations

```typescript
createAgent(params: CreateAgentParams): Promise<string>
getAgent(pda: PublicKey): Promise<AgentIdentity | null>
getAgentPDA(owner: PublicKey): [PublicKey, number]
updateAgent(params: UpdateAgentParams): Promise<string>
deactivateAgent(): Promise<string>
```

### Agreement Operations

```typescript
createAgreement(params: CreateAgreementParams): Promise<string>
getAgreement(pda: PublicKey): Promise<Agreement | null>
getAgreementPDA(agent: PublicKey, txId: string): [PublicKey, number]
releaseFunds(txId: string, provider: PublicKey): Promise<string>
markDisputed(txId: string): Promise<string>
```

### Oracle Operations

```typescript
submitOracleVote(params: OracleVoteParams): Promise<string>
getOracleRegistry(): Promise<OracleRegistry | null>
```

## Types

```typescript
enum AgentType {
  Trading = 0,
  DataProvider = 1,
  Validator = 2,
  Aggregator = 3,
  Custom = 4
}

enum AgreementStatus {
  Active = 0,
  Released = 1,
  Disputed = 2,
  Resolved = 3,
  Expired = 4
}

interface CreateAgentParams {
  name: string;
  agentType: AgentType;
  stakeAmount: BN;
}

interface CreateAgreementParams {
  provider: PublicKey;
  amount: BN;
  timeLockSeconds: number;
  transactionId: string;
  tokenMint?: PublicKey;
}
```

## Program Addresses

| Network | Program ID |
|---------|------------|
| Mainnet | `8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM` |
| Devnet | `8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM` |

## License

MIT
