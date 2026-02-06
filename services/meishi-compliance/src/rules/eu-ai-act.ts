import type { MeishiPassport, ComplianceDimension } from '@kamiyo/meishi';
import type { ComplianceRule } from './index.js';

/**
 * EU AI Act (Regulation 2024/1689) compliance rules.
 * Full enforcement: August 2026.
 */

/** Article 9: Risk management — agent must be classified and audited. */
export const riskManagementRule: ComplianceRule = {
  name: 'eu_ai_act_risk_management',
  jurisdiction: [1], // EU only
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 0;
    const findings: string[] = [];

    // Must have a compliance classification (not unclassified)
    if (passport.complianceClass !== 0) {
      score += 40;
    } else {
      findings.push('Agent not classified under EU AI Act');
    }

    // Must have been audited
    if (passport.lastAudit.toNumber() > 0) {
      score += 30;
    } else {
      findings.push('No risk assessment audit recorded');
    }

    // Compliance score must be positive
    if (passport.complianceScore > 0) {
      score += 30;
    } else {
      findings.push('Compliance score below neutral');
    }

    return {
      name: 'regulatory_classification',
      weight: 10,
      score,
      requirement: 'mandatory',
      jurisdiction: [1],
      findings,
    };
  },
};

/** Article 12: Record-keeping — audit trail must exist. */
export const recordKeepingRule: ComplianceRule = {
  name: 'eu_ai_act_record_keeping',
  jurisdiction: [1],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 0;
    const findings: string[] = [];
    const now = Math.floor(Date.now() / 1000);

    // Has been audited at all
    if (passport.auditNonce > 0) {
      score += 40;
    } else {
      findings.push('No audit records exist');
    }

    // Audited recently (within 30 days)
    const daysSince = (now - passport.lastAudit.toNumber()) / 86400;
    if (daysSince < 30) {
      score += 30;
    } else if (daysSince < 90) {
      score += 15;
    } else {
      findings.push(`Last audit ${Math.floor(daysSince)} days ago`);
    }

    // Multiple audits (depth of record)
    if (passport.auditNonce >= 5) {
      score += 30;
    } else if (passport.auditNonce >= 2) {
      score += 15;
    } else {
      findings.push('Insufficient audit depth');
    }

    return {
      name: 'audit_trail_completeness',
      weight: 15,
      score,
      requirement: 'mandatory',
      jurisdiction: [1],
      findings,
    };
  },
};

/** Article 14: Human oversight — mandate must require human approval for high-value actions. */
export const humanOversightRule: ComplianceRule = {
  name: 'eu_ai_act_human_oversight',
  jurisdiction: [1],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 0;
    const findings: string[] = [];

    // Has a principal (human delegator)
    if (passport.principal.toBase58() !== '11111111111111111111111111111111') {
      score += 50;
    } else {
      findings.push('No human principal assigned');
    }

    // Mandate exists with explicit limits
    if (!passport.mandateHash.every((b) => b === 0)) {
      score += 30;
    } else {
      findings.push('No authorization mandate configured');
    }

    // Mandate version > 0 (actively managed)
    if (passport.mandateVersion > 0) {
      score += 20;
    } else {
      findings.push('Mandate not actively managed');
    }

    return {
      name: 'oversight_checkpoints',
      weight: 5,
      score,
      requirement: 'mandatory',
      jurisdiction: [1],
      findings,
    };
  },
};

export const EU_AI_ACT_RULES: ComplianceRule[] = [
  riskManagementRule,
  recordKeepingRule,
  humanOversightRule,
];
