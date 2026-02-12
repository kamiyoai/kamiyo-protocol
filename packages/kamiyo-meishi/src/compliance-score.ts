import {
  ComplianceClass,
} from './types.js';
import type {
  ComplianceDimension,
  ComplianceReport,
  MeishiPassport,
} from './types.js';


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

export function toOnChainScore(internalScore: number): number {
  return Math.round((internalScore - 50) * 20);
}

export function fromOnChainScore(onChainScore: number): number {
  return Math.round(onChainScore / 20 + 50);
}

export function classifyCompliance(score: number): ComplianceClass {
  if (score >= 80) return ComplianceClass.Minimal;
  if (score >= 60) return ComplianceClass.Limited;
  if (score >= 30) return ComplianceClass.High;
  if (score >= 0) return ComplianceClass.Unclassified;
  return ComplianceClass.Unacceptable;
}

export function scoreIdentityVerification(passport: MeishiPassport): ComplianceDimension {
  let score = 0;
  const findings: string[] = [];

  if (passport.issuer.toBase58() !== '11111111111111111111111111111111') {
    score += 30;
  } else {
    findings.push('Invalid issuer address');
  }

  if (passport.principal.toBase58() !== '11111111111111111111111111111111') {
    score += 30;
  } else {
    findings.push('No principal assigned');
  }

  if (!passport.kamonHash.every((b) => b === 0)) {
    score += 20;
  }

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
    jurisdiction: [0, 1, 2, 3, 4],
    findings,
  };
}

export function scoreAuthorizationValidity(passport: MeishiPassport): ComplianceDimension {
  let score = 0;
  const findings: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  if (!passport.mandateHash.every((b) => b === 0)) {
    score += 40;
  } else {
    findings.push('No mandate configured');
  }

  if (passport.mandateExpires.toNumber() > now) {
    score += 40;
  } else {
    findings.push('Mandate expired');
  }

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

export function scoreTransactionHistory(passport: MeishiPassport): ComplianceDimension {
  let score = 50;
  const findings: string[] = [];

  const txCount = passport.totalTransactions.toNumber();
  const disputeRate = txCount > 0 ? passport.disputesFiled / txCount : 0;
  const lossRate = passport.disputesFiled > 0 ? passport.disputesLost / passport.disputesFiled : 0;

  if (txCount >= 100) score += 30;
  else if (txCount >= 50) score += 20;
  else if (txCount >= 10) score += 10;

  if (disputeRate > 0.2) {
    score -= 40;
    findings.push(`High dispute rate: ${(disputeRate * 100).toFixed(1)}%`);
  } else if (disputeRate > 0.1) {
    score -= 20;
    findings.push(`Elevated dispute rate: ${(disputeRate * 100).toFixed(1)}%`);
  }

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

export function scoreAuditTrail(passport: MeishiPassport): ComplianceDimension {
  let score = 0;
  const findings: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  if (passport.lastAudit.toNumber() > 0) {
    score += 40;
  } else {
    findings.push('Never audited');
  }

  const daysSinceAudit = (now - passport.lastAudit.toNumber()) / 86400;
  if (daysSinceAudit < 7) score += 30;
  else if (daysSinceAudit < 30) score += 20;
  else if (daysSinceAudit < 90) score += 10;
  else findings.push(`Last audit ${Math.floor(daysSinceAudit)} days ago`);

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
