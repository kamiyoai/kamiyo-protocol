# KAMIYO Governance

Council-executed governance for $KAMIYO token holders.

## Overview

| Field | Value |
|-------|-------|
| Model | Council-executed (Phase 1) |
| Multisig | Squads v4 |
| Threshold | 2-of-N |
| Token | `Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump` |

## How It Works

1. **Propose** - Draft proposal in Discord #governance
2. **Discuss** - Community feedback (24-48h)
3. **Vote** - Token-weighted off-chain vote (3 days)
4. **Execute** - Council multisig executes if approved (60%+)

## Governable Parameters

| Parameter | Current | Description |
|-----------|---------|-------------|
| `escrow_fee_bps` | 10 (0.1%) | Escrow creation fee |
| `dispute_fee_bps` | 100 (1%) | Protocol dispute fee |
| `oracle_reward_bps` | 100 (1%) | Oracle reward pool |
| `agent_slash_bps` | 500 (5%) | Frivolous dispute penalty |
| `oracle_slash_bps` | 1000 (10%) | Oracle violation penalty |

## Proposal Templates

- [Parameter Change](templates/parameter-change.md)
- [Treasury Transfer](templates/treasury-transfer.md)
- [Signaling](templates/signaling.md)

## Scripts

```bash
# Dry run multisig setup
npx tsx scripts/setup-squads-governance.ts --dry-run

# Deploy multisig (requires council member pubkeys)
npx tsx scripts/setup-squads-governance.ts
```

## Roadmap

**Phase 1 (Current)**
- Squads multisig for council
- Off-chain token-weighted voting
- Council executes approved proposals

**Phase 2 (When Realms supports Token-2022)**
- Migrate to Realms DAO
- Full on-chain voting
- Automatic execution

## Links

- [Squads Multisig](https://v4.squads.so/squads/D1WJ2jf3psoUWFwNnRPCggaEthMYn26Qd3em4HucCQU3)
- [Full Governance Docs](../docs/governance.md)
- [Token on Solscan](https://solscan.io/token/Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump)
