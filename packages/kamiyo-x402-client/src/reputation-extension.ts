/**
 * x402 Reputation Extension
 *
 * ZK reputation proofs as x402 header extensions. Agent proves
 * "my success rate >= X%" without revealing actual score.
 * Merchants can require minimum reputation before accepting payment.
 *
 * Features:
 * - ZK proof headers for privacy-preserving reputation
 * - Tiered pricing based on reputation (higher rep = lower fees)
 * - Access control for premium endpoints
 * - Credit limits for untrusted agents
 * - Dynamic pricing middleware
 *
 * Headers:
 * - X-402-Reputation-Proof: Base64-encoded ZK proof
 * - X-402-Reputation-Commitment: Poseidon hash commitment
 * - X-402-Reputation-Threshold: Required minimum (0-100)
 */

// Header names
export const X402_REPUTATION_PROOF = 'X-402-Reputation-Proof';
export const X402_REPUTATION_COMMITMENT = 'X-402-Reputation-Commitment';
export const X402_REPUTATION_THRESHOLD = 'X-402-Reputation-Threshold';

export interface ReputationProofData {
  agentPk: string;
  commitment: string;
  threshold: number;
  proofBytes: Uint8Array;
  groth16Proof?: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals?: string[];
}

export interface ReputationHeaders {
  [X402_REPUTATION_PROOF]: string;
  [X402_REPUTATION_COMMITMENT]: string;
  [X402_REPUTATION_THRESHOLD]: string;
}

export interface ParsedReputationHeaders {
  proof: string;
  commitment: string;
  threshold: number;
}

export interface ReputationRequirement {
  minThreshold: number;
  required: boolean;
}

export interface ReputationVerifyResult {
  valid: boolean;
  threshold?: number;
  commitment?: string;
  reason?: string;
}

/**
 * Encode a reputation proof into x402 headers.
 * Agent includes these when making payment requests.
 */
export function encodeReputationHeaders(proof: ReputationProofData): ReputationHeaders {
  const proofPayload = {
    agentPk: proof.agentPk,
    commitment: proof.commitment,
    threshold: proof.threshold,
    proof: Buffer.from(proof.proofBytes).toString('base64'),
    groth16Proof: proof.groth16Proof,
    publicSignals: proof.publicSignals,
  };

  return {
    [X402_REPUTATION_PROOF]: Buffer.from(JSON.stringify(proofPayload)).toString('base64'),
    [X402_REPUTATION_COMMITMENT]: proof.commitment,
    [X402_REPUTATION_THRESHOLD]: String(proof.threshold),
  };
}

/**
 * Parse reputation headers from a request.
 * Returns null if headers are missing or malformed.
 */
export function parseReputationHeaders(
  headers: Record<string, string | string[] | undefined>
): ParsedReputationHeaders | null {
  const proof = headers[X402_REPUTATION_PROOF] || headers[X402_REPUTATION_PROOF.toLowerCase()];
  const commitment = headers[X402_REPUTATION_COMMITMENT] || headers[X402_REPUTATION_COMMITMENT.toLowerCase()];
  const threshold = headers[X402_REPUTATION_THRESHOLD] || headers[X402_REPUTATION_THRESHOLD.toLowerCase()];

  if (!proof || !commitment || !threshold) {
    return null;
  }

  const proofStr = Array.isArray(proof) ? proof[0] : proof;
  const commitmentStr = Array.isArray(commitment) ? commitment[0] : commitment;
  const thresholdStr = Array.isArray(threshold) ? threshold[0] : threshold;

  const thresholdNum = parseInt(thresholdStr, 10);
  if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
    return null;
  }

  return {
    proof: proofStr,
    commitment: commitmentStr,
    threshold: thresholdNum,
  };
}

/**
 * Decode the full proof payload from the X-402-Reputation-Proof header.
 */
export function decodeReputationProof(proofHeader: string): ReputationProofData | null {
  try {
    const json = Buffer.from(proofHeader, 'base64').toString();
    const data = JSON.parse(json);

    return {
      agentPk: data.agentPk,
      commitment: data.commitment,
      threshold: data.threshold,
      proofBytes: Buffer.from(data.proof, 'base64'),
      groth16Proof: data.groth16Proof,
      publicSignals: data.publicSignals,
    };
  } catch {
    return null;
  }
}

/**
 * Add reputation requirement to x402 402 response headers.
 * Merchant includes this to signal minimum reputation needed.
 */
export function reputationRequirementHeaders(minThreshold: number): Record<string, string> {
  return {
    'X-402-Reputation-Required': 'true',
    'X-402-Reputation-Min-Threshold': String(minThreshold),
  };
}

/**
 * Check if request meets reputation requirement.
 * Returns verification result with reason if failed.
 *
 * Note: This performs structural validation only.
 * For cryptographic verification, use verifyReputationProof from @kamiyo/solana-privacy.
 */
export function checkReputationRequirement(
  headers: Record<string, string | string[] | undefined>,
  requirement: ReputationRequirement
): ReputationVerifyResult {
  if (!requirement.required) {
    return { valid: true };
  }

  const parsed = parseReputationHeaders(headers);
  if (!parsed) {
    return {
      valid: false,
      reason: 'Missing reputation proof headers',
    };
  }

  if (parsed.threshold < requirement.minThreshold) {
    return {
      valid: false,
      threshold: parsed.threshold,
      commitment: parsed.commitment,
      reason: `Threshold ${parsed.threshold} below required ${requirement.minThreshold}`,
    };
  }

  return {
    valid: true,
    threshold: parsed.threshold,
    commitment: parsed.commitment,
  };
}

/**
 * Express/Connect middleware for reputation-gated x402.
 * Checks reputation headers before payment verification.
 */
export interface ReputationMiddlewareOptions {
  minThreshold: number;
  required?: boolean;
  /** Require cryptographic proof verification. When true, requests without valid proofs are rejected. */
  requireProofVerification?: boolean;
  onInvalid?: (result: ReputationVerifyResult) => void;
  verifyProof?: (proof: ReputationProofData) => Promise<boolean>;
}

export type MiddlewareRequest = {
  headers: Record<string, string | string[] | undefined>;
};

export type MiddlewareResponse = {
  status: (code: number) => MiddlewareResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export type NextFunction = (err?: unknown) => void;

export function reputationMiddleware(opts: ReputationMiddlewareOptions) {
  return async (
    req: MiddlewareRequest,
    res: MiddlewareResponse,
    next: NextFunction
  ): Promise<void> => {
    const check = checkReputationRequirement(req.headers, {
      minThreshold: opts.minThreshold,
      required: opts.required ?? true,
    });

    if (!check.valid) {
      opts.onInvalid?.(check);

      Object.entries(reputationRequirementHeaders(opts.minThreshold)).forEach(([k, v]) =>
        res.setHeader(k, v)
      );

      res.status(402).json({
        error: 'Reputation requirement not met',
        reason: check.reason,
        required: {
          minThreshold: opts.minThreshold,
        },
      });
      return;
    }

    // Cryptographic verification (mandatory when requireProofVerification is true)
    if (opts.verifyProof || opts.requireProofVerification) {
      const parsed = parseReputationHeaders(req.headers);

      if (!parsed) {
        if (opts.requireProofVerification) {
          res.status(402).json({
            error: 'Reputation proof required',
            reason: 'Missing reputation headers',
          });
          return;
        }
      } else {
        const proof = decodeReputationProof(parsed.proof);

        if (!proof) {
          if (opts.requireProofVerification) {
            res.status(402).json({
              error: 'Invalid reputation proof',
              reason: 'Could not decode proof data',
            });
            return;
          }
        } else if (opts.verifyProof) {
          const isValid = await opts.verifyProof(proof);
          if (!isValid) {
            res.status(402).json({
              error: 'Invalid reputation proof',
              reason: 'Cryptographic verification failed',
            });
            return;
          }
        } else if (opts.requireProofVerification) {
          // requireProofVerification is true but no verifyProof function provided
          res.status(500).json({
            error: 'Server configuration error',
            reason: 'Proof verification required but no verifier configured',
          });
          return;
        }
      }
    }

    next();
  };
}

/**
 * Helper to add reputation headers to a fetch request.
 */
export function withReputationProof(
  proof: ReputationProofData,
  init?: RequestInit
): RequestInit {
  const headers = encodeReputationHeaders(proof);
  return {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...headers,
    },
  };
}

/**
 * Parse reputation requirement from 402 response headers.
 */
export function parseReputationRequirement(
  headers: Headers | Record<string, string>
): ReputationRequirement | null {
  const get = (key: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    return headers[key] || headers[key.toLowerCase()] || null;
  };

  const required = get('X-402-Reputation-Required');
  if (required !== 'true') {
    return null;
  }

  const minThreshold = get('X-402-Reputation-Min-Threshold');
  if (!minThreshold) {
    return null;
  }

  const threshold = parseInt(minThreshold, 10);
  if (isNaN(threshold)) {
    return null;
  }

  return {
    minThreshold: threshold,
    required: true,
  };
}

// ============================================================================
// TIERED PRICING - Dynamic pricing based on reputation
// ============================================================================

/**
 * Reputation tiers with associated discounts.
 * Higher reputation = lower prices = more business.
 */
export interface ReputationTier {
  name: string;
  minThreshold: number;
  discountPercent: number;
  creditLimit?: number; // Max amount before requiring upfront payment
}

export const DEFAULT_TIERS: ReputationTier[] = [
  { name: 'untrusted', minThreshold: 0, discountPercent: 0, creditLimit: 0 },
  { name: 'basic', minThreshold: 50, discountPercent: 5, creditLimit: 10 },
  { name: 'trusted', minThreshold: 70, discountPercent: 10, creditLimit: 50 },
  { name: 'premium', minThreshold: 85, discountPercent: 15, creditLimit: 200 },
  { name: 'elite', minThreshold: 95, discountPercent: 25, creditLimit: 1000 },
];

/**
 * Get the tier for a given reputation threshold.
 */
export function getTierForThreshold(
  threshold: number,
  tiers: ReputationTier[] = DEFAULT_TIERS
): ReputationTier {
  const sorted = [...tiers].sort((a, b) => b.minThreshold - a.minThreshold);
  return sorted.find((t) => threshold >= t.minThreshold) || tiers[0];
}

/**
 * Calculate discounted price based on reputation.
 */
export function calculateReputationPrice(
  basePrice: number,
  threshold: number,
  tiers: ReputationTier[] = DEFAULT_TIERS
): { price: number; discount: number; tier: ReputationTier } {
  const tier = getTierForThreshold(threshold, tiers);
  const discount = basePrice * (tier.discountPercent / 100);
  return {
    price: basePrice - discount,
    discount,
    tier,
  };
}

/**
 * Extended 402 response with tiered pricing.
 * Shows all price tiers so agents know what discount they'd get.
 */
export interface TieredPricing402Response {
  x402Version: 1;
  basePrice: number;
  yourPrice: number;
  yourTier: string;
  yourDiscount: number;
  tiers: Array<{
    name: string;
    minThreshold: number;
    price: number;
    discountPercent: number;
  }>;
  creditLimit?: number;
  reputationRequired: boolean;
  minThreshold: number;
}

/**
 * Build a tiered pricing 402 response.
 */
export function tieredPricing402(
  basePrice: number,
  agentThreshold: number | null,
  opts: {
    tiers?: ReputationTier[];
    minThreshold?: number;
    reputationRequired?: boolean;
  } = {}
): TieredPricing402Response {
  const tiers = opts.tiers || DEFAULT_TIERS;
  const minThreshold = opts.minThreshold ?? 0;
  const agentTier = agentThreshold !== null
    ? getTierForThreshold(agentThreshold, tiers)
    : tiers[0];

  const pricing = agentThreshold !== null
    ? calculateReputationPrice(basePrice, agentThreshold, tiers)
    : { price: basePrice, discount: 0, tier: tiers[0] };

  return {
    x402Version: 1,
    basePrice,
    yourPrice: pricing.price,
    yourTier: agentTier.name,
    yourDiscount: pricing.discount,
    tiers: tiers.map((t) => ({
      name: t.name,
      minThreshold: t.minThreshold,
      price: basePrice * (1 - t.discountPercent / 100),
      discountPercent: t.discountPercent,
    })),
    creditLimit: agentTier.creditLimit,
    reputationRequired: opts.reputationRequired ?? false,
    minThreshold,
  };
}

// ============================================================================
// CREDIT SYSTEM - Pay-later for trusted agents
// ============================================================================

export interface CreditAccount {
  agentPk: string;
  commitment: string;
  tier: string;
  creditLimit: number;
  usedCredit: number;
  lastPaymentAt: number;
}

export interface CreditCheckResult {
  approved: boolean;
  availableCredit: number;
  reason?: string;
}

/**
 * Storage interface for credit accounts.
 * Implement this to use Redis, PostgreSQL, or other persistent storage.
 */
export interface CreditStore {
  get(commitment: string): Promise<CreditAccount | null>;
  set(commitment: string, account: CreditAccount): Promise<void>;
  delete(commitment: string): Promise<void>;
  getAll(): Promise<CreditAccount[]>;
  atomicIncrement(commitment: string, field: 'usedCredit', amount: number): Promise<number>;
}

/**
 * In-memory credit store for testing and development.
 */
export class InMemoryCreditStore implements CreditStore {
  private accounts = new Map<string, CreditAccount>();

  async get(commitment: string): Promise<CreditAccount | null> {
    return this.accounts.get(commitment) || null;
  }

  async set(commitment: string, account: CreditAccount): Promise<void> {
    this.accounts.set(commitment, account);
  }

  async delete(commitment: string): Promise<void> {
    this.accounts.delete(commitment);
  }

  async getAll(): Promise<CreditAccount[]> {
    return Array.from(this.accounts.values());
  }

  async atomicIncrement(commitment: string, field: 'usedCredit', amount: number): Promise<number> {
    const account = this.accounts.get(commitment);
    if (!account) throw new Error('Account not found');
    account[field] += amount;
    return account[field];
  }
}

/**
 * Credit tracker with pluggable storage backend.
 * Default: in-memory. Production: pass Redis/DB store.
 */
export class CreditTracker {
  private store: CreditStore;
  private mutex = new Map<string, Promise<void>>();

  constructor(store?: CreditStore) {
    this.store = store || new InMemoryCreditStore();
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (this.mutex.has(key)) {
      await this.mutex.get(key);
    }
    let resolve: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    this.mutex.set(key, promise);
    try {
      return await fn();
    } finally {
      this.mutex.delete(key);
      resolve!();
    }
  }

  async getAccount(commitment: string): Promise<CreditAccount | null> {
    return this.store.get(commitment);
  }

  async registerAccount(
    commitment: string,
    agentPk: string,
    threshold: number,
    tiers: ReputationTier[] = DEFAULT_TIERS
  ): Promise<CreditAccount> {
    const tier = getTierForThreshold(threshold, tiers);
    const account: CreditAccount = {
      agentPk,
      commitment,
      tier: tier.name,
      creditLimit: tier.creditLimit || 0,
      usedCredit: 0,
      lastPaymentAt: Date.now(),
    };
    await this.store.set(commitment, account);
    return account;
  }

  async checkCredit(commitment: string, amount: number): Promise<CreditCheckResult> {
    const account = await this.store.get(commitment);
    if (!account) {
      return { approved: false, availableCredit: 0, reason: 'Account not found' };
    }

    const available = account.creditLimit - account.usedCredit;
    if (amount > available) {
      return {
        approved: false,
        availableCredit: available,
        reason: `Insufficient credit. Available: ${available}, requested: ${amount}`,
      };
    }

    return { approved: true, availableCredit: available };
  }

  async useCredit(commitment: string, amount: number): Promise<boolean> {
    return this.withLock(commitment, async () => {
      const check = await this.checkCredit(commitment, amount);
      if (!check.approved) return false;

      await this.store.atomicIncrement(commitment, 'usedCredit', amount);
      return true;
    });
  }

  async repayCredit(commitment: string, amount: number): Promise<void> {
    await this.withLock(commitment, async () => {
      const account = await this.store.get(commitment);
      if (!account) return;

      account.usedCredit = Math.max(0, account.usedCredit - amount);
      account.lastPaymentAt = Date.now();
      await this.store.set(commitment, account);
    });
  }

  async getStats(): Promise<{ totalAccounts: number; totalCredit: number; usedCredit: number }> {
    const accounts = await this.store.getAll();
    let totalCredit = 0;
    let usedCredit = 0;
    for (const account of accounts) {
      totalCredit += account.creditLimit;
      usedCredit += account.usedCredit;
    }
    return { totalAccounts: accounts.length, totalCredit, usedCredit };
  }

  // Sync versions for backwards compatibility (use store directly for sync access if InMemoryCreditStore)
  getAccountSync(commitment: string): CreditAccount | null {
    if (this.store instanceof InMemoryCreditStore) {
      return (this.store as any).accounts.get(commitment) || null;
    }
    throw new Error('Sync access not available with persistent store');
  }
}

// ============================================================================
// COMBINED MIDDLEWARE - Reputation + Tiered Pricing + Credit
// ============================================================================

export interface ReputationPricingMiddlewareOptions {
  basePrice: number;
  tiers?: ReputationTier[];
  minThreshold?: number;
  creditTracker?: CreditTracker;
  allowCredit?: boolean;
  /** Require cryptographic proof verification. When true, requests without valid proofs are rejected. */
  requireProofVerification?: boolean;
  verifyProof?: (proof: ReputationProofData) => Promise<boolean>;
  onPriceCalculated?: (result: {
    price: number;
    tier: string;
    discount: number;
    usingCredit: boolean;
  }) => void;
}

/**
 * Full-featured middleware combining:
 * - Reputation verification
 * - Tiered pricing
 * - Credit system
 *
 * Returns 402 with complete pricing breakdown.
 * Attaches pricing info to request for downstream handlers.
 */
export function reputationPricingMiddleware(opts: ReputationPricingMiddlewareOptions) {
  return async (
    req: MiddlewareRequest & { reputationPricing?: TieredPricing402Response },
    res: MiddlewareResponse,
    next: NextFunction
  ): Promise<void> => {
    const parsed = parseReputationHeaders(req.headers);

    // No reputation headers - return 402 with pricing info
    if (!parsed) {
      const response = tieredPricing402(opts.basePrice, null, {
        tiers: opts.tiers,
        minThreshold: opts.minThreshold,
        reputationRequired: true,
      });

      Object.entries(reputationRequirementHeaders(opts.minThreshold || 0)).forEach(([k, v]) =>
        res.setHeader(k, v)
      );
      res.setHeader('X-402-Base-Price', String(opts.basePrice));
      res.setHeader('X-402-Pricing-Type', 'tiered-reputation');

      res.status(402).json(response);
      return;
    }

    // Check minimum threshold
    if (opts.minThreshold && parsed.threshold < opts.minThreshold) {
      res.status(402).json({
        error: 'Reputation too low',
        yourThreshold: parsed.threshold,
        minRequired: opts.minThreshold,
      });
      return;
    }

    // Cryptographic verification (mandatory when requireProofVerification is true)
    if (opts.verifyProof || opts.requireProofVerification) {
      const proof = decodeReputationProof(parsed.proof);

      if (!proof) {
        res.status(402).json({
          error: 'Invalid reputation proof',
          reason: 'Could not decode proof data',
        });
        return;
      }

      if (opts.verifyProof) {
        const isValid = await opts.verifyProof(proof);
        if (!isValid) {
          res.status(402).json({
            error: 'Invalid reputation proof',
            reason: 'Cryptographic verification failed',
          });
          return;
        }
      } else if (opts.requireProofVerification) {
        // requireProofVerification is true but no verifyProof function provided
        res.status(500).json({
          error: 'Server configuration error',
          reason: 'Proof verification required but no verifier configured',
        });
        return;
      }
    }

    // Calculate pricing
    const pricing = calculateReputationPrice(opts.basePrice, parsed.threshold, opts.tiers);

    // Check credit if enabled
    let usingCredit = false;
    if (opts.allowCredit && opts.creditTracker && pricing.tier.creditLimit) {
      const creditCheck = await opts.creditTracker.checkCredit(parsed.commitment, pricing.price);
      if (creditCheck.approved) {
        usingCredit = true;
        await opts.creditTracker.useCredit(parsed.commitment, pricing.price);
      }
    }

    opts.onPriceCalculated?.({
      price: pricing.price,
      tier: pricing.tier.name,
      discount: pricing.discount,
      usingCredit,
    });

    // Attach pricing to request for downstream
    req.reputationPricing = tieredPricing402(opts.basePrice, parsed.threshold, {
      tiers: opts.tiers,
      minThreshold: opts.minThreshold,
    });

    next();
  };
}

// ============================================================================
// AGENT-SIDE HELPERS - Make it easy for agents to use
// ============================================================================

/**
 * Handle a 402 response with reputation requirements.
 * Returns the proof headers to retry with.
 */
export async function handleReputation402(
  response: Response,
  generateProof: (threshold: number) => Promise<ReputationProofData>
): Promise<ReputationHeaders | null> {
  if (response.status !== 402) return null;

  const requirement = parseReputationRequirement(response.headers);
  if (!requirement) return null;

  const proof = await generateProof(requirement.minThreshold);
  return encodeReputationHeaders(proof);
}

/**
 * Fetch wrapper that automatically handles reputation 402s.
 */
export async function fetchWithReputation(
  url: string,
  init: RequestInit,
  generateProof: (threshold: number) => Promise<ReputationProofData>
): Promise<Response> {
  let response = await fetch(url, init);

  if (response.status === 402) {
    const headers = await handleReputation402(response, generateProof);
    if (headers) {
      response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers || {}),
          ...headers,
        },
      });
    }
  }

  return response;
}
