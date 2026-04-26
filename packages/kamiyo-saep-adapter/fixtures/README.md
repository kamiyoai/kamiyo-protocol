# Fixtures

JSON-serialized representations of `SaepTaskSnapshot` shapes the adapter
expects to decode. Used as:

- Documentation for what each status looks like as a snapshot.
- Reference for cross-language clients consuming the same wire format.
- Test data in higher-level KAMIYO services that mock SAEP reads.

The byte-level Borsh fixtures are constructed in-test by
`packages/kamiyo-saep-adapter/src/decoder.test.ts`'s `buildAccountBytes`
helper rather than committed as binary blobs — this keeps fixture changes
visible in diffs and lets tests vary fields freely.

## Files

| File | Snapshot shape |
| --- | --- |
| `task-funded.json` | Newly-funded task; escrow loaded; agent eligible to submit. |
| `task-proof-submitted.json` | Agent submitted proof; awaiting verifier. |
| `task-verified-pre-window.json` | Verifier passed; dispute window still open; not yet releasable. |
| `task-verified-post-window.json` | Verifier passed; dispute window closed; release-eligible. |
| `task-released.json` | Terminal; funds settled to agent. |
| `task-expired.json` | Terminal; deadline passed; client refunded. |
| `task-disputed.json` | Client raised dispute within window; M2 arbitration pending. |
| `market-global.json` | Singleton MarketGlobal account fields (informational). |

## Pubkey conventions

Every fixture uses placeholder pubkeys deliberately constructed to be
recognizable in test output and unmistakable for any real on-chain account:

- `TaskPda1111111111111111111111111111111111111` — task PDA
- `Client111111111111111111111111111111111111` — client wallet
- `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` — USDC mainnet mint
- `Mint22222222222222222222222222222222222222` — non-USDC test mint

32-byte ids (`task_id`, `agent_did`, `task_hash`, etc.) use lowercase hex of
recognizable byte runs (`aa…`, `bb…`, `cc…`).

Timestamps are the canonical test epoch base `1_700_000_000` plus offsets,
not real wall-clock values.
