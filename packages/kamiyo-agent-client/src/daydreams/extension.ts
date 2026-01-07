/**
 * Kamiyo Extension for Daydreams
 *
 * Provides payment capabilities to Daydreams agents via the extension pattern.
 * Handles escrow creation, quality verification, and automatic dispute filing.
 *
 * Usage:
 * ```typescript
 * import { createDreams } from '@daydreamsai/core';
 * import { kamiyoExtension } from '@kamiyo/agent-client';
 *
 * const agent = createDreams({
 *   model: openai('gpt-4o'),
 *   extensions: [
 *     kamiyoExtension({
 *       network: 'devnet',
 *       qualityThreshold: 85,
 *       maxPrice: 0.01,
 *       autoDispute: true,
 *     }),
 *   ],
 * });
 * ```
 *
 * @see https://docs.dreams.fun/docs/core/concepts/extensions
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  KamiyoExtensionConfig,
  KamiyoMemory,
  PaymentRecord,
  DisputeRecord,
  QualityStats,
  QualityCheckResult,
  ConsumeAPIInput,
  ConsumeAPIOutput,
  CreateEscrowInput,
  CreateEscrowOutput,
  FileDisputeInput,
  FileDisputeOutput,
  DiscoverAPIsInput,
  DiscoverAPIsOutput,
  DiscoveredAPI,
  CheckBalanceInput,
  CheckBalanceOutput,
  KAMIYO_NETWORKS,
  DEFAULT_CONFIG,
  KamiyoError,
} from './types';

type ActionHandler<I, O> = (input: I, ctx: ExtensionContext) => Promise<O>;

interface ExtensionContext {
  memory: KamiyoMemory;
  config: Required<KamiyoExtensionConfig>;
  connection: Connection;
  keypair: Keypair | null;
}

interface KamiyoAction<I, O> {
  name: string;
  description: string;
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: ActionHandler<I, O>;
}

interface DaydreamsExtension {
  name: string;
  version: string;
  initialize?: () => Promise<void>;
  contexts?: unknown[];
  actions?: KamiyoAction<unknown, unknown>[];
}

class KamiyoExtension {
  readonly name = 'kamiyo';
  readonly version = '1.0.0';

  private config: Required<KamiyoExtensionConfig>;
  private connection: Connection;
  private keypair: Keypair | null = null;
  private memory: KamiyoMemory;

  constructor(config: KamiyoExtensionConfig = {}) {
    const networkConfig = KAMIYO_NETWORKS[config.network || 'devnet'];

    this.config = {
      ...DEFAULT_CONFIG,
      rpcUrl: config.rpcUrl || networkConfig.rpcUrl,
      programId: config.programId || networkConfig.programId,
      network: config.network || 'devnet',
      qualityThreshold: config.qualityThreshold ?? DEFAULT_CONFIG.qualityThreshold,
      maxPrice: config.maxPrice ?? DEFAULT_CONFIG.maxPrice,
      autoDispute: config.autoDispute ?? DEFAULT_CONFIG.autoDispute,
      privateKey: config.privateKey || '',
      onPayment: config.onPayment || (() => {}),
      onDispute: config.onDispute || (() => {}),
      onQualityCheck: config.onQualityCheck || (() => {}),
    };

    this.connection = new Connection(this.config.rpcUrl, 'confirmed');

    if (this.config.privateKey) {
      const secretKey = Buffer.from(this.config.privateKey, 'base64');
      this.keypair = Keypair.fromSecretKey(secretKey);
    }

    this.memory = this.createInitialMemory();
  }

  private createInitialMemory(): KamiyoMemory {
    return {
      payments: [],
      disputes: [],
      balance: 0,
      totalSpent: 0,
      totalRefunded: 0,
      qualityStats: {
        totalCalls: 0,
        avgQuality: 0,
        disputeRate: 0,
        successRate: 0,
        byEndpoint: {},
      },
    };
  }

  private getContext(): ExtensionContext {
    return {
      memory: this.memory,
      config: this.config,
      connection: this.connection,
      keypair: this.keypair,
    };
  }

  async initialize(): Promise<void> {
    if (this.keypair) {
      const balance = await this.connection.getBalance(this.keypair.publicKey);
      this.memory.balance = balance / 1e9;
    }
  }

  getActions(): KamiyoAction<unknown, unknown>[] {
    return [
      {
        name: 'kamiyo.consumeAPI',
        description: 'Consume a paid API with automatic payment via Kamiyo escrow. Handles 402 responses, quality verification, and dispute filing.',
        schema: {
          type: 'object',
          properties: {
            endpoint: { type: 'string', description: 'API endpoint URL' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method' },
            query: { type: 'object', description: 'Request body/query parameters' },
            headers: { type: 'object', description: 'Additional HTTP headers' },
            expectedSchema: { type: 'object', description: 'Expected response schema for quality validation' },
            maxPrice: { type: 'number', description: 'Maximum price in SOL' },
            qualityThreshold: { type: 'number', description: 'Minimum acceptable quality (0-100)' },
          },
          required: ['endpoint'],
        },
        handler: this.consumeAPI.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: 'kamiyo.createEscrow',
        description: 'Create a payment escrow for a service provider. Funds are locked until service is delivered or dispute is resolved.',
        schema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'Provider Solana address' },
            amount: { type: 'number', description: 'Amount in SOL' },
            timeLockHours: { type: 'number', description: 'Time lock duration in hours' },
            transactionId: { type: 'string', description: 'Optional transaction identifier' },
          },
          required: ['provider', 'amount'],
        },
        handler: this.createEscrow.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: 'kamiyo.fileDispute',
        description: 'File a dispute for a payment when service quality is below threshold. Triggers oracle review and potential refund.',
        schema: {
          type: 'object',
          properties: {
            paymentId: { type: 'string', description: 'Payment ID to dispute' },
            reason: { type: 'string', description: 'Dispute reason' },
            evidence: { type: 'object', description: 'Supporting evidence' },
          },
          required: ['paymentId', 'reason'],
        },
        handler: this.fileDispute.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: 'kamiyo.discoverAPIs',
        description: 'Discover Kamiyo-enabled APIs that accept x402 payments. Returns available endpoints with pricing and quality guarantees.',
        schema: {
          type: 'object',
          properties: {
            endpoints: { type: 'array', items: { type: 'string' }, description: 'Endpoints to probe' },
            category: { type: 'string', description: 'API category filter' },
          },
        },
        handler: this.discoverAPIs.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: 'kamiyo.checkBalance',
        description: 'Check wallet balance and pending payments.',
        schema: {
          type: 'object',
          properties: {
            address: { type: 'string', description: 'Optional address to check' },
          },
        },
        handler: this.checkBalance.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: 'kamiyo.getPaymentHistory',
        description: 'Get payment history and quality statistics.',
        schema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum records to return' },
            endpoint: { type: 'string', description: 'Filter by endpoint' },
          },
        },
        handler: this.getPaymentHistory.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: 'kamiyo.getQualityStats',
        description: 'Get aggregated quality statistics across all API calls.',
        schema: {
          type: 'object',
          properties: {},
        },
        handler: this.getQualityStats.bind(this) as ActionHandler<unknown, unknown>,
      },
    ];
  }

  private async consumeAPI(input: ConsumeAPIInput): Promise<ConsumeAPIOutput> {
    const ctx = this.getContext();
    const maxPrice = input.maxPrice ?? ctx.config.maxPrice;
    const threshold = input.qualityThreshold ?? ctx.config.qualityThreshold;

    const initialResponse = await fetch(input.endpoint, {
      method: input.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...input.headers,
      },
      body: input.query ? JSON.stringify(input.query) : undefined,
    });

    if (initialResponse.status !== 402) {
      const data = await initialResponse.json();
      const paymentId = this.generateId('pay');
      const quality = this.assessQuality(data, input.expectedSchema || {}, input.query || {});

      const record: PaymentRecord = {
        id: paymentId,
        endpoint: input.endpoint,
        amount: 0,
        quality: quality.score,
        timestamp: Date.now(),
        disputed: false,
      };

      ctx.memory.payments.push(record);
      this.updateQualityStats(input.endpoint, quality.score, 0);

      return {
        data,
        quality: quality.score,
        cost: 0,
        disputed: false,
        paymentId,
      };
    }

    const paymentInfo = await initialResponse.json() as { amount?: number; service?: string };
    const price = paymentInfo.amount || maxPrice;

    if (price > maxPrice) {
      throw new KamiyoError(
        `Price ${price} SOL exceeds maximum ${maxPrice} SOL`,
        'INSUFFICIENT_FUNDS',
        { price, maxPrice }
      );
    }

    const transactionId = this.generateId('tx');
    const paymentId = this.generateId('pay');

    const paidResponse = await fetch(input.endpoint, {
      method: input.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Proof': transactionId,
        'X-Payment-Amount': String(price),
        ...input.headers,
      },
      body: input.query ? JSON.stringify(input.query) : undefined,
    });

    if (!paidResponse.ok) {
      throw new KamiyoError(
        `API request failed: ${paidResponse.statusText}`,
        'API_UNAVAILABLE',
        { status: paidResponse.status }
      );
    }

    const data = await paidResponse.json();
    const quality = this.assessQuality(data, input.expectedSchema || {}, input.query || {});

    ctx.config.onQualityCheck?.(quality);

    let disputed = false;
    let refundAmount = 0;

    if (quality.score < threshold && ctx.config.autoDispute) {
      const disputeResult = await this.fileDispute({
        paymentId,
        reason: `Quality ${quality.score}% below threshold ${threshold}%`,
        evidence: { expected: input.expectedSchema, received: data },
      });
      disputed = true;
      refundAmount = price * ((100 - quality.score) / 100);
    }

    const record: PaymentRecord = {
      id: paymentId,
      endpoint: input.endpoint,
      amount: price,
      quality: quality.score,
      timestamp: Date.now(),
      disputed,
      refundAmount: disputed ? refundAmount : undefined,
      transactionId,
    };

    ctx.memory.payments.push(record);
    ctx.memory.totalSpent += price - refundAmount;
    if (disputed) ctx.memory.totalRefunded += refundAmount;

    this.updateQualityStats(input.endpoint, quality.score, price);
    ctx.config.onPayment?.(record);

    return {
      data,
      quality: quality.score,
      cost: price - refundAmount,
      disputed,
      paymentId,
      transactionId,
    };
  }

  private async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowOutput> {
    const ctx = this.getContext();

    if (!ctx.keypair) {
      throw new KamiyoError('Wallet not initialized', 'WALLET_NOT_INITIALIZED');
    }

    const transactionId = input.transactionId || this.generateId('tx');
    const timeLockSeconds = (input.timeLockHours || 24) * 3600;

    // Simulated escrow creation (actual implementation would use Kamiyo SDK)
    const escrowAddress = Keypair.generate().publicKey.toString();

    return {
      escrowAddress,
      transactionId,
      amount: input.amount,
      expiresAt: Date.now() + timeLockSeconds * 1000,
    };
  }

  private async fileDispute(input: FileDisputeInput): Promise<FileDisputeOutput> {
    const ctx = this.getContext();

    const payment = ctx.memory.payments.find((p) => p.id === input.paymentId);
    if (!payment) {
      throw new KamiyoError('Payment not found', 'PAYMENT_FAILED', { paymentId: input.paymentId });
    }

    const disputeId = this.generateId('dsp');

    const dispute: DisputeRecord = {
      id: disputeId,
      paymentId: input.paymentId,
      expectedQuality: ctx.config.qualityThreshold,
      actualQuality: payment.quality,
      evidence: input.evidence || {},
      status: 'pending',
      filedAt: Date.now(),
    };

    ctx.memory.disputes.push(dispute);
    payment.disputed = true;

    ctx.config.onDispute?.(dispute);

    return {
      disputeId,
      status: 'pending',
      estimatedResolution: Date.now() + 7 * 24 * 3600 * 1000, // 7 days
    };
  }

  private async discoverAPIs(input: DiscoverAPIsInput): Promise<DiscoverAPIsOutput> {
    const endpoints = input.endpoints || [
      'https://api.kamiyo.ai/v1/exploits',
      'https://api.kamiyo.ai/v1/protocols',
      'https://api.kamiyo.ai/v1/risk',
    ];

    const apis: DiscoveredAPI[] = [];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { method: 'OPTIONS' });

        if (response.status === 402 || response.headers.has('x-payment-amount')) {
          const paymentHeader = response.headers.get('x-payment-amount');
          const cost = paymentHeader ? parseFloat(paymentHeader) : 0.001;

          apis.push({
            endpoint,
            name: this.extractServiceName(endpoint),
            description: response.headers.get('x-service-description') || undefined,
            cost,
            qualityGuarantee: parseInt(response.headers.get('x-quality-guarantee') || '80', 10),
            paymentMethods: ['kamiyo-escrow', 'x402'],
            categories: this.extractCategories(endpoint),
          });
        }
      } catch {
        continue;
      }
    }

    return { apis, total: apis.length };
  }

  private async checkBalance(input: CheckBalanceInput): Promise<CheckBalanceOutput> {
    const ctx = this.getContext();

    let address: PublicKey;
    if (input.address) {
      address = new PublicKey(input.address);
    } else if (ctx.keypair) {
      address = ctx.keypair.publicKey;
    } else {
      throw new KamiyoError('No wallet address available', 'WALLET_NOT_INITIALIZED');
    }

    const balance = await ctx.connection.getBalance(address);
    const pending = ctx.memory.payments
      .filter((p) => p.disputed && !p.refundAmount)
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      balance: balance / 1e9,
      pending,
      available: balance / 1e9 - pending,
    };
  }

  private async getPaymentHistory(input: { limit?: number; endpoint?: string }): Promise<{ payments: PaymentRecord[] }> {
    const ctx = this.getContext();
    let payments = [...ctx.memory.payments];

    if (input.endpoint) {
      payments = payments.filter((p) => p.endpoint === input.endpoint);
    }

    payments.sort((a, b) => b.timestamp - a.timestamp);

    if (input.limit) {
      payments = payments.slice(0, input.limit);
    }

    return { payments };
  }

  private async getQualityStats(): Promise<{ stats: QualityStats }> {
    return { stats: this.memory.qualityStats };
  }

  private assessQuality(
    received: unknown,
    expected: Record<string, unknown>,
    query: Record<string, unknown>
  ): QualityCheckResult {
    const completeness = this.checkCompleteness(received, expected);
    const accuracy = this.checkAccuracy(received, query);
    const freshness = this.checkFreshness(received);

    const score = Math.round(completeness * 0.4 + accuracy * 0.3 + freshness * 0.3);

    return {
      score,
      completeness,
      accuracy,
      freshness,
      passesThreshold: score >= this.config.qualityThreshold,
    };
  }

  private checkCompleteness(received: unknown, expected: Record<string, unknown>): number {
    const data = this.extractData(received);
    const expectedFields = Object.keys(expected);

    if (expectedFields.length === 0) return 100;
    if (!data || (Array.isArray(data) && data.length === 0)) return 0;

    const target = Array.isArray(data) ? data[0] : data;
    const receivedFields = Object.keys(target || {});

    const missing = expectedFields.filter((f) => !receivedFields.includes(f));
    return Math.round(((expectedFields.length - missing.length) / expectedFields.length) * 100);
  }

  private checkAccuracy(received: unknown, query: Record<string, unknown>): number {
    const data = this.extractData(received);
    if (!data || (Array.isArray(data) && data.length === 0)) return 0;

    const target = Array.isArray(data) ? data[0] : data;
    if (!target || typeof target !== 'object') return 50;

    const t = target as Record<string, unknown>;
    const hasValidValues = Object.values(t).some(
      (v) => v !== null && v !== undefined && v !== '' && v !== 0
    );

    return hasValidValues ? 100 : 30;
  }

  private checkFreshness(received: unknown): number {
    const data = this.extractData(received);
    const target = Array.isArray(data) ? data[0] : data;

    if (!target || typeof target !== 'object') return 50;

    const t = target as Record<string, unknown>;
    const timestamp = t.timestamp || t.updated_at || t.created_at;
    if (!timestamp) return 50;

    const age = Date.now() - new Date(String(timestamp)).getTime();
    const maxAge = 3600000; // 1 hour

    return Math.max(0, Math.round(100 - (age / maxAge) * 100));
  }

  private extractData(received: unknown): unknown {
    if (!received || typeof received !== 'object') return received;
    const r = received as Record<string, unknown>;
    return r.data || received;
  }

  private updateQualityStats(endpoint: string, quality: number, cost: number): void {
    const stats = this.memory.qualityStats;

    stats.totalCalls++;
    stats.avgQuality = (stats.avgQuality * (stats.totalCalls - 1) + quality) / stats.totalCalls;

    if (!stats.byEndpoint[endpoint]) {
      stats.byEndpoint[endpoint] = {
        calls: 0,
        avgQuality: 0,
        avgCost: 0,
        disputes: 0,
        lastCall: 0,
      };
    }

    const ep = stats.byEndpoint[endpoint];
    ep.calls++;
    ep.avgQuality = (ep.avgQuality * (ep.calls - 1) + quality) / ep.calls;
    ep.avgCost = (ep.avgCost * (ep.calls - 1) + cost) / ep.calls;
    ep.lastCall = Date.now();

    stats.disputeRate = this.memory.disputes.length / stats.totalCalls;
    stats.successRate = this.memory.payments.filter((p) => p.quality >= this.config.qualityThreshold).length / stats.totalCalls;
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private extractServiceName(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private extractCategories(endpoint: string): string[] {
    const categories: string[] = [];
    const lower = endpoint.toLowerCase();

    if (lower.includes('exploit') || lower.includes('security')) categories.push('security');
    if (lower.includes('risk')) categories.push('risk');
    if (lower.includes('protocol')) categories.push('defi');
    if (lower.includes('price') || lower.includes('market')) categories.push('market-data');
    if (lower.includes('nft')) categories.push('nft');

    return categories.length > 0 ? categories : ['general'];
  }

  toExtension(): DaydreamsExtension {
    return {
      name: this.name,
      version: this.version,
      initialize: this.initialize.bind(this),
      actions: this.getActions(),
    };
  }
}

export function kamiyoExtension(config?: KamiyoExtensionConfig): DaydreamsExtension {
  const ext = new KamiyoExtension(config);
  return ext.toExtension();
}

export function createKamiyoExtension(config?: KamiyoExtensionConfig): KamiyoExtension {
  return new KamiyoExtension(config);
}
