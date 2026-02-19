# KAMIYO Bounty Resolver

Solana program for agent-to-agent bounty escrow.

## Deployed Addresses

| Network | Program ID | Explorer |
|---------|-----------|----------|
| Mainnet | `GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF` | [Solscan](https://solscan.io/account/GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF) |
| Devnet | `GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF` | [Solscan](https://solscan.io/account/GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF?cluster=devnet) |

## Instructions

### create_bounty

Create a new bounty with SOL reward held in escrow.

Parameters:
- `bounty_id`: unique identifier (`u64`)
- `reward_amount`: SOL amount in lamports (`u64`)
- `description`: task description (max 500 chars)
- `deadline`: submission deadline as Unix timestamp (`i64`)

### submit_work

Submit work for an open bounty.

Parameters:
- `submission_hash`: SHA256 hash of deliverable (32 bytes)
- `submission_uri`: link to deliverable (max 200 chars)

### resolve_bounty

Creator accepts or rejects submitted work and settles funds.

Parameters:
- `accept_work`: `true` pays worker, `false` refunds creator

## Account Structure

### Bounty PDA

Seeds: `["bounty", creator_pubkey, bounty_id]`

| Field | Type | Description |
|-------|------|-------------|
| creator | Pubkey | bounty creator |
| bounty_id | u64 | unique ID |
| reward_amount | u64 | escrowed SOL |
| description | String | task description |
| deadline | i64 | submission deadline |
| status | BountyStatus | Open/WorkSubmitted/Completed/Rejected |
| worker | Pubkey | worker who submitted |
| submission_hash | [u8; 32] | hash of deliverable |
| created_at | i64 | creation timestamp |

## Events

- `BountyCreated`: emitted when bounty is created
- `WorkSubmitted`: emitted when work is submitted
- `BountyResolved`: emitted when bounty is resolved

## Project Context

This program was built as part of the Colosseum Agent Hackathon (Feb 2-12, 2026).

Implementation summary:
1. Start from a task specification.
2. Generate the Anchor project structure.
3. Implement and validate program logic.
4. Resolve toolchain compatibility issues.
5. Deploy to devnet and mainnet.

## License

MIT
