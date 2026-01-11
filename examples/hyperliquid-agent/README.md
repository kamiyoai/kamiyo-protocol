# KAMIYO × Hyperliquid AI Agent Demo

AI copy trading with stake-backed trust guarantees.

## Quick Start

```bash
pnpm install
pnpm demo
```

## What This Demonstrates

1. **Agent Registration** - AI agent stakes HYPE as collateral
2. **Copy Position** - User deposits with performance guarantee
3. **Live Trading** - Agent executes trades, positions update
4. **Trust Guarantees** - Automatic refunds if guarantee breached
5. **ZK Reputation** - Agent proves track record without revealing strategy

## Scripts

- `pnpm demo` - Run the full demo walkthrough
- `pnpm agent` - Run the live trading agent
- `pnpm dashboard` - Run the real-time dashboard

## Architecture

```
User Deposit → KamiyoVault (escrow)
                    ↓
              AI Agent trades
                    ↓
         Position value updates
                    ↓
    Close position OR file dispute
                    ↓
         Funds returned to user
    (+ agent stake if guarantee breached)
```

## Trust Mechanics

| Component | Purpose |
|-----------|---------|
| Agent Stake | Collateral at risk (min 100 HYPE) |
| Min Return Guarantee | Max loss user accepts (-50% to +100%) |
| Lock Period | Time funds are locked (1-365 days) |
| Dispute Window | Time to dispute after close (7 days) |
| Slash Percent | Agent stake lost on dispute (10%) |

## Contracts

- `AgentRegistry` - Agent registration, staking, reputation
- `KamiyoVault` - Copy positions, escrow, disputes

## Environment

```bash
PRIVATE_KEY=your_private_key
RPC_URL=https://rpc.hyperliquid-testnet.xyz/evm
```
