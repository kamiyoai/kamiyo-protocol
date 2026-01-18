import type { IAgentRuntime, EvaluationContext } from '../types';
import type {
  DeliberationResult,
  DeliberationConfig,
  GatheredEvidence,
  DEFAULT_DELIBERATION_CONFIG,
} from './types';
import { AgentAdvocate } from './agentAdvocate';
import { ProviderAdvocate } from './providerAdvocate';
import { Investigator } from './investigator';
import { Arbiter } from './arbiter';
import { Transcript } from './transcript';
import { createLogger } from '../lib/logger';
import { EvaluationError } from '../lib/errors';

const log = createLogger('deliberation-chamber');

export class DeliberationChamber {
  private config: DeliberationConfig;
  private agentAdvocate: AgentAdvocate;
  private providerAdvocate: ProviderAdvocate;
  private investigator: Investigator;
  private arbiter: Arbiter;

  constructor(apiKey: string, config: Partial<DeliberationConfig> = {}) {
    this.config = {
      maxRounds: 5,
      advocateModel: 'claude-3-5-sonnet-20241022',
      investigatorModel: 'claude-3-5-sonnet-20241022',
      arbiterModel: 'claude-3-5-sonnet-20241022',
      advocateTemperature: 0.7,
      investigatorTemperature: 0.5,
      arbiterTemperature: 0.3,
      maxTokensPerCall: 1000,
      timeoutMs: 120000,
      ...config,
    };

    this.agentAdvocate = new AgentAdvocate(
      apiKey,
      this.config.advocateModel,
      this.config.advocateTemperature
    );

    this.providerAdvocate = new ProviderAdvocate(
      apiKey,
      this.config.advocateModel,
      this.config.advocateTemperature
    );

    this.investigator = new Investigator(
      apiKey,
      this.config.investigatorModel,
      this.config.investigatorTemperature
    );

    this.arbiter = new Arbiter(
      apiKey,
      this.config.arbiterModel,
      this.config.arbiterTemperature
    );
  }

  async deliberate(
    context: EvaluationContext,
    evidence: GatheredEvidence | null = null
  ): Promise<DeliberationResult> {
    const transcript = new Transcript(context.escrow.pda);
    const startTime = Date.now();

    log.info('Starting deliberation', {
      escrow: context.escrow.pda.slice(0, 8),
      maxRounds: this.config.maxRounds,
    });

    try {
      // Run debate rounds
      for (let round = 1; round <= this.config.maxRounds; round++) {
        // Check timeout
        if (Date.now() - startTime > this.config.timeoutMs) {
          log.warn('Deliberation timeout, proceeding to judgment', {
            roundsCompleted: round - 1,
          });
          break;
        }

        await this.executeRound(transcript, context, evidence, round);
      }

      // Render final judgment
      const result = await this.arbiter.renderJudgment(transcript, context, evidence);

      log.info('Deliberation complete', {
        escrow: context.escrow.pda.slice(0, 8),
        score: result.finalScore,
        confidence: result.confidence,
        rounds: result.metadata.totalRounds,
        llmCalls: result.metadata.totalLLMCalls,
        timeMs: result.metadata.deliberationTimeMs,
      });

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Deliberation failed', new Error(msg), {
        escrow: context.escrow.pda.slice(0, 8),
        roundsCompleted: transcript.getRoundCount(),
      });

      throw new EvaluationError(`Deliberation failed: ${msg}`, {
        escrowPda: context.escrow.pda,
        roundsCompleted: transcript.getRoundCount(),
      });
    }
  }

  private async executeRound(
    transcript: Transcript,
    context: EvaluationContext,
    evidence: GatheredEvidence | null,
    roundNumber: number
  ): Promise<void> {
    log.debug('Starting round', { round: roundNumber });

    transcript.startRound(roundNumber);

    // Phase 1: Advocates construct/refine arguments
    const previousRounds = transcript.getRounds().slice(0, -1);

    let agentArgument;
    let providerArgument;

    if (roundNumber === 1) {
      // Initial arguments
      [agentArgument, providerArgument] = await Promise.all([
        this.agentAdvocate.constructInitialArgument(context, evidence),
        this.providerAdvocate.constructInitialArgument(context, evidence),
      ]);
      transcript.incrementLLMCalls(2);
    } else {
      // Use previous round's strengthened arguments
      const lastRound = transcript.getLastRound();
      if (lastRound) {
        agentArgument = {
          position: lastRound.agentResponse.response,
          keyPoints: lastRound.agentResponse.strengthenedPoints,
          evidenceCited: lastRound.agentArgument.evidenceCited,
          confidence: lastRound.agentArgument.confidence,
        };
        providerArgument = {
          position: lastRound.providerResponse.response,
          keyPoints: lastRound.providerResponse.strengthenedPoints,
          evidenceCited: lastRound.providerArgument.evidenceCited,
          confidence: lastRound.providerArgument.confidence,
        };
      } else {
        // Fallback: construct new arguments
        [agentArgument, providerArgument] = await Promise.all([
          this.agentAdvocate.constructInitialArgument(context, evidence),
          this.providerAdvocate.constructInitialArgument(context, evidence),
        ]);
        transcript.incrementLLMCalls(2);
      }
    }

    transcript.recordAgentArgument(agentArgument);
    transcript.recordProviderArgument(providerArgument);

    // Phase 2: Investigator challenges both arguments
    const challenges = await this.investigator.generateChallenges(
      agentArgument,
      providerArgument,
      context,
      evidence,
      previousRounds
    );
    transcript.incrementLLMCalls();
    transcript.recordInvestigatorChallenges(challenges);

    log.debug('Challenges generated', {
      round: roundNumber,
      challengeCount: challenges.length,
    });

    // Phase 3: Advocates respond to challenges
    const [agentResponse, providerResponse] = await Promise.all([
      this.agentAdvocate.respondToChallenge(agentArgument, challenges, context),
      this.providerAdvocate.respondToChallenge(providerArgument, challenges, context),
    ]);
    transcript.incrementLLMCalls(2);

    transcript.recordAgentResponse(agentResponse);
    transcript.recordProviderResponse(providerResponse);

    log.debug('Round complete', {
      round: roundNumber,
      agentConcession: !!agentResponse.concession,
      providerConcession: !!providerResponse.concession,
    });
  }

  getConfig(): DeliberationConfig {
    return { ...this.config };
  }
}

export function createDeliberationChamber(
  runtime: IAgentRuntime
): DeliberationChamber {
  const apiKey = runtime.getSetting('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new EvaluationError('ANTHROPIC_API_KEY not configured');
  }

  const maxRoundsStr = runtime.getSetting('DELIBERATION_MAX_ROUNDS');
  const modelOverride = runtime.getSetting('DELIBERATION_MODEL');

  const config: Partial<DeliberationConfig> = {};

  if (maxRoundsStr) {
    config.maxRounds = parseInt(maxRoundsStr);
  }

  if (modelOverride) {
    config.advocateModel = modelOverride;
    config.investigatorModel = modelOverride;
    config.arbiterModel = modelOverride;
  }

  return new DeliberationChamber(apiKey, config);
}

export async function quickDeliberate(
  runtime: IAgentRuntime,
  context: EvaluationContext,
  evidence: GatheredEvidence | null = null
): Promise<DeliberationResult> {
  const apiKey = runtime.getSetting('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new EvaluationError('ANTHROPIC_API_KEY not configured');
  }

  const chamber = new DeliberationChamber(apiKey, {
    maxRounds: 2,
    timeoutMs: 60000,
  });

  return chamber.deliberate(context, evidence);
}

export async function fullDeliberate(
  runtime: IAgentRuntime,
  context: EvaluationContext,
  evidence: GatheredEvidence | null = null
): Promise<DeliberationResult> {
  const apiKey = runtime.getSetting('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new EvaluationError('ANTHROPIC_API_KEY not configured');
  }

  const chamber = new DeliberationChamber(apiKey, {
    maxRounds: 5,
    timeoutMs: 180000,
  });

  return chamber.deliberate(context, evidence);
}
