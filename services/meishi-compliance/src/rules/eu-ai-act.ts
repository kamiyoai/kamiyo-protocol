import type { MeishiPassport, ComplianceDimension } from '@kamiyo/meishi';
import type { ComplianceRule } from './index.js';

export const riskManagementRule: ComplianceRule = {
  name: 'eu_ai_act_risk_management',
  jurisdiction: [1],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 0;
    const findings: string[] = [];

    if (passport.complianceClass !== 0) {
      score += 40;
    } else {
      findings.push('Agent not classified under EU AI Act');
    }

    if (passport.lastAudit.toNumber() > 0) {
      score += 30;
    } else {
      findings.push('No risk assessment audit recorded');
    }

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

export const recordKeepingRule: ComplianceRule = {
  name: 'eu_ai_act_record_keeping',
  jurisdiction: [1],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 0;
    const findings: string[] = [];
    const now = Math.floor(Date.now() / 1000);

    if (passport.auditNonce > 0) {
      score += 40;
    } else {
      findings.push('No audit records exist');
    }

    const daysSince = (now - passport.lastAudit.toNumber()) / 86400;
    if (daysSince < 30) {
      score += 30;
    } else if (daysSince < 90) {
      score += 15;
    } else {
      findings.push(`Last audit ${Math.floor(daysSince)} days ago`);
    }

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

export const humanOversightRule: ComplianceRule = {
  name: 'eu_ai_act_human_oversight',
  jurisdiction: [1],
  evaluate(passport: MeishiPassport): ComplianceDimension {
    let score = 0;
    const findings: string[] = [];

    if (passport.principal.toBase58() !== '11111111111111111111111111111111') {
      score += 50;
    } else {
      findings.push('No human principal assigned');
    }

    if (!passport.mandateHash.every((b) => b === 0)) {
      score += 30;
    } else {
      findings.push('No authorization mandate configured');
    }

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
