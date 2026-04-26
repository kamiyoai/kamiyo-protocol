# @kamiyo/saep-cli

Operator CLI for the KAMIYO SAEP adapter. Wraps `@kamiyo/saep-adapter` for
direct SAEP reads, and the `/kizuna/adapters/saep/*` facilitator routes for
underwrite / settlement-ingest / reservation lookups.

## Install

From the repo root:

```bash
pnpm -r build
node packages/kamiyo-saep-cli/dist/cli.js --help
```

## Commands

```
kamiyo-saep read <taskPda>                 # decode + print SAEP TaskContract
kamiyo-saep underwrite <taskPda>           # POST /kizuna/adapters/saep/underwrite
kamiyo-saep reservation <id>               # GET  /kizuna/adapters/saep/reservations/:id
kamiyo-saep settle <reservationId>         # POST /kizuna/adapters/saep/settlement-ingest
```

## Environment

| Variable                   | Used by             | Notes                                                      |
| -------------------------- | ------------------- | ---------------------------------------------------------- |
| `SAEP_TASK_MARKET_PROGRAM_ID` | `read`           | Required — base58 program id.                              |
| `SAEP_RPC_URL_DEVNET`      | `read --cluster devnet` | Required for devnet reads.                              |
| `SOLANA_RPC_URL`           | `read --cluster mainnet-beta` | Required for mainnet reads.                       |
| `KAMIYO_FACILITATOR_URL`   | `underwrite`, `reservation`, `settle` | Default `http://localhost:3000`.    |
| `KAMIYO_INTERNAL_TOKEN`    | `underwrite`, `reservation`, `settle` | Bearer token for internal-auth.    |

A `.env` is loaded automatically from the working directory.
