# Guide to Testing the KAMIYO Protocol

This guide is for developers already comfortable with core Web3 concepts (wallets, transactions, smart contracts on Ethereum or Solana) but who may not have deep experience with zero-knowledge proofs or Solana-specific tooling. It walks through testing the KAMIYO Protocol end to end: local setup, running the test suite, and interacting with the protocol on localnet and devnet.

KAMIYO is a trust layer on Solana for autonomous agents (AI systems acting on-chain). It combines stake-backed identities, escrowed payments, and a dispute resolution system where oracles vote privately using zk-proofs.

Expect setup and first successful test run to take roughly 1-2 hours on macOS or Linux. Windows users need WSL or minor adjustments.

## Conceptual Overview

**Agents**: On-chain identities backed by staked SOL. The stake functions as economic collateral to discourage malicious behavior.

**Agreements**: Escrow contracts that lock funds (SOL, USDC, etc.) while a service is performed. Funds are released based on outcome.

**Disputes**: If execution quality is contested, oracles submit private votes (0-100%) using a commit-reveal flow backed by zk-proofs.

- Commitments: Halo2
- Verification: Groth16
- Resolution: Median score determines fund distribution

**Reputation**: On-chain trust scores derived from historical outcomes.

The repository is split across Rust (Solana program + zk tooling), TypeScript (SDK and tests), and Circom (zk circuits). Most interaction happens through Anchor and the TypeScript SDK.

## Prerequisites

- Node.js (LTS, 20.x+)
- Rust (1.70+)
- Anchor CLI (0.31.1)
- Solana CLI (3.0.13+)
- Git

Install the wasm32 target for Rust:

```bash
rustup target add wasm32-unknown-unknown
```

## Clone the Repository

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol.git
cd kamiyo-protocol
```

## Install Dependencies and Build

```bash
npm install
anchor build
```

## Run the Test Suite

```bash
anchor test
```

This command automatically:
- Starts a local Solana test validator
- Deploys the program
- Runs all tests
- Shuts down the validator

Expected output: 19 passing tests covering agent identity, escrow agreements, disputes, oracle registry, and SPL token support.

## Build and Use the SDK

Build all packages:

```bash
npm run build --workspaces
```

Or build the SDK individually:

```bash
cd packages/kamiyo-sdk
npm run build
```

### Create an Agent

```typescript
import { KamiyoClient, AgentType } from '@kamiyo/sdk';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';

const connection = new Connection('http://localhost:8899'); // localnet
const keypair = Keypair.generate();
const wallet = new Wallet(keypair);

const client = new KamiyoClient({ connection, wallet });

// Create agent with 0.5 SOL stake
const signature = await client.createAgent({
  name: 'TradingBot',
  agentType: AgentType.Trading,
  stakeAmount: new BN(0.5 * LAMPORTS_PER_SOL)
});

// Fetch agent data
const agent = await client.getAgentByOwner(wallet.publicKey);
console.log('Agent:', agent?.name, 'Reputation:', agent?.reputation.toString());
```

### Create an Escrow Agreement

```typescript
await client.createAgreement({
  provider: providerPubkey,
  amount: new BN(0.1 * LAMPORTS_PER_SOL),
  timeLockSeconds: new BN(86400), // 1 day
  transactionId: 'order-123'
});
```

### Release or Dispute

```typescript
// Happy path - release funds to provider
await client.releaseFunds('order-123', providerPubkey);

// Or mark as disputed for oracle resolution
await client.markDisputed('order-123');
```

### Deactivate Agent

```typescript
// Close agent PDA, recover stake + rent
await client.deactivateAgent();
```

## Available Packages

| Package | Description |
|---------|-------------|
| @kamiyo/sdk | Core TypeScript client |
| @kamiyo/x402-client | x402 payment client with escrow protection and SLA enforcement |
| @kamiyo/actions | Plug-and-play actions for agent payments, disputes, resolution |
| @kamiyo/langchain | LangChain tools integration |
| @kamiyo/middleware | HTTP 402 Payment Required middleware |
| @kamiyo/agent-client | Autonomous agent SDK with auto-dispute logic |
| @kamiyo/mcp-server | MCP server for Claude and LLM-based agents |
| @kamiyo/eliza | Trust layer plugin for ElizaOS agents |
| @kamiyo/blinks | Solana Actions (Blinks) for escrow protocol |
| @kamiyo/monad | Monad parallel execution adapter |
| @kamiyo/hyperliquid | Copy trading integration for Hyperliquid |
| @kamiyo/surfpool | Strategy simulation and pre-flight validation |
| @kamiyo/switchboard-function | Switchboard On-Demand function for quality scoring |
| @kamiyo/helius-adapter | Helius RPC adapter with webhooks and priority fees |

Each package has its own README with usage examples.

## Deploy and Test on Devnet

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
anchor deploy
```

## Troubleshooting

- Check Rust and Anchor versions match requirements
- Ensure wallets are funded on devnet before deploying
- Refer to ARCHITECTURE.md, DEPLOYMENT.md, and ORACLE_SETUP.md for deeper context
