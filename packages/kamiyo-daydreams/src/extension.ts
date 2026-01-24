/**
 * Daydreams extension with escrow, quality verification, and dispute handling.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { KamiyoClient, AgreementManager } from '@kamiyo/sdk';
import {
  QualityCheckResult,
  QualityEvaluator,
  CircuitBreakerConfig,
  CircuitBreakerState,
  StorageProvider,
  KAMIYO_NETWORKS,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  KamiyoError,
  MemoryStorage,
} from '@kamiyo/agent-core';
import {
  KamiyoExtensionConfig,
  KamiyoMemory,
  PaymentRecord,
  DisputeRecord,
  QualityStats,
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
  DEFAULT_CONFIG,
} from './types';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_PAYMENTS_HISTORY = 1000;
const MAX_DISPUTES_HISTORY = 500;
const MAX_CIRCUIT_BREAKERS = 100;
const MAX_RESPONSE_SIZE = 1_000_000; // 1MB max response body
const MAX_URL_LENGTH = 2048;
const MAX_QUERY_SIZE = 100_000; // 100KB max request body
const MAX_ENDPOINTS_DISCOVER = 20;
const MAX_ESCROW_AMOUNT = 100; // 100 SOL max per escrow
const MAX_HEADER_COUNT = 20;
const PAYMENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DISPUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// SSRF protection: block internal/private/metadata ranges
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^::$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
  /^ff0[0-9a-f]:/i,
  // Cloud metadata endpoints
  /^metadata\.google\.internal$/i,
  /^100\.100\.100\.200$/,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOSTS.some((pattern) => pattern.test(hostname));
}

function hasEmbeddedCredentials(url: URL): boolean {
  return !!(url.username || url.password);
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

  if (hasEmbeddedCredentials(url)) {
    throw new KamiyoError('URLs with embedded credentials not allowed', 'INVALID_CONFIG', { url: urlString });
  }

  return url;
}

const MAX_REDIRECTS = 5;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = url;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const response = await fetch(currentUrl, {
        ...options,
        signal: controller.signal,
        redirect: 'manual',
      });

      // Not a redirect — return the response
      if (response.status < 300 || response.status >= 400) {
        return response;
      }

      // Handle redirect: validate target before following
      const location = response.headers.get('location');
      if (!location) {
        return response;
      }

      const redirectUrl = new URL(location, currentUrl);
      if (isBlockedHost(redirectUrl.hostname)) {
        throw new KamiyoError('Redirect target blocked (internal network)', 'SSRF_BLOCKED', { url: redirectUrl.href });
      }
      if (hasEmbeddedCredentials(redirectUrl)) {
        throw new KamiyoError('Redirect target has embedded credentials', 'SSRF_BLOCKED', { url: redirectUrl.href });
      }
      if (redirectUrl.protocol !== 'https:' && redirectUrl.protocol !== 'http:') {
        throw new KamiyoError('Redirect target uses disallowed protocol', 'SSRF_BLOCKED', { url: redirectUrl.href });
      }

      currentUrl = redirectUrl.href;
    }

    throw new KamiyoError('Too many redirects', 'NETWORK_ERROR', { url });
  } catch (err) {
    if (err instanceof KamiyoError) throw err;
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
// Headers that must never be set by user input
const BLOCKED_HEADERS = new Set([
  'authorization',
  'cookie',
  'host',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'proxy-authorization',
  'set-cookie',
  'transfer-encoding',
  'connection',
  'upgrade',
]);

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = value;
    }
  }
  return sanitized;
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
} from '@kamiyo/agent-core';

type ActionHandler<I, O> = (input: I, ctx: ExtensionContext) => Promise<O>;

interface ExtensionContext {
  memory: KamiyoMemory;
  config: Required<Omit<KamiyoExtensionConfig, 'privateKeyEnvVar'>> & { privateKeyEnvVar: string };
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

// Default quality evaluator — validates schema, field types, and data freshness
const defaultQualityEvaluator: QualityEvaluator = {
  name: 'default',
  evaluate(received: unknown, expected: Record<string, unknown>, _query: Record<string, unknown>): QualityCheckResult {
    const data = extractData(received);
    const completeness = checkCompleteness(data, expected);
    const accuracy = checkAccuracy(data, expected);
    const freshness = checkFreshness(data);
    const score = Math.round(completeness * 0.4 + accuracy * 0.3 + freshness * 0.3);
    return { score, completeness, accuracy, freshness, passesThreshold: score >= DEFAULT_CONFIG.qualityThreshold };
  },
};

function extractData(received: unknown): unknown {
  if (!received || typeof received !== 'object') return received;
  const r = received as Record<string, unknown>;
  return r.data || received;
}

function checkCompleteness(received: unknown, expected: Record<string, unknown>): number {
  const data = extractData(received);
  const expectedFields = Object.keys(expected);
  if (expectedFields.length === 0) {
    // No schema specified — score based on whether we got any meaningful data
    if (!data) return 0;
    if (Array.isArray(data)) return data.length > 0 ? 70 : 0;
    if (typeof data === 'object') return Object.keys(data as object).length > 0 ? 70 : 0;
    return 50;
  }
  if (!data || (Array.isArray(data) && data.length === 0)) return 0;
  const target = Array.isArray(data) ? data[0] : data;
  if (!target || typeof target !== 'object') return 0;
  const receivedFields = Object.keys(target as object);
  const missing = expectedFields.filter((f) => !receivedFields.includes(f));
  return Math.round(((expectedFields.length - missing.length) / expectedFields.length) * 100);
}

function checkAccuracy(received: unknown, expected: Record<string, unknown>): number {
  const data = extractData(received);
  if (!data) return 0;
  if (Array.isArray(data) && data.length === 0) return 0;
  const target = Array.isArray(data) ? data[0] : data;
  if (!target || typeof target !== 'object') return 30;

  const t = target as Record<string, unknown>;
  const expectedFields = Object.keys(expected);

  // No expected schema — check that values are non-trivial
  if (expectedFields.length === 0) {
    const values = Object.values(t);
    const meaningful = values.filter((v) => v !== null && v !== undefined && v !== '' && v !== 0);
    if (values.length === 0) return 0;
    return Math.round((meaningful.length / values.length) * 100);
  }

  // With schema: validate that present fields match expected types
  let matched = 0;
  let checked = 0;
  for (const [field, expectedType] of Object.entries(expected)) {
    if (!(field in t)) continue;
    checked++;
    const value = t[field];
    if (value === null || value === undefined) continue;

    if (typeof expectedType === 'string') {
      // Type name check: 'number', 'string', 'boolean', 'object', 'array'
      if (expectedType === 'array' && Array.isArray(value)) matched++;
      else if (typeof value === expectedType) matched++;
    } else {
      // Non-null value present for a non-type schema entry
      matched++;
    }
  }

  return checked === 0 ? 50 : Math.round((matched / checked) * 100);
}

function checkFreshness(received: unknown): number {
  const data = extractData(received);
  const target = Array.isArray(data) ? data[0] : data;
  if (!target || typeof target !== 'object') return 30; // Unknown freshness = low score
  const t = target as Record<string, unknown>;
  const timestamp = t.timestamp || t.updated_at || t.created_at;
  if (!timestamp) return 30; // No timestamp = assume stale
  const parsed = new Date(String(timestamp)).getTime();
  if (isNaN(parsed)) return 20; // Invalid timestamp
  const age = Date.now() - parsed;
  if (age < 0) return 50; // Future timestamp — suspicious but not necessarily bad
  const maxAge = 3600000; // 1 hour
  return Math.max(0, Math.round(100 - (age / maxAge) * 100));
}

interface ExtendedConfig extends KamiyoExtensionConfig {
  storage?: StorageProvider;
  qualityEvaluator?: QualityEvaluator;
  circuitBreakerConfig?: CircuitBreakerConfig;
}

// Simple mutex for circuit breaker state transitions
class Mutex {
  private locked = false;
  private queue: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => { this.locked = true; resolve(); });
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

class KamiyoExtension {
  readonly name = 'kamiyo';
  readonly version = '2.0.0';

  private config: Required<Omit<KamiyoExtensionConfig, 'privateKeyEnvVar'>> & { privateKeyEnvVar: string };
  private connection: Connection;
  private keypair: Keypair | null = null;
  private wallet: Wallet | null = null;
  private memory: KamiyoMemory;
  private reputation: ReputationManager;
  private sdkClient: KamiyoClient | null = null;
  private agreementManager: AgreementManager | null = null;
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private circuitBreakerMutex = new Mutex();
  private circuitBreakerConfig: CircuitBreakerConfig;
  private storage: StorageProvider;
  private qualityEvaluator: QualityEvaluator;

  private privateKeyEnvVar: string;

  constructor(config: ExtendedConfig = {}) {
    // Validate config at startup
    if (config.network && !KAMIYO_NETWORKS[config.network]) {
      throw new KamiyoError(`Invalid network: ${config.network}. Use 'mainnet' or 'devnet'.`, 'INVALID_CONFIG');
    }
    if (config.rpcUrl) {
      try { new URL(config.rpcUrl); } catch {
        throw new KamiyoError(`Invalid rpcUrl: ${config.rpcUrl}`, 'INVALID_CONFIG');
      }
    }
    if (config.programId && (config.programId.length < 32 || config.programId.length > 44)) {
      throw new KamiyoError(`Invalid programId length: ${config.programId}`, 'INVALID_CONFIG');
    }
    if (config.qualityThreshold !== undefined && (config.qualityThreshold < 0 || config.qualityThreshold > 100)) {
      throw new KamiyoError('qualityThreshold must be between 0 and 100', 'INVALID_CONFIG');
    }
    if (config.maxPrice !== undefined && config.maxPrice < 0) {
      throw new KamiyoError('maxPrice must be non-negative', 'INVALID_CONFIG');
    }
    if (config.privateKeyEnvVar) {
      const keyValue = process.env[config.privateKeyEnvVar];
      if (keyValue) {
        try { Buffer.from(keyValue, 'base64'); } catch {
          throw new KamiyoError(`Invalid base64 in env var ${config.privateKeyEnvVar}`, 'INVALID_CONFIG');
        }
      }
    }

    const networkConfig = KAMIYO_NETWORKS[config.network || 'devnet'];

    this.privateKeyEnvVar = config.privateKeyEnvVar || 'SWARM_AGENT_WALLET_KEY';

    this.config = {
      ...DEFAULT_CONFIG,
      rpcUrl: config.rpcUrl || networkConfig.rpcUrl,
      programId: config.programId || networkConfig.programId,
      network: config.network || 'devnet',
      qualityThreshold: config.qualityThreshold ?? DEFAULT_CONFIG.qualityThreshold,
      maxPrice: config.maxPrice ?? DEFAULT_CONFIG.maxPrice,
      autoDispute: config.autoDispute ?? DEFAULT_CONFIG.autoDispute,
      privateKeyEnvVar: config.privateKeyEnvVar || 'SWARM_AGENT_WALLET_KEY',
      onPayment: config.onPayment || (() => {}),
      onDispute: config.onDispute || (() => {}),
      onQualityCheck: config.onQualityCheck || (() => {}),
    };

    this.connection = new Connection(this.config.rpcUrl, 'confirmed');
    this.circuitBreakerConfig = config.circuitBreakerConfig || DEFAULT_CIRCUIT_BREAKER_CONFIG;
    this.storage = config.storage || new MemoryStorage();
    this.qualityEvaluator = config.qualityEvaluator || defaultQualityEvaluator;

    this.initializeWallet();
    this.memory = this.createInitialMemory();
    this.reputation = new ReputationManager();
  }

  private initializeWallet(): void {
    const keyBase64 = process.env[this.privateKeyEnvVar];
    if (!keyBase64) return;

    const secretKey = Buffer.from(keyBase64, 'base64');
    this.keypair = Keypair.fromSecretKey(secretKey);
    this.wallet = {
      publicKey: this.keypair.publicKey,
      signTransaction: async <T extends import('@solana/web3.js').Transaction>(tx: T): Promise<T> => {
        tx.partialSign(this.keypair!);
        return tx;
      },
      signAllTransactions: async <T extends import('@solana/web3.js').Transaction>(txs: T[]): Promise<T[]> => {
        txs.forEach((tx) => tx.partialSign(this.keypair!));
        return txs;
      },
    } as Wallet;

    this.sdkClient = new KamiyoClient({
      connection: this.connection,
      wallet: this.wallet,
      programId: new PublicKey(this.config.programId),
    });
    this.agreementManager = new AgreementManager(this.sdkClient);
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

    if (!input.endpoint || typeof input.endpoint !== 'string') {
      throw new KamiyoError('endpoint is required and must be a string', 'INVALID_CONFIG');
    }
    if (input.endpoint.length > MAX_URL_LENGTH) {
      throw new KamiyoError(`URL exceeds max length of ${MAX_URL_LENGTH}`, 'INVALID_CONFIG');
    }
    if (input.headers && Object.keys(input.headers).length > MAX_HEADER_COUNT) {
      throw new KamiyoError(`Too many headers (max ${MAX_HEADER_COUNT})`, 'INVALID_CONFIG');
    }
    if (input.query) {
      const bodySize = JSON.stringify(input.query).length;
      if (bodySize > MAX_QUERY_SIZE) {
        throw new KamiyoError(`Request body too large (${bodySize} bytes, max ${MAX_QUERY_SIZE})`, 'INVALID_CONFIG');
      }
    }
    if (input.maxPrice !== undefined && (input.maxPrice < 0 || input.maxPrice > MAX_ESCROW_AMOUNT)) {
      throw new KamiyoError(`maxPrice must be between 0 and ${MAX_ESCROW_AMOUNT}`, 'INVALID_CONFIG');
    }
    if (input.qualityThreshold !== undefined && (input.qualityThreshold < 0 || input.qualityThreshold > 100)) {
      throw new KamiyoError('qualityThreshold must be between 0 and 100', 'INVALID_CONFIG');
    }

    validateUrl(input.endpoint);
    await this.checkCircuitBreaker(input.endpoint);

    const safeHeaders = sanitizeHeaders(input.headers);

    let initialResponse: Response;
    try {
      initialResponse = await fetchWithTimeout(input.endpoint, {
        method: input.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...safeHeaders,
        },
        body: input.query ? JSON.stringify(input.query) : undefined,
      });
    } catch (err) {
      await this.recordCircuitFailure(input.endpoint);
      throw err;
    }

    if (initialResponse.status !== 402) {
      const data = await this.readResponseWithLimit(initialResponse);
      const paymentId = this.generateId('pay');
      const quality = this.assessQuality(data, input.expectedSchema || {}, input.query || {});

      await this.recordCircuitSuccess(input.endpoint);

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

    let paidResponse: Response;
    try {
      paidResponse = await fetchWithTimeout(input.endpoint, {
        method: input.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Proof': transactionId,
          'X-Payment-Amount': String(price),
          ...safeHeaders,
        },
        body: input.query ? JSON.stringify(input.query) : undefined,
      });
    } catch (err) {
      await this.recordCircuitFailure(input.endpoint);
      throw err;
    }

    if (!paidResponse.ok) {
      await this.recordCircuitFailure(input.endpoint);
      throw new KamiyoError(
        'API request failed',
        'API_UNAVAILABLE'
      );
    }

    await this.recordCircuitSuccess(input.endpoint);
    const data = await this.readResponseWithLimit(paidResponse);
    const quality = this.assessQuality(data, input.expectedSchema || {}, input.query || {});

    try { ctx.config.onQualityCheck?.(quality); } catch { /* callback error — non-fatal */ }

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
    try { ctx.config.onPayment?.(record); } catch { /* callback error — non-fatal */ }

    return {
      data,
      quality: quality.score,
      cost: price - refundAmount,
      disputed,
      paymentId,
      transactionId,
    };
  }

  private async readResponseWithLimit(response: Response): Promise<unknown> {
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      throw new KamiyoError(`Response too large (${contentLength} bytes, max ${MAX_RESPONSE_SIZE})`, 'RESPONSE_TOO_LARGE');
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_SIZE) {
      throw new KamiyoError(`Response too large (${text.length} bytes, max ${MAX_RESPONSE_SIZE})`, 'RESPONSE_TOO_LARGE');
    }
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text.slice(0, 10000) };
    }
  }

  private addPaymentRecord(ctx: ExtensionContext, record: PaymentRecord): void {
    // Evict expired records first
    const now = Date.now();
    ctx.memory.payments = ctx.memory.payments.filter((p) => now - p.timestamp < PAYMENT_TTL_MS);

    // Then enforce max size
    while (ctx.memory.payments.length >= MAX_PAYMENTS_HISTORY) {
      ctx.memory.payments.shift();
    }
    ctx.memory.payments.push(record);
  }

  private evictExpiredDisputes(): void {
    const now = Date.now();
    this.memory.disputes = this.memory.disputes.filter((d) => now - d.filedAt < DISPUTE_TTL_MS);
  }

  private async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowOutput> {
    if (!this.keypair || !this.agreementManager) {
      throw new KamiyoError('Wallet not initialized', 'WALLET_NOT_INITIALIZED');
    }

    if (typeof input.amount !== 'number' || input.amount <= 0) {
      throw new KamiyoError('Invalid escrow amount', 'INVALID_CONFIG');
    }

    if (input.amount > MAX_ESCROW_AMOUNT) {
      throw new KamiyoError(`Escrow amount exceeds max (${MAX_ESCROW_AMOUNT} SOL)`, 'INVALID_CONFIG');
    }

    if (!input.provider || typeof input.provider !== 'string' || input.provider.length < 32 || input.provider.length > 44) {
      throw new KamiyoError('Invalid provider address', 'INVALID_CONFIG');
    }

    if (input.timeLockHours !== undefined && (input.timeLockHours < 1 || input.timeLockHours > 720)) {
      throw new KamiyoError('timeLockHours must be between 1 and 720 (30 days)', 'INVALID_CONFIG');
    }

    const transactionId = input.transactionId || this.generateId('tx');
    const timeLockHours = input.timeLockHours || 24;

    try {
      const { pda, signature } = await this.agreementManager.create(
        new PublicKey(input.provider),
        input.amount,
        timeLockHours,
        transactionId
      );

      // Wait for on-chain confirmation before persisting to storage
      const ctx = this.getContext();
      await ctx.connection.confirmTransaction(signature, 'confirmed');

      await this.storage.set(`escrow:${transactionId}`, {
        escrowAddress: pda.toString(),
        provider: input.provider,
        amount: input.amount,
        createdAt: Date.now(),
        signature,
        confirmed: true,
      });

      return {
        escrowAddress: pda.toString(),
        transactionId,
        amount: input.amount,
        expiresAt: Date.now() + timeLockHours * 3600 * 1000,
      };
    } catch (err) {
      throw new KamiyoError(
        `Escrow creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'ESCROW_CREATION_FAILED'
      );
    }
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

    this.evictExpiredDisputes();
    while (ctx.memory.disputes.length >= MAX_DISPUTES_HISTORY) {
      ctx.memory.disputes.shift();
    }
    ctx.memory.disputes.push(dispute);
    payment.disputed = true;

    try { ctx.config.onDispute?.(dispute); } catch { /* callback error — non-fatal */ }

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

    if (endpoints.length > MAX_ENDPOINTS_DISCOVER) {
      throw new KamiyoError(`Too many endpoints to discover (max ${MAX_ENDPOINTS_DISCOVER})`, 'INVALID_CONFIG');
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
    const result = this.qualityEvaluator.evaluate(received, expected, query);
    return {
      ...result,
      passesThreshold: result.score >= this.config.qualityThreshold,
    };
  }

  // Circuit breaker
  private getCircuitBreaker(endpoint: string): CircuitBreakerState {
    let cb = this.circuitBreakers.get(endpoint);
    if (!cb) {
      if (this.circuitBreakers.size >= MAX_CIRCUIT_BREAKERS) {
        const oldest = this.circuitBreakers.keys().next().value;
        if (oldest) this.circuitBreakers.delete(oldest);
      }
      cb = { failures: 0, lastFailure: null, state: 'closed', halfOpenAttempts: 0 };
      this.circuitBreakers.set(endpoint, cb);
    }
    return cb;
  }

  private async checkCircuitBreaker(endpoint: string): Promise<void> {
    await this.circuitBreakerMutex.acquire();
    try {
      const cb = this.getCircuitBreaker(endpoint);
      const now = Date.now();

      if (cb.state === 'open') {
        if (cb.lastFailure && now - cb.lastFailure > this.circuitBreakerConfig.resetTimeoutMs) {
          cb.state = 'half-open';
          cb.halfOpenAttempts = 0;
        } else {
          throw new KamiyoError(`Circuit open for ${endpoint}`, 'CIRCUIT_OPEN');
        }
      }

      if (cb.state === 'half-open' && cb.halfOpenAttempts >= this.circuitBreakerConfig.halfOpenRequests) {
        throw new KamiyoError(`Circuit half-open limit reached for ${endpoint}`, 'CIRCUIT_OPEN');
      }

      if (cb.state === 'half-open') {
        cb.halfOpenAttempts++;
      }
    } finally {
      this.circuitBreakerMutex.release();
    }
  }

  private async recordCircuitSuccess(endpoint: string): Promise<void> {
    await this.circuitBreakerMutex.acquire();
    try {
      const cb = this.getCircuitBreaker(endpoint);
      if (cb.state === 'half-open') {
        cb.state = 'closed';
        cb.failures = 0;
        cb.halfOpenAttempts = 0;
      } else if (cb.state === 'closed' && cb.failures > 0) {
        cb.failures = Math.max(0, cb.failures - 1);
      }
    } finally {
      this.circuitBreakerMutex.release();
    }
  }

  private async recordCircuitFailure(endpoint: string): Promise<void> {
    await this.circuitBreakerMutex.acquire();
    try {
      const cb = this.getCircuitBreaker(endpoint);
      cb.failures++;
      cb.lastFailure = Date.now();

      if (cb.state === 'half-open') {
        cb.state = 'open';
      } else if (cb.failures >= this.circuitBreakerConfig.failureThreshold) {
        cb.state = 'open';
      }
    } finally {
      this.circuitBreakerMutex.release();
    }
  }

  getCircuitBreakerState(endpoint: string): CircuitBreakerState | null {
    return this.circuitBreakers.get(endpoint) || null;
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

    // Rolling window rates: only consider records within the TTL window
    const now = Date.now();
    const recentPayments = this.memory.payments.filter((p) => now - p.timestamp < PAYMENT_TTL_MS);
    const recentDisputes = this.memory.disputes.filter((d) => now - d.filedAt < DISPUTE_TTL_MS);

    if (recentPayments.length > 0) {
      stats.disputeRate = recentDisputes.length / recentPayments.length;
      stats.successRate = recentPayments.filter((p) => p.quality >= this.config.qualityThreshold).length / recentPayments.length;
    } else {
      stats.disputeRate = 0;
      stats.successRate = 0;
    }
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

export function createKamiyoExtension(config?: ExtendedConfig): KamiyoExtension {
  return new KamiyoExtension(config);
}

export { KamiyoExtension };
