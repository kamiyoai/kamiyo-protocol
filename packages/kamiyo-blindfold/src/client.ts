import {
  PaymentRequest,
  PaymentResponse,
  BatchPaymentRequest,
  BatchPaymentResponse,
  HoldingWalletResponse,
  FundsCheckResponse,
  PaymentStatusResponse,
  CardTier,
  CARD_TIERS,
} from './types';

export interface BlindfoldClientConfig {
  baseUrl: string;
  apiKey?: string;
}

const DEFAULT_BASE_URL = 'https://blindfoldfinance.com';

export class BlindfoldClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: Partial<BlindfoldClientConfig> = {}) {
    this.baseUrl = config.baseUrl || process.env.BLINDFOLD_API_URL || DEFAULT_BASE_URL;
    this.apiKey = config.apiKey || process.env.BLINDFOLD_API_KEY;
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const response = await this.post('/api/crypto-payment/create', {
      amount: request.amount,
      currency: request.currency,
      recipientEmail: request.recipientEmail,
      recipientName: request.recipientName,
      useZkProof: request.useZkProof ?? true,
      agent_pk: request.agentPk,
      reputation_commitment: request.reputationCommitment,
      reputation_proof: request.reputationProof,
      requested_tier: request.requestedTier,
      requires_reputation_check: !!request.agentPk,
    });
    return response as PaymentResponse;
  }

  async createBatchPayment(request: BatchPaymentRequest): Promise<BatchPaymentResponse> {
    const response = await this.post('/api/crypto-payment/batch', {
      payments: request.payments.map((p) => ({
        amount: p.amount,
        currency: p.currency,
        recipientEmail: p.recipientEmail,
        useZkProof: true,
        agent_pk: p.agentPk,
        requested_tier: p.requestedTier,
      })),
      swarmId: request.swarmId,
      taskId: request.taskId,
    });
    return response as BatchPaymentResponse;
  }

  async createHoldingWallet(
    paymentId: string,
    amount: string,
    tokenMint: string
  ): Promise<HoldingWalletResponse> {
    const response = await this.post('/api/zk-pay/create-holding-wallet', {
      paymentId,
      amount,
      tokenMint,
    });
    return response as HoldingWalletResponse;
  }

  async checkFunds(paymentId: string): Promise<FundsCheckResponse> {
    const response = await this.post('/api/zk-pay/check-funds', { paymentId });
    return response as FundsCheckResponse;
  }

  async autoSplitAndExchange(paymentId: string): Promise<{
    success: boolean;
    totalSplits: number;
    exchanges: Array<{
      exchangeId: string;
      payinAddress: string;
      amount: string;
    }>;
  }> {
    const response = await this.post('/api/zk-pay/auto_split_and_exchange', {
      paymentId,
    });
    return response as {
      success: boolean;
      totalSplits: number;
      exchanges: Array<{
        exchangeId: string;
        payinAddress: string;
        amount: string;
      }>;
    };
  }

  async queueDeposit(params: {
    paymentId: string;
    intermediateWalletPublicKey: string;
    amount: string;
    tokenMint: string;
    depositSignature: string;
    changenowExchangeId?: string;
  }): Promise<{ success: boolean; batchKey: string }> {
    const response = await this.post('/api/zk-pay/queue-deposit', {
      payment_id: params.paymentId,
      intermediate_wallet_public_key: params.intermediateWalletPublicKey,
      amount: params.amount,
      token_mint: params.tokenMint,
      deposit_signature: params.depositSignature,
      changenow_exchange_id: params.changenowExchangeId,
    });
    return response as { success: boolean; batchKey: string };
  }

  async uploadProof(params: {
    paymentId: string;
    proofBytes: string;
    commitmentBytes: string;
    blindingFactorBytes: string;
  }): Promise<{ success: boolean; proofPDA: string; signature: string }> {
    const response = await this.post('/api/zk-pay/upload-proof', {
      paymentId: params.paymentId,
      proofBytes: params.proofBytes,
      commitmentBytes: params.commitmentBytes,
      blindingFactorBytes: params.blindingFactorBytes,
    });
    return response as { success: boolean; proofPDA: string; signature: string };
  }

  async submitToRelayer(
    proofPDA: string,
    paymentId: string
  ): Promise<{ success: boolean; signature: string }> {
    const response = await this.post('/api/zk-pay/relayer/submit', {
      proofPDA,
      paymentId,
    });
    return response as { success: boolean; signature: string };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    const response = await this.get(`/api/crypto-payment/verify/${paymentId}`);
    return response as PaymentStatusResponse;
  }

  getTierForThreshold(threshold: number): CardTier {
    for (let i = CARD_TIERS.length - 1; i >= 0; i--) {
      if (threshold >= CARD_TIERS[i].reputationThreshold) {
        return CARD_TIERS[i].tier;
      }
    }
    return 'basic';
  }

  getLimitForTier(tier: CardTier): number {
    const config = CARD_TIERS.find((t) => t.tier === tier);
    return config?.limit ?? 100;
  }

  private async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Blindfold API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Blindfold API error: ${response.status} ${error}`);
    }

    return response.json();
  }
}
