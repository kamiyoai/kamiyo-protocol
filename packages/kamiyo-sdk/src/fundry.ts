import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { BN, Wallet } from '@coral-xyz/anchor';
import { KamiyoClient } from './client';

export const FUNDRY_CONFIG_TYPES = [
  'community',
  'preseed',
  'seriesa',
  'toly',
  'indie',
  'music',
  'whitewhale',
  'kamiyo',
  'origin',
  'retardchy',
  'illuminati',
  'presales',
  'aiagents',
  'nitro',
] as const;

export type FundryConfigType = (typeof FUNDRY_CONFIG_TYPES)[number];

export const DEFAULT_FUNDRY_TX_ALLOWED_PROGRAM_IDS = [
  '11111111111111111111111111111111', // System Program
  'ComputeBudget111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', // Metaplex Token Metadata
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  'AddressLookupTab1e1111111111111111111111111',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022 (only if used)
] as const;

export interface SecureLaunchParams {
  name: string;
  ticker: string;
  description: string;
  imageUrl: string;
  configType: FundryConfigType;
  escrowAmountSol?: number;
  migrationTargetSol?: number;
  initialBuySol?: number;
  creatorAddress?: string;
  creatorAllocationBps?: number;
}

export interface SecureLaunchResult {
  success: boolean;
  fundryCoinId?: string;
  mint?: string;
  fundryTxSignature?: string;
  txSignature?: string;
  launchRecordPda?: string;
  agentPda?: string;
  warning?: string;
  error?: string;
}

export interface FundryManagerConfig {
  connection: Connection;
  wallet: Wallet;
  fundryMcpEndpoint?: string;
  programId?: PublicKey;
  fundryTxAllowedProgramIds?: string[];
  enforceFundryTxAllowlist?: boolean;
}

type FundryToolResponse = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: unknown;
};

const DEFAULT_ESCROW_SOL = 0.5;
const MIN_ESCROW_SOL = 0.001;
const MAX_ESCROW_SOL = 1000;
const LAMPORTS_PER_SOL = 1_000_000_000;
const BUILDER_CONFIG_TYPES = new Set<FundryConfigType>([
  'community',
  'preseed',
  'seriesa',
  'toly',
  'indie',
  'kamiyo',
  'origin',
]);
const FUNDRY_HTTP_TIMEOUT_MS = 20_000;
const FUNDRY_HTTP_RETRIES = 3;
const FUNDRY_HTTP_BASE_BACKOFF_MS = 400;
const FUNDRY_HTTP_MAX_BACKOFF_MS = 6_000;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

type HttpError = Error & {
  status?: number;
  retryable?: boolean;
  retryAfterMs?: number;
};

export class FundryManager {
  private client: KamiyoClient;
  private fundryEndpoint: string;
  private allowedFundryProgramIds: Set<string> | null;
  private enforceFundryTxAllowlist: boolean;

  constructor(config: FundryManagerConfig) {
    this.client = new KamiyoClient({
      connection: config.connection,
      wallet: config.wallet,
      programId: config.programId,
    });

    this.fundryEndpoint = (config.fundryMcpEndpoint ?? 'https://fundry.collaterize.com/api/mcp/mcp')
      .trim()
      .replace(/\/+$/, '');

    const allowlist =
      config.fundryTxAllowedProgramIds === undefined
        ? [...DEFAULT_FUNDRY_TX_ALLOWED_PROGRAM_IDS]
        : config.fundryTxAllowedProgramIds;
    this.allowedFundryProgramIds = allowlist.length > 0 ? new Set(allowlist) : null;
    this.enforceFundryTxAllowlist = config.enforceFundryTxAllowlist === true;
  }

  async secureLaunch(params: SecureLaunchParams): Promise<SecureLaunchResult> {
    const escrowSol = params.escrowAmountSol ?? DEFAULT_ESCROW_SOL;
    if (escrowSol < MIN_ESCROW_SOL || escrowSol > MAX_ESCROW_SOL) {
      return {
        success: false,
        error: `Escrow must be between ${MIN_ESCROW_SOL} and ${MAX_ESCROW_SOL} SOL`,
      };
    }

    const migrationTargetSol = params.migrationTargetSol ?? 40;
    if (!Number.isFinite(migrationTargetSol) || migrationTargetSol <= 0) {
      return {
        success: false,
        error: 'migrationTargetSol must be a positive number',
      };
    }

    if (!FUNDRY_CONFIG_TYPES.includes(params.configType)) {
      return {
        success: false,
        error: `Invalid config type. Valid: ${FUNDRY_CONFIG_TYPES.join(', ')}`,
      };
    }

    if (!params.imageUrl.trim()) {
      return {
        success: false,
        error: 'imageUrl is required for Fundry token creation',
      };
    }

    if (params.initialBuySol !== undefined) {
      if (!Number.isFinite(params.initialBuySol) || params.initialBuySol <= 0) {
        return { success: false, error: 'initialBuySol must be a positive number' };
      }
    }

    if (params.creatorAllocationBps !== undefined) {
      if (
        !Number.isInteger(params.creatorAllocationBps) ||
        params.creatorAllocationBps < 0 ||
        params.creatorAllocationBps > 10_000
      ) {
        return {
          success: false,
          error: 'creatorAllocationBps must be an integer between 0 and 10000',
        };
      }
    }

    const owner = this.client.wallet.publicKey;
    const [agentPda] = this.client.getAgentPDA(owner);
    const agent = await this.client.getAgent(agentPda);
    if (!agent || !agent.isActive) {
      return {
        success: false,
        error: 'No active KAMIYO agent identity found. Create one first.',
      };
    }

    let creatorAddress = owner.toBase58();
    if (params.creatorAddress !== undefined) {
      try {
        creatorAddress = new PublicKey(params.creatorAddress).toBase58();
      } catch {
        return { success: false, error: 'Invalid creatorAddress (must be a Solana public key)' };
      }
    }
    if (creatorAddress !== owner.toBase58()) {
      return {
        success: false,
        error: 'creatorAddress must match the signing wallet (Fundry requires the creator to sign the launch tx)',
      };
    }

    let fundryCoinId: string | undefined;
    let mintAddress = '';
    let fundryTxSignature: string | undefined;
    let warning: string | undefined;

    try {
      const created = await this.callFundry<FundryToolResponse>('create_token', {
        name: params.name,
        ticker: params.ticker,
        description: params.description,
        imageUrl: params.imageUrl,
        configType: params.configType,
        creatorAddress,
        ...(params.initialBuySol !== undefined ? { initialBuySOL: params.initialBuySol } : {}),
      });

      if (!created?.success || !created.data) {
        return { success: false, error: this.describeToolFailure('create_token', created?.error) };
      }

      const coinId = created.data['coinId'];
      if (typeof coinId !== 'string' || coinId.length === 0) {
        return { success: false, error: 'Fundry response missing coinId' };
      }
      if (!isUuid36(coinId)) {
        return { success: false, error: 'Fundry response coinId is not a valid UUID' };
      }
      fundryCoinId = coinId;

      const txB64 = created.data['transaction'];
      if (typeof txB64 !== 'string' || txB64.length === 0) {
        return { success: false, fundryCoinId, error: 'Fundry response missing transaction' };
      }

      const sent = await this.signAndSendFundryTx(txB64);
      fundryTxSignature = sent.signature;
      warning = joinWarnings(warning, sent.warning);

      try {
        await this.callFundry('confirm_launch', {
          coinId: fundryCoinId,
          transactionSignature: fundryTxSignature,
        });
      } catch (err: unknown) {
        warning = joinWarnings(warning, 'Fundry confirm_launch failed: ' + errorMessage(err));
      }

      const maybeMint =
        created.data['mintAddress'] ?? created.data['mint'] ?? created.data['mint_address'];
      mintAddress = typeof maybeMint === 'string' ? maybeMint : '';

      if (!mintAddress) {
        try {
          const token = await this.callFundry<FundryToolResponse>('get_token', {
            coinId: fundryCoinId,
          });
          const discoveredMint = token?.data?.['mintAddress'] ?? token?.data?.['mint'];
          mintAddress = typeof discoveredMint === 'string' ? discoveredMint : '';
        } catch {
        }
      }

      if (!mintAddress) {
        return {
          success: false,
          fundryCoinId,
          fundryTxSignature,
          warning,
          error: 'Unable to discover mint address',
        };
      }
    } catch (err: unknown) {
      return {
        success: false,
        fundryCoinId,
        fundryTxSignature,
        warning,
        error: `Fundry token creation failed: ${errorMessage(err)}`,
      };
    }

    if (!fundryCoinId) {
      return {
        success: false,
        fundryTxSignature,
        warning,
        error: 'Fundry response missing coinId',
      };
    }
    const escrowLamports = new BN(Math.floor(escrowSol * LAMPORTS_PER_SOL));
    const mint = new PublicKey(mintAddress);
    const migrationTarget = new BN(Math.floor(migrationTargetSol * LAMPORTS_PER_SOL));

    try {
      const txSignature = await this.client.createTrustedLaunch({
        mint,
        fundryCoinId,
        configType: params.configType,
        escrowAmount: escrowLamports,
        migrationTargetSol: migrationTarget,
        creatorAllocationBps: params.creatorAllocationBps ?? 500,
      });

      const [launchRecordPda] = this.client.getLaunchRecordPDA(agentPda, mint);

      return {
        success: true,
        fundryCoinId,
        mint: mintAddress,
        fundryTxSignature,
        txSignature,
        launchRecordPda: launchRecordPda.toBase58(),
        agentPda: agentPda.toBase58(),
        warning,
      };
    } catch (err: unknown) {
      return {
        success: true,
        fundryCoinId,
        mint: mintAddress,
        fundryTxSignature,
        agentPda: agentPda.toBase58(),
        warning,
        error:
          'Token created but LaunchRecord failed: ' +
          errorMessage(err) +
          '. Manual record creation needed.',
      };
    }
  }

  async getLaunchRecord(
    agent: PublicKey,
    mint: PublicKey
  ): Promise<{ exists: boolean; pda: PublicKey }> {
    const [pda] = this.client.getLaunchRecordPDA(agent, mint);
    const accountInfo = await this.client.connection.getAccountInfo(pda);
    return { exists: accountInfo !== null, pda };
  }

  listConfigs(): { name: FundryConfigType; category: string }[] {
    return FUNDRY_CONFIG_TYPES.map(name => ({
      name,
      category: BUILDER_CONFIG_TYPES.has(name) ? 'builder' : 'monkes',
    }));
  }

  private async callFundry<T = unknown>(tool: string, args: Record<string, unknown>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= FUNDRY_HTTP_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FUNDRY_HTTP_TIMEOUT_MS);

      try {
        const response = await fetch(this.fundryEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: tool, arguments: args },
          }),
          signal: controller.signal,
        });

        const raw = await response.text();
        if (!response.ok) {
          const detail = raw.trim();
          const error = new Error(
            `Fundry API ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
          ) as HttpError;
          error.status = response.status;
          error.retryable = RETRYABLE_HTTP_STATUSES.has(response.status);
          error.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
          throw error;
        }

        const rpc = parseMcpJsonRpc(raw);
        const content = rpc?.result?.content?.[0]?.text;
        if (typeof content !== 'string' || content.trim().length === 0) {
          throw new Error('Fundry response missing content');
        }

        return JSON.parse(content) as T;
      } catch (error: unknown) {
        const normalized = normalizeFundryHttpError(error);
        lastError = normalized;
        const shouldRetry = attempt < FUNDRY_HTTP_RETRIES && isRetryableFundryError(normalized);
        if (!shouldRetry) {
          throw normalized;
        }
        const backoffMs = computeFundryBackoffMs({
          error: normalized,
          attempt,
          baseDelayMs: FUNDRY_HTTP_BASE_BACKOFF_MS,
          maxDelayMs: FUNDRY_HTTP_MAX_BACKOFF_MS,
        });
        await sleep(backoffMs);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw (lastError ?? new Error('Fundry request failed'));
  }

  private async signAndSendFundryTx(
    txB64: string
  ): Promise<{ signature: string; warning?: string }> {
    const bytes = Buffer.from(txB64, 'base64');

    let tx: Transaction | VersionedTransaction;
    try {
      tx = VersionedTransaction.deserialize(bytes);
    } catch {
      tx = Transaction.from(bytes);
    }

    const signer = this.client.wallet as unknown as {
      signTransaction(
        tx: Transaction | VersionedTransaction
      ): Promise<Transaction | VersionedTransaction>;
    };

    const allowlistWarning = this.checkTxAllowlist(tx);
    if (allowlistWarning && this.enforceFundryTxAllowlist) {
      throw new Error(allowlistWarning);
    }

    const signed = await signer.signTransaction(tx);
    const sig = await this.client.connection.sendRawTransaction(signed.serialize(), {
      maxRetries: 3,
    });

    try {
      const confirm = this.client.connection.confirmTransaction(sig, 'confirmed');
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timed out confirming Fundry transaction')), 30_000)
      );
      await Promise.race([confirm, timeout]);
    } catch {
      // Best-effort confirmation.
    }

    return { signature: sig, warning: allowlistWarning };
  }

  private checkTxAllowlist(tx: Transaction | VersionedTransaction): string | undefined {
    if (!this.allowedFundryProgramIds) return;

    const programIds = getProgramIds(tx);
    if (programIds.length === 0) return 'Fundry transaction contains no instructions';

    const disallowed = programIds.filter(id => !this.allowedFundryProgramIds!.has(id));
    if (disallowed.length === 0) return;

    return `Fundry transaction contains disallowed program IDs: ${disallowed.join(', ')}`;
  }

  private describeToolFailure(tool: string, error: unknown): string {
    if (!error) return `Fundry ${tool} failed`;

    if (typeof error === 'string') return `Fundry ${tool} failed: ${error}`;
    if (error instanceof Error) return `Fundry ${tool} failed: ${error.message}`;

    try {
      return `Fundry ${tool} failed: ${JSON.stringify(error)}`;
    } catch {
      return `Fundry ${tool} failed`;
    }
  }
}

type McpJsonRpcResponse = {
  result?: {
    content?: Array<{ text?: string }>;
  };
};

function parseMcpJsonRpc(raw: string): McpJsonRpcResponse {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const dataLine = trimmed
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.startsWith('data: '))
    .at(-1);

  if (!dataLine) {
    throw new Error('Fundry response missing data frame');
  }

  return JSON.parse(dataLine.slice(6));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed) return;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return;
  const delay = dateMs - Date.now();
  if (delay <= 0) return;
  return delay;
}

function normalizeFundryHttpError(error: unknown): Error {
  if (error instanceof Error && error.name === 'AbortError') {
    const timeoutError = new Error(
      `Fundry request timed out after ${FUNDRY_HTTP_TIMEOUT_MS}ms`
    ) as HttpError;
    timeoutError.retryable = true;
    return timeoutError;
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function isHttpError(error: unknown): error is HttpError {
  if (!(error instanceof Error)) return false;
  return (
    typeof (error as HttpError).status === 'number' ||
    typeof (error as HttpError).retryable === 'boolean'
  );
}

function isRetryableFundryError(error: Error): boolean {
  if (isHttpError(error)) {
    if (error.retryable === true) return true;
    if (typeof error.status === 'number') return RETRYABLE_HTTP_STATUSES.has(error.status);
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket')
  );
}

function computeFundryBackoffMs(params: {
  error: Error;
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
}): number {
  if (
    isHttpError(params.error) &&
    typeof params.error.retryAfterMs === 'number' &&
    params.error.retryAfterMs > 0
  ) {
    return Math.min(params.error.retryAfterMs, params.maxDelayMs);
  }

  const raw = Math.min(params.baseDelayMs * Math.pow(2, params.attempt), params.maxDelayMs);
  return Math.max(25, Math.round(raw * (0.5 + Math.random() * 0.5)));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

function joinWarnings(existing: string | undefined, next: string | undefined): string | undefined {
  if (!next) return existing;
  if (!existing) return next;
  return `${existing}; ${next}`;
}

type VersionedMessageLike = {
  staticAccountKeys?: PublicKey[];
  accountKeys?: PublicKey[];
  compiledInstructions?: Array<{ programIdIndex: number }>;
  instructions?: Array<{ programIdIndex: number }>;
};

function getProgramIds(tx: Transaction | VersionedTransaction): string[] {
  if (tx instanceof Transaction) {
    return uniq(tx.instructions.map(ix => ix.programId.toBase58()));
  }

  const msg = (tx as unknown as { message?: unknown }).message;
  if (!msg || typeof msg !== 'object') return [];

  const parsed = msg as VersionedMessageLike;
  const keys: PublicKey[] = parsed.staticAccountKeys ?? parsed.accountKeys ?? [];
  const compiled = parsed.compiledInstructions ?? parsed.instructions ?? [];
  const ids = compiled
    .map(ix => {
      const idx = ix.programIdIndex;
      const key = keys[idx];
      return key ? key.toBase58() : null;
    })
    .filter((v): v is string => typeof v === 'string');

  return uniq(ids);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isUuid36(value: string): boolean {
  if (value.length !== 36) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      if (c !== 45) return false;
      continue;
    }

    const isDigit = c >= 48 && c <= 57;
    const isLowerHex = c >= 97 && c <= 102;
    const isUpperHex = c >= 65 && c <= 70;
    if (!isDigit && !isLowerHex && !isUpperHex) return false;
  }
  return true;
}
