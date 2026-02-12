import type { MeishiPassport, ComplianceDimension } from '@kamiyo/meishi';
import type { ComplianceRule } from './index.js';

export const authorizationRule: ComplianceRule = {
  name: 'authorization_verification',
  jurisdiction: [],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 0;
    const findings: string[] = [];
    const now = Math.floor(Date.now() / 1000);

    if (!passport.mandateHash.every((b) => b === 0)) {
      score += 40;
    } else {
      findings.push('No authorization mandate configured');
    }

    if (passport.mandateExpires.toNumber() > now) {
      score += 40;
    } else {
      findings.push('Mandate expired');
    }

    if (passport.mandateVersion > 0) {
      score += 20;
    } else {
      findings.push('No mandate version');
    }

    return {
      name: 'authorization_validity',
      weight: 20,
      score,
      requirement: 'mandatory',
      jurisdiction: [0, 1, 2, 3, 4],
      findings,
    };
  },
};

export const spendingComplianceRule: ComplianceRule = {
  name: 'spending_compliance',
  jurisdiction: [],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 50;
    const findings: string[] = [];

    const txCount = passport.totalTransactions.toNumber();
    if (txCount === 0) {
      return {
        name: 'spending_compliance',
        weight: 10,
        score: 50,
        requirement: 'mandatory',
        jurisdiction: [0, 1, 2, 3, 4],
        findings: ['No transaction history'],
      };
    }

    const disputeRate = passport.disputesFiled / txCount;
    if (disputeRate === 0) {
      score += 40;
    } else if (disputeRate < 0.05) {
      score += 25;
    } else if (disputeRate < 0.1) {
      score += 10;
    } else {
      score -= 20;
      findings.push(`High dispute rate indicates potential overspending: ${(disputeRate * 100).toFixed(1)}%`);
    }

    if (!passport.suspended) {
      score += 10;
    } else {
      score -= 30;
      findings.push('Passport suspended — possible spending violation');
    }

    return {
      name: 'spending_compliance',
      weight: 10,
      score: Math.max(0, Math.min(100, score)),
      requirement: 'mandatory',
      jurisdiction: [0, 1, 2, 3, 4],
      findings,
    };
  },
};

export const disputeRecordRule: ComplianceRule = {
  name: 'dispute_record',
  jurisdiction: [],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 80;
    const findings: string[] = [];

    const txCount = passport.totalTransactions.toNumber();
    if (txCount === 0) {
      return {
        name: 'dispute_record',
        weight: 5,
        score: 50,
        requirement: 'mandatory',
        jurisdiction: [0, 1, 2, 3, 4],
        findings: ['No transaction history'],
      };
    }

    const disputeRate = txCount > 0 ? passport.disputesFiled / txCount : 0;
    const lossRate = passport.disputesFiled > 0 ? passport.disputesLost / passport.disputesFiled : 0;

    if (disputeRate > 0.2) {
      score -= 60;
      findings.push(`Critical dispute rate: ${(disputeRate * 100).toFixed(1)}%`);
    } else if (disputeRate > 0.1) {
      score -= 30;
      findings.push(`Elevated dispute rate: ${(disputeRate * 100).toFixed(1)}%`);
    } else if (disputeRate > 0.05) {
      score -= 10;
    }

    if (lossRate > 0.5) {
      score -= 20;
      findings.push(`High loss rate: ${(lossRate * 100).toFixed(1)}%`);
    }

    return {
      name: 'dispute_record',
      weight: 5,
      score: Math.max(0, Math.min(100, score)),
      requirement: 'mandatory',
      jurisdiction: [0, 1, 2, 3, 4],
      findings,
    };
  },
};

export const CONSUMER_PROTECTION_RULES: ComplianceRule[] = [
  authorizationRule,
  spendingComplianceRule,
  disputeRecordRule,
];
