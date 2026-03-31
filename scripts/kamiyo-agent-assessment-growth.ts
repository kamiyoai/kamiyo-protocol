import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';
const DEFAULT_PROGRAM_ID = '3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr';
const DEFAULT_STATE_PATH = 'output/kamiyo-agent/assessment-growth-state.json';

type RunMode = 'auto' | 'bootstrap' | 'daily';

interface Config {
  rpcUrl: string;
  programId: PublicKey;
  idlPath?: string;
  statePath: string;
  mode: RunMode;
  live: boolean;
  bootstrapTarget: number;
  dailyBase: number;
  dailyGrowthRate: number;
  dailyRandomMin: number;
  dailyRandomMax: number;
  dailyMax: number;
  escrowAmountSol: number;
  timeLockSeconds: number;
  qualityMin: number;
  qualityMax: number;
  txPauseMs: number;
  maxCyclesPerRun: number;
  operatorKeypairPath?: string;
  operatorPrivateKey?: string;
  oracleKeypairPath?: string;
  oraclePrivateKey?: string;
  providerPublicKey?: string;
}

interface GrowthState {
  version: 1;
  createdAt: string;
  updatedAt: string;
  totalCyclesCompleted: number;
  bootstrapCyclesCompleted: number;
  bootstrapCompletedAt: string | null;
  dailyRunsCompleted: number;
  lastDailyRunDateUtc: string | null;
  lastDailyTarget: number | null;
  lastRunMode: 'bootstrap' | 'daily' | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunRequested: number;
  lastRunCompleted: number;
  lastRunFailed: number;
}

interface RunPlan {
  phase: 'bootstrap' | 'daily';
  requestedCycles: number;
  skippedReason?: string;
}

interface CycleResult {
  transactionId: string;
  qualityScore: number;
  refundPercentage: number;
  initializeSignature: string;
  disputeSignature: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
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

function parseMode(value: string | undefined): RunMode {
  if (value === 'bootstrap' || value === 'daily' || value === 'auto') return value;
  return 'auto';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomIntInclusive(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function utcDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
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
  if (!fs.existsSync(resolved)) {
    throw new Error(`keypair file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  return parsePrivateKey(raw);
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

  throw new Error(
    'unable to locate IDL: set KYO_ASSESS_IDL_PATH or provide services/api/src/mcp/idl/x402_escrow.json',
  );
}

function loadState(statePath: string): GrowthState {
  if (!fs.existsSync(statePath)) {
    const now = new Date().toISOString();
    return {
      version: 1,
      createdAt: now,
      updatedAt: now,
      totalCyclesCompleted: 0,
      bootstrapCyclesCompleted: 0,
      bootstrapCompletedAt: null,
      dailyRunsCompleted: 0,
      lastDailyRunDateUtc: null,
      lastDailyTarget: null,
      lastRunMode: null,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastRunRequested: 0,
      lastRunCompleted: 0,
      lastRunFailed: 0,
    };
  }

  const raw = fs.readFileSync(statePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<GrowthState>;

  return {
    version: 1,
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    totalCyclesCompleted: parsed.totalCyclesCompleted ?? 0,
    bootstrapCyclesCompleted: parsed.bootstrapCyclesCompleted ?? 0,
    bootstrapCompletedAt: parsed.bootstrapCompletedAt ?? null,
    dailyRunsCompleted: parsed.dailyRunsCompleted ?? 0,
    lastDailyRunDateUtc: parsed.lastDailyRunDateUtc ?? null,
    lastDailyTarget: parsed.lastDailyTarget ?? null,
    lastRunMode: parsed.lastRunMode ?? null,
    lastRunStartedAt: parsed.lastRunStartedAt ?? null,
    lastRunFinishedAt: parsed.lastRunFinishedAt ?? null,
    lastRunRequested: parsed.lastRunRequested ?? 0,
    lastRunCompleted: parsed.lastRunCompleted ?? 0,
    lastRunFailed: parsed.lastRunFailed ?? 0,
  };
}

function saveState(statePath: string, state: GrowthState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function computeDailyTarget(state: GrowthState, cfg: Config): number {
  const dayIndex = state.dailyRunsCompleted;
  const growthMultiplier = Math.pow(1 + cfg.dailyGrowthRate, dayIndex);
  const noise = randomBetween(cfg.dailyRandomMin, cfg.dailyRandomMax);
  const raw = cfg.dailyBase * growthMultiplier * noise;
  return clamp(Math.max(1, Math.round(raw)), 1, cfg.dailyMax);
}

function planRun(state: GrowthState, cfg: Config): RunPlan {
  const bootstrapRemaining = Math.max(0, cfg.bootstrapTarget - state.bootstrapCyclesCompleted);

  if (cfg.mode === 'bootstrap') {
    return {
      phase: 'bootstrap',
      requestedCycles: Math.min(cfg.maxCyclesPerRun, bootstrapRemaining),
    };
  }

  if (cfg.mode === 'daily') {
    const today = utcDateKey();
    if (state.lastDailyRunDateUtc === today) {
      return {
        phase: 'daily',
        requestedCycles: 0,
        skippedReason: `daily run already completed for ${today}`,
      };
    }

    return {
      phase: 'daily',
      requestedCycles: Math.min(cfg.maxCyclesPerRun, computeDailyTarget(state, cfg)),
    };
  }

  if (bootstrapRemaining > 0) {
    return {
      phase: 'bootstrap',
      requestedCycles: Math.min(cfg.maxCyclesPerRun, bootstrapRemaining),
    };
  }

  const today = utcDateKey();
  if (state.lastDailyRunDateUtc === today) {
    return {
      phase: 'daily',
      requestedCycles: 0,
      skippedReason: `daily run already completed for ${today}`,
    };
  }

  return {
    phase: 'daily',
    requestedCycles: Math.min(cfg.maxCyclesPerRun, computeDailyTarget(state, cfg)),
  };
}

function createConfig(): Config {
  const bootstrapTarget = Math.max(1, parseInteger(process.env.KYO_ASSESS_BOOTSTRAP_TARGET, 1000));
  const dailyBase = Math.max(1, parseInteger(process.env.KYO_ASSESS_DAILY_BASE, 25));
  const dailyGrowthRate = Math.max(0, parseNumber(process.env.KYO_ASSESS_DAILY_GROWTH_RATE, 0.15));
  const dailyRandomMin = Math.max(0.01, parseNumber(process.env.KYO_ASSESS_DAILY_RANDOM_MIN, 0.7));
  const dailyRandomMax = Math.max(dailyRandomMin, parseNumber(process.env.KYO_ASSESS_DAILY_RANDOM_MAX, 1.4));
  const dailyMax = Math.max(1, parseInteger(process.env.KYO_ASSESS_DAILY_MAX, 10_000));
  const escrowAmountSol = Math.max(0.001, parseNumber(process.env.KYO_ASSESS_ESCROW_AMOUNT_SOL, 0.001));
  const timeLockSeconds = Math.max(3600, parseInteger(process.env.KYO_ASSESS_TIMELOCK_SECONDS, 3600));
  const qualityMin = clamp(parseInteger(process.env.KYO_ASSESS_QUALITY_MIN, 45), 0, 100);
  const qualityMax = clamp(parseInteger(process.env.KYO_ASSESS_QUALITY_MAX, 90), qualityMin, 100);
  const txPauseMs = Math.max(0, parseInteger(process.env.KYO_ASSESS_TX_PAUSE_MS, 100));

  return {
    rpcUrl: process.env.SOLANA_RPC_URL?.trim() || DEFAULT_RPC_URL,
    programId: new PublicKey(process.env.KYO_ASSESS_PROGRAM_ID?.trim() || DEFAULT_PROGRAM_ID),
    idlPath: process.env.KYO_ASSESS_IDL_PATH?.trim(),
    statePath: path.resolve(process.cwd(), process.env.KYO_ASSESS_STATE_PATH?.trim() || DEFAULT_STATE_PATH),
    mode: parseMode(process.env.KYO_ASSESS_MODE?.trim()),
    live: parseBoolean(process.env.KYO_ASSESS_LIVE, false),
    bootstrapTarget,
    dailyBase,
    dailyGrowthRate,
    dailyRandomMin,
    dailyRandomMax,
    dailyMax,
    escrowAmountSol,
    timeLockSeconds,
    qualityMin,
    qualityMax,
    txPauseMs,
    maxCyclesPerRun: Math.max(1, parseInteger(process.env.KYO_ASSESS_MAX_CYCLES_PER_RUN, bootstrapTarget)),
    operatorKeypairPath: process.env.KAMIYO_OPERATOR_KEYPAIR_PATH?.trim(),
    operatorPrivateKey: process.env.KAMIYO_OPERATOR_PRIVATE_KEY?.trim(),
    oracleKeypairPath: process.env.KYO_ASSESS_ORACLE_KEYPAIR_PATH?.trim(),
    oraclePrivateKey: process.env.KYO_ASSESS_ORACLE_PRIVATE_KEY?.trim(),
    providerPublicKey: process.env.KYO_ASSESS_PROVIDER_PUBLIC_KEY?.trim(),
  };
}

function deriveEscrowPda(programId: PublicKey, agent: PublicKey, transactionId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), agent.toBuffer(), Buffer.from(transactionId)],
    programId,
  );
}

function deriveProtocolConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('protocol_config')], programId);
}

function deriveTreasuryPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('treasury')], programId);
}

function deriveOracleRegistryPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('oracle_registry')], programId);
}

function deriveReputationPda(programId: PublicKey, entity: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('reputation'), entity.toBuffer()], programId);
}

function createTransactionId(index: number): string {
  return `kamiyo-agent-assess-${Date.now().toString(36)}-${index.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function lamportsFromSol(sol: number): BN {
  return new BN(Math.round(sol * 1_000_000_000));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

function refundFromQuality(score: number): number {
  if (score >= 80) return 0;
  if (score >= 60) return 25;
  if (score >= 40) return 50;
  if (score >= 20) return 75;
  return 100;
}

function log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    service: 'kamiyo-agent-assessment-growth',
    message,
    ...(context ? { context } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function asProgramAccountNamespace(program: Program<any>): Record<string, { fetch: (address: PublicKey) => Promise<any> }> {
  const namespace = (program as any).account;
  if (!namespace || typeof namespace !== 'object') {
    throw new Error('anchor account namespace unavailable');
  }
  return namespace as Record<string, { fetch: (address: PublicKey) => Promise<any> }>;
}

async function fetchOracleRegistryAccount(program: Program<any>, oracleRegistry: PublicKey): Promise<any> {
  const accountNamespace = asProgramAccountNamespace(program);
  for (const key of ['oracleRegistry', 'oracle_registry', 'OracleRegistry']) {
    const reader = accountNamespace[key];
    if (!reader || typeof reader.fetch !== 'function') continue;
    return reader.fetch(oracleRegistry);
  }

  throw new Error('oracle registry account decoder unavailable in IDL');
}

function normalizePubkey(value: unknown): PublicKey | null {
  if (!value) return null;
  if (value instanceof PublicKey) return value;

  if (typeof value === 'string') {
    try {
      return new PublicKey(value);
    } catch {
      return null;
    }
  }

  if (value && typeof value === 'object' && 'toBase58' in (value as Record<string, unknown>)) {
    try {
      return new PublicKey(String((value as any).toBase58()));
    } catch {
      return null;
    }
  }

  return null;
}

async function ensureActiveVerifier(params: {
  program: Program<any>;
  programId: PublicKey;
  verifier: PublicKey;
}): Promise<void> {
  const [oracleRegistry] = deriveOracleRegistryPda(params.programId);
  const registry = await fetchOracleRegistryAccount(params.program, oracleRegistry);
  const oraclesRaw = Array.isArray((registry as any).oracles) ? (registry as any).oracles : [];

  const match = oraclesRaw.find((entry: any) => {
    const pubkey = normalizePubkey(entry?.pubkey);
    const status = Number(entry?.status ?? 0);
    return !!pubkey && pubkey.equals(params.verifier) && status === 0;
  });

  if (!match) {
    throw new Error(`verifier ${params.verifier.toBase58()} is not an active oracle in oracle_registry`);
  }
}

async function ensureReputationAccount(params: {
  connection: Connection;
  program: Program<any>;
  programId: PublicKey;
  operator: Keypair;
  entity: PublicKey;
}): Promise<void> {
  const [reputationPda] = deriveReputationPda(params.programId, params.entity);
  const info = await params.connection.getAccountInfo(reputationPda, 'confirmed');
  if (info) return;

  await params.program.methods
    .initReputation()
    .accounts({
      reputation: reputationPda,
      entity: params.entity,
      payer: params.operator.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([params.operator])
    .rpc();
}

async function runAssessmentCycle(params: {
  connection: Connection;
  program: Program<any>;
  programId: PublicKey;
  operator: Keypair;
  verifier: Keypair;
  provider: PublicKey;
  escrowAmountSol: number;
  timeLockSeconds: number;
  qualityMin: number;
  qualityMax: number;
  index: number;
}): Promise<CycleResult> {
  const transactionId = createTransactionId(params.index);
  const qualityScore = randomIntInclusive(params.qualityMin, params.qualityMax);
  const refundPercentage = refundFromQuality(qualityScore);

  const [protocolConfig] = deriveProtocolConfigPda(params.programId);
  const [treasury] = deriveTreasuryPda(params.programId);
  const [oracleRegistry] = deriveOracleRegistryPda(params.programId);
  const [escrow] = deriveEscrowPda(params.programId, params.operator.publicKey, transactionId);
  const [agentReputation] = deriveReputationPda(params.programId, params.operator.publicKey);
  const [apiReputation] = deriveReputationPda(params.programId, params.provider);

  const initializeSignature = await params.program.methods
    .initializeEscrow(
      lamportsFromSol(params.escrowAmountSol),
      new BN(params.timeLockSeconds),
      transactionId,
      false,
    )
    .accounts({
      protocolConfig,
      treasury,
      escrow,
      agent: params.operator.publicKey,
      api: params.provider,
      systemProgram: SystemProgram.programId,
      tokenMint: null,
      escrowTokenAccount: null,
      agentTokenAccount: null,
      tokenProgram: null,
      associatedTokenProgram: null,
    })
    .signers([params.operator])
    .rpc();

  const message = Buffer.from(`${transactionId}:${qualityScore}`);
  const signature = nacl.sign.detached(message, params.verifier.secretKey);

  const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
    privateKey: params.verifier.secretKey,
    message,
  });

  const markDisputedIx = await params.program.methods
    .markDisputed()
    .accounts({
      protocolConfig,
      escrow,
      reputation: agentReputation,
      agent: params.operator.publicKey,
    })
    .instruction();

  const resolveDisputeIx = await params.program.methods
    .resolveDispute(qualityScore, refundPercentage, Array.from(signature))
    .accounts({
      protocolConfig,
      escrow,
      agent: params.operator.publicKey,
      api: params.provider,
      oracleRegistry,
      verifier: params.verifier.publicKey,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      agentReputation,
      apiReputation,
      systemProgram: SystemProgram.programId,
      escrowTokenAccount: null,
      agentTokenAccount: null,
      apiTokenAccount: null,
      tokenProgram: null,
    })
    .instruction();

  const disputeTx = new Transaction().add(ed25519Ix, markDisputedIx, resolveDisputeIx);
  const disputeSignature = await sendAndConfirmTransaction(
    params.connection,
    disputeTx,
    [params.operator],
    {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
      maxRetries: 2,
    },
  );

  return {
    transactionId,
    qualityScore,
    refundPercentage,
    initializeSignature,
    disputeSignature,
  };
}

async function main(): Promise<void> {
  const cfg = createConfig();
  const state = loadState(cfg.statePath);
  const plan = planRun(state, cfg);

  log('info', 'assessment_growth_plan', {
    live: cfg.live,
    mode: cfg.mode,
    phase: plan.phase,
    requestedCycles: plan.requestedCycles,
    skippedReason: plan.skippedReason ?? null,
    statePath: cfg.statePath,
    bootstrapTarget: cfg.bootstrapTarget,
    bootstrapCompleted: state.bootstrapCyclesCompleted,
    dailyRunsCompleted: state.dailyRunsCompleted,
  });

  if (plan.requestedCycles <= 0) {
    log('info', 'assessment_growth_nothing_to_run', { reason: plan.skippedReason ?? 'no_work' });
    return;
  }

  if (!cfg.live) {
    log('warn', 'dry_run_only_enable_live_to_execute', {
      envVar: 'KYO_ASSESS_LIVE=true',
      plannedCycles: plan.requestedCycles,
    });
    return;
  }

  const operatorFallback = process.env.HOME ? path.join(process.env.HOME, '.config/solana/id.json') : undefined;
  const operator = loadRequiredKeypair({
    keypairPath: cfg.operatorKeypairPath,
    privateKey: cfg.operatorPrivateKey,
    fallbackPath: operatorFallback,
    label: 'KAMIYO_OPERATOR',
  });
  const verifier = loadRequiredKeypair({
    keypairPath: cfg.oracleKeypairPath,
    privateKey: cfg.oraclePrivateKey,
    label: 'KYO_ASSESS_ORACLE',
  });

  const provider = cfg.providerPublicKey
    ? new PublicKey(cfg.providerPublicKey)
    : operator.keypair.publicKey;

  log('info', 'assessment_growth_identity', {
    operatorSource: operator.source,
    verifierSource: verifier.source,
    operator: operator.keypair.publicKey.toBase58(),
    verifier: verifier.keypair.publicKey.toBase58(),
    provider: provider.toBase58(),
    programId: cfg.programId.toBase58(),
    rpcUrl: cfg.rpcUrl,
  });

  const connection = new Connection(cfg.rpcUrl, 'confirmed');
  await connection.getLatestBlockhash('confirmed');

  const wallet = new Wallet(operator.keypair);
  const providerObj = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  const idl = readIdl(cfg.idlPath);
  const program = new Program(idl, providerObj);

  await ensureActiveVerifier({
    program,
    programId: cfg.programId,
    verifier: verifier.keypair.publicKey,
  });

  await ensureReputationAccount({
    connection,
    program,
    programId: cfg.programId,
    operator: operator.keypair,
    entity: operator.keypair.publicKey,
  });

  await ensureReputationAccount({
    connection,
    program,
    programId: cfg.programId,
    operator: operator.keypair,
    entity: provider,
  });

  state.lastRunMode = plan.phase;
  state.lastRunStartedAt = new Date().toISOString();
  state.lastRunFinishedAt = null;
  state.lastRunRequested = plan.requestedCycles;
  state.lastRunCompleted = 0;
  state.lastRunFailed = 0;
  state.updatedAt = new Date().toISOString();
  saveState(cfg.statePath, state);

  let completed = 0;
  let failed = 0;
  const failures: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < plan.requestedCycles; i += 1) {
    try {
      const result = await runAssessmentCycle({
        connection,
        program,
        programId: cfg.programId,
        operator: operator.keypair,
        verifier: verifier.keypair,
        provider,
        escrowAmountSol: cfg.escrowAmountSol,
        timeLockSeconds: cfg.timeLockSeconds,
        qualityMin: cfg.qualityMin,
        qualityMax: cfg.qualityMax,
        index: i,
      });

      completed += 1;

      if ((i + 1) % 25 === 0 || i === plan.requestedCycles - 1) {
        log('info', 'assessment_cycle_progress', {
          completed,
          failed,
          requested: plan.requestedCycles,
          lastTransactionId: result.transactionId,
          lastQualityScore: result.qualityScore,
          lastRefundPercentage: result.refundPercentage,
        });
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ index: i, error: message });
      log('warn', 'assessment_cycle_failed', { index: i, error: message });
    }

    await sleep(cfg.txPauseMs);
  }

  state.totalCyclesCompleted += completed;
  if (plan.phase === 'bootstrap') {
    state.bootstrapCyclesCompleted += completed;
    if (state.bootstrapCyclesCompleted >= cfg.bootstrapTarget && !state.bootstrapCompletedAt) {
      state.bootstrapCompletedAt = new Date().toISOString();
    }
  } else {
    state.dailyRunsCompleted += 1;
    state.lastDailyRunDateUtc = utcDateKey();
    state.lastDailyTarget = plan.requestedCycles;
  }

  state.lastRunCompleted = completed;
  state.lastRunFailed = failed;
  state.lastRunFinishedAt = new Date().toISOString();
  state.updatedAt = new Date().toISOString();
  saveState(cfg.statePath, state);

  log('info', 'assessment_growth_run_complete', {
    phase: plan.phase,
    requested: plan.requestedCycles,
    completed,
    failed,
    totalCyclesCompleted: state.totalCyclesCompleted,
    bootstrapCyclesCompleted: state.bootstrapCyclesCompleted,
    dailyRunsCompleted: state.dailyRunsCompleted,
    bootstrapCompletedAt: state.bootstrapCompletedAt,
    failures: failures.slice(0, 10),
  });

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  log('error', 'assessment_growth_fatal', { error: message });
  process.exit(1);
});
