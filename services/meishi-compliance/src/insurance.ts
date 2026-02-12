import crypto from 'crypto';

export interface InsurancePool {
  id: string;
  name: string;
  premiumAsset: 'KAMIYO';
  reserveUsd: number;
  basePremiumBps: number;
  minComplianceScore: number;
  maxCoverageUsd: number;
  claimPayoutThreshold: number;
  activePolicies: number;
  totalPremiumsUsd: number;
  totalClaimsPaidUsd: number;
  createdAt: number;
}

export interface UnderwritingInput {
  agentId: string;
  complianceScore: number;
  jurisdiction: string;
  monthlyVolumeUsd: number;
  disputeRate: number;
  requestedCoverageUsd: number;
}

export interface InsuranceQuote {
  poolId: string;
  agentId: string;
  premiumBps: number;
  annualPremiumUsd: number;
  deductibleUsd: number;
  maxCoverageUsd: number;
  riskTier: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface InsurancePolicy {
  id: string;
  poolId: string;
  agentId: string;
  coverageUsd: number;
  annualPremiumUsd: number;
  deductibleUsd: number;
  premiumBps: number;
  startsAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'cancelled';
}

export interface InsuranceClaim {
  id: string;
  policyId: string;
  incidentRef: string;
  requestedPayoutUsd: number;
  approvedPayoutUsd: number;
  status: 'submitted' | 'approved' | 'rejected' | 'paid';
  oracleVotesFor: number;
  oracleVotesAgainst: number;
  threshold: number;
  submittedAt: number;
  resolvedAt?: number;
}

interface CreatePoolInput {
  id?: string;
  name: string;
  reserveUsd: number;
  basePremiumBps: number;
  minComplianceScore: number;
  maxCoverageUsd: number;
  claimPayoutThreshold?: number;
}

interface NumberValidationOptions {
  min?: number;
  max?: number;
  integer?: boolean;
}

export class LiabilityInsuranceEngine {
  private pools = new Map<string, InsurancePool>();
  private policies = new Map<string, InsurancePolicy>();
  private claims = new Map<string, InsuranceClaim>();

  listPools(): InsurancePool[] {
    return [...this.pools.values()];
  }

  createPool(input: CreatePoolInput): InsurancePool {
    const now = Date.now();
    const id = input.id?.trim() || `pool_${crypto.randomBytes(6).toString('hex')}`;
    if (this.pools.has(id)) {
      throw new Error(`Insurance pool already exists: ${id}`);
    }
    const name = input.name.trim();
    if (name.length === 0) throw new Error('name is required');
    this.assertNumber('reserveUsd', input.reserveUsd, { min: 0.01 });
    this.assertNumber('basePremiumBps', input.basePremiumBps, { min: 1, max: 10000 });
    this.assertNumber('minComplianceScore', input.minComplianceScore, { min: -1000, max: 1000 });
    this.assertNumber('maxCoverageUsd', input.maxCoverageUsd, { min: 0.01 });
    this.assertNumber('claimPayoutThreshold', input.claimPayoutThreshold ?? 3, {
      min: 1,
      max: 21,
      integer: true,
    });

    const pool: InsurancePool = {
      id,
      name,
      premiumAsset: 'KAMIYO',
      reserveUsd: input.reserveUsd,
      basePremiumBps: input.basePremiumBps,
      minComplianceScore: input.minComplianceScore,
      maxCoverageUsd: input.maxCoverageUsd,
      claimPayoutThreshold: input.claimPayoutThreshold ?? 3,
      activePolicies: 0,
      totalPremiumsUsd: 0,
      totalClaimsPaidUsd: 0,
      createdAt: now,
    };
    this.pools.set(pool.id, pool);
    return pool;
  }

  quote(poolId: string, input: UnderwritingInput): InsuranceQuote {
    const pool = this.requirePool(poolId);
    this.assertNumber('complianceScore', input.complianceScore, { min: 0, max: 100 });
    this.assertNumber('monthlyVolumeUsd', input.monthlyVolumeUsd, { min: 0 });
    this.assertNumber('disputeRate', input.disputeRate, { min: 0, max: 1 });
    this.assertNumber('requestedCoverageUsd', input.requestedCoverageUsd, { min: 0.01 });

    if (input.complianceScore < pool.minComplianceScore) {
      throw new Error('Agent compliance score is below pool minimum');
    }

    const riskFactor = this.computeRiskFactor(input);
    const capacityFactor = Math.max(0.6, Math.min(1.6, input.requestedCoverageUsd / Math.max(pool.reserveUsd, 1)));
    const premiumBps = Math.max(
      pool.basePremiumBps,
      Math.round(pool.basePremiumBps * riskFactor * capacityFactor)
    );
    const coverageUsd = Math.min(input.requestedCoverageUsd, pool.maxCoverageUsd);
    const annualPremiumUsd = (coverageUsd * premiumBps) / 10000;
    const deductibleUsd = Math.max(100, coverageUsd * (0.01 + riskFactor * 0.02));

    const riskTier: InsuranceQuote['riskTier'] =
      riskFactor < 1.15 ? 'low' : riskFactor < 1.55 ? 'medium' : 'high';

    return {
      poolId,
      agentId: input.agentId,
      premiumBps,
      annualPremiumUsd: round2(annualPremiumUsd),
      deductibleUsd: round2(deductibleUsd),
      maxCoverageUsd: round2(coverageUsd),
      riskTier,
      confidence: Math.max(0.5, Math.min(0.98, 1 - input.disputeRate * 2)),
    };
  }

  createPolicy(poolId: string, input: UnderwritingInput, durationDays = 365): InsurancePolicy {
    this.assertNumber('durationDays', durationDays, { min: 1, max: 365, integer: true });
    const quote = this.quote(poolId, input);
    const pool = this.requirePool(poolId);
    const now = Date.now();
    const policy: InsurancePolicy = {
      id: `policy_${crypto.randomBytes(6).toString('hex')}`,
      poolId,
      agentId: input.agentId,
      coverageUsd: quote.maxCoverageUsd,
      annualPremiumUsd: quote.annualPremiumUsd,
      deductibleUsd: quote.deductibleUsd,
      premiumBps: quote.premiumBps,
      startsAt: now,
      expiresAt: now + durationDays * 24 * 60 * 60 * 1000,
      status: 'active',
    };

    this.policies.set(policy.id, policy);
    pool.activePolicies += 1;
    pool.totalPremiumsUsd += policy.annualPremiumUsd;
    pool.reserveUsd += policy.annualPremiumUsd;
    return policy;
  }

  submitClaim(policyId: string, incidentRef: string, requestedPayoutUsd: number): InsuranceClaim {
    const policy = this.requirePolicy(policyId);
    if (policy.status !== 'active') {
      throw new Error('Policy is not active');
    }
    if (incidentRef.trim().length === 0) throw new Error('incidentRef is required');
    this.assertNumber('requestedPayoutUsd', requestedPayoutUsd, { min: 0.01 });

    const claim: InsuranceClaim = {
      id: `claim_${crypto.randomBytes(6).toString('hex')}`,
      policyId,
      incidentRef,
      requestedPayoutUsd,
      approvedPayoutUsd: 0,
      status: 'submitted',
      oracleVotesFor: 0,
      oracleVotesAgainst: 0,
      threshold: this.requirePool(policy.poolId).claimPayoutThreshold,
      submittedAt: Date.now(),
    };
    this.claims.set(claim.id, claim);
    return claim;
  }

  settleClaim(claimId: string, vote: { forVotes: number; againstVotes: number }): InsuranceClaim {
    const claim = this.requireClaim(claimId);
    if (claim.status !== 'submitted') {
      return claim;
    }
    this.assertNumber('forVotes', vote.forVotes, { min: 0, max: 1000, integer: true });
    this.assertNumber('againstVotes', vote.againstVotes, { min: 0, max: 1000, integer: true });
    const policy = this.requirePolicy(claim.policyId);
    const pool = this.requirePool(policy.poolId);

    claim.oracleVotesFor = vote.forVotes;
    claim.oracleVotesAgainst = vote.againstVotes;
    const approved = vote.forVotes >= claim.threshold && vote.forVotes > vote.againstVotes;
    claim.status = approved ? 'approved' : 'rejected';
    claim.resolvedAt = Date.now();

    if (!approved) {
      return claim;
    }

    const payoutCap = Math.max(0, policy.coverageUsd - policy.deductibleUsd);
    const payout = round2(Math.min(claim.requestedPayoutUsd, payoutCap, pool.reserveUsd));
    claim.approvedPayoutUsd = payout;
    claim.status = 'paid';
    pool.reserveUsd = round2(Math.max(0, pool.reserveUsd - payout));
    pool.totalClaimsPaidUsd = round2(pool.totalClaimsPaidUsd + payout);
    return claim;
  }

  listPolicies(): InsurancePolicy[] {
    return [...this.policies.values()];
  }

  listClaims(): InsuranceClaim[] {
    return [...this.claims.values()];
  }

  private computeRiskFactor(input: UnderwritingInput): number {
    const compliancePenalty = Math.max(0, (80 - input.complianceScore) / 100);
    const disputePenalty = Math.max(0, input.disputeRate * 2.5);
    const volumeFactor = Math.min(0.35, input.monthlyVolumeUsd / 1_000_000);
    return 1 + compliancePenalty + disputePenalty + volumeFactor;
  }

  private assertNumber(name: string, value: number, options: NumberValidationOptions): void {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number`);
    }
    if (options.integer && !Number.isInteger(value)) {
      throw new Error(`${name} must be an integer`);
    }
    if (options.min != null && value < options.min) {
      throw new Error(`${name} must be >= ${options.min}`);
    }
    if (options.max != null && value > options.max) {
      throw new Error(`${name} must be <= ${options.max}`);
    }
  }

  private requirePool(poolId: string): InsurancePool {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error(`Insurance pool not found: ${poolId}`);
    return pool;
  }

  private requirePolicy(policyId: string): InsurancePolicy {
    const policy = this.policies.get(policyId);
    if (!policy) throw new Error(`Insurance policy not found: ${policyId}`);
    return policy;
  }

  private requireClaim(claimId: string): InsuranceClaim {
    const claim = this.claims.get(claimId);
    if (!claim) throw new Error(`Insurance claim not found: ${claimId}`);
    return claim;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
