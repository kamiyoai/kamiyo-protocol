import type { MeishiPassport, ComplianceDimension } from '@kamiyo/meishi';

/**
 * A compliance rule evaluates one aspect of a passport and returns a dimension score.
 */
export interface ComplianceRule {
  name: string;
  jurisdiction: number[]; // Which jurisdictions this rule applies to (empty = all)
  evaluate(passport: MeishiPassport): ComplianceDimension;
}

/**
 * Rule registry. Rules are organized by category and can be filtered by jurisdiction.
 */
export class RuleRegistry {
  private rules: ComplianceRule[] = [];

  register(rule: ComplianceRule): void {
    this.rules.push(rule);
  }

  registerAll(rules: ComplianceRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  /**
   * Get all rules applicable to a jurisdiction.
   */
  getForJurisdiction(jurisdiction: number): ComplianceRule[] {
    return this.rules.filter(
      (r) => r.jurisdiction.length === 0 || r.jurisdiction.includes(jurisdiction)
    );
  }

  /**
   * Evaluate all applicable rules for a passport.
   */
  evaluate(passport: MeishiPassport): ComplianceDimension[] {
    const applicable = this.getForJurisdiction(passport.jurisdiction);
    return applicable.map((rule) => rule.evaluate(passport));
  }

  count(): number {
    return this.rules.length;
  }
}
