/**
 * Coinbase CDP x402 Facilitator
 *
 * Integration with Coinbase Developer Platform x402 facilitator.
 * Fee-free USDC payments on Base and Solana.
 *
 * @see https://docs.cdp.coinbase.com/x402
 * @see https://x402.org
 */

const USDC_DECIMALS = 6;
const MICRO = 10 ** USDC_DECIMALS;

export type CoinbaseNetwork = 'base' | 'base-sepolia' | 'solana' | 'solana-devnet';

export interface CoinbaseNetworkConfig {
  name: string;
  chainId: string;
  testnet: boolean;
  usdc: string;
  facilitator: string;
}

export const COINBASE_NETWORKS: Record<CoinbaseNetwork, CoinbaseNetworkConfig> = {
  base: {
    name: 'Base',
    chainId: 'eip155:8453',
    testnet: false,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    facilitator: 'https://x402.org/facilitator',
  },
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 'eip155:84532',
    testnet: true,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    facilitator: 'https://x402.org/facilitator',
  },
  solana: {
    name: 'Solana',
    chainId: 'solana:mainnet',
    testnet: false,
    usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    facilitator: 'https://x402.org/facilitator',
  },
  'solana-devnet': {
    name: 'Solana Devnet',
    chainId: 'solana:devnet',
    testnet: true,
    usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    facilitator: 'https://x402.org/facilitator',
  },
};

export interface CoinbaseFacilitatorConfig {
  merchantAddress: string;
  defaultNetwork?: CoinbaseNetwork;
  testnet?: boolean;
}

export interface CoinbasePaymentRequirement {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
}

export interface Coinbase402Response {
  x402Version: number;
  accepts: CoinbasePaymentRequirement[];
  error?: string;
}

export interface CoinbaseVerifyResult {
  valid: boolean;
  payer?: string;
  network?: string;
  amount?: string;
  reason?: string;
}

export interface CoinbaseSettleResult {
  success: boolean;
  tx?: string;
  payer?: string;
  network?: string;
  error?: string;
}

function toMicro(usdc: number): string {
  return String(Math.floor(usdc * MICRO));
}

function fromMicro(micro: string | number): number {
  return (typeof micro === 'string' ? parseInt(micro, 10) : micro) / MICRO;
}

export class CoinbaseFacilitator {
  static readonly URL = 'https://x402.org/facilitator';
  static readonly VERSION = '2';
  static readonly NETWORKS = Object.keys(COINBASE_NETWORKS) as CoinbaseNetwork[];

  static toMicro = toMicro;
  static fromMicro = fromMicro;

  static mainnets(): CoinbaseNetwork[] {
    return CoinbaseFacilitator.NETWORKS.filter((n) => !COINBASE_NETWORKS[n].testnet);
  }

  static testnets(): CoinbaseNetwork[] {
    return CoinbaseFacilitator.NETWORKS.filter((n) => COINBASE_NETWORKS[n].testnet);
  }

  static getChainId(n: CoinbaseNetwork): string {
    return COINBASE_NETWORKS[n].chainId;
  }

  static getUsdcAddress(n: CoinbaseNetwork): string {
    return COINBASE_NETWORKS[n].usdc;
  }

  private readonly merchant: string;
  private readonly network: CoinbaseNetwork;
  private readonly facilitatorUrl: string;

  constructor(config: CoinbaseFacilitatorConfig) {
    this.merchant = config.merchantAddress;
    this.network = config.defaultNetwork || (config.testnet ? 'base-sepolia' : 'base');
    this.facilitatorUrl = COINBASE_NETWORKS[this.network].facilitator;
  }

  requirement(
    resource: string,
    usdc: number,
    desc: string,
    opts?: { network?: CoinbaseNetwork; timeout?: number }
  ): CoinbasePaymentRequirement {
    const net = opts?.network || this.network;
    const cfg = COINBASE_NETWORKS[net];
    return {
      scheme: 'exact',
      network: cfg.chainId,
      maxAmountRequired: toMicro(usdc),
      resource,
      description: desc,
      payTo: this.merchant,
      asset: cfg.usdc,
      maxTimeoutSeconds: opts?.timeout || 60,
    };
  }

  requirements(
    resource: string,
    usdc: number,
    desc: string,
    networks?: CoinbaseNetwork[]
  ): CoinbasePaymentRequirement[] {
    const nets = networks || [this.network];
    return nets.map((n) => this.requirement(resource, usdc, desc, { network: n }));
  }

  response402(
    resource: string,
    usdc: number,
    desc: string,
    networks?: CoinbaseNetwork[]
  ): Coinbase402Response {
    return {
      x402Version: 2,
      accepts: this.requirements(resource, usdc, desc, networks),
    };
  }

  headers402(
    resource: string,
    usdc: number,
    desc: string,
    network?: CoinbaseNetwork
  ): Record<string, string> {
    const req = this.requirement(resource, usdc, desc, { network });
    return {
      'WWW-Authenticate': `X402 scheme="exact", network="${req.network}", amount="${req.maxAmountRequired}", asset="${req.asset}"`,
      'X-Payment-Network': req.network,
      'X-Payment-Amount': req.maxAmountRequired,
      'X-Payment-Asset': req.asset,
      'X-Payment-PayTo': this.merchant,
    };
  }

  async verify(header: string, req: CoinbasePaymentRequirement): Promise<CoinbaseVerifyResult> {
    try {
      const res = await fetch(`${this.facilitatorUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x402Version: 2,
          paymentHeader: header,
          paymentRequirements: req,
        }),
      });

      const data = await res.json();
      return {
        valid: !!data.isValid,
        payer: data.payer,
        network: req.network,
        amount: req.maxAmountRequired,
        reason: data.invalidReason,
      };
    } catch (e) {
      return { valid: false, reason: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  async settle(header: string, req: CoinbasePaymentRequirement): Promise<CoinbaseSettleResult> {
    try {
      const res = await fetch(`${this.facilitatorUrl}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x402Version: 2,
          paymentHeader: header,
          paymentRequirements: req,
        }),
      });

      const data = await res.json();
      return {
        success: !!data.success,
        tx: data.transaction,
        payer: data.payer,
        network: req.network,
        error: data.error,
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  async verifyAndSettle(
    header: string,
    req: CoinbasePaymentRequirement
  ): Promise<{ verify: CoinbaseVerifyResult; settle?: CoinbaseSettleResult }> {
    const v = await this.verify(header, req);
    if (!v.valid) return { verify: v };
    return { verify: v, settle: await this.settle(header, req) };
  }
}

export function createCoinbaseFacilitator(
  merchant: string,
  opts?: Partial<Omit<CoinbaseFacilitatorConfig, 'merchantAddress'>>
): CoinbaseFacilitator {
  return new CoinbaseFacilitator({ merchantAddress: merchant, ...opts });
}
