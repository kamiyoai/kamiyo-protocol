import type { IncomingHttpHeaders } from 'node:http';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { createPayAIFacilitator, PayAIFacilitator, type PayAINetwork } from '@kamiyo/x402-client';
import { SapConnection, deriveAgent, deriveEscrow, hashToArray, sha256, type X402Headers } from '@oobe-protocol-labs/synapse-sap-sdk';
import { getX402Capability, resolveX402SupportedNetworks } from './core-capabilities';
import { logger } from './logger';
import { loadSolanaKeypair } from './solana-keypair';
import { resolveSolanaRpcUrl } from './solana';

export type X402HeaderType = 'missing' | 'payment-signature' | 'x-payment' | 'sap-x402';

export interface X402PaymentHeader {
  type: X402HeaderType;
  value: string | null;
  forwardHeaders: Record<string, string>;
  sapHeaders: X402Headers | null;
}

export interface SettledX402Payment {
  payer?: string;
  network?: string;
  amount?: string;
  tx?: string;
  headerType: Exclude<X402HeaderType, 'missing'>;
}

interface VerifyX402PaymentOptions {
  allowSapX402?: boolean;
}

let facilitator: PayAIFacilitator | null = null;
let cachedSapRuntime:
  | {
      cacheKey: string;
      agentWallet: PublicKey;
      agentPda: PublicKey;
      connection: SapConnection;
      client: ReturnType<SapConnection['createClient']>;
    }
  | null = null;

const SAP_X402_HEADER_NAMES = [
  'X-Payment-Protocol',
  'X-Payment-Escrow',
  'X-Payment-Agent',
  'X-Payment-Depositor',
  'X-Payment-MaxCalls',
  'X-Payment-PricePerCall',
  'X-Payment-Program',
  'X-Payment-Network',
] as const;
const KAMIYO_FACILITATOR_URL = 'https://x402.kamiyo.ai';
const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

export function getSupportedX402Networks(env: NodeJS.ProcessEnv = process.env): PayAINetwork[] {
  return [...resolveX402SupportedNetworks(env)];
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function splitUrls(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isKamiyoDeployment(env: NodeJS.ProcessEnv): boolean {
  const baseUrl = readEnv(env, 'API_BASE_URL');
  if (!baseUrl) {
    return env.NODE_ENV === 'production';
  }

  try {
    return new URL(baseUrl).hostname.toLowerCase().endsWith('kamiyo.ai');
  } catch {
    return false;
  }
}

export function resolveX402FacilitatorUrls(env: NodeJS.ProcessEnv = process.env): string[] {
  const preferred = splitUrls(readEnv(env, 'X402_FACILITATOR_URLS'));
  const fallback = splitUrls(readEnv(env, 'FACILITATOR_URLS'));
  const primary = [
    readEnv(env, 'X402_FACILITATOR_URL'),
    readEnv(env, 'FACILITATOR_URL'),
  ].filter((value): value is string => value !== null);

  const configured = Array.from(new Set([...preferred, ...fallback, ...primary]));
  if (configured.length > 0) {
    return configured;
  }

  if (isKamiyoDeployment(env)) {
    return [KAMIYO_FACILITATOR_URL, PayAIFacilitator.URL];
  }

  return [];
}

function resolveX402FacilitatorApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return readEnv(env, 'X402_FACILITATOR_API_KEY') ?? readEnv(env, 'FACILITATOR_API_KEY');
}

function readHeader(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return null;
}

function getSapAgentSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.SAP_AGENT_KEYPAIR?.trim() || env.MCP_AGENT_KEYPAIR?.trim() || null;
}

function getSapRuntime():
  | {
      agentWallet: PublicKey;
      agentPda: PublicKey;
      connection: SapConnection;
      client: ReturnType<SapConnection['createClient']>;
    }
  | null {
  const secret = getSapAgentSecret();
  if (!secret) {
    return null;
  }

  const rpcUrl = resolveSolanaRpcUrl();
  const cluster = SapConnection.detectCluster(rpcUrl);
  const cacheKey = `${rpcUrl}:${cluster}:${secret}`;

  if (cachedSapRuntime?.cacheKey === cacheKey) {
    return cachedSapRuntime;
  }

  try {
    const keypair = loadSolanaKeypair(secret);
    const connection = SapConnection.fromKeypair(rpcUrl, keypair, { cluster });
    const [agentPda] = connection.client.agent.deriveAgent();

    cachedSapRuntime = {
      cacheKey,
      agentWallet: keypair.publicKey,
      agentPda,
      connection,
      client: connection.client,
    };

    return cachedSapRuntime;
  } catch (error) {
    logger.error('failed to initialize sap x402 runtime', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function getSapX402Headers(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>
): X402Headers | null {
  const protocol = readHeader(headers, 'x-payment-protocol');
  if (!protocol || protocol.toLowerCase() !== 'sap-x402') {
    return null;
  }

  const values = Object.fromEntries(
    SAP_X402_HEADER_NAMES.map((name) => [name, readHeader(headers, name)])
  ) as Record<(typeof SAP_X402_HEADER_NAMES)[number], string | null>;

  if (SAP_X402_HEADER_NAMES.some((name) => !values[name])) {
    return null;
  }

  return {
    'X-Payment-Protocol': 'SAP-x402',
    'X-Payment-Escrow': values['X-Payment-Escrow']!,
    'X-Payment-Agent': values['X-Payment-Agent']!,
    'X-Payment-Depositor': values['X-Payment-Depositor']!,
    'X-Payment-MaxCalls': values['X-Payment-MaxCalls']!,
    'X-Payment-PricePerCall': values['X-Payment-PricePerCall']!,
    'X-Payment-Program': values['X-Payment-Program']!,
    'X-Payment-Network': values['X-Payment-Network']!,
  };
}

function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`invalid ${label}`);
  }
}

export function isAcceptedSapNetwork(network: string, cluster: string): boolean {
  const normalized = network.trim().toLowerCase();
  const accepted =
    cluster === 'mainnet-beta'
      ? ['mainnet-beta', 'mainnet', 'solana:mainnet-beta', 'solana:mainnet', SOLANA_MAINNET_CAIP2]
      : cluster === 'devnet'
        ? ['devnet', 'solana:devnet']
        : cluster === 'localnet'
          ? ['localnet', 'localhost', '127.0.0.1', 'solana:localnet']
          : [cluster];

  return accepted.some((candidate) => candidate.toLowerCase() === normalized);
}

export function initX402Gateway(): void {
  const capability = getX402Capability();
  const supportedNetworks = getSupportedX402Networks();
  const facilitatorUrls = resolveX402FacilitatorUrls();
  const facilitatorApiKey = resolveX402FacilitatorApiKey();
  facilitator = null;

  if (!capability.enabled || !capability.merchantWallet) {
    return;
  }

  facilitator = createPayAIFacilitator(capability.merchantWallet, {
    facilitatorUrls: facilitatorUrls.length > 0 ? facilitatorUrls : undefined,
    apiKey: facilitatorApiKey || undefined,
    defaultNetwork: supportedNetworks[0] || 'base',
    onVerified: (result) => {
      logger.info('x402 payment verified', {
        valid: result.valid,
        payer: result.payer?.slice(0, 10),
        network: result.network,
        amount: result.amount,
      });
    },
    onSettled: (result) => {
      logger.info('x402 payment settled', {
        success: result.success,
        tx: result.tx?.slice(0, 16),
        network: result.network,
      });
    },
    onError: (error) => {
      logger.error('x402 payment error', { code: error.code, message: error.message });
    },
  });

  logger.info('x402 payment gateway initialized', {
    merchant: `${capability.merchantWallet.slice(0, 10)}...`,
    networks: supportedNetworks.join(', '),
    facilitators:
      facilitatorUrls.length > 0 ? facilitatorUrls.join(', ') : PayAIFacilitator.URL,
    facilitatorAuth: facilitatorApiKey ? 'api-key' : 'none',
  });
}

export function getX402Gateway(): PayAIFacilitator | null {
  return facilitator;
}

export function isX402Available(): boolean {
  return facilitator !== null;
}

export function getX402PaymentHeader(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>
): X402PaymentHeader {
  const sapHeaders = getSapX402Headers(headers);
  if (sapHeaders) {
    return {
      type: 'sap-x402',
      value: null,
      forwardHeaders: { ...sapHeaders },
      sapHeaders,
    };
  }

  const paymentSignature = readHeader(headers, 'payment-signature');
  if (paymentSignature) {
    return {
      type: 'payment-signature',
      value: paymentSignature,
      forwardHeaders: { 'payment-signature': paymentSignature },
      sapHeaders: null,
    };
  }

  const legacyHeader = readHeader(headers, 'x-payment');
  if (legacyHeader) {
    return {
      type: 'x-payment',
      value: legacyHeader,
      forwardHeaders: { 'X-Payment': legacyHeader },
      sapHeaders: null,
    };
  }

  return { type: 'missing', value: null, forwardHeaders: {}, sapHeaders: null };
}

export function getX402Challenge(
  resource: string,
  priceUsd: number,
  description: string,
  networks: readonly PayAINetwork[] = getSupportedX402Networks()
): { body: Record<string, unknown>; headers: Record<string, string> } {
  if (!facilitator) {
    throw new Error('x402 gateway not configured');
  }

  return {
    body: facilitator.response402(resource, priceUsd, description, [...networks]) as unknown as Record<string, unknown>,
    headers: facilitator.headers402(),
  };
}

function usdToMicroUsdc(priceUsd: number): string {
  return String(Math.round(priceUsd * 1_000_000));
}

export async function verifyAndSettleX402Payment(
  paymentHeader: X402PaymentHeader,
  resource: string,
  priceUsd: number,
  description: string,
  networks: readonly PayAINetwork[] = getSupportedX402Networks(),
  options: VerifyX402PaymentOptions = {}
): Promise<{ ok: true; payment: SettledX402Payment } | { ok: false; verifyError?: string }> {
  if (paymentHeader.type === 'missing') {
    return { ok: false };
  }

  if (paymentHeader.type === 'sap-x402') {
    if (!options.allowSapX402) {
      return { ok: false, verifyError: 'sap x402 headers are not supported for this endpoint' };
    }

    const sapHeaders = paymentHeader.sapHeaders;
    if (!sapHeaders) {
      return { ok: false, verifyError: 'missing sap x402 headers' };
    }

    const runtime = getSapRuntime();
    if (!runtime) {
      return { ok: false, verifyError: 'sap x402 settlement is not configured' };
    }

    try {
      const escrow = parsePublicKey(sapHeaders['X-Payment-Escrow'], 'sap escrow');
      const agent = parsePublicKey(sapHeaders['X-Payment-Agent'], 'sap agent');
      const depositor = parsePublicKey(sapHeaders['X-Payment-Depositor'], 'sap depositor');

      if (!isAcceptedSapNetwork(sapHeaders['X-Payment-Network'], runtime.connection.cluster)) {
        return { ok: false, verifyError: 'sap network mismatch' };
      }

      if (sapHeaders['X-Payment-Program'] !== runtime.connection.programId.toBase58()) {
        return { ok: false, verifyError: 'sap program mismatch' };
      }

      if (!agent.equals(runtime.agentPda)) {
        return { ok: false, verifyError: 'sap agent mismatch' };
      }

      const [expectedAgentPda] = deriveAgent(runtime.agentWallet);
      const [expectedEscrowPda] = deriveEscrow(expectedAgentPda, depositor);

      if (!escrow.equals(expectedEscrowPda)) {
        return { ok: false, verifyError: 'sap escrow mismatch' };
      }

      const escrowState = await runtime.client.x402.fetchEscrow(runtime.agentWallet, depositor);
      if (!escrowState) {
        return { ok: false, verifyError: 'sap escrow not found' };
      }

      if (escrowState.maxCalls.toString() !== sapHeaders['X-Payment-MaxCalls']) {
        return { ok: false, verifyError: 'sap maxCalls mismatch' };
      }

      if (escrowState.pricePerCall.toString() !== sapHeaders['X-Payment-PricePerCall']) {
        return { ok: false, verifyError: 'sap pricePerCall mismatch' };
      }

      if (!escrowState.agent.equals(runtime.agentPda) || !escrowState.agentWallet.equals(runtime.agentWallet)) {
        return { ok: false, verifyError: 'sap escrow agent mismatch' };
      }

      const balance = await runtime.client.x402.getBalance(runtime.agentWallet, depositor);
      if (!balance || balance.callsRemaining < 1) {
        return { ok: false, verifyError: 'sap escrow has no calls remaining' };
      }

      const serviceHash = hashToArray(
        sha256(JSON.stringify({ resource, description, quotedPriceUsd: priceUsd }))
      );
      const settlementAmount = escrowState.pricePerCall.toString();
      if (settlementAmount !== usdToMicroUsdc(priceUsd)) {
        return { ok: false, verifyError: 'sap quoted price mismatch' };
      }

      let txSignature: string;
      if (escrowState.tokenMint) {
        const mintInfo = await runtime.connection.connection.getAccountInfo(escrowState.tokenMint);
        if (!mintInfo) {
          return { ok: false, verifyError: 'sap token mint not found' };
        }

        const tokenProgram = mintInfo.owner;
        const escrowAta = await getAssociatedTokenAddress(escrowState.tokenMint, escrow, true, tokenProgram);
        const agentAta = await getAssociatedTokenAddress(escrowState.tokenMint, runtime.agentWallet, false, tokenProgram);

        txSignature = await runtime.client.escrow.settle(depositor, 1, serviceHash, [
          { pubkey: escrowAta, isSigner: false, isWritable: true },
          { pubkey: agentAta, isSigner: false, isWritable: true },
          { pubkey: tokenProgram.equals(TOKEN_PROGRAM_ID) ? TOKEN_PROGRAM_ID : tokenProgram, isSigner: false, isWritable: false },
          { pubkey: escrowState.tokenMint, isSigner: false, isWritable: false },
        ]);
      } else {
        const settlement = await runtime.client.x402.settle(
          depositor,
          1,
          JSON.stringify({ resource, description, quotedPriceUsd: priceUsd })
        );
        txSignature = settlement.txSignature;
      }

      return {
        ok: true,
        payment: {
          payer: depositor.toBase58(),
          network: sapHeaders['X-Payment-Network'],
          amount: settlementAmount,
          tx: txSignature,
          headerType: 'sap-x402',
        },
      };
    } catch (error) {
      return {
        ok: false,
        verifyError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (!facilitator) {
    throw new Error('x402 gateway not configured');
  }

  if (!paymentHeader.value) {
    return { ok: false };
  }

  const requirements = facilitator.requirements(resource, priceUsd, description, [...networks]);
  let verifyError: string | undefined;

  for (const requirement of requirements) {
    try {
      const { verify, settle } = await facilitator.verifyAndSettle(paymentHeader.value, requirement);
      if (verify.valid && settle?.success) {
        return {
          ok: true,
          payment: {
            payer: verify.payer,
            network: verify.network,
            amount: verify.amount,
            tx: settle.tx,
            headerType: paymentHeader.type,
          },
        };
      }

      if (!verify.valid && verify.reason) {
        verifyError = verify.reason;
      }
    } catch (error) {
      verifyError = error instanceof Error ? error.message : String(error);
    }
  }

  return { ok: false, verifyError };
}
