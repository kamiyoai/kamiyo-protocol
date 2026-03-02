import { BN } from '@coral-xyz/anchor';
import {
  AgentManager,
  AgentType,
  AgreementManager,
  AgreementStatus,
  KamiyoClient,
  KAMIYO_PROGRAM_ID,
  OracleManager,
  type AgentIdentity,
  type Agreement,
  type OracleRegistry,
} from '@kamiyo/sdk';
import {
  Jurisdiction,
  MeishiClient,
  PassportManager,
  type MeishiPassport,
} from '@kamiyo/meishi';
import {
  createX402KamiyoClient,
  type X402KamiyoClient,
} from '@kamiyo/x402-client';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import type { AgentTool, AgentToolResult, OpenClawPluginApi, PluginLogger, ToolParams } from './types.js';

type WalletLike = {
  publicKey: PublicKey;
  payer: Keypair;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
};

type RuntimeConfig = {
  rpcUrl: string;
  apiBaseUrl?: string;
  programId: PublicKey;
  meishiProgramId?: string;
  x402BaseUrl: string;
  x402TimeoutMs: number;
  x402MaxPriceSol: number;
  keypair: Keypair;
  hasSigner: boolean;
};

type RuntimeState = {
  connection: Connection;
  wallet: WalletLike;
  kamiyo: KamiyoClient;
  agents: AgentManager;
  agreements: AgreementManager;
  oracles: OracleManager;
  meishi: MeishiClient;
  passports: PassportManager;
  x402?: X402KamiyoClient;
};

const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';
const DEFAULT_X402_BASE_URL = 'https://x402.kamiyo.ai';
const DEFAULT_X402_TIMEOUT_MS = 30_000;
const DEFAULT_X402_MAX_PRICE_SOL = 0.1;

const AGENT_TYPE_MAP: Record<string, AgentType> = {
  trading: AgentType.Trading,
  service: AgentType.Service,
  oracle: AgentType.Oracle,
  custom: AgentType.Custom,
};

const JURISDICTION_MAP: Record<string, Jurisdiction> = {
  global: Jurisdiction.Global,
  eu: Jurisdiction.EU,
  us: Jurisdiction.US,
  uk: Jurisdiction.UK,
  apac: Jurisdiction.APAC,
};

const AGREEMENT_STATUS_LABEL: Record<number, string> = {
  [AgreementStatus.Active]: 'active',
  [AgreementStatus.Released]: 'released',
  [AgreementStatus.Disputed]: 'disputed',
  [AgreementStatus.Resolved]: 'resolved',
};

function toWallet(keypair: Keypair): WalletLike {
  return {
    publicKey: keypair.publicKey,
    payer: keypair,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
      } else {
        tx.partialSign(keypair);
      }
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) {
          tx.sign([keypair]);
        } else {
          tx.partialSign(keypair);
        }
      }
      return txs;
    },
  };
}

function readConfigString(
  config: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = config?.[key];
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function readConfigNumber(
  config: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = config?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function decodeSecretKey(raw: string): Uint8Array {
  const value = raw.trim();
  if (!value) {
    throw new Error('private key is empty');
  }

  if (value.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('private key JSON is invalid');
    }

    if (!Array.isArray(parsed) || parsed.length < 32) {
      throw new Error('private key JSON must be a byte array');
    }

    const bytes = new Uint8Array(parsed.length);
    for (let i = 0; i < parsed.length; i += 1) {
      const n = parsed[i];
      if (!Number.isInteger(n) || n < 0 || n > 255) {
        throw new Error('private key JSON must contain only bytes');
      }
      bytes[i] = n;
    }
    return bytes;
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length < 32) {
    throw new Error('private key base64 decode failed');
  }
  return new Uint8Array(decoded);
}

function parseConfig(pluginConfig: Record<string, unknown> | undefined): RuntimeConfig {
  const rpcUrl =
    readConfigString(pluginConfig, 'rpcUrl')
    || process.env.KAMIYO_RPC_URL
    || process.env.SOLANA_RPC_URL
    || DEFAULT_RPC_URL;

  const apiBaseUrl =
    readConfigString(pluginConfig, 'apiBaseUrl')
    || process.env.KAMIYO_API_URL;

  const rawProgramId =
    readConfigString(pluginConfig, 'programId')
    || process.env.KAMIYO_PROGRAM_ID
    || KAMIYO_PROGRAM_ID.toBase58();
  const programId = new PublicKey(rawProgramId);

  const meishiProgramId =
    readConfigString(pluginConfig, 'meishiProgramId')
    || process.env.MEISHI_PROGRAM_ID;

  const x402BaseUrl =
    readConfigString(pluginConfig, 'x402BaseUrl')
    || process.env.KAMIYO_X402_BASE_URL
    || DEFAULT_X402_BASE_URL;

  const x402TimeoutMs =
    readConfigNumber(pluginConfig, 'x402TimeoutMs')
    || (process.env.KAMIYO_X402_TIMEOUT_MS ? Number.parseFloat(process.env.KAMIYO_X402_TIMEOUT_MS) : undefined)
    || DEFAULT_X402_TIMEOUT_MS;
  if (!Number.isFinite(x402TimeoutMs) || x402TimeoutMs < 500) {
    throw new Error('x402TimeoutMs must be >= 500');
  }

  const x402MaxPriceSol =
    readConfigNumber(pluginConfig, 'x402MaxPriceSol')
    || (process.env.KAMIYO_X402_MAX_PRICE_SOL ? Number.parseFloat(process.env.KAMIYO_X402_MAX_PRICE_SOL) : undefined)
    || DEFAULT_X402_MAX_PRICE_SOL;
  if (!Number.isFinite(x402MaxPriceSol) || x402MaxPriceSol <= 0) {
    throw new Error('x402MaxPriceSol must be > 0');
  }

  const rawSecret =
    readConfigString(pluginConfig, 'privateKey')
    || process.env.KAMIYO_PRIVATE_KEY
    || process.env.SOLANA_PRIVATE_KEY;

  let keypair: Keypair;
  let hasSigner = false;
  if (rawSecret) {
    keypair = Keypair.fromSecretKey(decodeSecretKey(rawSecret));
    hasSigner = true;
  } else {
    keypair = Keypair.generate();
  }

  return {
    rpcUrl,
    apiBaseUrl,
    programId,
    meishiProgramId,
    x402BaseUrl,
    x402TimeoutMs,
    x402MaxPriceSol,
    keypair,
    hasSigner,
  };
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown error';
  }
}

function jsonResult<T>(details: T): AgentToolResult<T> {
  return {
    content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
    details,
  };
}

function toUnixSeconds(value: BN | null): number | null {
  if (!value) return null;
  return value.toNumber();
}

function lamportsToSol(value: BN): string {
  const lamports = BigInt(value.toString());
  const whole = lamports / 1_000_000_000n;
  const frac = lamports % 1_000_000_000n;
  const fracText = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return fracText ? `${whole}.${fracText}` : `${whole}.0`;
}

function readString(params: ToolParams, key: string, required = true): string | undefined {
  const value = params[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  if (required) throw new Error(`${key} is required`);
  return undefined;
}

function readNumber(params: ToolParams, key: string, required = true): number | undefined {
  const value = params[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (required) throw new Error(`${key} must be a number`);
  return undefined;
}

function readBoolean(params: ToolParams, key: string): boolean | undefined {
  const value = params[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }
  return undefined;
}

function readNumberArray(params: ToolParams, key: string): number[] {
  const value = params[key];
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array`);
  }
  const numbers = value.map((entry) => {
    if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
    if (typeof entry === 'string') {
      const parsed = Number.parseFloat(entry);
      if (Number.isFinite(parsed)) return parsed;
    }
    throw new Error(`${key} must contain only numbers`);
  });
  return numbers;
}

function readBody(params: ToolParams): string | undefined {
  const raw = params.body;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return JSON.stringify(raw);
  }
  throw new Error('body must be a string or object');
}

function parsePublicKey(params: ToolParams, key: string, required = true): PublicKey | undefined {
  const value = readString(params, key, required);
  if (!value) return undefined;
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${key} must be a valid Solana public key`);
  }
}

function serializeAgent(agent: AgentIdentity, manager: AgentManager): Record<string, unknown> {
  return {
    owner: agent.owner.toBase58(),
    name: agent.name,
    agentType: agent.agentType,
    agentTypeLabel: Object.entries(AGENT_TYPE_MAP).find(([, v]) => v === agent.agentType)?.[0] ?? 'unknown',
    reputation: agent.reputation.toNumber(),
    stakeLamports: agent.stakeAmount.toString(),
    stakeSol: lamportsToSol(agent.stakeAmount),
    isActive: agent.isActive,
    trustLevel: manager.calculateTrustLevel(agent),
    totalEscrows: agent.totalEscrows.toString(),
    successfulEscrows: agent.successfulEscrows.toString(),
    disputedEscrows: agent.disputedEscrows.toString(),
    createdAt: agent.createdAt.toNumber(),
    lastActive: agent.lastActive.toNumber(),
  };
}

function serializeAgreement(agreement: Agreement): Record<string, unknown> {
  return {
    agent: agreement.agent.toBase58(),
    provider: agreement.api.toBase58(),
    amountLamports: agreement.amount.toString(),
    amountSol: lamportsToSol(agreement.amount),
    status: agreement.status,
    statusLabel: AGREEMENT_STATUS_LABEL[agreement.status] ?? 'unknown',
    transactionId: agreement.transactionId,
    qualityScore: agreement.qualityScore,
    refundPercentage: agreement.refundPercentage,
    createdAt: agreement.createdAt.toNumber(),
    expiresAt: agreement.expiresAt.toNumber(),
    disputedAt: toUnixSeconds(agreement.disputedAt),
    commitPhaseEndsAt: toUnixSeconds(agreement.commitPhaseEndsAt),
    oracleCommitments: agreement.oracleCommitments.length,
    oracleSubmissions: agreement.oracleSubmissions.length,
    tokenMint: agreement.tokenMint?.toBase58() ?? null,
  };
}

function serializePassport(passport: MeishiPassport, manager: PassportManager): Record<string, unknown> {
  return {
    agentIdentity: passport.agentIdentity.toBase58(),
    issuer: passport.issuer.toBase58(),
    principal: passport.principal.toBase58(),
    jurisdiction: passport.jurisdiction,
    complianceClass: passport.complianceClass,
    complianceScore: passport.complianceScore,
    suspended: passport.suspended,
    suspensionReason: passport.suspensionReason,
    trustTier: manager.getTrustTier(passport),
    active: manager.isActive(passport),
    compliant: manager.isCompliant(passport),
    mandateVersion: passport.mandateVersion,
    mandateExpiresAt: passport.mandateExpires.toNumber(),
    totalTransactions: passport.totalTransactions.toString(),
    totalVolumeUsdMicro: passport.totalVolumeUsd.toString(),
    disputesFiled: passport.disputesFiled,
    disputesLost: passport.disputesLost,
    disputeRate: manager.getDisputeRate(passport),
    disputeLossRate: manager.getDisputeLossRate(passport),
    updatedAt: passport.updatedAt.toNumber(),
  };
}

class Runtime {
  private state: RuntimeState | null = null;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly logger?: PluginLogger,
  ) {}

  hasSigner(): boolean {
    return this.config.hasSigner;
  }

  ensureSigner(): void {
    if (!this.config.hasSigner) {
      throw new Error(
        'This operation requires a signer. Configure privateKey in plugin config or KAMIYO_PRIVATE_KEY/SOLANA_PRIVATE_KEY.',
      );
    }
  }

  getPublicKey(): string {
    return this.config.keypair.publicKey.toBase58();
  }

  getX402BaseUrl(): string {
    return this.config.x402BaseUrl;
  }

  getX402TimeoutMs(): number {
    return this.config.x402TimeoutMs;
  }

  private init(): RuntimeState {
    if (this.state) return this.state;

    const connection = new Connection(this.config.rpcUrl, 'confirmed');
    const wallet = toWallet(this.config.keypair);
    const kamiyo = new KamiyoClient({
      connection,
      wallet,
      programId: this.config.programId,
      apiBaseUrl: this.config.apiBaseUrl,
    });

    const meishi = new MeishiClient({
      connection,
      keypair: this.config.keypair,
      programId: this.config.meishiProgramId,
    });

    this.state = {
      connection,
      wallet,
      kamiyo,
      agents: new AgentManager(kamiyo),
      agreements: new AgreementManager(kamiyo),
      oracles: new OracleManager(kamiyo),
      meishi,
      passports: new PassportManager(meishi),
    };

    this.logger?.debug?.(
      `kamiyo runtime initialized rpc=${this.config.rpcUrl} signer=${this.config.hasSigner}`,
    );

    return this.state;
  }

  agents(): AgentManager {
    return this.init().agents;
  }

  agreements(): AgreementManager {
    return this.init().agreements;
  }

  oracles(): OracleManager {
    return this.init().oracles;
  }

  passports(): PassportManager {
    return this.init().passports;
  }

  async getRegistry(): Promise<OracleRegistry | null> {
    return this.oracles().getRegistry();
  }

  x402(): X402KamiyoClient {
    const state = this.init();
    if (!state.x402) {
      state.x402 = createX402KamiyoClient(
        state.connection,
        this.config.keypair,
        this.config.programId,
        {
          maxPricePerRequest: this.config.x402MaxPriceSol,
          defaultTimeoutMs: this.config.x402TimeoutMs,
        },
      );
    }
    return state.x402;
  }
}

async function runTool<T>(
  handler: () => Promise<T>,
): Promise<AgentToolResult<T>> {
  try {
    return jsonResult(await handler());
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Omit<RequestInit, 'signal'> | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...(init ?? {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const TOOL_NAMES = [
  'kamiyo_staked_identity_create',
  'kamiyo_staked_identity_get',
  'kamiyo_escrow_create',
  'kamiyo_escrow_get',
  'kamiyo_escrow_dispute',
  'kamiyo_escrow_release',
  'kamiyo_oracle_consensus_preview',
  'kamiyo_oracle_registry',
  'kamiyo_meishi_issue_passport',
  'kamiyo_meishi_verify_passport',
  'kamiyo_x402_check_price',
  'kamiyo_x402_request',
  'kamiyo_x402_dispute',
  'kamiyo_x402_release',
  'kamiyo_x402_request_settlement',
] as const;

export type KamiyoOpenClawToolName = (typeof TOOL_NAMES)[number];

export function createKamiyoOpenClawTools(api: OpenClawPluginApi): AgentTool[] {
  const runtime = new Runtime(parseConfig(api.pluginConfig), api.logger);

  return [
    {
      name: 'kamiyo_staked_identity_create',
      description: 'Create a staked KAMIYO agent identity for the configured signer.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'Human-readable agent name.' },
          agentType: {
            type: 'string',
            enum: Object.keys(AGENT_TYPE_MAP),
            description: 'Agent type: trading, service, oracle, or custom.',
          },
          stakeSol: { type: 'number', description: 'Stake amount in SOL.' },
        },
        required: ['name', 'agentType', 'stakeSol'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          runtime.ensureSigner();

          const name = readString(params, 'name')!;
          const agentTypeRaw = readString(params, 'agentType')!.toLowerCase();
          const stakeSol = readNumber(params, 'stakeSol')!;
          if (!Number.isFinite(stakeSol) || stakeSol <= 0) {
            throw new Error('stakeSol must be greater than zero');
          }

          const agentType = AGENT_TYPE_MAP[agentTypeRaw];
          if (agentType === undefined) {
            throw new Error(`agentType must be one of: ${Object.keys(AGENT_TYPE_MAP).join(', ')}`);
          }

          const result = await runtime.agents().create(name, agentType, stakeSol);
          return {
            owner: runtime.getPublicKey(),
            agentPda: result.pda.toBase58(),
            signature: result.signature,
            stakeSol,
          };
        }),
    },
    {
      name: 'kamiyo_staked_identity_get',
      description: 'Fetch a KAMIYO staked identity by owner address.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          owner: {
            type: 'string',
            description: 'Owner wallet address. Defaults to configured signer when available.',
          },
        },
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          const owner = parsePublicKey(params, 'owner', false)
            || (runtime.hasSigner() ? new PublicKey(runtime.getPublicKey()) : undefined);
          if (!owner) {
            throw new Error('owner is required when no signer is configured');
          }

          const agent = await runtime.agents().getByOwner(owner);
          if (!agent) {
            return { found: false, owner: owner.toBase58() };
          }

          return {
            found: true,
            owner: owner.toBase58(),
            identity: serializeAgent(agent, runtime.agents()),
          };
        }),
    },
    {
      name: 'kamiyo_escrow_create',
      description: 'Create an escrowed agreement payment with the configured signer as the agent.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          provider: { type: 'string', description: 'Provider wallet address.' },
          amountSol: { type: 'number', description: 'Escrow amount in SOL.' },
          timeLockHours: { type: 'number', description: 'Time lock duration in hours (default 24).' },
          transactionId: { type: 'string', description: 'Optional idempotent transaction ID.' },
        },
        required: ['provider', 'amountSol'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          runtime.ensureSigner();

          const provider = parsePublicKey(params, 'provider')!;
          const amountSol = readNumber(params, 'amountSol')!;
          if (!Number.isFinite(amountSol) || amountSol <= 0) {
            throw new Error('amountSol must be greater than zero');
          }

          const timeLockHours = readNumber(params, 'timeLockHours', false) ?? 24;
          if (!Number.isFinite(timeLockHours) || timeLockHours <= 0) {
            throw new Error('timeLockHours must be greater than zero');
          }

          const providedTxId = readString(params, 'transactionId', false);
          const transactionId = providedTxId ?? runtime.agreements().generateTransactionId();

          const result = await runtime.agreements().create(
            provider,
            amountSol,
            timeLockHours,
            transactionId,
          );

          return {
            transactionId,
            escrowPda: result.pda.toBase58(),
            signature: result.signature,
            amountSol,
            provider: provider.toBase58(),
          };
        }),
    },
    {
      name: 'kamiyo_escrow_get',
      description: 'Get escrow/agreement status by transaction ID.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          transactionId: { type: 'string', description: 'Escrow transaction ID.' },
          agent: { type: 'string', description: 'Optional agent wallet address.' },
        },
        required: ['transactionId'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          const transactionId = readString(params, 'transactionId')!;
          const agent = parsePublicKey(params, 'agent', false);

          const agreement = await runtime.agreements().getByTransactionId(transactionId, agent);
          if (!agreement) {
            return { found: false, transactionId };
          }

          const nowSec = Math.floor(Date.now() / 1000);
          const expiresAt = agreement.expiresAt.toNumber();
          const secondsRemaining = Math.max(0, expiresAt - nowSec);

          return {
            found: true,
            transactionId,
            secondsRemaining,
            escrow: serializeAgreement(agreement),
          };
        }),
    },
    {
      name: 'kamiyo_escrow_dispute',
      description: 'Mark an escrow agreement as disputed.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          transactionId: { type: 'string', description: 'Escrow transaction ID.' },
        },
        required: ['transactionId'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          runtime.ensureSigner();
          const transactionId = readString(params, 'transactionId')!;
          const signature = await runtime.agreements().dispute(transactionId);
          return { transactionId, signature };
        }),
    },
    {
      name: 'kamiyo_escrow_release',
      description: 'Release escrow funds to the provider.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          transactionId: { type: 'string', description: 'Escrow transaction ID.' },
          provider: { type: 'string', description: 'Provider wallet address.' },
        },
        required: ['transactionId', 'provider'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          runtime.ensureSigner();
          const transactionId = readString(params, 'transactionId')!;
          const provider = parsePublicKey(params, 'provider')!;
          const signature = await runtime.agreements().releaseFunds(transactionId, provider);
          return { transactionId, provider: provider.toBase58(), signature };
        }),
    },
    {
      name: 'kamiyo_oracle_consensus_preview',
      description: 'Run private oracle consensus math for a score set and flag outliers.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scores: {
            type: 'array',
            items: { type: 'number' },
            description: 'Quality scores from oracle voters (0-100).',
          },
          maxDeviation: {
            type: 'number',
            description: 'Maximum distance from median before a score is treated as an outlier.',
          },
          weights: {
            type: 'array',
            items: { type: 'number' },
            description: 'Optional score weights, same length as scores.',
          },
        },
        required: ['scores'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          const scores = readNumberArray(params, 'scores');
          if (scores.length < 3) {
            throw new Error('scores must contain at least 3 values');
          }

          for (const score of scores) {
            runtime.oracles().validateQualityScore(score);
          }

          const maxDeviation = readNumber(params, 'maxDeviation', false) ?? 15;
          const basic = runtime.oracles().calculateConsensus(scores, maxDeviation);

          const weightsRaw = params.weights;
          let weightedConsensus: number | undefined;
          if (weightsRaw !== undefined) {
            const weights = readNumberArray(params, 'weights');
            if (weights.length !== scores.length) {
              throw new Error('weights must have the same length as scores');
            }
            weightedConsensus = runtime
              .oracles()
              .calculateWeightedConsensus(scores.map((score, i) => ({ score, weight: weights[i] })));
          }

          return {
            consensusScore: basic.consensusScore,
            validScores: basic.validScores,
            outliers: basic.outliers,
            weightedConsensus,
          };
        }),
    },
    {
      name: 'kamiyo_oracle_registry',
      description: 'Fetch live oracle registry state for dispute consensus configuration.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      execute: async () =>
        runTool(async () => {
          const registry = await runtime.getRegistry();
          if (!registry) {
            return { found: false };
          }

          const active = await runtime.oracles().getActiveOracles();
          return {
            found: true,
            admin: registry.admin.toBase58(),
            totalOracles: registry.oracles.length,
            activeOracles: active.length,
            minConsensus: registry.minConsensus,
            maxScoreDeviation: registry.maxScoreDeviation,
            publicRegistration: registry.publicRegistration,
            totalStakeLamports: registry.totalStake.toString(),
            totalStakeSol: lamportsToSol(registry.totalStake),
            oracles: registry.oracles.map((oracle) => ({
              pubkey: oracle.pubkey.toBase58(),
              status: runtime.oracles().getOracleStatusLabel(oracle.status),
              weight: oracle.weight,
              stakeSol: lamportsToSol(oracle.stakeAmount),
              violationCount: oracle.violationCount,
              consensusVoteRate:
                oracle.disputesParticipated === 0
                  ? 0
                  : oracle.consensusVotes / oracle.disputesParticipated,
            })),
          };
        }),
    },
    {
      name: 'kamiyo_meishi_issue_passport',
      description: 'Issue a Meishi passport to an agent identity.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agentIdentity: { type: 'string', description: 'Agent identity wallet address.' },
          jurisdiction: {
            type: 'string',
            enum: Object.keys(JURISDICTION_MAP),
            description: 'Regulatory jurisdiction (default global).',
          },
        },
        required: ['agentIdentity'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          runtime.ensureSigner();

          const agentIdentity = parsePublicKey(params, 'agentIdentity')!;
          const jurisdictionRaw = (readString(params, 'jurisdiction', false) ?? 'global').toLowerCase();
          const jurisdiction = JURISDICTION_MAP[jurisdictionRaw];
          if (jurisdiction === undefined) {
            throw new Error(`jurisdiction must be one of: ${Object.keys(JURISDICTION_MAP).join(', ')}`);
          }

          const result = await runtime.passports().create({ agentIdentity, jurisdiction });
          return {
            agentIdentity: agentIdentity.toBase58(),
            jurisdiction: jurisdictionRaw,
            passportAddress: result.passportAddress.toBase58(),
            signature: result.signature,
          };
        }),
    },
    {
      name: 'kamiyo_meishi_verify_passport',
      description: 'Verify Meishi passport validity, mandate status, and compliance score.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agentIdentity: { type: 'string', description: 'Agent identity wallet address.' },
        },
        required: ['agentIdentity'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          const agentIdentity = parsePublicKey(params, 'agentIdentity')!;
          const verify = await runtime.passports().verify(agentIdentity);
          const passport = await runtime.passports().get(agentIdentity);

          return {
            agentIdentity: agentIdentity.toBase58(),
            verification: verify,
            passport: passport ? serializePassport(passport, runtime.passports()) : null,
          };
        }),
    },
    {
      name: 'kamiyo_x402_check_price',
      description: 'Probe an x402 endpoint and return payment requirements (402 challenge).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', description: 'x402 endpoint URL.' },
          method: { type: 'string', description: 'HTTP method (default GET).' },
        },
        required: ['url'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          const url = readString(params, 'url')!;
          const method = (readString(params, 'method', false) ?? 'GET').toUpperCase();

          const response = await fetchWithTimeout(
            url,
            { method },
            runtime.getX402TimeoutMs(),
          );
          const challenge = await response
            .json()
            .catch(() => null) as Record<string, unknown> | null;

          if (response.status !== 402) {
            return {
              paymentRequired: false,
              status: response.status,
              challenge,
            };
          }

          return {
            paymentRequired: true,
            status: response.status,
            challenge,
          };
        }),
    },
    {
      name: 'kamiyo_x402_request',
      description: 'Execute a paid x402 request with optional escrow and SLA checks.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', description: 'x402 endpoint URL.' },
          method: { type: 'string', description: 'HTTP method (default GET).' },
          body: { type: 'string', description: 'Optional request body as raw JSON string.' },
          useEscrow: { type: 'boolean', description: 'Force escrow-mode payment.' },
          transactionId: { type: 'string', description: 'Optional idempotent x402 transaction ID.' },
          timeoutMs: { type: 'number', description: 'Per-request timeout in milliseconds.' },
          maxLatencyMs: { type: 'number', description: 'SLA max latency check for auto-dispute pipeline.' },
        },
        required: ['url'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          runtime.ensureSigner();

          const url = readString(params, 'url')!;
          const method = (readString(params, 'method', false) ?? 'GET').toUpperCase();
          const body = readBody(params);
          const useEscrow = readBoolean(params, 'useEscrow');
          const transactionId = readString(params, 'transactionId', false);
          const timeoutMs = readNumber(params, 'timeoutMs', false);
          const maxLatencyMs = readNumber(params, 'maxLatencyMs', false);

          const response = await runtime.x402().request(url, {
            method,
            body,
            useEscrow,
            transactionId,
            timeoutMs,
            sla: maxLatencyMs ? { maxLatencyMs } : undefined,
          });

          if (!response.success) {
            return {
              ok: false,
              error: response.error
                ? {
                  code: response.error.code,
                  message: response.error.message,
                  details: response.error.details,
                }
                : { message: 'x402 request failed' },
            };
          }

          return {
            ok: true,
            data: response.data,
            meta: response.meta,
            slaResult: response.slaResult,
          };
        }),
    },
    {
      name: 'kamiyo_x402_dispute',
      description: 'Dispute an active x402 escrow transaction.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          transactionId: { type: 'string', description: 'x402 escrow transaction ID.' },
        },
        required: ['transactionId'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          runtime.ensureSigner();

          const transactionId = readString(params, 'transactionId')!;
          const result = await runtime.x402().disputeEscrow(transactionId);
          return {
            transactionId,
            success: result.success,
            signature: result.signature,
            escrowPda: result.escrowPda?.toBase58(),
            error: result.error
              ? {
                code: result.error.code,
                message: result.error.message,
                details: result.error.details,
              }
              : null,
          };
        }),
    },
    {
      name: 'kamiyo_x402_release',
      description: 'Release a successful x402 escrow transaction.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          transactionId: { type: 'string', description: 'x402 escrow transaction ID.' },
        },
        required: ['transactionId'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          runtime.ensureSigner();

          const transactionId = readString(params, 'transactionId')!;
          const result = await runtime.x402().releaseEscrow(transactionId);
          return {
            transactionId,
            success: result.success,
            signature: result.signature,
            escrowPda: result.escrowPda?.toBase58(),
            error: result.error
              ? {
                code: result.error.code,
                message: result.error.message,
                details: result.error.details,
              }
              : null,
          };
        }),
    },
    {
      name: 'kamiyo_x402_request_settlement',
      description: 'Request settlement/refund for a paid x402 transaction.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          paymentRef: { type: 'string', description: 'Payment reference used by settlement API.' },
          violation: {
            type: 'string',
            enum: ['timeout', 'serverError', 'latency', 'malformed', 'incomplete'],
            description: 'Violation reason.',
          },
          evidence: { type: 'string', description: 'Optional claim evidence.' },
        },
        required: ['paymentRef', 'violation'],
      },
      execute: async (_callId, params) =>
        runTool(async () => {
          const paymentRef = readString(params, 'paymentRef')!;
          const violation = readString(params, 'violation')!;
          const evidence = readString(params, 'evidence', false);

          const response = await fetchWithTimeout(
            `${runtime.getX402BaseUrl()}/api/settlement/${encodeURIComponent(paymentRef)}`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ violation, evidence }),
            },
            runtime.getX402TimeoutMs(),
          );

          const data = await response
            .json()
            .catch(() => null) as Record<string, unknown> | null;

          return {
            ok: response.ok,
            status: response.status,
            settlement: data,
          };
        }),
    },
  ];
}

function registerOptionalTool(api: OpenClawPluginApi, tool: AgentTool): void {
  try {
    api.registerTool(tool, { optional: true });
  } catch (error) {
    if (!isLegacyRegisterToolError(api, error)) {
      throw error;
    }
    api.registerTool(tool);
  }
}

function isLegacyRegisterToolError(api: OpenClawPluginApi, error: unknown): boolean {
  if (api.registerTool.length < 2) {
    return true;
  }
  const message = normalizeError(error).toLowerCase();
  return (
    message.includes('registertool')
    && (
      message.includes('options')
      || message.includes('argument')
      || message.includes('arity')
      || message.includes('signature')
    )
  );
}

export default function register(api: OpenClawPluginApi): void {
  const tools = createKamiyoOpenClawTools(api);
  for (const tool of tools) {
    registerOptionalTool(api, tool);
  }
}

export type {
  AgentTool,
  AgentToolResult,
  OpenClawPluginApi,
  ToolParams,
} from './types.js';
