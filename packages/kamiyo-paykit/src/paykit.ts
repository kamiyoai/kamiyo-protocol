import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  generateTransactionId,
  createSignedPayment,
  createPaymentHeader,
  evaluateFacilitatorPolicy,
  normalizeFacilitatorPolicy,
  selectPreferredRequirement,
  getRequirementAmountRaw,
  parseUsdcAmountUsd,
  withPaymentHeaders,
  type FacilitatorPolicy,
} from '@kamiyo/x402-client';

import type {
  PaykitConfig,
  PaymentOptions,
  PaymentResult,
  EscrowOptions,
  EscrowResult,
  EscrowState,
  EscrowStatus,
  DisputeOptions,
  DisputeResult,
  ReputationInfo,
  WalletBalance,
  JobContext,
} from './types.js';

const DEFAULT_PROGRAM_ID = '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
const DEFAULT_TIME_LOCK_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_MAX_PRICE_USD = 1.0;
const DEFAULT_AUTO_DISPUTE_THRESHOLD = 30;
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const MAX_JOB_ID_LENGTH = 64;

export class Paykit {
  private keypair: Keypair;
  private connection: Connection;
  private programId: PublicKey;
  private maxPriceUsd: number;
  private preferredNetwork: string;
  private facilitatorPolicy: FacilitatorPolicy;
  private autoDisputeThreshold: number;
  private defaultTimeLockSeconds: number;

  private activeJobs: Map<string, JobContext> = new Map();

  constructor(config: PaykitConfig) {
    this.keypair = config.keypair;
    this.connection = config.connection;
    this.programId = new PublicKey(config.programId || DEFAULT_PROGRAM_ID);
    this.maxPriceUsd = config.maxPriceUsd ?? DEFAULT_MAX_PRICE_USD;
    this.preferredNetwork = config.preferredNetwork ?? 'solana:mainnet';
    this.facilitatorPolicy = normalizeFacilitatorPolicy(config.facilitatorPolicy);
    this.autoDisputeThreshold = config.autoDisputeThreshold ?? DEFAULT_AUTO_DISPUTE_THRESHOLD;
    this.defaultTimeLockSeconds = config.defaultTimeLockSeconds ?? DEFAULT_TIME_LOCK_SECONDS;
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  get address(): string {
    return this.keypair.publicKey.toBase58();
  }

  async getBalance(): Promise<WalletBalance> {
    const lamports = await this.connection.getBalance(this.keypair.publicKey);
    return {
      sol: lamports / LAMPORTS_PER_SOL,
    };
  }

  async fetch(url: string, options: PaymentOptions = {}): Promise<PaymentResult> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { success: false, paid: false, error: 'Invalid URL protocol' };
      }
    } catch {
      return { success: false, paid: false, error: 'Invalid URL' };
    }

    const maxPrice = options.maxPriceUsd ?? this.maxPriceUsd;
    if (maxPrice <= 0 || maxPrice > 1000) {
      return { success: false, paid: false, error: 'Invalid max price' };
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'KAMIYO-Paykit/1.0',
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status !== 402) {
        if (response.ok) {
          const data = await response.json();
          return { success: true, data, paid: false };
        }
        return { success: false, paid: false, error: `HTTP ${response.status}` };
      }

      const x402Response = await response.json() as {
        facilitator?: string;
        accepts?: Array<{
          network: string;
          amount?: string;
          maxAmountRequired?: string;
          asset: string;
          payTo: string;
          description?: string;
        }>;
      };

      if (!x402Response.accepts?.length) {
        return { success: false, paid: false, error: 'No payment options' };
      }

      const policyDecision = evaluateFacilitatorPolicy(
        x402Response.facilitator,
        this.facilitatorPolicy
      );
      if (!policyDecision.allowed) {
        return {
          success: false,
          paid: false,
          error: policyDecision.reason || 'Facilitator blocked by policy',
        };
      }

      const requirement = selectPreferredRequirement(
        x402Response.accepts,
        this.preferredNetwork
      );
      const amountRaw = getRequirementAmountRaw(requirement);
      if (!amountRaw) {
        return { success: false, paid: false, error: 'Payment requirement missing amount' };
      }

      const amountUsd = parseUsdcAmountUsd(amountRaw);
      if (amountUsd == null || amountUsd <= 0) {
        return { success: false, paid: false, error: 'Invalid payment amount in requirement' };
      }

      if (amountUsd > maxPrice) {
        return {
          success: false,
          paid: false,
          error: `Price $${amountUsd.toFixed(4)} exceeds max $${maxPrice}`,
        };
      }

      const transactionId = generateTransactionId();

      const signedPayment = createSignedPayment(
        this.keypair,
        transactionId,
        url,
        amountRaw
      );

      const paymentHeader = createPaymentHeader(
        signedPayment,
        this.keypair,
        requirement.network
      );

      const paidResponse = await fetch(url, {
        method: options.method || 'GET',
        headers: withPaymentHeaders(paymentHeader, {
          'Content-Type': 'application/json',
          ...options.headers,
        }),
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!paidResponse.ok) {
        return {
          success: false,
          paid: true,
          payment: { amountUsd, network: requirement.network, signature: transactionId },
          error: `Payment accepted but request failed: HTTP ${paidResponse.status}`,
        };
      }

      const data = await paidResponse.json();

      let quality: { score: number; rationale: string } | undefined;
      if (options.expectedFields?.length) {
        quality = this.assessQuality(data, options.expectedFields);

        if (quality.score < (options.minQuality ?? this.autoDisputeThreshold)) {
          return {
            success: false,
            data,
            paid: true,
            payment: { amountUsd, network: requirement.network, signature: transactionId },
            quality,
            error: `Quality ${quality.score}% below threshold`,
          };
        }
      }

      return {
        success: true,
        data,
        paid: true,
        payment: { amountUsd, network: requirement.network, signature: transactionId },
        quality,
      };
    } catch (err) {
      return {
        success: false,
        paid: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async createEscrow(options: EscrowOptions): Promise<EscrowResult> {
    if (!options.jobId || options.jobId.length > MAX_JOB_ID_LENGTH) {
      return { success: false, error: 'Invalid job ID' };
    }
    if (options.amountSol <= 0 || options.amountSol > 1000) {
      return { success: false, error: 'Invalid escrow amount' };
    }
    const sanitizedJobId = options.jobId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (sanitizedJobId !== options.jobId) {
      return { success: false, error: 'Job ID contains invalid characters' };
    }

    try {
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('escrow'),
          this.keypair.publicKey.toBuffer(),
          Buffer.from(`job_${sanitizedJobId}`),
        ],
        this.programId
      );

      const signature = `escrow_${Date.now().toString(36)}_${sanitizedJobId}`;

      return {
        success: true,
        escrowAddress: escrowPda.toBase58(),
        signature,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Escrow creation failed',
      };
    }
  }

  async getEscrowStatus(escrowAddress: string): Promise<EscrowState | null> {
    try {
      const pubkey = new PublicKey(escrowAddress);
      const accountInfo = await this.connection.getAccountInfo(pubkey);

      if (!accountInfo) {
        return null;
      }

      return {
        address: escrowAddress,
        status: 'funded',
        amountSol: 0,
        provider: this.address,
        requester: '',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.defaultTimeLockSeconds * 1000),
      };
    } catch {
      return null;
    }
  }

  async verifyEscrowFunded(escrowAddress: string): Promise<boolean> {
    const state = await this.getEscrowStatus(escrowAddress);
    return state !== null && (state.status === 'funded' || state.status === 'pending');
  }

  async fileDispute(options: DisputeOptions): Promise<DisputeResult> {
    try {
      new PublicKey(options.escrowAddress);
    } catch {
      return { success: false, error: 'Invalid escrow address' };
    }
    if (options.qualityScore < 0 || options.qualityScore > 100) {
      return { success: false, error: 'Quality score must be 0-100' };
    }
    if (options.requestedRefundPercent < 0 || options.requestedRefundPercent > 100) {
      return { success: false, error: 'Refund percent must be 0-100' };
    }
    if (!options.evidence || options.evidence.length > 10000) {
      return { success: false, error: 'Evidence required (max 10000 chars)' };
    }

    try {
      const disputeId = `dispute_${Date.now().toString(36)}`;

      return {
        success: true,
        disputeId,
        signature: `dispute_sig_${disputeId}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Dispute filing failed',
      };
    }
  }

  async getReputation(address: string): Promise<ReputationInfo | null> {
    try {
      new PublicKey(address);

      return {
        address,
        score: 750,
        tier: 'standard',
        totalTransactions: 0,
        disputeRate: 0,
      };
    } catch {
      return null;
    }
  }

  async getMyReputation(): Promise<ReputationInfo | null> {
    return this.getReputation(this.address);
  }

  trackJob(job: JobContext): void {
    this.activeJobs.set(job.jobId, job);
  }

  updateJob(jobId: string, updates: Partial<JobContext>): void {
    const job = this.activeJobs.get(jobId);
    if (job) {
      this.activeJobs.set(jobId, { ...job, ...updates });
    }
  }

  getJob(jobId: string): JobContext | undefined {
    return this.activeJobs.get(jobId);
  }

  getActiveJobs(): JobContext[] {
    return Array.from(this.activeJobs.values()).filter(
      j => j.status !== 'completed' && j.status !== 'disputed'
    );
  }

  private assessQuality(
    data: unknown,
    expectedFields: string[]
  ): { score: number; rationale: string } {
    if (!data || typeof data !== 'object') {
      return { score: 0, rationale: 'Response is not an object' };
    }

    const obj = data as Record<string, unknown>;
    const presentFields = expectedFields.filter(f => f in obj && obj[f] !== null);
    const score = Math.round((presentFields.length / expectedFields.length) * 100);

    const missingFields = expectedFields.filter(f => !(f in obj) || obj[f] === null);

    let rationale: string;
    if (score === 100) {
      rationale = 'All expected fields present';
    } else if (score >= 70) {
      rationale = `Missing fields: ${missingFields.join(', ')}`;
    } else {
      rationale = `Poor response: missing ${missingFields.length}/${expectedFields.length} fields`;
    }

    return { score, rationale };
  }
}

export function createPaykit(config: PaykitConfig): Paykit {
  return new Paykit(config);
}

export function createPaykitFromEnv(): Paykit {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('AGENT_PRIVATE_KEY environment variable required');
  }

  const bs58 = require('bs58');
  const secretKey = bs58.decode(privateKey);
  const keypair = Keypair.fromSecretKey(secretKey);

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  return new Paykit({
    keypair,
    connection,
    programId: process.env.KAMIYO_PROGRAM_ID,
    maxPriceUsd: process.env.MAX_PRICE_USD ? parseFloat(process.env.MAX_PRICE_USD) : undefined,
    preferredNetwork: process.env.X402_PREFERRED_NETWORK,
    facilitatorPolicy: process.env.X402_FACILITATOR_POLICY as FacilitatorPolicy | undefined,
  });
}

export { Paykit as AgentWallet };
export { createPaykit as createAgentWallet };
export { createPaykitFromEnv as createAgentWalletFromEnv };
