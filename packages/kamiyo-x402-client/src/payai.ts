// PayAI x402 v2 facilitator client

import { toCAIP2 } from './v2/networks';
import type { PaymentRequired402, PaymentRequirementV2, ExtensionDeclaration } from './v2/types';

const USDC_DECIMALS = 6;
const MICRO = 10 ** USDC_DECIMALS;
// Cache verified payments for 55s (under x402's 60s settlement window)
const CACHE_TTL_MS = 55_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export type PayAINetwork =
  // Mainnets
  | 'base'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'avalanche'
  | 'sei'
  | 'iotex'
  | 'peaq'
  | 'xlayer'
  | 'solana'
  // Testnets
  | 'base-sepolia'
  | 'polygon-amoy'
  | 'arbitrum-sepolia'
  | 'optimism-sepolia'
  | 'avalanche-fuji'
  | 'sei-testnet'
  | 'iotex-testnet'
  | 'peaq-agung'
  | 'xlayer-testnet'
  | 'solana-devnet';

export interface NetworkConfig {
  name: string;
  chainId: number | string;
  eip155: string; // EIP-155 chain identifier (e.g., "eip155:8453")
  testnet: boolean;
  explorer: string;
  usdc: string;
  nativeToken: string;
  rpcUrl?: string;
}

export const NETWORKS: Record<PayAINetwork, NetworkConfig> = {
  base: {
    name: 'Base',
    chainId: 8453,
    eip155: 'eip155:8453',
    testnet: false,
    explorer: 'https://basescan.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    nativeToken: 'ETH',
    rpcUrl: 'https://mainnet.base.org',
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    eip155: 'eip155:137',
    testnet: false,
    explorer: 'https://polygonscan.com',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    nativeToken: 'MATIC',
    rpcUrl: 'https://polygon-rpc.com',
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    eip155: 'eip155:42161',
    testnet: false,
    explorer: 'https://arbiscan.io',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    nativeToken: 'ETH',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    eip155: 'eip155:10',
    testnet: false,
    explorer: 'https://optimistic.etherscan.io',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    nativeToken: 'ETH',
    rpcUrl: 'https://mainnet.optimism.io',
  },
  avalanche: {
    name: 'Avalanche C-Chain',
    chainId: 43114,
    eip155: 'eip155:43114',
    testnet: false,
    explorer: 'https://snowtrace.io',
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    nativeToken: 'AVAX',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
  },
  sei: {
    name: 'Sei',
    chainId: 1329,
    eip155: 'eip155:1329',
    testnet: false,
    explorer: 'https://seitrace.com',
    usdc: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
    nativeToken: 'SEI',
    rpcUrl: 'https://evm-rpc.sei-apis.com',
  },
  iotex: {
    name: 'IoTeX',
    chainId: 4689,
    eip155: 'eip155:4689',
    testnet: false,
    explorer: 'https://iotexscan.io',
    usdc: '0x6fbCdc1169B5130C59E72E51Ed68A84841C98cd1',
    nativeToken: 'IOTX',
    rpcUrl: 'https://babel-api.mainnet.iotex.io',
  },
  peaq: {
    name: 'Peaq',
    chainId: 3338,
    eip155: 'eip155:3338',
    testnet: false,
    explorer: 'https://peaq.subscan.io',
    usdc: '',
    nativeToken: 'PEAQ',
    rpcUrl: 'https://peaq.api.onfinality.io/public',
  },
  xlayer: {
    name: 'XLayer',
    chainId: 196,
    eip155: 'eip155:196',
    testnet: false,
    explorer: 'https://www.okx.com/explorer/xlayer',
    usdc: '0x74b7F16337b8972027F6196A17a631aC6dE26d22',
    nativeToken: 'OKB',
    rpcUrl: 'https://xlayerrpc.okx.com',
  },
  solana: {
    name: 'Solana',
    chainId: 'mainnet-beta',
    eip155: 'solana:mainnet',
    testnet: false,
    explorer: 'https://solscan.io',
    usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    nativeToken: 'SOL',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
  },
  // Testnets
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 84532,
    eip155: 'eip155:84532',
    testnet: true,
    explorer: 'https://sepolia.basescan.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    nativeToken: 'ETH',
    rpcUrl: 'https://sepolia.base.org',
  },
  'polygon-amoy': {
    name: 'Polygon Amoy',
    chainId: 80002,
    eip155: 'eip155:80002',
    testnet: true,
    explorer: 'https://amoy.polygonscan.com',
    usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    nativeToken: 'MATIC',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
  },
  'arbitrum-sepolia': {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    eip155: 'eip155:421614',
    testnet: true,
    explorer: 'https://sepolia.arbiscan.io',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    nativeToken: 'ETH',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
  },
  'optimism-sepolia': {
    name: 'Optimism Sepolia',
    chainId: 11155420,
    eip155: 'eip155:11155420',
    testnet: true,
    explorer: 'https://sepolia-optimism.etherscan.io',
    usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    nativeToken: 'ETH',
    rpcUrl: 'https://sepolia.optimism.io',
  },
  'avalanche-fuji': {
    name: 'Avalanche Fuji',
    chainId: 43113,
    eip155: 'eip155:43113',
    testnet: true,
    explorer: 'https://testnet.snowtrace.io',
    usdc: '0x5425890298aed601595a70AB815c96711a31Bc65',
    nativeToken: 'AVAX',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
  },
  'sei-testnet': {
    name: 'Sei Testnet',
    chainId: 1328,
    eip155: 'eip155:1328',
    testnet: true,
    explorer: 'https://seitrace.com/?chain=atlantic-2',
    usdc: '',
    nativeToken: 'SEI',
    rpcUrl: 'https://evm-rpc-testnet.sei-apis.com',
  },
  'iotex-testnet': {
    name: 'IoTeX Testnet',
    chainId: 4690,
    eip155: 'eip155:4690',
    testnet: true,
    explorer: 'https://testnet.iotexscan.io',
    usdc: '',
    nativeToken: 'IOTX',
    rpcUrl: 'https://babel-api.testnet.iotex.io',
  },
  'peaq-agung': {
    name: 'Peaq Agung',
    chainId: 9990,
    eip155: 'eip155:9990',
    testnet: true,
    explorer: 'https://agung.subscan.io',
    usdc: '',
    nativeToken: 'AGNG',
    rpcUrl: 'https://wss.agung.peaq.network',
  },
  'xlayer-testnet': {
    name: 'XLayer Testnet',
    chainId: 195,
    eip155: 'eip155:195',
    testnet: true,
    explorer: 'https://www.okx.com/explorer/xlayer-test',
    usdc: '',
    nativeToken: 'OKB',
    rpcUrl: 'https://xlayertestrpc.okx.com',
  },
  'solana-devnet': {
    name: 'Solana Devnet',
    chainId: 'devnet',
    eip155: 'solana:devnet',
    testnet: true,
    explorer: 'https://solscan.io',
    usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    nativeToken: 'SOL',
    rpcUrl: 'https://api.devnet.solana.com',
  },
};

export interface PayAIConfig {
  merchantAddress: string;
  facilitatorUrl?: string;
  facilitatorUrls?: string[];
  apiKey?: string;
  timeoutMs?: number;
  defaultNetwork?: PayAINetwork;
  retryAttempts?: number;
  retryDelayMs?: number;
  onVerified?: (result: VerifyResult) => void;
  onSettled?: (result: SettleResult) => void;
  onError?: (error: PayAIError) => void;
}

export interface PaymentRequirement {
  scheme: 'exact';
  network: string; // CAIP-2 identifier
  amount: string;
  resource: string;
  description: string;
  payTo: string;
  asset: 'USDC';
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface VerifyRequest {
  x402Version: 2;
  paymentHeader: string;
  paymentRequirements: PaymentRequirement;
}

export interface SettleRequest {
  x402Version: 2;
  paymentHeader: string;
  paymentRequirements: PaymentRequirement;
}

export interface VerifyResult {
  valid: boolean;
  payer: string;
  reason?: string;
  network?: string; // CAIP-2
  amount?: string;
  chainId?: string; // same as network in v2
  facilitator?: string;
}

export interface SettleResult {
  success: boolean;
  payer: string;
  tx?: string;
  network?: string; // CAIP-2
  amount?: string;
  error?: string;
  chainId?: string; // same as network in v2
  facilitator?: string;
}

export interface PayAI402Response {
  x402Version: 2;
  accepts: PaymentRequirement[];
  error: string;
  facilitator: string;
  extensions?: Record<string, ExtensionDeclaration>;
}

export interface ListResponse {
  networks: PayAINetwork[];
  assets: string[];
  version: string;
  uptime?: number;
}

export interface HealthResponse {
  ok: boolean;
  latency: number;
  networks: PayAINetwork[];
  version?: string;
}

export interface BatchVerifyResult {
  results: VerifyResult[];
  successCount: number;
  failureCount: number;
}

export interface BatchSettleResult {
  results: SettleResult[];
  successCount: number;
  failureCount: number;
  totalAmount: string;
}

export type PayAIErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_PAYMENT'
  | 'SETTLEMENT_FAILED'
  | 'FACILITATOR_ERROR'
  | 'INVALID_CONFIG'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_FUNDS'
  | 'SIGNATURE_INVALID';

export class PayAIError extends Error {
  constructor(
    message: string,
    public readonly code: PayAIErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PayAIError';
  }
}

function toMicro(usdc: number): string {
  return String(Math.floor(usdc * MICRO));
}

function fromMicro(micro: string | number): number {
  return (typeof micro === 'string' ? parseInt(micro, 10) : micro) / MICRO;
}

function explorerUrl(network: PayAINetwork, tx: string): string {
  const cfg = NETWORKS[network];
  if (network.startsWith('solana')) {
    const cluster = network === 'solana' ? '' : '?cluster=devnet';
    return `${cfg.explorer}/tx/${tx}${cluster}`;
  }
  return `${cfg.explorer}/tx/${tx}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeFacilitatorUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    throw new PayAIError(`Invalid facilitator URL: ${url}`, 'INVALID_CONFIG');
  }
}

export class PayAIFacilitator {
  static readonly URL = 'https://facilitator.payai.network';
  static readonly ECHO_URL = 'https://x402.payai.network';
  static readonly VERSION = '1.0.0';
  static readonly NETWORKS = Object.keys(NETWORKS) as PayAINetwork[];

  private readonly merchant: string;
  private readonly url: string;
  private readonly facilitatorUrls: string[];
  private readonly apiKey: string | null;
  private readonly timeout: number;
  private readonly network: PayAINetwork;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly hooks: Pick<PayAIConfig, 'onVerified' | 'onSettled' | 'onError'>;
  private readonly cache = new Map<string, { result: VerifyResult; expires: number }>();

  constructor(config: PayAIConfig) {
    if (!config.merchantAddress) {
      throw new PayAIError('merchantAddress required', 'INVALID_CONFIG');
    }
    this.merchant = config.merchantAddress;

    const configuredUrls = [
      ...(config.facilitatorUrl ? [config.facilitatorUrl] : []),
      ...(config.facilitatorUrls || []),
    ];
    const normalizedUrls = Array.from(
      new Set(
        (configuredUrls.length > 0 ? configuredUrls : [PayAIFacilitator.URL]).map(
          normalizeFacilitatorUrl
        )
      )
    );
    if (normalizedUrls.length === 0) {
      throw new PayAIError('At least one facilitator URL is required', 'INVALID_CONFIG');
    }

    this.url = normalizedUrls[0];
    this.facilitatorUrls = normalizedUrls;
    this.apiKey = config.apiKey?.trim() || null;
    this.timeout = config.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.network = config.defaultNetwork || 'base';
    this.retries = config.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    this.retryDelay = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.hooks = {
      onVerified: config.onVerified,
      onSettled: config.onSettled,
      onError: config.onError,
    };
  }

  static toMicro = toMicro;
  static fromMicro = fromMicro;
  static explorerUrl = explorerUrl;

  static isMainnet(n: PayAINetwork): boolean {
    return !NETWORKS[n].testnet;
  }

  static isEVM(n: PayAINetwork): boolean {
    return !n.startsWith('solana');
  }

  static hasUsdcSupport(n: PayAINetwork): boolean {
    const usdc = NETWORKS[n].usdc;
    return !!usdc && usdc.length > 0;
  }

  static mainnets(): PayAINetwork[] {
    return PayAIFacilitator.NETWORKS.filter((n) => !NETWORKS[n].testnet);
  }

  static testnets(): PayAINetwork[] {
    return PayAIFacilitator.NETWORKS.filter((n) => NETWORKS[n].testnet);
  }

  static evmNetworks(): PayAINetwork[] {
    return PayAIFacilitator.NETWORKS.filter((n) => !n.startsWith('solana'));
  }

  static networksWithUsdc(): PayAINetwork[] {
    return PayAIFacilitator.NETWORKS.filter((n) => PayAIFacilitator.hasUsdcSupport(n));
  }

  static mainnetsWithUsdc(): PayAINetwork[] {
    return PayAIFacilitator.mainnets().filter((n) => PayAIFacilitator.hasUsdcSupport(n));
  }

  static testnetsWithUsdc(): PayAINetwork[] {
    return PayAIFacilitator.testnets().filter((n) => PayAIFacilitator.hasUsdcSupport(n));
  }

  static getNetworkConfig(n: PayAINetwork): NetworkConfig {
    return NETWORKS[n];
  }

  static getChainId(n: PayAINetwork): string {
    return NETWORKS[n].eip155;
  }

  static getUsdcAddress(n: PayAINetwork): string {
    return NETWORKS[n].usdc;
  }

  requirement(
    resource: string,
    usdc: number,
    desc: string,
    opts?: { network?: PayAINetwork; timeout?: number; extra?: Record<string, unknown> }
  ): PaymentRequirement {
    if (usdc <= 0) {
      throw new PayAIError('Price must be positive', 'INVALID_CONFIG');
    }
    const network = opts?.network || this.network;
    if (!PayAIFacilitator.hasUsdcSupport(network)) {
      throw new PayAIError(`Network ${network} does not have USDC support`, 'INVALID_CONFIG');
    }
    return {
      scheme: 'exact',
      network: toCAIP2(network),
      amount: toMicro(usdc),
      resource,
      description: desc,
      payTo: this.merchant,
      asset: 'USDC',
      maxTimeoutSeconds: opts?.timeout || 60,
      extra: opts?.extra,
    };
  }

  requirements(
    resource: string,
    usdc: number,
    desc: string,
    networks?: PayAINetwork[]
  ): PaymentRequirement[] {
    // Default to mainnets with USDC support to avoid invalid payment options
    return (networks || PayAIFacilitator.mainnetsWithUsdc()).map((n) =>
      this.requirement(resource, usdc, desc, { network: n })
    );
  }

  response402(
    resource: string,
    usdc: number,
    desc: string,
    networks?: PayAINetwork[],
    extensions?: Record<string, ExtensionDeclaration>
  ): PayAI402Response {
    const reqs = this.requirements(resource, usdc, desc, networks);
    const response: PayAI402Response = {
      x402Version: 2,
      accepts: reqs,
      error: 'Payment Required',
      facilitator: this.url,
    };
    if (extensions) {
      response.extensions = extensions;
    }
    return response;
  }

  headers402(): Record<string, string> {
    return {
      'WWW-Authenticate': 'X402',
      'X-Payment-Facilitator': this.url,
    };
  }

  async verify(header: string, req: PaymentRequirement): Promise<VerifyResult> {
    const key = `${header}:${req.network}:${req.amount}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.result;
    }

    const result = await this.retry(async () => {
      const { response, facilitator } = await this.fetchWithFailover('/verify', {
        x402Version: 2,
        paymentHeader: header,
        paymentRequirements: req,
      });
      const data = await response.json();
      return {
        valid: !!data.isValid,
        payer: data.payer || '',
        reason:
          data.invalidReason ||
          data.invalidMessage ||
          data.errorReason ||
          data.errorMessage ||
          data.error,
        network: req.network,
        amount: req.amount,
        chainId: req.network,
        facilitator,
      };
    });

    if (result.valid) {
      this.cache.set(key, { result, expires: Date.now() + CACHE_TTL_MS });
    }
    this.hooks.onVerified?.(result);
    return result;
  }

  async verifyBatch(
    payments: Array<{ header: string; req: PaymentRequirement }>
  ): Promise<BatchVerifyResult> {
    const results = await Promise.all(
      payments.map(({ header, req }) => this.verify(header, req).catch((e) => ({
        valid: false,
        payer: '',
        reason: e instanceof Error ? e.message : 'Unknown error',
        network: req.network,
        amount: req.amount,
      })))
    );

    return {
      results,
      successCount: results.filter((r) => r.valid).length,
      failureCount: results.filter((r) => !r.valid).length,
    };
  }

  async settle(header: string, req: PaymentRequirement): Promise<SettleResult> {
    const result = await this.retry(async () => {
      const { response, facilitator } = await this.fetchWithFailover('/settle', {
        x402Version: 2,
        paymentHeader: header,
        paymentRequirements: req,
      });
      const data = await response.json();
      return {
        success: !!data.success,
        payer: data.payer || '',
        tx: data.transaction || data.txHash,
        network: req.network,
        amount: req.amount,
        error: data.error || data.errorReason || data.errorMessage,
        chainId: req.network,
        facilitator,
      };
    });
    this.hooks.onSettled?.(result);
    return result;
  }

  async settleBatch(
    payments: Array<{ header: string; req: PaymentRequirement }>
  ): Promise<BatchSettleResult> {
    const results = await Promise.all(
      payments.map(({ header, req }) => this.settle(header, req).catch((e) => ({
        success: false,
        payer: '',
        error: e instanceof Error ? e.message : 'Unknown error',
        network: req.network,
        amount: req.amount,
      })))
    );

    const totalAmount = results
      .filter((r) => r.success)
      .reduce((sum, r) => sum + BigInt(r.amount || '0'), BigInt(0));

    return {
      results,
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      totalAmount: totalAmount.toString(),
    };
  }

  async verifyAndSettle(
    header: string,
    req: PaymentRequirement
  ): Promise<{ verify: VerifyResult; settle?: SettleResult }> {
    const v = await this.verify(header, req);
    if (!v.valid) return { verify: v };
    return { verify: v, settle: await this.settle(header, req) };
  }

  async list(): Promise<ListResponse> {
    try {
      const { response } = await this.fetchWithFailover('/list', undefined, 'GET');
      return await response.json();
    } catch {
      return {
        networks: PayAIFacilitator.NETWORKS,
        assets: ['USDC'],
        version: PayAIFacilitator.VERSION,
      };
    }
  }

  async health(): Promise<HealthResponse> {
    const start = Date.now();
    try {
      const { response } = await this.fetchWithFailover('/health', undefined, 'GET');
      const data = await response.json().catch(() => ({}));
      return {
        ok: response.ok,
        latency: Date.now() - start,
        networks: data.networks || PayAIFacilitator.NETWORKS,
        version: data.version,
      };
    } catch {
      return { ok: false, latency: Date.now() - start, networks: [] };
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getFacilitatorUrls(): string[] {
    return [...this.facilitatorUrls];
  }

  private shouldFailover(err: Error): boolean {
    if (!(err instanceof PayAIError)) return false;
    if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT' || err.code === 'RATE_LIMITED') {
      return true;
    }
    if (err.code === 'FACILITATOR_ERROR') {
      const status = Number(err.details?.status);
      if (!Number.isFinite(status)) return true;
      return status >= 500 || status === 404;
    }
    return false;
  }

  private async fetchWithFailover(
    path: string,
    body?: unknown,
    method: 'POST' | 'GET' = 'POST'
  ): Promise<{ response: Response; facilitator: string }> {
    let lastErr: Error | undefined;

    for (const facilitator of this.facilitatorUrls) {
      try {
        const response = await this.fetch(path, body, method, facilitator);
        return { response, facilitator };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        lastErr = err;
        if (!this.shouldFailover(err)) {
          throw err;
        }
      }
    }

    throw lastErr || new PayAIError('No facilitator available', 'NETWORK_ERROR');
  }

  private async fetch(
    path: string,
    body?: unknown,
    method: 'POST' | 'GET' = 'POST',
    facilitatorUrl: string = this.url
  ): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      const headers: Record<string, string> = {
        'User-Agent': `Kamiyo-x402/${PayAIFacilitator.VERSION}`,
      };

      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const res = await fetch(`${facilitatorUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });

      if (res.status === 429) {
        throw new PayAIError('Rate limited', 'RATE_LIMITED', {
          retryAfter: res.headers.get('Retry-After'),
        });
      }

      if (!res.ok && res.status !== 402) {
        throw new PayAIError(`Facilitator ${res.status}`, 'FACILITATOR_ERROR', {
          status: res.status,
        });
      }
      return res;
    } catch (e) {
      if (e instanceof PayAIError) throw e;
      if (e instanceof Error && e.name === 'AbortError') {
        throw new PayAIError('Timeout', 'TIMEOUT');
      }
      throw new PayAIError(String(e), 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    let err: Error | undefined;
    for (let i = 0; i < this.retries; i++) {
      try {
        return await fn();
      } catch (e) {
        err = e instanceof Error ? e : new Error(String(e));
        if (e instanceof PayAIError) {
          if (e.code === 'INVALID_PAYMENT' || e.code === 'SIGNATURE_INVALID') {
            throw e;
          }
          if (e.code === 'RATE_LIMITED') {
            const retryAfter = e.details?.retryAfter;
            const delay = retryAfter ? parseInt(String(retryAfter), 10) * 1000 : this.retryDelay * 2 ** i;
            await sleep(delay);
            continue;
          }
        }
        if (i < this.retries - 1) await sleep(this.retryDelay * 2 ** i);
      }
    }
    const final =
      err instanceof PayAIError
        ? err
        : new PayAIError(err?.message || 'Unknown', 'NETWORK_ERROR');
    this.hooks.onError?.(final);
    throw final;
  }
}

export function createPayAIFacilitator(
  merchant: string,
  opts?: Partial<Omit<PayAIConfig, 'merchantAddress'>>
): PayAIFacilitator {
  return new PayAIFacilitator({ merchantAddress: merchant, ...opts });
}

export type PayAIMiddlewareRequest = {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
  path?: string;
};

export type PayAIMiddlewareResponse = {
  status: (code: number) => PayAIMiddlewareResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export type PayAINextFunction = (err?: unknown) => void;

export interface PayAIMiddlewareOptions {
  facilitator: PayAIFacilitator;
  priceUsd: number;
  description: string;
  networks?: PayAINetwork[];
  skip?: (req: PayAIMiddlewareRequest) => boolean;
}

export function payaiMiddleware(opts: PayAIMiddlewareOptions) {
  return async (
    req: PayAIMiddlewareRequest,
    res: PayAIMiddlewareResponse,
    next: PayAINextFunction
  ): Promise<void> => {
    if (opts.skip?.(req)) {
      next();
      return;
    }

    const resource = req.path || req.url || '/';
    const paymentHeader = req.headers['payment-signature'];

    if (!paymentHeader || Array.isArray(paymentHeader)) {
      const body = opts.facilitator.response402(
        resource,
        opts.priceUsd,
        opts.description,
        opts.networks
      );
      const headers = opts.facilitator.headers402();
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      res.status(402).json(body);
      return;
    }

    const reqs = opts.facilitator.requirements(
      resource,
      opts.priceUsd,
      opts.description,
      opts.networks
    );

    let lastError: Error | undefined;
    for (const requirement of reqs) {
      try {
        const { verify, settle } = await opts.facilitator.verifyAndSettle(
          paymentHeader,
          requirement
        );
        if (verify.valid && settle?.success) {
          next();
          return;
        }
        if (!verify.valid && verify.reason) {
          lastError = new PayAIError(verify.reason, 'INVALID_PAYMENT');
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        continue;
      }
    }

    const body = opts.facilitator.response402(
      resource,
      opts.priceUsd,
      opts.description,
      opts.networks
    );
    if (lastError) {
      (body as unknown as Record<string, unknown>).verifyError = lastError.message;
    }
    res.status(402).json(body);
  };
}

export function withPayAI<T extends (...args: unknown[]) => Promise<unknown>>(
  handler: T,
  opts: PayAIMiddlewareOptions
): T {
  return (async (...args: unknown[]) => {
    const [req, res] = args as [PayAIMiddlewareRequest, PayAIMiddlewareResponse];

    if (opts.skip?.(req)) {
      return handler(...args);
    }

    const resource = req.path || req.url || '/';
    const paymentHeader = req.headers['payment-signature'];

    if (!paymentHeader || Array.isArray(paymentHeader)) {
      const body = opts.facilitator.response402(
        resource,
        opts.priceUsd,
        opts.description,
        opts.networks
      );
      const headers = opts.facilitator.headers402();
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(402).json(body);
    }

    const reqs = opts.facilitator.requirements(
      resource,
      opts.priceUsd,
      opts.description,
      opts.networks
    );

    let lastError: Error | undefined;
    for (const requirement of reqs) {
      try {
        const { verify, settle } = await opts.facilitator.verifyAndSettle(
          paymentHeader,
          requirement
        );
        if (verify.valid && settle?.success) {
          return handler(...args);
        }
        if (!verify.valid && verify.reason) {
          lastError = new PayAIError(verify.reason, 'INVALID_PAYMENT');
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        continue;
      }
    }

    const body = opts.facilitator.response402(
      resource,
      opts.priceUsd,
      opts.description,
      opts.networks
    );
    if (lastError) {
      (body as unknown as Record<string, unknown>).verifyError = lastError.message;
    }
    return res.status(402).json(body);
  }) as T;
}
