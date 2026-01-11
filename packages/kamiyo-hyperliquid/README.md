# @kamiyo/hyperliquid

TypeScript SDK for Kamiyo Protocol on Hyperliquid L1.

## Installation

```bash
npm install @kamiyo/hyperliquid ethers
```

## Configuration

### Environment Variables

Set contract addresses via environment variables:

```bash
# Testnet
KAMIYO_TESTNET_AGENT_REGISTRY=0x...
KAMIYO_TESTNET_VAULT=0x...
KAMIYO_TESTNET_REPUTATION_LIMITS=0x...

# Mainnet
KAMIYO_MAINNET_AGENT_REGISTRY=0x...
KAMIYO_MAINNET_VAULT=0x...
KAMIYO_MAINNET_REPUTATION_LIMITS=0x...
```

### Programmatic Configuration

```typescript
import { configure } from '@kamiyo/hyperliquid';

configure({
  testnet: {
    agentRegistry: '0x...',
    kamiyoVault: '0x...',
    reputationLimits: '0x...',
  },
});
```

## Usage

### Client Setup

```typescript
import { ethers } from 'ethers';
import { HyperliquidClient } from '@kamiyo/hyperliquid';

const provider = new ethers.JsonRpcProvider('https://rpc.hyperliquid-testnet.xyz/evm');
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const client = new HyperliquidClient({
  network: 'testnet',
  signer,
});
```

### Agent Registration

```typescript
// Register as an agent
const result = await client.registerAgent({
  name: 'my_trading_bot',
  stakeAmount: ethers.parseEther('100'),
});
console.log('Registered:', result.hash);

// Check registration
const agent = await client.getAgent(await signer.getAddress());
console.log('Agent:', agent.name, 'Stake:', agent.stake);
```

### Copy Trading Positions

```typescript
// Open a copy position
const position = await client.openPosition({
  agent: '0x...', // Agent address
  minReturnBps: 500, // 5% minimum return
  lockPeriodSeconds: 86400 * 7, // 7 days
  depositAmount: ethers.parseEther('1'),
});
console.log('Position ID:', position.positionId);

// Check position status
const status = await client.getPositionWithReturn(position.positionId);
console.log('Current return:', status.returnBps, 'bps');

// Close position (after lock period)
await client.closePosition(position.positionId);
```

### ZK Reputation Proofs

```typescript
import { ReputationProver } from '@kamiyo/hyperliquid';

const prover = new ReputationProver({
  wasmPath: './circuits/reputation_threshold.wasm',
  zkeyPath: './circuits/reputation_threshold.zkey',
});

// Generate proof for tier 3 (75+ score)
const { proof, commitment } = await prover.generateProof({
  score: 82,
  tier: 3,
});

// Submit proof to contract
await client.proveReputation({
  tier: 3,
  commitment,
  proofA: proof.proofA,
  proofB: proof.proofB,
  proofC: proof.proofC,
  pubInputs: proof.pubInputs,
});
```

### Exchange API

```typescript
import { HyperliquidExchange } from '@kamiyo/hyperliquid';

const exchange = new HyperliquidExchange({
  wallet: signer,
  network: 'testnet',
});
await exchange.init();

// Get market data
const mids = await exchange.getAllMids();
console.log('BTC mid:', mids['BTC']);

// Place market order
const order = await exchange.marketOrder('BTC', true, 0.01, 100);
console.log('Order:', order);

// Get account state
const state = await exchange.getAccountState();
console.log('Account value:', state.marginSummary.accountValue);
```

### Event Subscriptions

```typescript
import { EventListener } from '@kamiyo/hyperliquid';

const events = new EventListener(
  provider,
  config.contracts.agentRegistry,
  config.contracts.kamiyoVault
);

// Subscribe to position events
const sub = events.onPositionOpened((event) => {
  console.log('Position opened:', event.positionId, event.user);
});

// Query historical events
const history = await events.getPositionOpenedEvents({
  fromBlock: 1000000,
  user: '0x...',
});

// Cleanup
sub.unsubscribe();
events.unsubscribeAll();
```

### Logging

```typescript
import { enableConsoleLogging, setLogger } from '@kamiyo/hyperliquid';

// Enable console logging
enableConsoleLogging('kamiyo');

// Or provide custom logger
setLogger({
  debug: (msg, ...args) => console.debug(msg, ...args),
  info: (msg, ...args) => console.info(msg, ...args),
  warn: (msg, ...args) => console.warn(msg, ...args),
  error: (msg, ...args) => console.error(msg, ...args),
});
```

## API Reference

### HyperliquidClient

Core client for interacting with Kamiyo contracts.

| Method | Description |
|--------|-------------|
| `registerAgent(params)` | Register as a trading agent |
| `addStake(amount)` | Add stake to agent |
| `openPosition(params)` | Open copy trading position |
| `closePosition(positionId)` | Close position |
| `fileDispute(positionId)` | File dispute on position |
| `proveReputation(params)` | Submit ZK reputation proof |
| `getAgent(address)` | Get agent info |
| `getPosition(positionId)` | Get position info |
| `getTier(tier)` | Get tier configuration |

### HyperliquidExchange

Direct exchange API for order execution.

| Method | Description |
|--------|-------------|
| `marketOrder(coin, isBuy, size, slippage)` | Execute market order |
| `limitOrder(coin, isBuy, size, price, tif)` | Place limit order |
| `closePosition(coin)` | Close existing position |
| `cancelOrder(coin, oid)` | Cancel order |
| `getAccountState()` | Get account summary |
| `getAllMids()` | Get all mid prices |

### Configuration Functions

| Function | Description |
|----------|-------------|
| `configure(overrides)` | Set contract addresses |
| `getNetworkConfig(network)` | Get network config |
| `validateConfig(network)` | Validate configuration |
| `isNetworkConfigured(network)` | Check if configured |

## Error Handling

```typescript
import { KamiyoError, KamiyoErrorCode } from '@kamiyo/hyperliquid';

try {
  await client.openPosition(params);
} catch (error) {
  if (error instanceof KamiyoError) {
    switch (error.code) {
      case KamiyoErrorCode.AGENT_NOT_ACTIVE:
        console.error('Agent is not active');
        break;
      case KamiyoErrorCode.INSUFFICIENT_DEPOSIT:
        console.error('Deposit too small');
        break;
      default:
        console.error('Error:', error.message);
    }
  }
}
```

## Networks

| Network | Chain ID | RPC |
|---------|----------|-----|
| Mainnet | 999 | https://rpc.hyperliquid.xyz/evm |
| Testnet | 998 | https://rpc.hyperliquid-testnet.xyz/evm |

## License

MIT
