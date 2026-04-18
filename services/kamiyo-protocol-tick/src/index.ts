import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { loadConfig } from './config.js';
import { loadKeypair } from './wallet.js';
import { generateTickSummary } from './research.js';
import { sweepExpiredEscrows, createAndSettleSelfEscrow } from './maintenance.js';

function log(level: string, message: string, ctx?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: 'protocol-tick',
      message,
      ...ctx,
    })
  );
}

async function tick(
  cfg: ReturnType<typeof loadConfig>,
  connection: Connection,
  wallet: Wallet,
  tickNumber: number
) {
  log('info', 'tick start', { tickNumber, dryRun: cfg.DRY_RUN });

  const balance = await connection.getBalance(wallet.publicKey);
  const solBalance = balance / LAMPORTS_PER_SOL;
  log('info', 'wallet balance', { address: wallet.publicKey.toBase58(), solBalance });

  if (solBalance < 0.005 && !cfg.DRY_RUN) {
    log('error', 'insufficient SOL for on-chain tx', { solBalance });
    return;
  }

  // Fetch recent signatures for context
  let last24h: string[] = [];
  try {
    const recentSigs = await connection.getSignaturesForAddress(wallet.publicKey, { limit: 20 });
    last24h = recentSigs
      .filter(s => s.blockTime && s.blockTime > Date.now() / 1000 - 86400)
      .map(s => s.signature);
  } catch (err) {
    log('warn', 'failed to fetch recent signatures (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Phase 1: Sweep stale escrows
  try {
    const sweepResult = await sweepExpiredEscrows({ connection, wallet, cfg });
    if (sweepResult.swept > 0) {
      log('info', 'swept expired escrows', { swept: sweepResult.swept });
    }
  } catch (err) {
    log('warn', 'sweep failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Phase 2: Research mission — LLM summary → self-escrow settlement
  let summary: string;
  try {
    summary = await generateTickSummary(cfg, {
      tickNumber,
      walletAddress: wallet.publicKey.toBase58(),
      solBalance,
      recentSignatures: last24h,
    });
    log('info', 'research summary generated', { length: summary.length });
  } catch (err) {
    log('warn', 'LLM summary failed, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    summary = `Tick #${tickNumber}: protocol heartbeat. Balance: ${solBalance.toFixed(4)} SOL. ${last24h.length} recent tx.`;
  }

  // Phase 3: Create + settle self-escrow (on-chain receipt of research work)
  try {
    const result = await createAndSettleSelfEscrow({ connection, wallet, cfg, summary });
    if (result) {
      log('info', 'tick complete — on-chain receipt recorded', {
        tickNumber,
        escrowPda: result.escrowPda,
        createSig: result.createSig,
        settleSig: result.settleSig,
      });
    } else {
      log('info', 'tick complete (dry-run)', { tickNumber });
    }
  } catch (err) {
    log('error', 'self-escrow failed', {
      tickNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function main() {
  const cfg = loadConfig();
  const keypair = loadKeypair(cfg);
  const wallet = new Wallet(keypair);
  const connection = new Connection(cfg.SOLANA_RPC_URL, 'confirmed');

  log('info', 'protocol-tick starting', {
    wallet: wallet.publicKey.toBase58(),
    rpc: cfg.SOLANA_RPC_URL,
    model: cfg.LLM_MODEL,
    interval: cfg.TICK_INTERVAL_SECONDS,
    dryRun: cfg.DRY_RUN,
    runOnce: cfg.TICK_RUN_ONCE,
  });

  let tickNumber = 1;

  if (cfg.TICK_RUN_ONCE) {
    await tick(cfg, connection, wallet, tickNumber);
    return;
  }

  // Initial tick immediately
  await tick(cfg, connection, wallet, tickNumber++);

  // Loop
  const intervalMs = cfg.TICK_INTERVAL_SECONDS * 1000;
  const loop = setInterval(async () => {
    try {
      await tick(cfg, connection, wallet, tickNumber++);
    } catch (err) {
      log('error', 'tick crashed', {
        tickNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, intervalMs);

  const shutdown = (signal: string) => {
    log('info', `received ${signal}, shutting down`);
    clearInterval(loop);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  log('error', 'boot failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
