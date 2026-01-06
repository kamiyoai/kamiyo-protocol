/**
 * PayAI Network x402 facilitator client
 */

const USDC_DECIMALS = 6;
const MICRO = 10 ** USDC_DECIMALS;
const CACHE_TTL_MS = 55_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export type PayAINetwork =
  | 'base'
  | 'base-sepolia'
  | 'solana'
  | 'solana-devnet'
  | 'polygon'
  | 'polygon-amoy'
  | 'arbitrum'
  | 'arbitrum-sepolia'
  | 'optimism'
  | 'optimism-sepolia';

export interface NetworkConfig {
  name: string;
  chainId: number | string;
  testnet: boolean;
  explorer: string;
  usdc: string;
}

export const NETWORKS: Record<PayAINetwork, NetworkConfig> = {
  'base':            { name: 'Base',            chainId: 8453,      testnet: false, explorer: 'https://basescan.org',                 usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  'base-sepolia':    { name: 'Base Sepolia',    chainId: 84532,     testnet: true,  explorer: 'https://sepolia.basescan.org',         usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
  'solana':          { name: 'Solana',          chainId: 'mainnet', testnet: false, explorer: 'https://solscan.io',                   usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  'solana-devnet':   { name: 'Solana Devnet',   chainId: 'devnet',  testnet: true,  explorer: 'https://solscan.io',                   usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' },
  'polygon':         { name: 'Polygon',         chainId: 137,       testnet: false, explorer: 'https://polygonscan.com',              usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  'polygon-amoy':    { name: 'Polygon Amoy',    chainId: 80002,     testnet: true,  explorer: 'https://amoy.polygonscan.com',         usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582' },
  'arbitrum':        { name: 'Arbitrum One',    chainId: 42161,     testnet: false, explorer: 'https://arbiscan.io',                  usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  'arbitrum-sepolia':{ name: 'Arbitrum Sepolia',chainId: 421614,    testnet: true,  explorer: 'https://sepolia.arbiscan.io',          usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' },
  'optimism':        { name: 'Optimism',        chainId: 10,        testnet: false, explorer: 'https://optimistic.etherscan.io',      usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
  'optimism-sepolia':{ name: 'Optimism Sepolia',chainId: 11155420,  testnet: true,  explorer: 'https://sepolia-optimism.etherscan.io',usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' },
};

export interface PayAIConfig {
  merchantAddress: string;
  facilitatorUrl?: string;
  timeoutMs?: number;
  defaultNetwork?: PayAINetwork;
  retryAttempts?: number;
  retryDelayMs?: number;
  onVerified?: (result: VerifyResult) => void;
  onSettled?: (result: SettleResult) => void;
  onError?: (error: PayAIError) => void;
}

export interface PaymentRequirement {
  scheme: 'exact' | 'upto';
  network: PayAINetwork;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: 'USDC';
  maxTimeoutSeconds: number;
}

export interface VerifyResult {
  valid: boolean;
  payer: string;
  reason?: string;
  network?: PayAINetwork;
  amount?: string;
}

export interface SettleResult {
  success: boolean;
  payer: string;
  tx?: string;
  network?: PayAINetwork;
  amount?: string;
  error?: string;
}

export interface X402Response {
  x402Version: 1;
  accepts: PaymentRequirement[];
  error: string;
  facilitator: string;
}

export type PayAIErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_PAYMENT'
  | 'SETTLEMENT_FAILED'
  | 'FACILITATOR_ERROR'
  | 'INVALID_CONFIG';

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
    return `${cfg.explorer}/tx/${tx}${network === 'solana' ? '' : '?cluster=devnet'}`;
  }
  return `${cfg.explorer}/tx/${tx}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class PayAIFacilitator {
  static readonly URL = 'https://facilitator.payai.network';
  static readonly NETWORKS = Object.keys(NETWORKS) as PayAINetwork[];

  private readonly merchant: string;
  private readonly url: string;
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
    this.url = config.facilitatorUrl || PayAIFacilitator.URL;
    this.timeout = config.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.network = config.defaultNetwork || 'base';
    this.retries = config.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    this.retryDelay = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.hooks = { onVerified: config.onVerified, onSettled: config.onSettled, onError: config.onError };
  }

  static toMicro = toMicro;
  static fromMicro = fromMicro;
  static explorerUrl = explorerUrl;
  static isMainnet = (n: PayAINetwork) => !NETWORKS[n].testnet;
  static mainnets = () => PayAIFacilitator.NETWORKS.filter((n) => !NETWORKS[n].testnet);
  static testnets = () => PayAIFacilitator.NETWORKS.filter((n) => NETWORKS[n].testnet);

  requirement(resource: string, usdc: number, desc: string, opts?: { network?: PayAINetwork; scheme?: 'exact' | 'upto' }): PaymentRequirement {
    return {
      scheme: opts?.scheme || 'exact',
      network: opts?.network || this.network,
      maxAmountRequired: toMicro(usdc),
      resource,
      description: desc,
      payTo: this.merchant,
      asset: 'USDC',
      maxTimeoutSeconds: 60,
    };
  }

  requirements(resource: string, usdc: number, desc: string, networks?: PayAINetwork[]): PaymentRequirement[] {
    return (networks || PayAIFacilitator.mainnets()).map((n) => this.requirement(resource, usdc, desc, { network: n }));
  }

  response402(resource: string, usdc: number, desc: string, networks?: PayAINetwork[]): X402Response {
    return {
      x402Version: 1,
      accepts: this.requirements(resource, usdc, desc, networks),
      error: 'Payment Required',
      facilitator: this.url,
    };
  }

  headers402(resource: string, usdc: number, desc: string, network?: PayAINetwork): Record<string, string> {
    const req = this.requirement(resource, usdc, desc, { network });
    return {
      'WWW-Authenticate': `X402 scheme="${req.scheme}", network="${req.network}", amount="${req.maxAmountRequired}", asset="USDC"`,
      'X-Payment-Network': req.network,
      'X-Payment-Amount': req.maxAmountRequired,
      'X-Payment-Asset': 'USDC',
      'X-Payment-PayTo': this.merchant,
      'X-Payment-Facilitator': this.url,
    };
  }

  async verify(header: string, req: PaymentRequirement): Promise<VerifyResult> {
    const key = `${header}:${req.network}:${req.maxAmountRequired}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.result;

    const result = await this.retry(async () => {
      const res = await this.fetch('/verify', { x402Version: 1, paymentHeader: header, paymentRequirements: req });
      const data = await res.json();
      return { valid: !!data.isValid, payer: data.payer || '', reason: data.invalidReason, network: req.network, amount: req.maxAmountRequired };
    });

    if (result.valid) {
      this.cache.set(key, { result, expires: Date.now() + CACHE_TTL_MS });
    }
    this.hooks.onVerified?.(result);
    return result;
  }

  async settle(header: string, req: PaymentRequirement): Promise<SettleResult> {
    const result = await this.retry(async () => {
      const res = await this.fetch('/settle', { x402Version: 1, paymentHeader: header, paymentRequirements: req });
      const data = await res.json();
      return { success: !!data.success, payer: data.payer || '', tx: data.transaction, network: req.network, amount: req.maxAmountRequired, error: data.error };
    });
    this.hooks.onSettled?.(result);
    return result;
  }

  async verifyAndSettle(header: string, req: PaymentRequirement): Promise<{ verify: VerifyResult; settle?: SettleResult }> {
    const v = await this.verify(header, req);
    if (!v.valid) return { verify: v };
    return { verify: v, settle: await this.settle(header, req) };
  }

  async health(): Promise<{ ok: boolean; latency: number; networks: PayAINetwork[] }> {
    const start = Date.now();
    try {
      const res = await this.fetch('/health', undefined, 'GET');
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, latency: Date.now() - start, networks: data.networks || PayAIFacilitator.NETWORKS };
    } catch {
      return { ok: false, latency: Date.now() - start, networks: [] };
    }
  }

  private async fetch(path: string, body?: unknown, method: 'POST' | 'GET' = 'POST'): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (!res.ok && res.status !== 402) {
        throw new PayAIError(`Facilitator ${res.status}`, 'FACILITATOR_ERROR', { status: res.status });
      }
      return res;
    } catch (e) {
      if (e instanceof PayAIError) throw e;
      if (e instanceof Error && e.name === 'AbortError') throw new PayAIError('Timeout', 'TIMEOUT');
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
        if (e instanceof PayAIError && e.code === 'INVALID_PAYMENT') throw e;
        if (i < this.retries - 1) await sleep(this.retryDelay * 2 ** i);
      }
    }
    const final = err instanceof PayAIError ? err : new PayAIError(err?.message || 'Unknown', 'NETWORK_ERROR');
    this.hooks.onError?.(final);
    throw final;
  }
}

export function createPayAIFacilitator(merchant: string, opts?: Partial<Omit<PayAIConfig, 'merchantAddress'>>): PayAIFacilitator {
  return new PayAIFacilitator({ merchantAddress: merchant, ...opts });
}
