/**
 * KamiyoClient - Main SDK client with x402Resolve support
 */

import axios, { AxiosInstance } from 'axios';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  KamiyoClientConfig,
  AccessToken,
  PaymentParams,
  DisputeParams,
  DisputeResult,
  DisputeStatus,
  EscrowDetails,
  VerifierResponse,
  X402Error,
} from './types';
import { Tsudzuki, TsudzukiConfig, DEFAULT_TSUDZUKI_CONFIG } from './retry-handler';

export class KamiyoClient {
  private apiUrl: string;
  private chain: string;
  private verifierUrl: string;
  private enablex402Resolve: boolean;
  private walletPublicKey?: PublicKey;
  private connection?: Connection;
  private httpClient: AxiosInstance;
  private retryHandler: Tsudzuki;

  constructor(config: KamiyoClientConfig) {
    this.apiUrl = config.apiUrl;
    this.chain = config.chain;
    this.verifierUrl = config.verifierUrl || 'http://localhost:8000';
    this.enablex402Resolve = config.enablex402Resolve ?? true;

    // Initialize retry handler
    this.retryHandler = new Tsudzuki(config.retryConfig || DEFAULT_TSUDZUKI_CONFIG);

    // Initialize Solana connection if chain is Solana
    if (config.chain === 'solana') {
      const rpcUrl = config.rpcUrl || 'https://api.devnet.solana.com';
      this.connection = new Connection(rpcUrl, 'confirmed');

      if (config.walletPublicKey) {
        this.walletPublicKey =
          typeof config.walletPublicKey === 'string'
            ? new PublicKey(config.walletPublicKey)
            : config.walletPublicKey;
      }
    }

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Pay for API access (with optional escrow for x402Resolve)
   */
  async pay(params: PaymentParams): Promise<AccessToken> {
    this.validatePaymentParams(params);

    return this.retryHandler.execute(async () => {
      try {
        const enableEscrow = params.enableEscrow ?? this.enablex402Resolve;

        if (this.chain === 'solana' && enableEscrow) {
          return await this.payToEscrow(params);
        }

        const response = await this.httpClient.post('/pay', {
          amount: params.amount,
          recipient: params.recipient,
          chain: this.chain,
          metadata: params.metadata,
        });

        return {
          token: response.data.token,
          expiresAt: response.data.expiresAt,
          transactionId: response.data.transactionId,
        };
      } catch (error: any) {
        throw new X402Error(
          error.response?.data?.message || 'Payment failed',
          'PAYMENT_FAILED',
          error.response?.status
        );
      }
    }, 'Payment');
  }

  private validatePaymentParams(params: PaymentParams): void {
    if (!params.amount || params.amount <= 0) {
      throw new X402Error(
        `Invalid amount: ${params.amount}. Must be greater than 0`,
        'INVALID_AMOUNT'
      );
    }

    if (params.amount < 0.001 || params.amount > 1000) {
      throw new X402Error(
        `Amount ${params.amount} SOL out of range. Must be between 0.001 and 1000 SOL`,
        'AMOUNT_OUT_OF_RANGE'
      );
    }

    if (!params.recipient || params.recipient.trim().length === 0) {
      throw new X402Error(
        'Recipient address is required',
        'RECIPIENT_REQUIRED'
      );
    }
  }

  /**
   * Pay to escrow (enables dispute resolution)
   */
  private async payToEscrow(params: PaymentParams): Promise<AccessToken> {
    if (!this.connection || !this.walletPublicKey) {
      throw new X402Error(
        'Solana wallet not configured',
        'WALLET_NOT_CONFIGURED'
      );
    }

    const walletPublicKey = this.walletPublicKey;

    return this.retryHandler.execute(async () => {
      try {
        // Request escrow account creation
        const response = await this.httpClient.post('/escrow/create', {
          agent: walletPublicKey.toBase58(),
          api: params.recipient,
          amount: params.amount,
          metadata: params.metadata,
        });

        const { escrowAddress, transactionId, token, expiresAt } = response.data;

        return {
          token,
          expiresAt,
          transactionId,
          escrowAddress,
        };
      } catch (error: any) {
        throw new X402Error(
          error.response?.data?.message || 'Escrow payment failed',
          'ESCROW_PAYMENT_FAILED',
          error.response?.status
        );
      }
    }, 'Escrow Payment');
  }

  /**
   * File a dispute for poor data quality
   */
  async fileDispute(params: DisputeParams): Promise<DisputeResult> {
    this.validateDisputeParams(params);

    if (!this.enablex402Resolve) {
      throw new X402Error(
        'x402Resolve not enabled. Set enablex402Resolve: true in config',
        'X402_RESOLVE_DISABLED'
      );
    }

    return this.retryHandler.execute(async () => {
      try {
        // Step 1: Call verifier oracle for quality assessment
        const verifierResponse = await axios.post<VerifierResponse>(
          `${this.verifierUrl}/verify-quality`,
          {
            original_query: params.originalQuery,
            data_received: params.dataReceived,
            expected_criteria: params.expectedCriteria,
            transaction_id: params.transactionId,
            expected_record_count: params.expectedRecordCount,
          },
          { timeout: 30000 }
        );

        const verification = verifierResponse.data;

        // Step 2: Submit dispute to KAMIYO API with verifier signature
        const disputeResponse = await this.httpClient.post('/dispute/create', {
          transactionId: params.transactionId,
          reason: params.reason,
          qualityScore: verification.quality_score,
          recommendation: verification.recommendation,
          refundPercentage: verification.refund_percentage,
          reasoning: verification.reasoning,
          signature: verification.signature,
        });

        return {
          disputeId: disputeResponse.data.disputeId,
          status: 'pending',
          qualityScore: verification.quality_score,
          recommendation: verification.recommendation as any,
          refundPercentage: verification.refund_percentage,
          reasoning: verification.reasoning,
          signature: verification.signature,
        };
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED') {
          throw new X402Error(
            'Cannot connect to verifier oracle. Ensure it is running.',
            'VERIFIER_UNAVAILABLE'
          );
        }

        throw new X402Error(
          error.response?.data?.message || 'Dispute filing failed',
          'DISPUTE_FAILED',
          error.response?.status
        );
      }
    }, 'Dispute Filing');
  }

  /**
   * Get status of a dispute
   */
  async getDisputeStatus(disputeId: string): Promise<DisputeStatus> {
    return this.retryHandler.execute(async () => {
      try {
        const response = await this.httpClient.get(`/dispute/${disputeId}`);
        return response.data;
      } catch (error: any) {
        throw new X402Error(
          error.response?.data?.message || 'Failed to fetch dispute status',
          'DISPUTE_STATUS_FAILED',
          error.response?.status
        );
      }
    }, 'Get Dispute Status');
  }

  /**
   * Get escrow details
   */
  async getEscrowDetails(escrowAddress: string): Promise<EscrowDetails> {
    return this.retryHandler.execute(async () => {
      try {
        const response = await this.httpClient.get(`/escrow/${escrowAddress}`);
        return response.data;
      } catch (error: any) {
        throw new X402Error(
          error.response?.data?.message || 'Failed to fetch escrow details',
          'ESCROW_DETAILS_FAILED',
          error.response?.status
        );
      }
    }, 'Get Escrow Details');
  }

  /**
   * Query KAMIYO API with automatic payment handling
   */
  async query(endpoint: string, params?: Record<string, any>): Promise<any> {
    return this.retryHandler.execute(async () => {
      try {
        const response = await this.httpClient.get(endpoint, { params });

        // Check for 402 Payment Required
        if (response.status === 402) {
          throw new X402Error(
            'Payment required. Call .pay() first.',
            'PAYMENT_REQUIRED',
            402
          );
        }

        return response.data;
      } catch (error: any) {
        if (error.response?.status === 402) {
          throw new X402Error(
            'Payment required. Call .pay() first.',
            'PAYMENT_REQUIRED',
            402
          );
        }

        throw new X402Error(
          error.response?.data?.message || 'Query failed',
          'QUERY_FAILED',
          error.response?.status
        );
      }
    }, 'API Query');
  }

  /**
   * Set access token (from previous payment)
   */
  setAccessToken(token: string): void {
    this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Clear access token
   */
  clearAccessToken(): void {
    delete this.httpClient.defaults.headers.common['Authorization'];
  }

  private validateDisputeParams(params: DisputeParams): void {
    if (!params.transactionId || params.transactionId.trim().length === 0) {
      throw new X402Error(
        'Transaction ID is required',
        'TRANSACTION_ID_REQUIRED'
      );
    }

    if (!params.reason || params.reason.trim().length === 0) {
      throw new X402Error(
        'Dispute reason is required',
        'REASON_REQUIRED'
      );
    }

    if (!params.originalQuery || params.originalQuery.trim().length === 0) {
      throw new X402Error(
        'Original query is required for dispute evidence',
        'ORIGINAL_QUERY_REQUIRED'
      );
    }

    if (!params.dataReceived) {
      throw new X402Error(
        'Data received is required for dispute evidence',
        'DATA_RECEIVED_REQUIRED'
      );
    }

    if (!Array.isArray(params.expectedCriteria) || params.expectedCriteria.length === 0) {
      throw new X402Error(
        'Expected criteria must be a non-empty array',
        'EXPECTED_CRITERIA_REQUIRED'
      );
    }
  }
}
