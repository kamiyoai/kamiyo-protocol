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

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_PAYMENTS_HISTORY = 1000;
const MAX_DISPUTES_HISTORY = 500;

// SSRF protection: block internal/private ranges
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOSTS.some((pattern) => pattern.test(hostname));
}

function validateUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new KamiyoError('Invalid URL format', 'INVALID_CONFIG', { url: urlString });
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new KamiyoError('URL must use http or https protocol', 'INVALID_CONFIG', { url: urlString });
  }

  if (isBlockedHost(url.hostname)) {
    throw new KamiyoError('URL host not allowed', 'INVALID_CONFIG', { url: urlString });
  }

  return url;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new KamiyoError('Request timed out', 'TIMEOUT', { url, timeoutMs });
    }
    throw new KamiyoError(
      `Network error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'NETWORK_ERROR',
      { url }
    );
  } finally {
    clearTimeout(timeout);
  }
}
import {
  ReputationManager,
  reputationActions,
  type GenerateCommitmentInput,
  type GenerateCommitmentOutput,
  type ProveReputationInput,
  type ProveReputationOutput,
  type VerifyProofInput,
  type VerifyProofOutput,
  type TierLevel,
  type PeerReputation,
} from './reputation';

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
  readonly version = '2.0.0';

  private config: Required<KamiyoExtensionConfig>;
  private connection: Connection;
  private keypair: Keypair | null = null;
  private memory: KamiyoMemory;
  private reputation: ReputationManager;

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
    this.reputation = new ReputationManager();
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
      // ZK Reputation Actions
      {
        name: reputationActions.generateCommitment.name,
        description: reputationActions.generateCommitment.description,
        schema: reputationActions.generateCommitment.schema,
        handler: this.generateCommitment.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: reputationActions.proveReputation.name,
        description: reputationActions.proveReputation.description,
        schema: reputationActions.proveReputation.schema,
        handler: this.proveReputation.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: reputationActions.verifyProof.name,
        description: reputationActions.verifyProof.description,
        schema: reputationActions.verifyProof.schema,
        handler: this.verifyProof.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: reputationActions.getReputationTier.name,
        description: reputationActions.getReputationTier.description,
        schema: reputationActions.getReputationTier.schema,
        handler: this.getReputationTier.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: reputationActions.canProveTier.name,
        description: reputationActions.canProveTier.description,
        schema: reputationActions.canProveTier.schema,
        handler: this.canProveTier.bind(this) as ActionHandler<unknown, unknown>,
      },
      {
        name: reputationActions.getVerifiedPeers.name,
        description: reputationActions.getVerifiedPeers.description,
        schema: reputationActions.getVerifiedPeers.schema,
        handler: this.getVerifiedPeers.bind(this) as ActionHandler<unknown, unknown>,
      },
    ];
  }

  private async consumeAPI(input: ConsumeAPIInput): Promise<ConsumeAPIOutput> {
    const ctx = this.getContext();
    const maxPrice = input.maxPrice ?? ctx.config.maxPrice;
    const threshold = input.qualityThreshold ?? ctx.config.qualityThreshold;

    validateUrl(input.endpoint);

    const initialResponse = await fetchWithTimeout(input.endpoint, {
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

      this.addPaymentRecord(ctx, record);
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
        'Price exceeds maximum allowed',
        'INSUFFICIENT_FUNDS'
      );
    }

    const transactionId = this.generateId('tx');
    const paymentId = this.generateId('pay');

    const paidResponse = await fetchWithTimeout(input.endpoint, {
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
        'API request failed',
        'API_UNAVAILABLE'
      );
    }

    const data = await paidResponse.json();
    const quality = this.assessQuality(data, input.expectedSchema || {}, input.query || {});

    ctx.config.onQualityCheck?.(quality);

    let disputed = false;
    let refundAmount = 0;

    if (quality.score < threshold && ctx.config.autoDispute) {
      await this.fileDispute({
        paymentId,
        reason: 'Quality below threshold',
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

    this.addPaymentRecord(ctx, record);
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

  private addPaymentRecord(ctx: ExtensionContext, record: PaymentRecord): void {
    if (ctx.memory.payments.length >= MAX_PAYMENTS_HISTORY) {
      ctx.memory.payments.shift();
    }
    ctx.memory.payments.push(record);
  }

  private async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowOutput> {
    const ctx = this.getContext();

    if (!ctx.keypair) {
      throw new KamiyoError('Wallet not initialized', 'WALLET_NOT_INITIALIZED');
    }

    if (typeof input.amount !== 'number' || input.amount <= 0) {
      throw new KamiyoError('Invalid escrow amount', 'INVALID_CONFIG');
    }

    // TODO: SDK integration
    console.warn('[kamiyo] createEscrow: simulated');

    const transactionId = input.transactionId || this.generateId('tx');
    const timeLockSeconds = (input.timeLockHours || 24) * 3600;
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

    if (!input.paymentId || typeof input.paymentId !== 'string') {
      throw new KamiyoError('Invalid payment ID', 'DISPUTE_FAILED');
    }

    const payment = ctx.memory.payments.find((p) => p.id === input.paymentId);
    if (!payment) {
      throw new KamiyoError('Payment not found', 'PAYMENT_FAILED');
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

    if (ctx.memory.disputes.length >= MAX_DISPUTES_HISTORY) {
      ctx.memory.disputes.shift();
    }
    ctx.memory.disputes.push(dispute);
    payment.disputed = true;

    ctx.config.onDispute?.(dispute);

    return {
      disputeId,
      status: 'pending',
      estimatedResolution: Date.now() + 7 * 24 * 3600 * 1000,
    };
  }

  private async discoverAPIs(input: DiscoverAPIsInput): Promise<DiscoverAPIsOutput> {
    const endpoints = input.endpoints || [];

    if (endpoints.length === 0) {
      return { apis: [], total: 0 };
    }

    const apis: DiscoveredAPI[] = [];

    for (const endpoint of endpoints) {
      try {
        validateUrl(endpoint);
        const response = await fetchWithTimeout(endpoint, { method: 'OPTIONS' }, 10000);

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
        // Skip invalid or unreachable endpoints
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

  // ZK Reputation Handlers
  private async generateCommitment(input: GenerateCommitmentInput): Promise<GenerateCommitmentOutput> {
    return this.reputation.generateCommitment(input);
  }

  private async proveReputation(input: ProveReputationInput): Promise<ProveReputationOutput> {
    return this.reputation.proveReputation(input);
  }

  private async verifyProof(input: VerifyProofInput): Promise<VerifyProofOutput> {
    return this.reputation.verifyProof(input);
  }

  private async getReputationTier(): Promise<{ tier: TierLevel; name: string }> {
    return this.reputation.getTier();
  }

  private async canProveTier(input: { tier: TierLevel }): Promise<{ canProve: boolean; tier: TierLevel }> {
    return {
      canProve: this.reputation.canProveTier(input.tier),
      tier: input.tier,
    };
  }

  private async getVerifiedPeers(): Promise<{ peers: PeerReputation[] }> {
    return { peers: this.reputation.getVerifiedPeers() };
  }

  getReputation(): ReputationManager {
    return this.reputation;
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
