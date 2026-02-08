import {
  declareReputationExtension,
  parseReputationPayload,
  parseReputationExtension,
  validateReputationPayload,
  REPUTATION_EXTENSION_KEY,
} from './v2/extensions';
import type {
  KamiyoReputationInfo,
  KamiyoReputationPayload,
  PaymentRequired402,
  ExtensionDeclaration,
} from './v2/types';
import { computeCreditScore, type CreditScoringOutput } from './credit-scoring';

export { REPUTATION_EXTENSION_KEY } from './v2/extensions';
export type { KamiyoReputationInfo, KamiyoReputationPayload } from './v2/types';

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

export function buildReputationPayload(proof: ReputationProofData): Record<string, ExtensionDeclaration> {
  const proofBase64 = Buffer.from(proof.proofBytes).toString('base64');
  return {
    [REPUTATION_EXTENSION_KEY]: {
      info: {
        proof: proofBase64,
        commitment: proof.commitment,
        threshold: proof.threshold,
        agentPk: proof.agentPk,
        publicSignals: proof.publicSignals || [],
      },
    },
  };
}

export function reputationExtensionInfo(
  minThreshold: number,
  opts?: { tiers?: ReputationTier[]; creditEnabled?: boolean }
): Record<string, ExtensionDeclaration> {
  return declareReputationExtension({
    minThreshold,
    tiers: opts?.tiers,
    creditEnabled: opts?.creditEnabled,
  });
}

export function parseReputationRequirement(
  response: PaymentRequired402 | { extensions?: Record<string, ExtensionDeclaration> }
): ReputationRequirement | null {
  const info = parseReputationExtension(response);
  if (!info) return null;
  return { minThreshold: info.minThreshold, required: true };
}

export function checkReputationRequirement(
  extensions: Record<string, unknown> | undefined,
  requirement: ReputationRequirement
): ReputationVerifyResult {
  if (!requirement.required) {
    return { valid: true };
  }

  const payload = parseReputationPayload(extensions);
  if (!payload) {
    return { valid: false, reason: 'Missing reputation extension payload' };
  }

  const validation = validateReputationPayload(payload);
  if (!validation.valid) {
    return { valid: false, reason: validation.errors[0] };
  }

  if (payload.threshold < requirement.minThreshold) {
    return {
      valid: false,
      threshold: payload.threshold,
      commitment: payload.commitment,
      reason: `Threshold ${payload.threshold} below required ${requirement.minThreshold}`,
    };
  }

  return {
    valid: true,
    threshold: payload.threshold,
    commitment: payload.commitment,
  };
}

export interface ReputationMiddlewareOptions {
  minThreshold: number;
  required?: boolean;
  requireProofVerification?: boolean;
  onInvalid?: (result: ReputationVerifyResult) => void;
  verifyProof?: (payload: KamiyoReputationPayload) => Promise<boolean>;
}

export type MiddlewareRequest = {
  body?: { extensions?: Record<string, unknown> };
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
    const extensions = req.body?.extensions;
    const check = checkReputationRequirement(extensions, {
      minThreshold: opts.minThreshold,
      required: opts.required ?? true,
    });

    if (!check.valid) {
      opts.onInvalid?.(check);
      res.status(402).json({
        error: 'Reputation requirement not met',
        reason: check.reason,
        extensions: reputationExtensionInfo(opts.minThreshold),
      });
      return;
    }

    if (opts.verifyProof || opts.requireProofVerification) {
      const payload = parseReputationPayload(extensions);

      if (!payload) {
        if (opts.requireProofVerification) {
          res.status(402).json({
            error: 'Reputation proof required',
            reason: 'Missing reputation extension',
          });
          return;
        }
      } else if (opts.verifyProof) {
        const isValid = await opts.verifyProof(payload);
        if (!isValid) {
          res.status(402).json({
            error: 'Invalid reputation proof',
            reason: 'Cryptographic verification failed',
          });
          return;
        }
      } else if (opts.requireProofVerification) {
        res.status(500).json({
          error: 'Server configuration error',
          reason: 'Proof verification required but no verifier configured',
        });
        return;
      }
    }

    next();
  };
}

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

export function getTierForThreshold(
  threshold: number,
  tiers: ReputationTier[] = DEFAULT_TIERS
): ReputationTier {
  const sorted = [...tiers].sort((a, b) => b.minThreshold - a.minThreshold);
  return sorted.find((t) => threshold >= t.minThreshold) || tiers[0];
}

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

export interface TieredPricing402Response {
  x402Version: 2;
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
    x402Version: 2,
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

export interface CreditStore {
  get(commitment: string): Promise<CreditAccount | null>;
  set(commitment: string, account: CreditAccount): Promise<void>;
  delete(commitment: string): Promise<void>;
  getAll(): Promise<CreditAccount[]>;
  atomicIncrement(commitment: string, field: 'usedCredit', amount: number): Promise<number>;
}

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

  getAccountSync(commitment: string): CreditAccount | null {
    if (this.store instanceof InMemoryCreditStore) {
      return (this.store as any).accounts.get(commitment) || null;
    }
    throw new Error('Sync access not available with persistent store');
  }
}

export interface ReputationPricingMiddlewareOptions {
  basePrice: number;
  tiers?: ReputationTier[];
  minThreshold?: number;
  creditTracker?: CreditTracker;
  allowCredit?: boolean;
  requireProofVerification?: boolean;
  verifyProof?: (payload: KamiyoReputationPayload) => Promise<boolean>;
  onPriceCalculated?: (result: {
    price: number;
    tier: string;
    discount: number;
    usingCredit: boolean;
  }) => void;
}

export function reputationPricingMiddleware(opts: ReputationPricingMiddlewareOptions) {
  return async (
    req: MiddlewareRequest & { reputationPricing?: TieredPricing402Response },
    res: MiddlewareResponse,
    next: NextFunction
  ): Promise<void> => {
    const extensions = req.body?.extensions;
    const payload = parseReputationPayload(extensions);

    if (!payload) {
      const response = tieredPricing402(opts.basePrice, null, {
        tiers: opts.tiers,
        minThreshold: opts.minThreshold,
        reputationRequired: true,
      });

      res.status(402).json(response);
      return;
    }

    if (opts.minThreshold && payload.threshold < opts.minThreshold) {
      res.status(402).json({
        error: 'Reputation too low',
        yourThreshold: payload.threshold,
        minRequired: opts.minThreshold,
      });
      return;
    }

    if (opts.verifyProof || opts.requireProofVerification) {
      if (opts.verifyProof) {
        const isValid = await opts.verifyProof(payload);
        if (!isValid) {
          res.status(402).json({
            error: 'Invalid reputation proof',
            reason: 'Cryptographic verification failed',
          });
          return;
        }
      } else if (opts.requireProofVerification) {
        res.status(500).json({
          error: 'Server configuration error',
          reason: 'Proof verification required but no verifier configured',
        });
        return;
      }
    }

    const pricing = calculateReputationPrice(opts.basePrice, payload.threshold, opts.tiers);

    let usingCredit = false;
    if (opts.allowCredit && opts.creditTracker && pricing.tier.creditLimit) {
      const creditCheck = await opts.creditTracker.checkCredit(payload.commitment, pricing.price);
      if (creditCheck.approved) {
        usingCredit = true;
        await opts.creditTracker.useCredit(payload.commitment, pricing.price);
      }
    }

    opts.onPriceCalculated?.({
      price: pricing.price,
      tier: pricing.tier.name,
      discount: pricing.discount,
      usingCredit,
    });

    req.reputationPricing = tieredPricing402(opts.basePrice, payload.threshold, {
      tiers: opts.tiers,
      minThreshold: opts.minThreshold,
    });

    next();
  };
}

export async function handleReputation402(
  responseBody: PaymentRequired402,
  generateProof: (threshold: number) => Promise<ReputationProofData>
): Promise<Record<string, ExtensionDeclaration> | null> {
  const requirement = parseReputationRequirement(responseBody);
  if (!requirement) return null;

  const proof = await generateProof(requirement.minThreshold);
  return buildReputationPayload(proof);
}

export async function fetchWithReputation(
  url: string,
  init: RequestInit,
  generateProof: (threshold: number) => Promise<ReputationProofData>
): Promise<Response> {
  let response = await fetch(url, init);

  if (response.status === 402) {
    const body = await response.json() as PaymentRequired402;
    const extensionPayload = await handleReputation402(body, generateProof);
    if (extensionPayload) {
      const paymentBody = {
        ...(init.body ? JSON.parse(init.body as string) : {}),
        extensions: extensionPayload,
      };
      response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers || {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentBody),
      });
    }
  }

  return response;
}

export interface CreditHistory {
  timestamp: number;
  type: 'use' | 'repay' | 'escrow_outcome' | 'collateral_pledge' | 'collateral_release';
  amount: number;
}

export interface CreditAccountV2 extends CreditAccount {
  totalRepayments: number;
  onTimeRepayments: number;
  disputesWon: number;
  disputesLost: number;
  escrowsCompleted: number;
  averageQualityScore: number;
  qualityScoreCount: number;
  creditScore: number;
  creditMultiplier: number;
  effectiveCreditLimit: number;
  collateralPledged: number;
  collateralEscrowPda?: string;
  firstActivityAt: number;
  lastActivityAt: number;
  history: CreditHistory[];
}

export interface CreditStoreV2 extends CreditStore {
  getV2(commitment: string): Promise<CreditAccountV2 | null>;
  setV2(commitment: string, account: CreditAccountV2): Promise<void>;
  appendHistory(commitment: string, entry: CreditHistory): Promise<void>;
}

const MAX_HISTORY = 100;
const LOCK_TIMEOUT_MS = 10_000;

export class InMemoryCreditStoreV2 extends InMemoryCreditStore implements CreditStoreV2 {
  private v2Accounts = new Map<string, CreditAccountV2>();

  async getV2(commitment: string): Promise<CreditAccountV2 | null> {
    return this.v2Accounts.get(commitment) || null;
  }

  async setV2(commitment: string, account: CreditAccountV2): Promise<void> {
    this.v2Accounts.set(commitment, account);
    await this.set(commitment, account);
  }

  async appendHistory(commitment: string, entry: CreditHistory): Promise<void> {
    const account = this.v2Accounts.get(commitment);
    if (!account) throw new Error(`Account not found: ${commitment}`);
    if (account.history.length >= MAX_HISTORY) {
      account.history.shift();
    }
    account.history.push(entry);
  }

  getAllV2(): CreditAccountV2[] {
    return Array.from(this.v2Accounts.values());
  }
}

export interface DynamicCreditTrackerOptions {
  tierBaseLimit?: number;
  halfLifeDays?: number;
  collateralMultiplier?: number;
  minEscrowsForCredit?: number;
  lockTimeoutMs?: number;
}

export class DynamicCreditTracker {
  private store: CreditStoreV2;
  private locks = new Map<string, { promise: Promise<void>; resolve: () => void }>();
  private tierBaseLimit: number;
  private halfLifeDays: number;
  private collateralMultiplier: number;
  private minEscrowsForCredit: number;
  private lockTimeoutMs: number;

  constructor(store?: CreditStoreV2, opts?: DynamicCreditTrackerOptions) {
    this.store = store || new InMemoryCreditStoreV2();
    this.tierBaseLimit = opts?.tierBaseLimit ?? 100;
    this.halfLifeDays = opts?.halfLifeDays ?? 30;
    this.collateralMultiplier = opts?.collateralMultiplier ?? 3;
    this.minEscrowsForCredit = opts?.minEscrowsForCredit ?? 3;
    this.lockTimeoutMs = opts?.lockTimeoutMs ?? LOCK_TIMEOUT_MS;
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + this.lockTimeoutMs;
    while (this.locks.has(key)) {
      const existing = this.locks.get(key)!;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Lock timeout on commitment ${key}`);
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Lock timeout on commitment ${key}`)), remaining);
      });

      try {
        await Promise.race([existing.promise, timeout]);
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    }

    let resolve: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    this.locks.set(key, { promise, resolve: resolve! });
    try {
      return await fn();
    } finally {
      this.locks.delete(key);
      resolve!();
    }
  }

  async registerAccount(commitment: string, agentPk: string, threshold: number): Promise<CreditAccountV2> {
    return this.withLock(commitment, async () => {
      const now = Date.now();
      const tier = getTierForThreshold(threshold);
      const account: CreditAccountV2 = {
        agentPk,
        commitment,
        tier: tier.name,
        creditLimit: 0,
        usedCredit: 0,
        lastPaymentAt: now,
        totalRepayments: 0,
        onTimeRepayments: 0,
        disputesWon: 0,
        disputesLost: 0,
        escrowsCompleted: 0,
        averageQualityScore: 0,
        qualityScoreCount: 0,
        creditScore: 0,
        creditMultiplier: 0,
        effectiveCreditLimit: 0,
        collateralPledged: 0,
        firstActivityAt: now,
        lastActivityAt: now,
        history: [],
      };
      await this.store.setV2(commitment, account);
      return account;
    });
  }

  async checkCredit(commitment: string, amount: number): Promise<CreditCheckResult> {
    if (!Number.isFinite(amount) || amount < 0) {
      return { approved: false, availableCredit: 0, reason: 'Invalid amount' };
    }
    const account = await this.store.getV2(commitment);
    if (!account) {
      return { approved: false, availableCredit: 0, reason: 'Account not found' };
    }

    const available = account.effectiveCreditLimit - account.usedCredit;
    if (amount > available) {
      return {
        approved: false,
        availableCredit: Math.max(0, available),
        reason: `Insufficient credit. Available: ${Math.max(0, available)}, requested: ${amount}`,
      };
    }

    return { approved: true, availableCredit: available };
  }

  async useCredit(commitment: string, amount: number): Promise<boolean> {
    if (!Number.isFinite(amount) || amount < 0) return false;

    return this.withLock(commitment, async () => {
      const account = await this.store.getV2(commitment);
      if (!account) return false;

      this.recomputeLimit(account);

      const available = account.effectiveCreditLimit - account.usedCredit;
      if (amount > available) return false;

      account.usedCredit += amount;
      account.lastActivityAt = Date.now();
      await this.store.setV2(commitment, account);
      await this.store.appendHistory(commitment, {
        timestamp: Date.now(),
        type: 'use',
        amount,
      });
      return true;
    });
  }

  async repayCredit(commitment: string, amount: number): Promise<boolean> {
    if (!Number.isFinite(amount) || amount < 0) return false;

    return this.withLock(commitment, async () => {
      const account = await this.store.getV2(commitment);
      if (!account) return false;

      account.usedCredit = Math.max(0, account.usedCredit - amount);
      account.totalRepayments++;
      account.onTimeRepayments++;
      account.lastPaymentAt = Date.now();
      account.lastActivityAt = Date.now();
      this.recomputeLimit(account);
      await this.store.setV2(commitment, account);
      await this.store.appendHistory(commitment, {
        timestamp: Date.now(),
        type: 'repay',
        amount,
      });
      return true;
    });
  }

  async recordEscrowOutcome(
    commitment: string,
    outcome: 'released' | 'dispute_won' | 'dispute_lost',
    qualityScore?: number
  ): Promise<void> {
    await this.withLock(commitment, async () => {
      const account = await this.store.getV2(commitment);
      if (!account) return;

      account.escrowsCompleted++;
      account.lastActivityAt = Date.now();

      if (outcome === 'dispute_won') {
        account.disputesWon++;
      } else if (outcome === 'dispute_lost') {
        account.disputesLost++;
      }

      if (qualityScore != null && Number.isFinite(qualityScore)) {
        const clamped = Math.max(0, Math.min(100, qualityScore));
        account.qualityScoreCount++;
        account.averageQualityScore += (clamped - account.averageQualityScore) / account.qualityScoreCount;
      }

      this.recomputeLimit(account);
      await this.store.setV2(commitment, account);
      await this.store.appendHistory(commitment, {
        timestamp: Date.now(),
        type: 'escrow_outcome',
        amount: qualityScore ?? 0,
      });
    });
  }

  async pledgeCollateral(commitment: string, escrowPda: string, amount: number): Promise<boolean> {
    if (!Number.isFinite(amount) || amount <= 0) return false;

    return this.withLock(commitment, async () => {
      const account = await this.store.getV2(commitment);
      if (!account) return false;

      account.collateralPledged += amount;
      account.collateralEscrowPda = escrowPda;
      account.lastActivityAt = Date.now();
      this.recomputeLimit(account);
      await this.store.setV2(commitment, account);
      await this.store.appendHistory(commitment, {
        timestamp: Date.now(),
        type: 'collateral_pledge',
        amount,
      });
      return true;
    });
  }

  async releaseCollateral(commitment: string): Promise<number> {
    return this.withLock(commitment, async () => {
      const account = await this.store.getV2(commitment);
      if (!account) return 0;

      const released = account.collateralPledged;
      account.collateralPledged = 0;
      account.collateralEscrowPda = undefined;
      account.lastActivityAt = Date.now();
      this.recomputeLimit(account);
      await this.store.setV2(commitment, account);
      await this.store.appendHistory(commitment, {
        timestamp: Date.now(),
        type: 'collateral_release',
        amount: released,
      });
      return released;
    });
  }

  async refreshCreditLimit(commitment: string): Promise<void> {
    await this.withLock(commitment, async () => {
      const account = await this.store.getV2(commitment);
      if (!account) return;
      this.recomputeLimit(account);
      await this.store.setV2(commitment, account);
    });
  }

  async getCreditBreakdown(commitment: string): Promise<CreditScoringOutput | null> {
    const account = await this.store.getV2(commitment);
    if (!account) return null;

    return this.buildScoringInput(account);
  }

  async getAccount(commitment: string): Promise<CreditAccountV2 | null> {
    return this.store.getV2(commitment);
  }

  async serialize(): Promise<string> {
    if (!(this.store instanceof InMemoryCreditStoreV2)) {
      throw new Error('Serialize only supported with InMemoryCreditStoreV2');
    }
    const accounts = (this.store as InMemoryCreditStoreV2).getAllV2();
    return JSON.stringify({
      version: 2,
      tierBaseLimit: this.tierBaseLimit,
      halfLifeDays: this.halfLifeDays,
      collateralMultiplier: this.collateralMultiplier,
      minEscrowsForCredit: this.minEscrowsForCredit,
      accounts,
    });
  }

  static async deserialize(json: string): Promise<DynamicCreditTracker> {
    const data = JSON.parse(json);
    if (data.version !== 2) throw new Error(`Unsupported version: ${data.version}`);

    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, {
      tierBaseLimit: data.tierBaseLimit,
      halfLifeDays: data.halfLifeDays,
      collateralMultiplier: data.collateralMultiplier,
      minEscrowsForCredit: data.minEscrowsForCredit,
    });

    for (const account of data.accounts) {
      if (account.qualityScoreCount == null) {
        account.qualityScoreCount = account.escrowsCompleted;
      }
      await store.setV2(account.commitment, account);
    }

    return tracker;
  }

  private recomputeLimit(account: CreditAccountV2): void {
    const now = Date.now();
    const tenureDays = (now - account.firstActivityAt) / (1000 * 60 * 60 * 24);
    const inactiveDays = (now - account.lastActivityAt) / (1000 * 60 * 60 * 24);

    const totalDisputes = account.disputesWon + account.disputesLost;
    const disputeWinRate = totalDisputes > 0 ? account.disputesWon / totalDisputes : null;

    const onTimeRepaymentRate = account.totalRepayments > 0
      ? account.onTimeRepayments / account.totalRepayments
      : null;

    const scoring = computeCreditScore({
      disputeWinRate,
      onTimeRepaymentRate,
      avgQualityScore: account.averageQualityScore,
      tenureDays,
      inactiveDays,
      pledgedAmount: account.collateralPledged,
      tierBaseLimit: this.tierBaseLimit,
      escrowsCompleted: account.escrowsCompleted,
      halfLifeDays: this.halfLifeDays,
    });

    account.creditScore = scoring.rawScore;
    account.creditMultiplier = scoring.multiplier;
    account.effectiveCreditLimit = scoring.effectiveLimit;
    account.creditLimit = scoring.effectiveLimit;
  }

  private buildScoringInput(account: CreditAccountV2): CreditScoringOutput {
    const now = Date.now();
    const tenureDays = (now - account.firstActivityAt) / (1000 * 60 * 60 * 24);
    const inactiveDays = (now - account.lastActivityAt) / (1000 * 60 * 60 * 24);

    const totalDisputes = account.disputesWon + account.disputesLost;
    const disputeWinRate = totalDisputes > 0 ? account.disputesWon / totalDisputes : null;

    const onTimeRepaymentRate = account.totalRepayments > 0
      ? account.onTimeRepayments / account.totalRepayments
      : null;

    return computeCreditScore({
      disputeWinRate,
      onTimeRepaymentRate,
      avgQualityScore: account.averageQualityScore,
      tenureDays,
      inactiveDays,
      pledgedAmount: account.collateralPledged,
      tierBaseLimit: this.tierBaseLimit,
      escrowsCompleted: account.escrowsCompleted,
      halfLifeDays: this.halfLifeDays,
    });
  }
}
