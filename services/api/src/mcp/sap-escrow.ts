import { LAMPORTS_PER_SOL, type Keypair, PublicKey } from '@solana/web3.js';
import { SapConnection } from '@oobe-protocol-labs/synapse-sap-sdk';
import { logger } from '../logger';
import { validateSapEscrowArgs } from '../sap-escrow-policy';
import { resolveSolanaRpcUrl } from '../solana';
import { loadSolanaKeypair } from '../solana-keypair';

const DEFAULT_SAP_BASELINE_PRICE_MICRO_USDC = 1_388;

interface SapEscrowRuntime {
  cacheKey: string;
  keypair: Keypair;
  connection: SapConnection & { readonly client: ReturnType<SapConnection['createClient']> };
}

let cachedRuntime: SapEscrowRuntime | null = null;

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getSapAgentSecret(): string | null {
  return process.env.SAP_AGENT_KEYPAIR?.trim() || process.env.MCP_AGENT_KEYPAIR?.trim() || null;
}

function getSapBaselinePriceMicroUsdc(): number {
  const raw = process.env.SAP_BASELINE_PRICE_MICRO_USDC?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SAP_BASELINE_PRICE_MICRO_USDC;
}

function getSapEscrowRuntime(): SapEscrowRuntime | null {
  const secret = getSapAgentSecret();
  if (!secret) {
    return null;
  }

  const rpcUrl = resolveSolanaRpcUrl();
  const cluster = SapConnection.detectCluster(rpcUrl);
  const cacheKey = `${rpcUrl}:${cluster}:${secret}`;

  if (cachedRuntime?.cacheKey === cacheKey) {
    return cachedRuntime;
  }

  try {
    const keypair = loadSolanaKeypair(secret);
    const connection = SapConnection.fromKeypair(rpcUrl, keypair, { cluster });
    cachedRuntime = {
      cacheKey,
      keypair,
      connection,
    };
    return cachedRuntime;
  } catch (error) {
    logger.error('failed to initialize sap escrow runtime', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function toLamports(amountSol: number): number {
  return Math.floor(amountSol * LAMPORTS_PER_SOL);
}

function getEscrowLookupKey(params: { escrowAddress?: string; transactionId?: string }):
  | { ok: true; escrow: PublicKey }
  | { ok: false; error: string } {
  const raw = params.escrowAddress?.trim() || params.transactionId?.trim() || '';
  if (!raw) {
    return { ok: false, error: 'escrowAddress required for SAP escrow status checks' };
  }

  try {
    return { ok: true, escrow: new PublicKey(raw) };
  } catch {
    return {
      ok: false,
      error: 'escrowAddress must be a valid escrow PDA; transactionId is only a deprecated alias for the same value',
    };
  }
}

function deriveStatus(balance: { balance: { toString(): string }; isExpired: boolean }): string {
  if (balance.isExpired) {
    return 'expired';
  }
  if (balance.balance.toString() === '0') {
    return 'depleted';
  }
  return 'active';
}

export async function createSapEscrow(
  params: { api: string; amount: number; timeLock?: number; pricePerCall?: number | string; maxCalls?: number | string }
): Promise<Record<string, unknown>> {
  const validation = validateSapEscrowArgs(params);
  if (!validation.ok) {
    return {
      success: false,
      code: validation.code,
      error: validation.message,
    };
  }

  const runtime = getSapEscrowRuntime();
  if (!runtime) {
    return {
      success: false,
      error: 'SAP escrow runtime is not configured. Set SAP_AGENT_KEYPAIR or MCP_AGENT_KEYPAIR.',
    };
  }

  try {
    const apiWallet = new PublicKey(params.api);
    const deposit = toLamports(params.amount);
    if (deposit < 1_000_000) {
      return { success: false, error: 'amount too small (min 0.001 SOL)' };
    }

    const timeLock = typeof params.timeLock === 'number' && Number.isFinite(params.timeLock)
      ? Math.floor(params.timeLock)
      : 3600;
    if (timeLock < 3600 || timeLock > 2_592_000) {
      return { success: false, error: 'timeLock must be 3600-2592000 seconds' };
    }

    const pricePerCall = parsePositiveInteger(params.pricePerCall) ?? getSapBaselinePriceMicroUsdc();
    const maxCalls = parsePositiveInteger(params.maxCalls) ?? 0;
    const expiresAt = Math.floor(Date.now() / 1000) + timeLock;

    const context = await runtime.connection.client.x402.preparePayment(apiWallet, {
      pricePerCall,
      maxCalls,
      deposit,
      expiresAt,
    });

    return {
      success: true,
      escrowAddress: context.escrowPda.toBase58(),
      transactionId: context.escrowPda.toBase58(),
      signature: context.txSignature,
      api: apiWallet.toBase58(),
      agent: context.agentPda.toBase58(),
      depositor: context.depositorWallet.toBase58(),
      pricePerCall: context.pricePerCall.toString(),
      maxCalls: context.maxCalls.toString(),
      paymentHeaders: runtime.connection.client.x402.buildPaymentHeaders(context, {
        network: runtime.connection.cluster,
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create SAP escrow',
    };
  }
}

export async function checkSapEscrowStatus(
  params: { escrowAddress?: string; transactionId?: string }
): Promise<Record<string, unknown>> {
  const lookup = getEscrowLookupKey(params);
  if (!lookup.ok) {
    return { success: false, error: lookup.error };
  }

  const runtime = getSapEscrowRuntime();
  if (!runtime) {
    return {
      success: false,
      error: 'SAP escrow runtime is not configured. Set SAP_AGENT_KEYPAIR or MCP_AGENT_KEYPAIR.',
    };
  }

  try {
    const escrow = await runtime.connection.client.escrow.fetchByPda(lookup.escrow);
    const balance = await runtime.connection.client.x402.getBalance(escrow.agentWallet, escrow.depositor);
    if (!balance) {
      return { success: false, error: 'SAP escrow not found' };
    }

    return {
      success: true,
      status: deriveStatus(balance),
      escrowAddress: lookup.escrow.toBase58(),
      transactionId: lookup.escrow.toBase58(),
      agent: escrow.agent.toBase58(),
      api: escrow.agentWallet.toBase58(),
      depositor: escrow.depositor.toBase58(),
      amount: Number(escrow.totalDeposited.toString()) / LAMPORTS_PER_SOL,
      createdAt: escrow.createdAt.toNumber(),
      expiresAt: escrow.expiresAt.toNumber(),
      balance: balance.balance.toString(),
      totalDeposited: escrow.totalDeposited.toString(),
      totalSettled: escrow.totalSettled.toString(),
      totalCallsSettled: escrow.totalCallsSettled.toString(),
      pricePerCall: escrow.pricePerCall.toString(),
      maxCalls: escrow.maxCalls.toString(),
      callsRemaining: balance.callsRemaining,
      affordableCalls: balance.affordableCalls,
      isExpired: balance.isExpired,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch SAP escrow',
    };
  }
}
