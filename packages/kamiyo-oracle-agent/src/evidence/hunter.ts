import type { IAgentRuntime, EvaluationContext } from '../types';
import type { GatheredEvidence } from '../deliberation/types';
import { OnChainAnalyzer, type OnChainEvidence } from './onChainAnalyzer';
import { OffChainProber, type OffChainEvidence } from './offChainProber';
import { PatternMatcher, type PatternAnalysis } from './patternMatcher';
import { getNetworkConfig, PROGRAM_IDS } from '../config';
import { createLogger } from '../lib/logger';

const log = createLogger('evidence-hunter');

export interface EvidenceHuntResult {
  evidence: GatheredEvidence;
  quality: 'poor' | 'moderate' | 'good' | 'excellent';
  gatheringTimeMs: number;
  sourcesChecked: string[];
  errors: string[];
}

export interface EvidenceHunterConfig {
  maxTimeMs: number;
  enableOffChain: boolean;
  enablePatternMatching: boolean;
  cacheResults: boolean;
}

const DEFAULT_CONFIG: EvidenceHunterConfig = {
  maxTimeMs: 45000,
  enableOffChain: true,
  enablePatternMatching: true,
  cacheResults: true,
};

export class EvidenceHunter {
  private onChainAnalyzer: OnChainAnalyzer;
  private offChainProber: OffChainProber;
  private patternMatcher: PatternMatcher;
  private config: EvidenceHunterConfig;
  private cache: Map<string, { evidence: GatheredEvidence; timestamp: number }> = new Map();

  constructor(
    runtime: IAgentRuntime,
    config: Partial<EvidenceHunterConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const { rpcUrl, network } = getNetworkConfig(runtime);
    const programId = PROGRAM_IDS[network as keyof typeof PROGRAM_IDS];
    const heliusKey = runtime.getSetting('HELIUS_API_KEY');
    const tavilyKey = runtime.getSetting('TAVILY_API_KEY');

    this.onChainAnalyzer = new OnChainAnalyzer(rpcUrl, programId, heliusKey);
    this.offChainProber = new OffChainProber(tavilyKey);
    this.patternMatcher = new PatternMatcher();
  }

  async hunt(context: EvaluationContext): Promise<EvidenceHuntResult> {
    const startTime = Date.now();
    const escrowPda = context.escrow.pda;
    const errors: string[] = [];
    const sourcesChecked: string[] = [];

    log.info('Starting evidence hunt', {
      escrow: escrowPda.slice(0, 8),
      agent: context.agent.pubkey.slice(0, 8),
      provider: context.provider.pubkey.slice(0, 8),
    });

    // Check cache first
    if (this.config.cacheResults) {
      const cached = this.cache.get(escrowPda);
      if (cached && Date.now() - cached.timestamp < 300000) {
        log.debug('Using cached evidence', { escrow: escrowPda.slice(0, 8) });
        return {
          evidence: cached.evidence,
          quality: this.assessQuality(cached.evidence),
          gatheringTimeMs: 0,
          sourcesChecked: ['cache'],
          errors: [],
        };
      }
    }

    // Gather evidence from all sources in parallel
    const onChainPromise = this.gatherOnChain(context)
      .then((result) => {
        sourcesChecked.push('on-chain');
        return result;
      })
      .catch((err) => {
        errors.push(`on-chain: ${err.message}`);
        return null;
      });

    const offChainPromise = this.config.enableOffChain
      ? this.gatherOffChain(context)
          .then((result) => {
            sourcesChecked.push('off-chain');
            return result;
          })
          .catch((err) => {
            errors.push(`off-chain: ${err.message}`);
            return null;
          })
      : Promise.resolve(null);

    // Wait for results with timeout
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), this.config.maxTimeMs)
    );

    const [onChainEvidence, offChainEvidence] = await Promise.race([
      Promise.all([onChainPromise, offChainPromise]),
      timeoutPromise.then(() => [null, null] as [null, null]),
    ]);

    // Run pattern matching
    let patternAnalysis: PatternAnalysis | null = null;
    if (this.config.enablePatternMatching && onChainEvidence) {
      try {
        this.patternMatcher.setHistoricalDisputes(onChainEvidence.previousDisputes);
        patternAnalysis = this.patternMatcher.analyze(context);
        sourcesChecked.push('pattern-matcher');
      } catch (err) {
        errors.push(`pattern-matcher: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Assemble evidence
    const evidence = this.assembleEvidence(
      onChainEvidence,
      offChainEvidence,
      patternAnalysis
    );

    // Cache result
    if (this.config.cacheResults) {
      this.cache.set(escrowPda, { evidence, timestamp: Date.now() });
    }

    const gatheringTimeMs = Date.now() - startTime;
    const quality = this.assessQuality(evidence);

    log.info('Evidence hunt complete', {
      escrow: escrowPda.slice(0, 8),
      quality,
      sources: sourcesChecked,
      errors: errors.length,
      timeMs: gatheringTimeMs,
    });

    return {
      evidence,
      quality,
      gatheringTimeMs,
      sourcesChecked,
      errors,
    };
  }

  private async gatherOnChain(context: EvaluationContext): Promise<OnChainEvidence | null> {
    return this.onChainAnalyzer.analyze(
      context.agent.pubkey,
      context.provider.pubkey,
      context.escrow.pda,
      this.config.maxTimeMs / 2
    );
  }

  private async gatherOffChain(context: EvaluationContext): Promise<OffChainEvidence | null> {
    return this.offChainProber.probe(
      context.service.type,
      context.escrow.transactionId,
      context.provider.pubkey,
      this.config.maxTimeMs / 3
    );
  }

  private assembleEvidence(
    onChain: OnChainEvidence | null,
    offChain: OffChainEvidence | null,
    patterns: PatternAnalysis | null
  ): GatheredEvidence {
    return {
      onChain: {
        agentTransactions: onChain?.agentTransactions || [],
        providerTransactions: onChain?.providerTransactions || [],
        previousDisputes: onChain?.previousDisputes || [],
        escrowHistory: onChain?.escrowHistory || [],
      },
      offChain: {
        apiHealthCheck: offChain?.apiHealthCheck,
        webSearch: offChain?.webSearch,
        domainInfo: offChain?.domainInfo,
      },
      patterns: {
        similarDisputes: patterns?.similarDisputes || [],
        fraudIndicators: patterns?.fraudIndicators || [],
        legitimacySignals: patterns?.legitimacySignals || [],
      },
    };
  }

  private assessQuality(evidence: GatheredEvidence): 'poor' | 'moderate' | 'good' | 'excellent' {
    let score = 0;

    // On-chain evidence
    if (evidence.onChain.agentTransactions.length > 0) score += 2;
    if (evidence.onChain.providerTransactions.length > 0) score += 2;
    if (evidence.onChain.previousDisputes.length > 0) score += 3;
    if (evidence.onChain.escrowHistory.length > 0) score += 2;

    // Off-chain evidence
    if (evidence.offChain.apiHealthCheck?.reachable) score += 2;
    if ((evidence.offChain.webSearch?.length ?? 0) > 0) score += 1;
    if (evidence.offChain.domainInfo?.hasSSL) score += 1;

    // Pattern analysis
    if (evidence.patterns.similarDisputes.length > 0) score += 2;
    if (evidence.patterns.fraudIndicators.length > 0) score += 1;
    if (evidence.patterns.legitimacySignals.length > 0) score += 1;

    if (score >= 12) return 'excellent';
    if (score >= 8) return 'good';
    if (score >= 4) return 'moderate';
    return 'poor';
  }

  clearCache(): void {
    this.cache.clear();
    log.debug('Evidence cache cleared');
  }
}

/**
 * Quick evidence gathering for time-sensitive situations
 */
export async function quickHunt(
  runtime: IAgentRuntime,
  context: EvaluationContext
): Promise<GatheredEvidence> {
  const hunter = new EvidenceHunter(runtime, {
    maxTimeMs: 15000,
    enableOffChain: false,
  });

  const result = await hunter.hunt(context);
  return result.evidence;
}

/**
 * Full evidence gathering with all sources
 */
export async function fullHunt(
  runtime: IAgentRuntime,
  context: EvaluationContext
): Promise<EvidenceHuntResult> {
  const hunter = new EvidenceHunter(runtime, {
    maxTimeMs: 60000,
    enableOffChain: true,
    enablePatternMatching: true,
  });

  return hunter.hunt(context);
}
