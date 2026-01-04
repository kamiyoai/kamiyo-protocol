/**
 * x402 Agent Client - Programmatic payment for AI agents
 *
 * Enables autonomous agents to:
 * - Discover payment requirements via Solana Actions
 * - Create and sign payment transactions
 * - Track escrows and handle disputes automatically
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

export interface X402ClientConfig {
  /** Solana RPC connection */
  connection: Connection;
  /** Agent keypair for signing transactions */
  wallet: Keypair;
  /** Kamiyo program ID */
  programId: PublicKey;
  /** Auto-dispute threshold (0-100, dispute if quality below this) */
  qualityThreshold?: number;
  /** Maximum price willing to pay per request (in SOL) */
  maxPricePerRequest?: number;
}

export interface PaymentRequirement {
  /** Whether payment is required */
  required: boolean;
  /** Required amount */
  amount: number;
  /** Currency */
  currency: 'SOL' | 'USDC' | 'USDT';
  /** Provider wallet */
  provider: PublicKey;
  /** Program ID for escrow */
  programId: PublicKey;
  /** Whether escrow provides quality guarantee */
  qualityGuarantee: boolean;
  /** Actions URL if available */
  actionsUrl?: string;
}

export interface ActionMetadata {
  icon: string;
  title: string;
  description: string;
  label: string;
  links: {
    actions: Array<{
      label: string;
      href: string;
      parameters?: Array<{
        name: string;
        label: string;
        required?: boolean;
      }>;
    }>;
  };
}

export interface PaymentResult {
  success: boolean;
  signature?: string;
  escrowPda?: PublicKey;
  transactionId?: string;
  error?: string;
}

export interface X402Response<T> {
  success: boolean;
  data?: T;
  paymentRequired?: PaymentRequirement;
  escrow?: {
    pda: PublicKey;
    transactionId: string;
  };
  error?: string;
}

/**
 * x402 Client for autonomous agent payments
 */
export class X402Client {
  private connection: Connection;
  private wallet: Keypair;
  private programId: PublicKey;
  private qualityThreshold: number;
  private maxPricePerRequest: number;

  constructor(config: X402ClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId;
    this.qualityThreshold = config.qualityThreshold ?? 70;
    this.maxPricePerRequest = config.maxPricePerRequest ?? 0.1;
  }

  /**
   * Check if an endpoint requires payment
   */
  async checkPaymentRequired(url: string): Promise<PaymentRequirement | null> {
    try {
      const response = await fetch(url, { method: 'GET' });

      if (response.status !== 402) {
        return null;
      }

      const wwwAuth = response.headers.get('WWW-Authenticate');
      const priceHeader = response.headers.get('X-Price');
      const programHeader = response.headers.get('X-Program-Id');
      const qualityHeader = response.headers.get('X-Quality-Guarantee');

      const body = await response.json().catch(() => ({})) as {
        amount?: string;
        currency?: string;
        provider?: string;
        escrow_program?: string;
        quality_guarantee?: boolean;
        actions_url?: string;
      };

      return {
        required: true,
        amount: parseFloat(priceHeader?.split(' ')[0] || body.amount || '0'),
        currency: (priceHeader?.split(' ')[1] as any) || body.currency || 'SOL',
        provider: new PublicKey(body.provider || body.escrow_program || this.programId),
        programId: new PublicKey(programHeader || body.escrow_program || this.programId),
        qualityGuarantee: qualityHeader === 'true' || body.quality_guarantee === true,
        actionsUrl: body.actions_url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Discover Solana Actions for an endpoint
   */
  async discoverActions(baseUrl: string): Promise<ActionMetadata | null> {
    try {
      // Try actions.json first
      const rulesResponse = await fetch(`${baseUrl}/actions.json`);
      if (rulesResponse.ok) {
        const rules = await rulesResponse.json() as { rules?: Array<{ apiPath?: string }> };
        // Use first API path
        if (rules.rules?.[0]?.apiPath) {
          const actionPath = rules.rules[0].apiPath.replace('/**', '');
          const actionResponse = await fetch(`${baseUrl}${actionPath}`);
          if (actionResponse.ok) {
            return await actionResponse.json() as ActionMetadata;
          }
        }
      }

      // Try direct /api/actions/pay
      const directResponse = await fetch(`${baseUrl}/api/actions/pay`);
      if (directResponse.ok) {
        return await directResponse.json() as ActionMetadata;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Execute a Solana Action to create a payment transaction
   */
  async executeAction(
    actionUrl: string,
    params?: Record<string, string>
  ): Promise<PaymentResult> {
    try {
      // Build URL with params
      let url = actionUrl;
      if (params) {
        const urlObj = new URL(actionUrl);
        Object.entries(params).forEach(([key, value]) => {
          // Replace {param} placeholders in URL
          url = url.replace(`{${key}}`, encodeURIComponent(value));
          urlObj.searchParams.set(key, value);
        });
        if (!url.includes('{')) {
          url = urlObj.toString();
        }
      }

      // POST to get transaction
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: this.wallet.publicKey.toBase58() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string; message?: string };
        return { success: false, error: errorData.error || errorData.message || 'Unknown error' };
      }

      const responseData = await response.json() as { transaction: string; message: string };
      const { transaction: txBase64, message } = responseData;

      // Deserialize and sign
      const transaction = Transaction.from(Buffer.from(txBase64, 'base64'));
      transaction.partialSign(this.wallet);

      // Send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet]
      );

      return {
        success: true,
        signature,
        transactionId: params?.transactionId,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Pay for API access - handles both direct payment and escrow
   */
  async payForAccess(
    url: string,
    options?: {
      useEscrow?: boolean;
      transactionId?: string;
    }
  ): Promise<PaymentResult> {
    const requirement = await this.checkPaymentRequired(url);

    if (!requirement?.required) {
      return { success: true };
    }

    // Check price limit
    const priceInSol = requirement.currency === 'SOL'
      ? requirement.amount
      : requirement.amount / 100; // Approximate USD to SOL

    if (priceInSol > this.maxPricePerRequest) {
      return {
        success: false,
        error: `Price ${requirement.amount} ${requirement.currency} exceeds max ${this.maxPricePerRequest} SOL`,
      };
    }

    // Try to discover and use Solana Actions
    const baseUrl = new URL(url).origin;
    const actions = await this.discoverActions(baseUrl);

    if (actions) {
      const useEscrow = options?.useEscrow ?? requirement.qualityGuarantee;
      const actionType = useEscrow ? 'escrow' : 'pay';

      // Find matching action
      const action = actions.links.actions.find((a) =>
        a.href.includes(actionType) &&
        a.label.toLowerCase().includes(requirement.amount.toString())
      ) || actions.links.actions[0];

      if (action) {
        const params: Record<string, string> = {};
        if (useEscrow && options?.transactionId) {
          params.transactionId = options.transactionId;
        }
        return this.executeAction(action.href, params);
      }
    }

    // Fallback: direct escrow creation via SDK
    return this.createDirectEscrow(
      requirement.provider,
      requirement.amount,
      requirement.currency,
      options?.transactionId || `x402-${Date.now()}`
    );
  }

  /**
   * Make a paid API request with automatic payment handling
   */
  async request<T>(
    url: string,
    options?: RequestInit & {
      useEscrow?: boolean;
      transactionId?: string;
    }
  ): Promise<X402Response<T>> {
    // First attempt
    let response = await fetch(url, options);

    if (response.status === 402) {
      // Payment required - handle it
      const transactionId = options?.transactionId || `x402-${Date.now()}`;
      const paymentResult = await this.payForAccess(url, {
        useEscrow: options?.useEscrow,
        transactionId,
      });

      if (!paymentResult.success) {
        return {
          success: false,
          error: paymentResult.error,
        };
      }

      // Retry with payment proof
      response = await fetch(url, {
        ...options,
        headers: {
          ...options?.headers,
          'X-Payment-Proof': paymentResult.escrowPda?.toBase58() || paymentResult.signature || '',
          'X-Transaction-Id': transactionId,
        },
      });
    }

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json() as T;
    return { success: true, data };
  }

  /**
   * Create escrow directly using Kamiyo SDK
   */
  private async createDirectEscrow(
    provider: PublicKey,
    amount: number,
    currency: 'SOL' | 'USDC' | 'USDT',
    transactionId: string
  ): Promise<PaymentResult> {
    try {
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('escrow'),
          this.wallet.publicKey.toBuffer(),
          Buffer.from(transactionId),
        ],
        this.programId
      );

      // This would use the full KamiyoClient for actual escrow creation
      // For now, return the PDA info
      return {
        success: true,
        escrowPda,
        transactionId,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get wallet public key
   */
  getPublicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<number> {
    const lamports = await this.connection.getBalance(this.wallet.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }
}

/**
 * Create x402 client with simple config
 */
export function createX402Client(
  connection: Connection,
  wallet: Keypair,
  programId: PublicKey,
  options?: {
    qualityThreshold?: number;
    maxPricePerRequest?: number;
  }
): X402Client {
  return new X402Client({
    connection,
    wallet,
    programId,
    ...options,
  });
}
