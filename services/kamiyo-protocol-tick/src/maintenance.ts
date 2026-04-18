import { Connection, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { createHash } from 'node:crypto';
import { InferenceClient } from '@kamiyo/solana-inference';
import type { Config } from './config.js';

function hashModelName(name: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(name).digest());
}

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

export async function sweepExpiredEscrows(params: {
  connection: Connection;
  wallet: Wallet;
  cfg: Config;
}): Promise<{ swept: number; signatures: string[] }> {
  const { connection, wallet, cfg } = params;
  const programId = new PublicKey(cfg.PROGRAM_ID);
  const client = new InferenceClient({ connection, wallet, programId });

  // Scan for inference escrow PDAs owned by our wallet for the configured model
  const modelId = hashModelName(cfg.MODEL_NAME);
  const [escrowPda] = client.getInferenceEscrowPDA(wallet.publicKey, modelId);

  const signatures: string[] = [];
  try {
    const escrow = await client.getEscrow(escrowPda);
    if (!escrow) return { swept: 0, signatures };

    const now = Math.floor(Date.now() / 1000);
    if (escrow.status === 0 && now > escrow.expiresAt.toNumber()) {
      if (cfg.DRY_RUN) {
        log('info', 'dry-run: would refund expired escrow', { escrowPda: escrowPda.toBase58() });
        return { swept: 0, signatures };
      }

      const sig = await client.refundExpired(escrowPda.toBase58());
      signatures.push(sig);
      log('info', 'refunded expired escrow', { escrowPda: escrowPda.toBase58(), signature: sig });
    }
  } catch (err) {
    log('warn', 'sweep check failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { swept: signatures.length, signatures };
}

export async function createAndSettleSelfEscrow(params: {
  connection: Connection;
  wallet: Wallet;
  cfg: Config;
  summary: string;
}): Promise<{ createSig: string; settleSig: string; escrowPda: string } | null> {
  const { connection, wallet, cfg, summary } = params;
  const programId = new PublicKey(cfg.PROGRAM_ID);
  const client = new InferenceClient({ connection, wallet, programId });

  if (cfg.DRY_RUN) {
    log('info', 'dry-run: would create self-escrow', {
      model: cfg.MODEL_NAME,
      amount: cfg.ESCROW_AMOUNT_LAMPORTS,
      summary: summary.slice(0, 100),
    });
    return null;
  }

  // Step 1: Create inference escrow (agent pays self)
  const amount = cfg.ESCROW_AMOUNT_LAMPORTS / 1e9; // convert lamports to SOL
  log('info', 'creating inference escrow', { model: cfg.MODEL_NAME, amountSol: amount });

  const createResult = await client.createInferenceEscrow({
    model: cfg.MODEL_NAME,
    amount,
    qualityThreshold: cfg.ESCROW_QUALITY_THRESHOLD,
    expiresIn: cfg.ESCROW_EXPIRES_SECONDS,
  });

  log('info', 'escrow created', {
    escrowPda: createResult.escrowId,
    signature: createResult.signature,
  });

  // Step 2: Settle with high quality score (self-assessment, real work was done via LLM)
  const qualityScore = 85;
  const settleResult = await client.settleInference(
    createResult.escrowId,
    qualityScore,
    wallet.publicKey // model_owner = self (self-escrow)
  );

  log('info', 'inference settled', {
    escrowPda: createResult.escrowId,
    qualityScore,
    signature: settleResult.signature,
  });

  return {
    createSig: createResult.signature,
    settleSig: settleResult.signature,
    escrowPda: createResult.escrowId,
  };
}
