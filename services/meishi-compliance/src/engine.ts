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
  agentIdentity: string;
  report: ComplianceReport;
  onChainScore: number;
  previousScore: number;
  scoreChanged: boolean;
  suspended: boolean;
}

export interface AuditBatchResult {
  results: AuditResult[];
  failures: number;
}

export class ComplianceEngine {
  private client: MeishiClient;
  private passports: PassportManager;
  private mandates: MandateManager;
  private circuitBreaker: CircuitBreaker;

  constructor(client: MeishiClient, circuitBreaker: CircuitBreaker) {
    this.client = client;
    this.passports = new PassportManager(client);
    this.mandates = new MandateManager(client);
    this.circuitBreaker = circuitBreaker;
  }

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
        agentIdentity: passport.agentIdentity.toBase58(),
        report,
        onChainScore,
        previousScore,
        scoreChanged,
        suspended: passport.suspended,
      };
    });
  }

  async auditBatch(addresses: PublicKey[], concurrency = 4): Promise<AuditBatchResult> {
    const results: AuditResult[] = [];
    let failures = 0;
    const queue = [...addresses];
    const workerCount = Math.max(1, Math.min(concurrency, addresses.length));

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const address = queue.shift();
        if (!address) break;
        try {
          const result = await this.auditPassport(address);
          results.push(result);
        } catch (err) {
          failures++;
          console.error(`[engine] Audit failed for ${address.toBase58()}:`, err);
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return { results, failures };
  }

  needsTriggeredAudit(passport: MeishiPassport, scoreThreshold: number): boolean {
    if (passport.complianceScore < scoreThreshold) return true;

    const now = BigInt(Math.floor(Date.now() / 1000));
    const mandateExpires = BigInt(passport.mandateExpires.toString(10));
    if (mandateExpires <= now) return true;

    const txCount = BigInt(passport.totalTransactions.toString(10));
    if (txCount > 0n) {
      const disputes = BigInt(passport.disputesFiled);
      if (disputes * 100n > txCount * 15n) return true;
    }

    return false;
  }
}
