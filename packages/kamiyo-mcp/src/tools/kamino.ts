import { PublicKey, type Commitment, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { SolanaClient } from '../solana/client.js';

const DEFAULT_API_BASE_URL = process.env.KAMINO_API_BASE_URL || 'https://api.kamino.finance';
const DEFAULT_USDC_MINT =
  process.env.KAMINO_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_CONFIRM_TIMEOUT_MS = 90_000;

export const KAMINO_TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'kamino_list_vaults',
    description: 'List Kamino KVaults for a token mint (defaults to USDC).',
    inputSchema: {
      type: 'object',
      properties: {
        tokenMint: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'kamino_vault_metrics',
    description: 'Fetch APY and AUM metrics for a Kamino vault.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: { type: 'string' },
      },
      required: ['vault'],
    },
  },
  {
    name: 'kamino_suggest_vaults',
    description: 'Rank Kamino vaults by APY and liquidity constraints.',
    inputSchema: {
      type: 'object',
      properties: {
        tokenMint: { type: 'string' },
        limit: { type: 'number' },
        apyWindow: {
          type: 'string',
          enum: ['apy24h', 'apy7d', 'apy30d', 'apy90d', 'apy180d', 'apy365d', 'apy'],
        },
        minAumUsd: { type: 'number' },
        includeMetadata: { type: 'boolean' },
      },
    },
  },
  {
    name: 'kamino_positions',
    description: 'Get KVault positions for a wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string' },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'kamino_deposit',
    description: 'Build or submit a Kamino KVault deposit transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: { type: 'string' },
        amount: { type: 'string' },
        wallet: { type: 'string' },
        dryRun: { type: 'boolean' },
        confirm: { type: 'boolean' },
        commitment: { type: 'string', enum: ['processed', 'confirmed', 'finalized'] },
        confirmTimeoutMs: { type: 'number' },
      },
      required: ['vault', 'amount'],
    },
  },
  {
    name: 'kamino_withdraw',
    description: 'Build or submit a Kamino KVault withdraw transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: { type: 'string' },
        amount: { type: 'string' },
        withdrawAll: { type: 'boolean' },
        wallet: { type: 'string' },
        dryRun: { type: 'boolean' },
        confirm: { type: 'boolean' },
        commitment: { type: 'string', enum: ['processed', 'confirmed', 'finalized'] },
        confirmTimeoutMs: { type: 'number' },
      },
      required: ['vault'],
    },
  },
  {
    name: 'kamino_autosave_usdc',
    description: 'Auto-route idle USDC into the highest-ranked Kamino vault.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string' },
        bufferUsdc: { type: ['string', 'number'] as any },
        minDepositUsdc: { type: ['string', 'number'] as any },
        maxDepositUsdc: { type: ['string', 'number'] as any },
        apyWindow: {
          type: 'string',
          enum: ['apy24h', 'apy7d', 'apy30d', 'apy90d', 'apy180d', 'apy365d', 'apy'],
        },
        minAumUsd: { type: 'number' },
        vault: { type: 'string' },
        dryRun: { type: 'boolean' },
      },
    },
  },
];

type KaminoVault = {
  address: string;
  programId: string;
  state: {
    tokenMint: string;
    tokenMintDecimals: number;
    sharesMint: string;
    sharesMintDecimals: number;
    managementFeeBps?: number;
    performanceFeeBps?: number;
  };
};

type KvaultMetrics = {
  apy?: string;
  apy24h?: string;
  apy7d?: string;
  apy30d?: string;
  apy90d?: string;
  apy180d?: string;
  apy365d?: string;
  tokensAvailableUsd?: string;
  tokensInvestedUsd?: string;
  tokenPrice?: { value: string } | string;
  sharePrice?: { value: string } | string;
  tokensPerShare?: { value: string } | string;
};

type MintMetadata = {
  name: string;
  symbol: string;
  description: string;
  image: string;
};

type ApyWindow = 'apy24h' | 'apy7d' | 'apy30d' | 'apy90d' | 'apy180d' | 'apy365d' | 'apy';

type CacheEntry<T> = { value: T; expiresAtMs: number };
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAtMs) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAtMs: Date.now() + ttlMs });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableTxError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('blockhash not found') ||
    m.includes('blockhashnotfound') ||
    m.includes('transactionexpiredblockheightexceeded') ||
    m.includes('node is behind') ||
    m.includes('timeout') ||
    m.includes('429')
  );
}

function decimalToBaseUnits(amount: string, decimals: number): bigint {
  const s = String(amount).trim();
  if (!s) throw new Error('Amount is required');
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Invalid amount format');

  const [whole, frac = ''] = s.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const base = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0');
  return base;
}

function baseUnitsToDecimal(amount: bigint, decimals: number): string {
  const neg = amount < 0n;
  const v = neg ? -amount : amount;
  const denom = 10n ** BigInt(decimals);
  const whole = v / denom;
  const frac = v % denom;
  if (decimals === 0) return `${neg ? '-' : ''}${whole}`;

  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${neg ? '-' : ''}${whole}.${fracStr}` : `${neg ? '-' : ''}${whole}`;
}

async function fetchKaminoJson<T>(
  path: string,
  init?: RequestInit,
  baseUrl: string = DEFAULT_API_BASE_URL
): Promise<T> {
  const url = new URL(path, baseUrl);
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kamino API error ${res.status}: ${text.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

async function getTokenBalanceBaseUnits(
  client: SolanaClient,
  owner: PublicKey,
  mint: PublicKey
): Promise<{ amount: bigint; decimals: number }> {
  const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

  let total = 0n;
  let decimals: number | null = null;

  for (const programId of programs) {
    const accounts = await client.connection.getParsedTokenAccountsByOwner(owner, { programId });
    for (const a of accounts.value) {
      const parsed = (a.account.data as any)?.parsed?.info;
      if (!parsed) continue;
      if (parsed.mint !== mint.toBase58()) continue;
      const ta = parsed.tokenAmount;
      if (!ta?.amount) continue;
      total += BigInt(ta.amount);
      if (decimals === null && typeof ta.decimals === 'number') decimals = ta.decimals;
    }
  }

  if (decimals === null) decimals = 0;
  return { amount: total, decimals };
}

function parseDecimalString(s: unknown): number | null {
  const n = typeof s === 'string' ? Number(s) : typeof s === 'number' ? s : NaN;
  return Number.isFinite(n) ? n : null;
}

function metricsAumUsd(metrics: KvaultMetrics): number | null {
  const a = parseDecimalString(metrics.tokensAvailableUsd);
  const b = parseDecimalString(metrics.tokensInvestedUsd);
  if (a === null && b === null) return null;
  return (a || 0) + (b || 0);
}

function metricsApy(metrics: KvaultMetrics, window: ApyWindow): number | null {
  return parseDecimalString((metrics as any)[window]);
}

function isProbablyMainnet(rpcUrl: string): boolean {
  const u = rpcUrl.toLowerCase();
  if (u.includes('devnet') || u.includes('testnet')) return false;
  if (u.includes('localhost') || u.includes('127.0.0.1')) return false;
  return true;
}

async function confirmSignature(
  client: SolanaClient,
  signature: string,
  commitment: Commitment,
  timeoutMs: number
): Promise<'confirmed' | 'finalized'> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = await client.connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const s = st.value[0];
    if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === 'finalized') return 'finalized';
    if (s?.confirmationStatus === 'confirmed' && commitment !== 'finalized') return 'confirmed';
    await sleep(1_500);
  }
  throw new Error('Transaction confirmation timeout');
}

async function buildKvaultDepositTx(args: {
  wallet: string;
  kvault: string;
  amount: string;
}): Promise<{ transaction: string }> {
  return fetchKaminoJson('/ktx/kvault/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

async function buildKvaultWithdrawTx(args: {
  wallet: string;
  kvault: string;
  amount: string;
}): Promise<{ transaction: string }> {
  return fetchKaminoJson('/ktx/kvault/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

async function sendVersionedTxBase64(args: {
  client: SolanaClient;
  txBase64: string;
  commitment: Commitment;
  confirm: boolean;
  confirmTimeoutMs: number;
}): Promise<{ signature: string; confirmationStatus?: 'confirmed' | 'finalized' }> {
  const bytes = Buffer.from(args.txBase64, 'base64');
  const tx = VersionedTransaction.deserialize(bytes);
  tx.sign([args.client.wallet]);

  const signature = await args.client.connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  if (!args.confirm) return { signature };
  const status = await confirmSignature(args.client, signature, args.commitment, args.confirmTimeoutMs);
  return { signature, confirmationStatus: status };
}

export async function kaminoListVaults(args: {
  tokenMint?: string;
  limit?: number;
}): Promise<{ success: boolean; vaults?: KaminoVault[]; error?: string }> {
  try {
    const tokenMint = typeof args.tokenMint === 'string' && args.tokenMint ? args.tokenMint : DEFAULT_USDC_MINT;
    const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(200, args.limit)) : 200;

    const cacheKey = `kvaults:vaults:${tokenMint}:${limit}`;
    const cached = getCached<KaminoVault[]>(cacheKey);
    if (cached) return { success: true, vaults: cached };

    const all = await fetchKaminoJson<KaminoVault[]>('/kvaults/vaults');
    const filtered = all.filter((v) => v?.state?.tokenMint === tokenMint).slice(0, limit);
    setCached(cacheKey, filtered, 60_000);
    return { success: true, vaults: filtered };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to list vaults' };
  }
}

export async function kaminoVaultMetrics(args: {
  vault: string;
}): Promise<{ success: boolean; metrics?: KvaultMetrics; aumUsd?: number | null; error?: string }> {
  try {
    if (!args.vault) return { success: false, error: 'vault is required' };
    const vault = new PublicKey(args.vault).toBase58();

    const cacheKey = `kvaults:metrics:${vault}`;
    const cached = getCached<{ metrics: KvaultMetrics; aumUsd: number | null }>(cacheKey);
    if (cached) return { success: true, metrics: cached.metrics, aumUsd: cached.aumUsd };

    const metrics = await fetchKaminoJson<KvaultMetrics>(`/kvaults/vaults/${vault}/metrics`);
    const aumUsd = metricsAumUsd(metrics);
    setCached(cacheKey, { metrics, aumUsd }, 120_000);

    return { success: true, metrics, aumUsd };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch vault metrics' };
  }
}

export async function kaminoSuggestVaults(args: {
  tokenMint?: string;
  limit?: number;
  apyWindow?: ApyWindow;
  minAumUsd?: number;
  includeMetadata?: boolean;
}): Promise<{
  success: boolean;
  tokenMint?: string;
  apyWindow?: ApyWindow;
  vaults?: Array<{
    vault: string;
    sharesMint: string;
    name?: string;
    symbol?: string;
    aumUsd?: number | null;
    apy?: number | null;
  }>;
  error?: string;
}> {
  try {
    const tokenMint = typeof args.tokenMint === 'string' && args.tokenMint ? args.tokenMint : DEFAULT_USDC_MINT;
    const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(20, args.limit)) : 5;
    const apyWindow: ApyWindow = (args.apyWindow as ApyWindow) || 'apy30d';
    const minAumUsd =
      typeof args.minAumUsd === 'number'
        ? Math.max(0, args.minAumUsd)
        : Number(process.env.KAMINO_MIN_AUM_USD || 250_000);
    const includeMetadata = args.includeMetadata !== false;

    const cacheKey = `kvaults:suggest:${tokenMint}:${limit}:${apyWindow}:${minAumUsd}:${includeMetadata}`;
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;

    const list = await kaminoListVaults({ tokenMint, limit: 200 });
    if (!list.success || !list.vaults) return { success: false, error: list.error || 'Failed to list vaults' };

    const vaults = list.vaults;
    const metricsList = await mapWithConcurrency(
      vaults,
      8,
      async (v) => {
        const m = await kaminoVaultMetrics({ vault: v.address });
        if (!m.success || !m.metrics) return null;
        const aumUsd = m.aumUsd;
        const apy = metricsApy(m.metrics, apyWindow);
        return { v, aumUsd, apy };
      }
    );

    const ranked = metricsList
      .filter((x): x is NonNullable<typeof x> => !!x)
      .filter((x) => (x.aumUsd || 0) >= minAumUsd)
      .sort((a, b) => (b.apy || -Infinity) - (a.apy || -Infinity))
      .slice(0, limit);

    const withMeta = includeMetadata
      ? await mapWithConcurrency(
          ranked,
          6,
          async (x) => {
            const meta = await fetchKaminoJson<MintMetadata>(
              `/kvaults/mints/${new PublicKey(x.v.state.sharesMint).toBase58()}/metadata`
            ).catch(() => null);
            return {
              vault: x.v.address,
              sharesMint: x.v.state.sharesMint,
              name: meta?.name,
              symbol: meta?.symbol,
              aumUsd: x.aumUsd ?? null,
              apy: x.apy ?? null,
            };
          }
        )
      : ranked.map((x) => ({
          vault: x.v.address,
          sharesMint: x.v.state.sharesMint,
          aumUsd: x.aumUsd ?? null,
          apy: x.apy ?? null,
        }));

    const result = { success: true, tokenMint, apyWindow, vaults: withMeta };
    setCached(cacheKey, result, 180_000);
    return result;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to suggest vaults' };
  }
}

export async function kaminoPositions(args: {
  wallet: string;
}): Promise<{ success: boolean; positions?: unknown; error?: string }> {
  try {
    if (!args.wallet) return { success: false, error: 'wallet is required' };
    const wallet = new PublicKey(args.wallet).toBase58();
    const positions = await fetchKaminoJson<unknown>(`/kvaults/users/${wallet}/positions`);
    return { success: true, positions };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch positions' };
  }
}

export async function kaminoDeposit(
  args: {
    vault: string;
    amount: string;
    wallet?: string;
    dryRun?: boolean;
    confirm?: boolean;
    commitment?: Commitment;
    confirmTimeoutMs?: number;
  },
  client: SolanaClient | undefined
): Promise<{
  success: boolean;
  vault?: string;
  wallet?: string;
  amount?: string;
  txBase64?: string;
  signature?: string;
  confirmationStatus?: 'confirmed' | 'finalized';
  error?: string;
}> {
  try {
    if (!client) return { success: false, error: 'Solana wallet not configured' };

    const vault = new PublicKey(args.vault).toBase58();
    if (args.wallet && args.wallet !== client.publicKey.toBase58()) {
      return { success: false, error: 'wallet must match the configured agent wallet' };
    }
    const wallet = client.publicKey.toBase58();
    const amount = String(args.amount || '').trim();
    if (!amount) return { success: false, error: 'amount is required' };

    const dryRun = args.dryRun !== false;
    if (dryRun) {
      const txResp = await buildKvaultDepositTx({ wallet, kvault: vault, amount });
      return { success: true, vault, wallet, amount, txBase64: txResp.transaction };
    }

    const rpcUrl = client.connection.rpcEndpoint;
    if (!isProbablyMainnet(rpcUrl)) {
      return { success: false, error: 'Refusing to send: SOLANA_RPC_URL does not look like mainnet' };
    }

    const commitment = args.commitment || 'confirmed';
    const confirm = args.confirm !== false;
    const confirmTimeoutMs = args.confirmTimeoutMs || DEFAULT_CONFIRM_TIMEOUT_MS;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const txResp = await buildKvaultDepositTx({ wallet, kvault: vault, amount });
        const sent = await sendVersionedTxBase64({
          client,
          txBase64: txResp.transaction,
          commitment,
          confirm,
          confirmTimeoutMs,
        });
        return {
          success: true,
          vault,
          wallet,
          amount,
          signature: sent.signature,
          confirmationStatus: sent.confirmationStatus,
        };
      } catch (e: any) {
        if (!isRetryableTxError(String(e?.message || e)) || attempt === 1) throw e;
        await sleep(1_000);
      }
    }

    return { success: false, error: 'Failed to send transaction' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Deposit failed' };
  }
}

export async function kaminoWithdraw(
  args: {
    vault: string;
    amount?: string;
    withdrawAll?: boolean;
    wallet?: string;
    dryRun?: boolean;
    confirm?: boolean;
    commitment?: Commitment;
    confirmTimeoutMs?: number;
  },
  client: SolanaClient | undefined
): Promise<{
  success: boolean;
  vault?: string;
  wallet?: string;
  amount?: string;
  txBase64?: string;
  signature?: string;
  confirmationStatus?: 'confirmed' | 'finalized';
  error?: string;
}> {
  try {
    if (!client) return { success: false, error: 'Solana wallet not configured' };

    const vault = new PublicKey(args.vault).toBase58();
    if (args.wallet && args.wallet !== client.publicKey.toBase58()) {
      return { success: false, error: 'wallet must match the configured agent wallet' };
    }
    const wallet = client.publicKey.toBase58();
    const amount = args.withdrawAll ? '18446744073709551615' : String(args.amount || '').trim();
    if (!amount) return { success: false, error: 'amount is required unless withdrawAll=true' };

    const dryRun = args.dryRun !== false;
    if (dryRun) {
      const txResp = await buildKvaultWithdrawTx({ wallet, kvault: vault, amount });
      return { success: true, vault, wallet, amount, txBase64: txResp.transaction };
    }

    const rpcUrl = client.connection.rpcEndpoint;
    if (!isProbablyMainnet(rpcUrl)) {
      return { success: false, error: 'Refusing to send: SOLANA_RPC_URL does not look like mainnet' };
    }

    const commitment = args.commitment || 'confirmed';
    const confirm = args.confirm !== false;
    const confirmTimeoutMs = args.confirmTimeoutMs || DEFAULT_CONFIRM_TIMEOUT_MS;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const txResp = await buildKvaultWithdrawTx({ wallet, kvault: vault, amount });
        const sent = await sendVersionedTxBase64({
          client,
          txBase64: txResp.transaction,
          commitment,
          confirm,
          confirmTimeoutMs,
        });
        return {
          success: true,
          vault,
          wallet,
          amount,
          signature: sent.signature,
          confirmationStatus: sent.confirmationStatus,
        };
      } catch (e: any) {
        if (!isRetryableTxError(String(e?.message || e)) || attempt === 1) throw e;
        await sleep(1_000);
      }
    }

    return { success: false, error: 'Failed to send transaction' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Withdraw failed' };
  }
}

export async function kaminoAutosaveUsdc(
  args: {
    wallet?: string;
    bufferUsdc?: string | number;
    minDepositUsdc?: string | number;
    maxDepositUsdc?: string | number;
    apyWindow?: ApyWindow;
    minAumUsd?: number;
    vault?: string;
    dryRun?: boolean;
  },
  client: SolanaClient | undefined
): Promise<{
  success: boolean;
  wallet?: string;
  usdcMint?: string;
  usdcBalance?: string;
  bufferUsdc?: string;
  idleUsdc?: string;
  depositUsdc?: string;
  selectedVault?: {
    vault: string;
    sharesMint: string;
    name?: string;
    symbol?: string;
    apy?: number | null;
    aumUsd?: number | null;
  };
  txBase64?: string;
  signature?: string;
  confirmationStatus?: 'confirmed' | 'finalized';
  skipped?: boolean;
  reason?: string;
  error?: string;
}> {
  try {
    if (!client) return { success: false, error: 'Solana wallet not configured' };

    if (args.wallet && args.wallet !== client.publicKey.toBase58()) {
      return { success: false, error: 'wallet must match the configured agent wallet' };
    }

    const walletPk = client.publicKey;
    const usdcMint = new PublicKey(DEFAULT_USDC_MINT);

    const solLamports = await client.connection.getBalance(walletPk);
    if (solLamports < 500_000) {
      return { success: true, skipped: true, reason: 'Insufficient SOL for fees', wallet: walletPk.toBase58() };
    }

    let { amount: usdcBase, decimals } = await getTokenBalanceBaseUnits(client, walletPk, usdcMint);
    if (decimals === 0) decimals = 6;
    const usdcBalance = baseUnitsToDecimal(usdcBase, decimals);

    const bufferStr = args.bufferUsdc === undefined ? '5' : String(args.bufferUsdc);
    const minDepositStr = args.minDepositUsdc === undefined ? '20' : String(args.minDepositUsdc);
    const maxDepositStr = args.maxDepositUsdc === undefined ? null : String(args.maxDepositUsdc);

    const bufferBase = decimalToBaseUnits(bufferStr, decimals);
    const minDepositBase = decimalToBaseUnits(minDepositStr, decimals);
    const maxDepositBase = maxDepositStr ? decimalToBaseUnits(maxDepositStr, decimals) : null;

    const idleBase = usdcBase - bufferBase;
    const idleUsdc = baseUnitsToDecimal(idleBase > 0n ? idleBase : 0n, decimals);

    if (idleBase <= 0n) {
      return {
        success: true,
        skipped: true,
        reason: 'No idle USDC (balance below buffer)',
        wallet: walletPk.toBase58(),
        usdcMint: usdcMint.toBase58(),
        usdcBalance,
        bufferUsdc: bufferStr,
        idleUsdc,
      };
    }

    if (idleBase < minDepositBase) {
      return {
        success: true,
        skipped: true,
        reason: 'Idle USDC below minDepositUsdc',
        wallet: walletPk.toBase58(),
        usdcMint: usdcMint.toBase58(),
        usdcBalance,
        bufferUsdc: bufferStr,
        idleUsdc,
      };
    }

    const depositBase = maxDepositBase ? (idleBase > maxDepositBase ? maxDepositBase : idleBase) : idleBase;
    const depositUsdc = baseUnitsToDecimal(depositBase, decimals);

    const apyWindow: ApyWindow = (args.apyWindow as ApyWindow) || 'apy30d';
    const minAumUsd =
      typeof args.minAumUsd === 'number'
        ? Math.max(0, args.minAumUsd)
        : Number(process.env.KAMINO_MIN_AUM_USD || 250_000);

    const selected =
      args.vault && args.vault.trim()
        ? null
        : await kaminoSuggestVaults({
            tokenMint: usdcMint.toBase58(),
            limit: 1,
            apyWindow,
            minAumUsd,
            includeMetadata: true,
          });

    const picked =
      args.vault && args.vault.trim()
        ? { vault: new PublicKey(args.vault).toBase58(), sharesMint: '', apy: null, aumUsd: null }
        : selected?.success && selected.vaults && selected.vaults.length > 0
          ? selected.vaults[0]
          : null;

    if (!picked) {
      return {
        success: false,
        error: 'No suitable USDC vault found',
        wallet: walletPk.toBase58(),
        usdcMint: usdcMint.toBase58(),
        usdcBalance,
        bufferUsdc: bufferStr,
        idleUsdc,
        depositUsdc,
      };
    }

    const depositRes = await kaminoDeposit(
      {
        vault: picked.vault,
        amount: depositUsdc,
        wallet: walletPk.toBase58(),
        dryRun: args.dryRun !== false,
        confirm: true,
        commitment: 'confirmed',
      },
      client
    );

    if (!depositRes.success) {
      return {
        success: false,
        error: depositRes.error || 'Deposit failed',
        wallet: walletPk.toBase58(),
        usdcMint: usdcMint.toBase58(),
        usdcBalance,
        bufferUsdc: bufferStr,
        idleUsdc,
        depositUsdc,
        selectedVault: picked,
      };
    }

    return {
      success: true,
      wallet: walletPk.toBase58(),
      usdcMint: usdcMint.toBase58(),
      usdcBalance,
      bufferUsdc: bufferStr,
      idleUsdc,
      depositUsdc,
      selectedVault: picked,
      txBase64: depositRes.txBase64,
      signature: depositRes.signature,
      confirmationStatus: depositRes.confirmationStatus,
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'AutoSave failed' };
  }
}
