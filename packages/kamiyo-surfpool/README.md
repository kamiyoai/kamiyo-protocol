# @kamiyo/surfpool

Surfpool integration for Kamiyo - Strategy simulation and pre-flight validation on Solana.

## Overview

Test agent strategies and validate Kamiyo operations in a simulated environment before committing real funds on mainnet.

**Features:**

- **Strategy Simulation** - Execute and benchmark trading strategies
- **Pre-flight Validation** - Validate escrows, agents, disputes before execution
- **Time Travel** - Test across different blockchain states
- **Fork Support** - Clone mainnet/devnet state for realistic testing
- **Stress Testing** - Run strategies under varying conditions

## Installation

```bash
npm install @kamiyo/surfpool
```

## Quick Start

### Strategy Simulation

```typescript
import { SurfpoolClient, StrategySimulator } from '@kamiyo/surfpool';
import { Keypair } from '@solana/web3.js';

const surfpool = new SurfpoolClient({
  endpoint: 'https://your-surfpool-endpoint.com',
});

const simulator = new StrategySimulator(surfpool);

// Define a strategy
const myStrategy = {
  name: 'arbitrage-v1',
  buildTransactions: async (context) => {
    // Build your strategy transactions
    return [tx1, tx2, tx3];
  },
  validateResults: (result) => {
    return result.pnl > 0 && result.success;
  },
};

// Run simulation
const result = await simulator.runStrategy(myStrategy, agentKeypair, {
  initialBalanceSol: 10,
  cloneAccounts: [USDC_MINT, RAYDIUM_AMM],
});

console.log(`PnL: ${result.pnl / 1e9} SOL`);
console.log(`Gas: ${result.gasUsed} CU`);
console.log(`Success: ${result.success}`);
```

### Pre-flight Validation

```typescript
import { SurfpoolClient, PreflightValidator } from '@kamiyo/surfpool';
import { BN } from '@coral-xyz/anchor';

const surfpool = new SurfpoolClient({ endpoint: SURFPOOL_URL });
const validator = new PreflightValidator(surfpool, MITAMA_PROGRAM_ID);

// Validate escrow before creation
const validation = await validator.validateEscrowCreation({
  agent: agentPubkey,
  provider: providerPubkey,
  amount: new BN(1_000_000_000), // 1 SOL
  timeLockSeconds: new BN(86400), // 24 hours
  transactionId: 'order-123',
}, agentKeypair);

if (!validation.valid) {
  console.error('Pre-flight failed:', validation.error);
  console.warn('Warnings:', validation.warnings);
} else {
  console.log('Estimated cost:', validation.estimatedCost);
  // Proceed with actual transaction
}
```

### Time Travel Testing

```typescript
// Create fork from mainnet
await surfpool.createFork({
  sourceCluster: 'mainnet-beta',
  prefetchAccounts: [USDC_MINT, MY_TOKEN_ACCOUNT],
});

// Set test balance
await surfpool.setBalanceSol(agentPubkey, 100);

// Execute strategy
const result1 = await simulator.runStrategy(strategy, keypair);

// Advance 1 hour
await surfpool.advanceTime(3600);

// Execute again to test time-dependent behavior
const result2 = await simulator.runStrategy(strategy, keypair);
```

### Strategy Optimization

```typescript
// Test strategy with different parameters
const { bestParams, bestResult } = await simulator.optimizeStrategy(
  myStrategy,
  agentKeypair,
  {
    slippage: [0.5, 1.0, 2.0],
    maxPositionSize: [1, 5, 10],
  }
);

console.log('Best parameters:', bestParams);
console.log('Best PnL:', bestResult.pnl);
```

### Stress Testing

```typescript
const stressResults = await simulator.stressTest(myStrategy, agentKeypair, {
  iterations: 100,
  varyBalance: { min: 1, max: 100 },
  varySlots: { min: 0, max: 1000 },
});

console.log(`Success rate: ${stressResults.successRate}%`);
console.log(`Avg PnL: ${stressResults.avgPnl}`);
console.log(`Worst case: ${stressResults.worstCase.pnl}`);
```

## API Reference

### SurfpoolClient

| Method | Description |
|--------|-------------|
| `setBalance(account, lamports)` | Set account balance |
| `setBalanceSol(account, sol)` | Set balance in SOL |
| `warpToSlot(slot)` | Jump to specific slot |
| `advanceSlots(n)` | Advance by N slots |
| `advanceTime(seconds)` | Advance by time duration |
| `createFork(config)` | Fork from mainnet/devnet |
| `reset()` | Reset simulation state |
| `snapshot()` | Create state snapshot |
| `restore(id)` | Restore to snapshot |
| `cloneAccount(pubkey)` | Clone account from mainnet |
| `simulateTransaction(tx)` | Simulate without state change |
| `executeTransaction(tx)` | Execute with state change |

### StrategySimulator

| Method | Description |
|--------|-------------|
| `runStrategy(strategy, keypair, config)` | Execute strategy simulation |
| `compareStrategies(strategies, keypair)` | Compare multiple strategies |
| `optimizeStrategy(strategy, keypair, params)` | Find optimal parameters |
| `stressTest(strategy, keypair, config)` | Run stress test iterations |

### PreflightValidator

| Method | Description |
|--------|-------------|
| `validateAgentCreation(params)` | Validate agent creation |
| `validateEscrowCreation(params)` | Validate escrow creation |
| `validateDispute(params)` | Validate dispute marking |
| `validateRelease(params)` | Validate fund release |
| `validateFullFlow(agent, escrow)` | Validate complete flow |

## Surfpool Setup

### Local Development

```bash
# Install Surfpool CLI
cargo install surfpool

# Start local Surfpool instance
surfpool start --fork mainnet-beta
```

### Cloud Endpoints

Contact [Txtx](https://txtx.dev) for cloud Surfpool access.

## License

MIT
