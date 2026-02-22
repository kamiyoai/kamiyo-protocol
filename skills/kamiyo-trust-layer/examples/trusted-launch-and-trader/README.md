# Trusted launch and trusted trader flow

This flow composes Fundry launch records and Elfa trader sessions with KAMIYO trust primitives.

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { KamiyoClient, FundryManager, ElfaManager } from "@kamiyo/sdk";

async function run() {
  const connection = new Connection(process.env.SOLANA_RPC_URL!);
  const keypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.AGENT_SECRET_KEY_JSON!)));
  const wallet = new Wallet(keypair);

  const client = new KamiyoClient({ connection, wallet });

  // 1) Ensure agent exists before any trusted launch/trader flow.
  const [agentPda] = client.getAgentPDA(wallet.publicKey);
  const agent = await client.getAgent(agentPda);
  if (!agent?.isActive) {
    throw new Error("active agent identity required");
  }

  // 2) Launch token with Fundry + on-chain LaunchRecord.
  const fundry = new FundryManager({
    connection,
    wallet,
    fundryMcpEndpoint: process.env.FUNDRY_MCP_ENDPOINT,
  });

  const launch = await fundry.secureLaunch({
    name: "Trust Token",
    ticker: "TRST",
    description: "Trust-layer launch",
    imageUrl: "https://example.com/token.png",
    configType: "kamiyo",
    escrowAmountSol: 0.5,
    migrationTargetSol: 40,
  });

  if (!launch.success || !launch.mint) {
    throw new Error(`launch failed: ${launch.error}`);
  }

  // 3) Start trusted trader session and collateralized trade escrow.
  const elfa = new ElfaManager({
    connection,
    wallet,
    elfaMcpEndpoint: process.env.ELFA_MCP_ENDPOINT,
  });

  const trade = await elfa.secureTrade({
    signal: "long SOL with invalidation at previous daily low",
    collateralUsdc: 250,
    timeLock: 24 * 60 * 60,
  });

  if (!trade.success) {
    throw new Error(`trade failed: ${trade.error}`);
  }

  console.log({
    launchRecord: launch.launchRecordPda,
    fundryCoinId: launch.fundryCoinId,
    tradeEscrow: trade.tradeEscrowPda,
    traderSession: trade.sessionPda,
  });
}
```

Notes:

- Persist launch and session PDAs so retries are idempotent.
- Treat external MCP and on-chain record writes as separate recovery points.
