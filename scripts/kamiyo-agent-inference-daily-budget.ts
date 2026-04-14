import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';
const DEFAULT_PROGRAM_ID = '3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr';

interface Config {
  rpcUrl: string;
  programId: PublicKey;
  idlPath?: string;
  budgetSol: number;
  reserveSol: number;
  escrowAmountSol: number;
  qualityThreshold: number;
  settleScore: number;
  timeLockSeconds: number;
  txPauseMs: number;
  maxCycles: number;
  live: boolean;
  operatorKeypairPath?: string;
  operatorPrivateKey?: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseInteger(value: string | undefined, fallback: number): number {
  return Math.floor(parseNumber(value, fallback));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

function lamportsFromSol(sol: number): BN {
  return new BN(Math.round(sol * 1_000_000_000));
}

function parsePrivateKey(raw: string): Keypair {
  const value = raw.trim();

  try {
    return Keypair.fromSecretKey(bs58.decode(value));
  } catch {
    // continue
  }

  try {
    return Keypair.fromSecretKey(Buffer.from(value, 'base64'));
  } catch {
    // continue
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('private key must be base58/base64 or a JSON array');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('private key must be base58/base64 or a JSON array');
  }

  return Keypair.fromSecretKey(new Uint8Array(parsed));
}

function readKeypairFromPath(filePath: string): Keypair {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) throw new Error(`keypair file not found: ${filePath}`);
  return parsePrivateKey(fs.readFileSync(resolved, 'utf8'));
}

function loadRequiredKeypair(params: {
  keypairPath?: string;
  privateKey?: string;
  fallbackPath?: string;
  label: string;
}): { keypair: Keypair; source: string } {
  if (params.keypairPath) {
    return { keypair: readKeypairFromPath(params.keypairPath), source: `${params.label}_KEYPAIR_PATH` };
  }

  if (params.privateKey) {
    return { keypair: parsePrivateKey(params.privateKey), source: `${params.label}_PRIVATE_KEY` };
  }

  if (params.fallbackPath && fs.existsSync(params.fallbackPath)) {
    return { keypair: readKeypairFromPath(params.fallbackPath), source: params.fallbackPath };
  }

  throw new Error(`missing keypair for ${params.label}`);
}

function readIdl(idlPath?: string): any {
  const candidates: string[] = [];
  if (idlPath) {
    const resolved = path.isAbsolute(idlPath) ? idlPath : path.resolve(process.cwd(), idlPath);
    candidates.push(resolved);
  }

  candidates.push(
    path.resolve(process.cwd(), 'services/api/src/mcp/idl/x402_escrow.json'),
    path.resolve(process.cwd(), 'target/idl/kamiyo.json'),
  );

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    return JSON.parse(fs.readFileSync(candidate, 'utf8'));
  }

  throw new Error('unable to locate IDL');
}

function deriveModelPda(programId: PublicKey, modelId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('model'), Buffer.from(modelId)], programId);
}

function deriveInferenceEscrowPda(programId: PublicKey, user: PublicKey, modelId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('inference_escrow'), user.toBuffer(), Buffer.from(modelId)], programId);
}

function createConfig(): Config {
  return {
    rpcUrl: process.env.SOLANA_RPC_URL?.trim() || DEFAULT_RPC_URL,
    programId: new PublicKey(process.env.KYO_DAILY_PROGRAM_ID?.trim() || DEFAULT_PROGRAM_ID),
    idlPath: process.env.KYO_DAILY_IDL_PATH?.trim(),
    budgetSol: Math.max(0.001, parseNumber(process.env.KYO_DAILY_BUDGET_SOL, 0.2)),
    reserveSol: Math.max(0, parseNumber(process.env.KYO_DAILY_RESERVE_SOL, 0.001)),
    escrowAmountSol: Math.max(0.001, parseNumber(process.env.KYO_DAILY_ESCROW_AMOUNT_SOL, 0.001)),
    qualityThreshold: Math.min(100, Math.max(0, parseInteger(process.env.KYO_DAILY_QUALITY_THRESHOLD, 50))),
    settleScore: Math.min(100, Math.max(0, parseInteger(process.env.KYO_DAILY_SETTLE_SCORE, 80))),
    timeLockSeconds: Math.max(300, parseInteger(process.env.KYO_DAILY_TIMELOCK_SECONDS, 3600)),
    txPauseMs: Math.max(0, parseInteger(process.env.KYO_DAILY_TX_PAUSE_MS, 100)),
    maxCycles: Math.max(1, parseInteger(process.env.KYO_DAILY_MAX_CYCLES, 10000)),
    live: parseBoolean(process.env.KYO_DAILY_LIVE, true),
    operatorKeypairPath: process.env.KAMIYO_OPERATOR_KEYPAIR_PATH?.trim(),
    operatorPrivateKey: process.env.KAMIYO_OPERATOR_PRIVATE_KEY?.trim(),
  };
}

function log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    service: 'kamiyo-agent-inference-daily-budget',
    message,
    ...(context ? { context } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function isInsufficientFundsError(error: unknown): boolean {
  const text = String(error ?? '').toLowerCase();
  return (
    text.includes('insufficient funds') ||
    text.includes('attempt to debit an account') ||
    text.includes('custom program error: 0x1')
  );
}

async function main(): Promise<void> {
  const cfg = createConfig();
  const operatorFallback = process.env.HOME ? path.join(process.env.HOME, '.config/solana/id.json') : undefined;
  const operator = loadRequiredKeypair({
    keypairPath: cfg.operatorKeypairPath,
    privateKey: cfg.operatorPrivateKey,
    fallbackPath: operatorFallback,
    label: 'KAMIYO_OPERATOR',
  });

  log('info', 'daily_inference_budget_config', {
    live: cfg.live,
    rpcUrl: cfg.rpcUrl,
    programId: cfg.programId.toBase58(),
    budgetSol: cfg.budgetSol,
    reserveSol: cfg.reserveSol,
    escrowAmountSol: cfg.escrowAmountSol,
    maxCycles: cfg.maxCycles,
    operatorSource: operator.source,
    operator: operator.keypair.publicKey.toBase58(),
  });

  if (!cfg.live) {
    log('warn', 'dry_run_only_enable_live_to_execute', { envVar: 'KYO_DAILY_LIVE=true' });
    return;
  }

  const connection = new Connection(cfg.rpcUrl, 'confirmed');
  await connection.getLatestBlockhash('confirmed');

  const wallet = new Wallet(operator.keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  const program = new Program(readIdl(cfg.idlPath), provider);

  const budgetLamports = Math.round(cfg.budgetSol * 1_000_000_000);
  const reserveLamports = Math.round(cfg.reserveSol * 1_000_000_000);
  const startBalance = await connection.getBalance(operator.keypair.publicKey, 'confirmed');

  let completed = 0;
  let failed = 0;
  let stopReason = 'budget_reached';
  let lastError: string | null = null;

  for (let i = 0; i < cfg.maxCycles; i += 1) {
    const currentBalance = await connection.getBalance(operator.keypair.publicKey, 'confirmed');
    const spentLamports = startBalance - currentBalance;

    if (spentLamports >= budgetLamports) {
      stopReason = 'budget_reached';
      break;
    }

    if (currentBalance <= reserveLamports) {
      stopReason = 'reserve_reached';
      break;
    }

    const modelId = crypto.randomBytes(32);
    const [model] = deriveModelPda(cfg.programId, modelId);
    const [escrow] = deriveInferenceEscrowPda(cfg.programId, operator.keypair.publicKey, modelId);

    try {
      await program.methods
        .registerModel(Array.from(modelId))
        .accounts({
          model,
          owner: operator.keypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([operator.keypair])
        .rpc();

      await program.methods
        .createInferenceEscrow(
          Array.from(modelId),
          lamportsFromSol(cfg.escrowAmountSol),
          cfg.qualityThreshold,
          new BN(cfg.timeLockSeconds),
        )
        .accounts({
          escrow,
          model,
          user: operator.keypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([operator.keypair])
        .rpc();

      await program.methods
        .settleInference(cfg.settleScore)
        .accounts({
          escrow,
          model,
          user: operator.keypair.publicKey,
          modelOwner: operator.keypair.publicKey,
          caller: operator.keypair.publicKey,
        })
        .signers([operator.keypair])
        .rpc();

      completed += 1;
      if (completed % 10 === 0) {
        const bal = await connection.getBalance(operator.keypair.publicKey, 'confirmed');
        log('info', 'daily_inference_budget_progress', {
          completed,
          failed,
          balanceLamports: bal,
          spentLamports: startBalance - bal,
        });
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      if (isInsufficientFundsError(error)) {
        stopReason = 'insufficient_funds';
        break;
      }
      log('warn', 'daily_inference_cycle_failed', {
        index: i,
        error: message,
      });
    }

    await sleep(cfg.txPauseMs);
  }

  const endBalance = await connection.getBalance(operator.keypair.publicKey, 'confirmed');
  const spentLamports = startBalance - endBalance;

  log('info', 'daily_inference_budget_complete', {
    completed,
    failed,
    stopReason,
    budgetLamports,
    startBalance,
    endBalance,
    spentLamports,
    lastError,
  });

  if (failed > 0 && completed === 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  log('error', 'daily_inference_budget_fatal', { error: message });
  process.exit(1);
});
