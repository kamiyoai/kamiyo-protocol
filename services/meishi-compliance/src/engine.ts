import { PublicKey } from '@solana/web3.js';
import {
  MeishiClient,
  PassportManager,
  MandateManager,
  generateComplianceReport,
  toOnChainScore,
  classifyCompliance,
  type MeishiPassport,
  type ComplianceReport,
} from '@kamiyo/meishi';
import { CircuitBreaker } from './circuit-breaker.js';

export interface AuditResult {
  passportAddress: string;
  report: ComplianceReport;
  onChainScore: number;
  previousScore: number;
  scoreChanged: boolean;
  suspended: boolean;
}

export class ComplianceEngine {
  private client: MeishiClient;
  private passports: PassportManager;
  private mandates: MandateManager;
  private circuitBreaker: CircuitBreaker;

  constructor(
    client: MeishiClient,
    circuitBreaker: CircuitBreaker
  ) {
    this.client = client;
    this.passports = new PassportManager(client);
    this.mandates = new MandateManager(client);
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * Run a compliance audit on a single passport.
   */
  async auditPassport(passportAddress: PublicKey): Promise<AuditResult> {
    return this.circuitBreaker.execute(async () => {
      const passport = await this.client.fetchPassport(passportAddress);
      if (!passport) {
        throw new Error(`Passport not found: ${passportAddress.toBase58()}`);
      }

      const report = generateComplianceReport(passport, passportAddress.toBase58());
      const onChainScore = toOnChainScore(report.overallScore);
      const previousScore = passport.complianceScore;
      const scoreChanged = onChainScore !== previousScore;

      return {
        passportAddress: passportAddress.toBase58(),
        report,
        onChainScore,
        previousScore,
        scoreChanged,
        suspended: passport.suspended,
      };
    });
  }

  /**
   * Run audits on a batch of passports.
   */
  async auditBatch(addresses: PublicKey[]): Promise<AuditResult[]> {
    const results: AuditResult[] = [];

    for (const address of addresses) {
      try {
        const result = await this.auditPassport(address);
        results.push(result);
      } catch (err) {
        console.error(`[engine] Audit failed for ${address.toBase58()}:`, err);
      }
    }

    return results;
  }

  /**
   * Check if a passport needs a triggered audit based on current state.
   */
  needsTriggeredAudit(passport: MeishiPassport, scoreThreshold: number): boolean {
    if (passport.complianceScore < scoreThreshold) return true;

    // Mandate expired
    const now = Math.floor(Date.now() / 1000);
    if (passport.mandateExpires.toNumber() <= now) return true;

    // High dispute rate
    const txCount = passport.totalTransactions.toNumber();
    if (txCount > 0) {
      const disputeRate = passport.disputesFiled / txCount;
      if (disputeRate > 0.15) return true;
    }

    return false;
  }
}
