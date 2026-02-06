import type {
  ComplianceDimension,
  ComplianceReport,
  ComplianceClass,
  Jurisdiction,
  MeishiPassport,
} from './types.js';

/**
 * Compliance scoring engine.
 * Evaluates agent passports across 8 weighted dimensions.
 * Maps internal 0-100 score to on-chain -1000 to 1000 range.
 */

export interface DimensionWeights {
  identityVerification: number;
  authorizationValidity: number;
  transactionHistory: number;
  auditTrailCompleteness: number;
  regulatoryClassification: number;
  spendingCompliance: number;
  disputeRecord: number;
  oversightCheckpoints: number;
}

export const DEFAULT_WEIGHTS: DimensionWeights = {
  identityVerification: 20,
  authorizationValidity: 20,
  transactionHistory: 15,
  auditTrailCompleteness: 15,
  regulatoryClassification: 10,
  spendingCompliance: 10,
  disputeRecord: 5,
  oversightCheckpoints: 5,
};

export function calculateComplianceScore(
  dimensions: ComplianceDimension[],
  weights?: DimensionWeights
): number {
  const w = weights ?? DEFAULT_WEIGHTS;
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const dim of dimensions) {
    totalWeightedScore += dim.score * dim.weight;
    totalWeight += dim.weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(totalWeightedScore / totalWeight);
}

/**
 * Convert internal 0-100 score to on-chain -1000 to 1000 range.
 */
export function toOnChainScore(internalScore: number): number {
  // 0 internal → -1000 on-chain
  // 50 internal → 0 on-chain
  // 100 internal → 1000 on-chain
  return Math.round((internalScore - 50) * 20);
}

/**
 * Convert on-chain -1000 to 1000 score to internal 0-100 range.
 */
export function fromOnChainScore(onChainScore: number): number {
  return Math.round(onChainScore / 20 + 50);
}

/**
 * Determine EU AI Act compliance class from score.
 */
export function classifyCompliance(score: number): ComplianceClass {
  if (score >= 80) return 1; // Minimal risk
  if (score >= 60) return 2; // Limited risk
  if (score >= 30) return 3; // High risk
  if (score >= 0) return 0;  // Unclassified
  return 4;                   // Unacceptable
}

/**
 * Score the identity verification dimension.
 */
export function scoreIdentityVerification(passport: MeishiPassport): ComplianceDimension {
  let score = 0;
  const findings: string[] = [];

  // Has a valid issuer
  if (passport.issuer.toBase58() !== '11111111111111111111111111111111') {
    score += 30;
  } else {
    findings.push('Invalid issuer address');
  }

  // Has a principal (delegating human)
  if (passport.principal.toBase58() !== '11111111111111111111111111111111') {
    score += 30;
  } else {
    findings.push('No principal assigned');
  }

  // Has a Kamon (identity crest)
  if (!passport.kamonHash.every((b) => b === 0)) {
    score += 20;
  }

  // Agent identity linked
  if (passport.agentIdentity.toBase58() !== '11111111111111111111111111111111') {
    score += 20;
  } else {
    findings.push('No agent identity linked');
  }

  return {
    name: 'identity_verification',
    weight: DEFAULT_WEIGHTS.identityVerification,
    score,
    requirement: 'mandatory',
    jurisdiction: [0, 1, 2, 3, 4], // All jurisdictions
    findings,
  };
}

/**
 * Score the authorization validity dimension.
 */
export function scoreAuthorizationValidity(passport: MeishiPassport): ComplianceDimension {
  let score = 0;
  const findings: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Has a mandate hash (not all zeros)
  if (!passport.mandateHash.every((b) => b === 0)) {
    score += 40;
  } else {
    findings.push('No mandate configured');
  }

  // Mandate not expired
  if (passport.mandateExpires.toNumber() > now) {
    score += 40;
  } else {
    findings.push('Mandate expired');
  }

  // Mandate version > 0 (has been explicitly set)
  if (passport.mandateVersion > 0) {
    score += 20;
  } else {
    findings.push('No mandate version set');
  }

  return {
    name: 'authorization_validity',
    weight: DEFAULT_WEIGHTS.authorizationValidity,
    score,
    requirement: 'mandatory',
    jurisdiction: [0, 1, 2, 3, 4],
    findings,
  };
}

/**
 * Score the transaction history dimension.
 */
export function scoreTransactionHistory(passport: MeishiPassport): ComplianceDimension {
  let score = 50; // Start at neutral
  const findings: string[] = [];

  const txCount = passport.totalTransactions.toNumber();
  const disputeRate = txCount > 0 ? passport.disputesFiled / txCount : 0;
  const lossRate = passport.disputesFiled > 0 ? passport.disputesLost / passport.disputesFiled : 0;

  // Transaction volume bonus (up to +30)
  if (txCount >= 100) score += 30;
  else if (txCount >= 50) score += 20;
  else if (txCount >= 10) score += 10;

  // Dispute rate penalty
  if (disputeRate > 0.2) {
    score -= 40;
    findings.push(`High dispute rate: ${(disputeRate * 100).toFixed(1)}%`);
  } else if (disputeRate > 0.1) {
    score -= 20;
    findings.push(`Elevated dispute rate: ${(disputeRate * 100).toFixed(1)}%`);
  }

  // Loss rate penalty
  if (lossRate > 0.5) {
    score -= 20;
    findings.push(`High dispute loss rate: ${(lossRate * 100).toFixed(1)}%`);
  }

  return {
    name: 'transaction_history',
    weight: DEFAULT_WEIGHTS.transactionHistory,
    score: Math.max(0, Math.min(100, score)),
    requirement: 'mandatory',
    jurisdiction: [0, 1, 2, 3, 4],
    findings,
  };
}

/**
 * Score the audit trail completeness dimension.
 */
export function scoreAuditTrail(passport: MeishiPassport): ComplianceDimension {
  let score = 0;
  const findings: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Has been audited
  if (passport.lastAudit.toNumber() > 0) {
    score += 40;
  } else {
    findings.push('Never audited');
  }

  // Audit recency (within 30 days)
  const daysSinceAudit = (now - passport.lastAudit.toNumber()) / 86400;
  if (daysSinceAudit < 7) score += 30;
  else if (daysSinceAudit < 30) score += 20;
  else if (daysSinceAudit < 90) score += 10;
  else findings.push(`Last audit ${Math.floor(daysSinceAudit)} days ago`);

  // Audit depth (nonce indicates number of audits)
  if (passport.auditNonce >= 10) score += 30;
  else if (passport.auditNonce >= 5) score += 20;
  else if (passport.auditNonce >= 1) score += 10;

  return {
    name: 'audit_trail_completeness',
    weight: DEFAULT_WEIGHTS.auditTrailCompleteness,
    score: Math.min(100, score),
    requirement: 'mandatory',
    jurisdiction: [0, 1, 2, 3, 4],
    findings,
  };
}

/**
 * Generate a full compliance report for a passport.
 */
export function generateComplianceReport(
  passport: MeishiPassport,
  passportAddress: string
): ComplianceReport {
  const dimensions = [
    scoreIdentityVerification(passport),
    scoreAuthorizationValidity(passport),
    scoreTransactionHistory(passport),
    scoreAuditTrail(passport),
  ];

  const overallScore = calculateComplianceScore(dimensions);
  const classification = classifyCompliance(overallScore);

  const recommendations: string[] = [];
  for (const dim of dimensions) {
    if (dim.score < 50) {
      recommendations.push(`Improve ${dim.name}: ${dim.findings.join(', ')}`);
    }
  }

  return {
    passportAddress,
    dimensions,
    overallScore,
    classification,
    jurisdiction: passport.jurisdiction,
    recommendations,
    timestamp: Math.floor(Date.now() / 1000),
  };
}
