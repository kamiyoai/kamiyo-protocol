import type { MeishiPassport, ComplianceDimension } from '@kamiyo/meishi';

export interface ComplianceRule {
  name: string;
  jurisdiction: number[];
  evaluate(passport: MeishiPassport): ComplianceDimension;
}

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

  getForJurisdiction(jurisdiction: number): ComplianceRule[] {
    return this.rules.filter(
      (r) => r.jurisdiction.length === 0 || r.jurisdiction.includes(jurisdiction)
    );
  }

  evaluate(passport: MeishiPassport): ComplianceDimension[] {
    const applicable = this.getForJurisdiction(passport.jurisdiction);
    return applicable.map((rule) => rule.evaluate(passport));
  }

  count(): number {
    return this.rules.length;
  }
}
