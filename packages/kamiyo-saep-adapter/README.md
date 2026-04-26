# @kamiyo/saep-adapter

Read/sim adapter for the [SAEP task-market](https://github.com/SolanaAEP/saep)
on Solana. Use this package to:

- Fetch a SAEP `TaskContract` by PDA or `(client, task_nonce)`.
- Decode it into a typed `SaepTaskSnapshot`.
- Normalize it into a KAMIYO-owned `SaepWorkRef` (the canonical
  `externalWorkRef.venue = "saep"` payload).
- Validate it against an `UnderwritingPolicy` (allowed mint, status,
  deadline window, agent identity, snapshot freshness).
- Compute a deterministic `riskHash` for Kizuna decisions.

This package **never** signs SAEP transactions. The
[`BOUNDARY.md`](./BOUNDARY.md) document is the load-bearing contract
between KAMIYO and SAEP — read it before reaching for code that does more
than read state.

> **Status:** Alpha. Surface is W1+W2 from the six-week SAEP-adapter
> sprint. The facilitator routes (`/kizuna/adapters/saep/*`) and the
> settlement-ingest path land in W3 and W4.

## Install

This package is internal to `kamiyo-protocol`; depend on it via the
workspace:

```jsonc
// in another package's package.json
{
  "dependencies": {
    "@kamiyo/saep-adapter": "workspace:*"
  }
}
```

## Quickstart

```ts
import { Connection, PublicKey } from '@solana/web3.js';
import {
  SaepReader,
  normalizeSnapshot,
  validateForUnderwriting,
} from '@kamiyo/saep-adapter';
import { RpcPool } from '@kamiyo/sdk';

const pool = RpcPool.fromEnv('mainnet-beta');
await pool.init();
const reader = new SaepReader({
  connection: pool.getConnection(),
  cluster: 'mainnet-beta',
  programIds: { taskMarket: SAEP_TASK_MARKET_PROGRAM_ID },
  expectedDiscriminator: SAEP_TASK_CONTRACT_DISCRIMINATOR,
});

const taskPda = new PublicKey('SomeSaepTaskPda1111111111111111111111111111');
const snapshot = await reader.fetchTaskByPda(taskPda);

validateForUnderwriting(
  snapshot,
  { nowSec: Math.floor(Date.now() / 1000) },
  {
    allowedPaymentMints: [USDC_MINT],
    minSecondsToDeadline: 60,
    maxSecondsToDeadline: 30 * 24 * 3600,
  },
);

const workRef = normalizeSnapshot(snapshot);
// workRef.venue === 'saep'
// workRef.riskHash is stable across reads of the same on-chain state
```

## Public surface

| Module | Exports |
| --- | --- |
| `decoder` | `decodeTaskContract`, `DecoderConfig`, `PLACEHOLDER_TASK_CONTRACT_DISCRIMINATOR` |
| `errors` | `SaepAdapterError`, `SaepAdapterErrorCode` |
| `normalize` | `normalizeSnapshot`, `statusString` |
| `pda` | `deriveTaskPda`, `deriveTaskEscrowPda`, `deriveMarketGlobalPda`, `SaepProgramIds`, `DEFAULT_SAEP_TASK_MARKET_PROGRAM_ID_MAINNET` |
| `reader` | `SaepReader`, `ReaderConfig` |
| `risk-hash` | `computeRiskHash`, `risksMatch`, `RISK_HASH_FIELDS` |
| `status` | `SaepTaskStatus`, `parseSaepTaskStatus`, `isActive`, `isTerminal`, `ACTIVE_STATUSES`, `TERMINAL_STATUSES` |
| `types` | `SaepTaskSnapshot`, `SaepWorkRef`, `ExternalWorkRef`, `SaepTaskStatusString`, `SaepFundingMode`, `SolanaCluster` |
| `validate` | `validateForUnderwriting`, `validatedWorkRef`, `UnderwritingPolicy`, `UnderwritingContext` |

## Tests

```bash
pnpm --filter @kamiyo/saep-adapter test
```

The mainnet read-only smoke (gated, opt-in):

```bash
SAEP_SMOKE_ENABLED=1 SAEP_SMOKE_RPC_URL=... SAEP_SMOKE_TASK_PDA=... \
  pnpm --filter @kamiyo/saep-adapter test:smoke
```

The smoke test never modifies on-chain state and never signs anything.

## Caveats

- The `TaskContract` Anchor discriminator and the on-chain field order are
  pinned to the SAEP spec at the time this adapter was cut. Production
  callers should pass the discriminator explicitly via `DecoderConfig`. If
  the SAEP team rebuilds the program, the discriminator changes — see
  [`BOUNDARY.md`](./BOUNDARY.md).
- The `TaskPayload` discriminated union (the spec's "free-form description
  replacement") is intentionally **not** decoded. KAMIYO underwriting does
  not need its contents, and its shape is upstream-extensible.
- v1 supports the crypto-fast funding lane only. Enterprise prefund
  follows in a later sprint.

## License

MIT. See the repo root `LICENSE`.
