# End-to-end escrow flow

This flow composes identity, agreement, quality scoring, and dispute handling.

```typescript
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import {
  KamiyoClient,
  AgentManager,
  AgreementManager,
  QualityOracle,
  createServiceSpec,
  AgentType,
} from "@kamiyo/sdk";

async function run() {
  const connection = new Connection(process.env.SOLANA_RPC_URL!);
  const keypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.AGENT_SECRET_KEY_JSON!)));
  const wallet = new Wallet(keypair);

  const client = new KamiyoClient({ connection, wallet });
  const agents = new AgentManager(client);
  const agreements = new AgreementManager(client);
  const oracle = new QualityOracle(connection, wallet);

  // 1) Ensure agent identity exists and is active.
  const mine = await agents.getMine();
  if (!mine) {
    await agents.create("escrow-orchestrator", AgentType.Trading, 1);
  }

  // 2) Create escrow agreement.
  const provider = new PublicKey(process.env.PROVIDER_PUBKEY!);
  const txId = agreements.generateTransactionId();
  await agreements.create(provider, 0.25, 24, txId);

  // 3) Assess response quality.
  const spec = createServiceSpec({
    fields: {
      id: { type: "string", required: true },
      payload: { type: "object", required: true },
      timestamp: { type: "number", required: true },
    },
    maxResponseTime: 3000,
    maxDataAge: 300,
  });

  const report = oracle.assessQuality(
    {
      data: { id: "req-1", payload: { ok: true }, timestamp: Date.now() / 1000 },
      responseTimeMs: 420,
      dataTimestamp: Math.floor(Date.now() / 1000),
      provider,
    },
    spec
  );

  // 4) Resolve: release on high quality, dispute on low quality.
  if (report.overallScore >= 70) {
    await agreements.releaseFunds(txId, provider);
  } else {
    await agreements.dispute(txId);
  }
}
```

Notes:

- Replace the placeholder secret-key loading with your own wallet loading utility.
- If you dispute, follow commit/reveal/finalization with `EscrowDisputeManager` in an oracle worker.
