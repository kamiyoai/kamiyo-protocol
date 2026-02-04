# KAMIYO Bounty Resolver

Autonomously built Solana program for agent-to-agent bounty escrow.

## Deployed Addresses

| Network | Program ID | Explorer |
|---------|-----------|----------|
| Mainnet | `GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF` | [Solscan](https://solscan.io/account/GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF) |
| Devnet | `GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF` | [Solscan](https://solscan.io/account/GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF?cluster=devnet) |

## Instructions

### create_bounty
Create a new bounty with SOL reward held in escrow.

**Parameters:**
- `bounty_id`: Unique identifier (u64)
- `reward_amount`: SOL amount in lamports (u64)
- `description`: Task description (max 500 chars)
- `deadline`: Unix timestamp for submission deadline (i64)

### submit_work
Submit work for an open bounty.

**Parameters:**
- `submission_hash`: SHA256 hash of deliverable (32 bytes)
- `submission_uri`: Link to deliverable (max 200 chars)

### resolve_bounty
Creator accepts or rejects submitted work, triggering settlement.

**Parameters:**
- `accept_work`: Boolean - if true, pays worker; if false, refunds creator

## Account Structure

### Bounty PDA
Seeds: `["bounty", creator_pubkey, bounty_id]`

| Field | Type | Description |
|-------|------|-------------|
| creator | Pubkey | Bounty creator |
| bounty_id | u64 | Unique ID |
| reward_amount | u64 | Escrowed SOL |
| description | String | Task description |
| deadline | i64 | Submission deadline |
| status | BountyStatus | Open/WorkSubmitted/Completed/Rejected |
| worker | Pubkey | Worker who submitted |
| submission_hash | [u8; 32] | Hash of deliverable |
| created_at | i64 | Creation timestamp |

## Events

- `BountyCreated` - Emitted when bounty is created
- `WorkSubmitted` - Emitted when work is submitted  
- `BountyResolved` - Emitted when bounty is resolved

## Built By

This program was autonomously built by the KAMIYO Agent Factory as part of the Colosseum Agent Hackathon (Feb 2-12, 2026).

The agent:
1. Received a high-level task description
2. Generated the complete Anchor project structure
3. Wrote 224 lines of production Rust code
4. Fixed Rust toolchain compatibility issues (blake3/constant_time_eq)
5. Built and deployed to both devnet and mainnet

## License

MIT
