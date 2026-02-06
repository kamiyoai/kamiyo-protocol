import type { MeishiPassport, ComplianceDimension } from '@kamiyo/meishi';
import type { ComplianceRule } from './index.js';

/**
 * Commerce-specific compliance rules.
 * Evaluates agent identity provenance and transaction volume patterns.
 */

/** Identity verification — who built and deployed this agent. */
export const identityVerificationRule: ComplianceRule = {
  name: 'identity_verification',
  jurisdiction: [],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 0;
    const findings: string[] = [];

    // Valid issuer
    if (passport.issuer.toBase58() !== '11111111111111111111111111111111') {
      score += 30;
    } else {
      findings.push('Invalid issuer address');
    }

    // Has principal
    if (passport.principal.toBase58() !== '11111111111111111111111111111111') {
      score += 30;
    } else {
      findings.push('No principal assigned');
    }

    // Has Kamon (identity crest)
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
      weight: 20,
      score,
      requirement: 'mandatory',
      jurisdiction: [0, 1, 2, 3, 4],
      findings,
    };
  },
};

/** Transaction history — volume and consistency patterns. */
export const transactionHistoryRule: ComplianceRule = {
  name: 'transaction_history',
  jurisdiction: [],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 50;
    const findings: string[] = [];

    const txCount = passport.totalTransactions.toNumber();
    const disputeRate = txCount > 0 ? passport.disputesFiled / txCount : 0;
    const lossRate = passport.disputesFiled > 0 ? passport.disputesLost / passport.disputesFiled : 0;

    // Volume bonus
    if (txCount >= 100) score += 30;
    else if (txCount >= 50) score += 20;
    else if (txCount >= 10) score += 10;

    // Dispute penalty
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
      weight: 15,
      score: Math.max(0, Math.min(100, score)),
      requirement: 'mandatory',
      jurisdiction: [0, 1, 2, 3, 4],
      findings,
    };
  },
};

export const COMMERCE_RULES: ComplianceRule[] = [
  identityVerificationRule,
  transactionHistoryRule,
];
