import { sha256 } from '@noble/hashes/sha256';
import type { ReasoningChain, ReasoningCommitment, ReasoningStep } from './reasoningChain';
import { ReasoningChainBuilder } from './reasoningChain';
import { IPFSPublisher } from './ipfsPublisher';
import { createLogger } from '../lib/logger';

const log = createLogger('verifier');

export interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    chainIntegrity: boolean;
    commitmentMatch: boolean;
    stepHashesValid: boolean;
    rootHashValid: boolean;
    contentComplete: boolean;
  };
}

export interface AuditReport {
  chainId: string;
  escrowPda: string;
  verification: VerificationResult;
  summary: {
    totalSteps: number;
    debateRounds: number;
    challenges: number;
    finalScore: number;
    confidence: string;
  };
  timeline: Array<{
    step: number;
    type: string;
    actor?: string;
    timestamp: number;
  }>;
  reasoningQuality: {
    evidenceCited: boolean;
    challengesAddressed: boolean;
    clearReasoning: boolean;
    score: number;
  };
}

export class Verifier {
  private chainBuilder: ReasoningChainBuilder;
  private ipfsPublisher: IPFSPublisher;

  constructor(ipfsPublisher?: IPFSPublisher) {
    this.chainBuilder = new ReasoningChainBuilder();
    this.ipfsPublisher = ipfsPublisher || new IPFSPublisher();
  }

  /**
   * Verify a reasoning chain against its commitment
   */
  verify(chain: ReasoningChain, commitment: ReasoningCommitment): VerificationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check chain ID
    const chainIdMatch = chain.id === commitment.chainId;
    if (!chainIdMatch) {
      errors.push(`Chain ID mismatch: expected ${commitment.chainId}, got ${chain.id}`);
    }

    // Check escrow
    const escrowMatch = chain.escrowPda === commitment.escrowPda;
    if (!escrowMatch) {
      errors.push(`Escrow mismatch: expected ${commitment.escrowPda}, got ${chain.escrowPda}`);
    }

    // Check score
    const scoreMatch = chain.finalScore === commitment.finalScore;
    if (!scoreMatch) {
      errors.push(`Score mismatch: expected ${commitment.finalScore}, got ${chain.finalScore}`);
    }

    // Verify step hashes
    const stepHashesValid = this.verifyStepHashes(chain.steps);
    if (!stepHashesValid) {
      errors.push('One or more step hashes are invalid');
    }

    // Verify root hash
    const calculatedRootHash = this.calculateRootHash(chain.steps);
    const rootHashValid = calculatedRootHash === chain.rootHash;
    if (!rootHashValid) {
      errors.push(`Root hash mismatch: expected ${chain.rootHash}, calculated ${calculatedRootHash}`);
    }

    // Check commitment root hash
    const commitmentMatch = chain.rootHash === commitment.rootHash;
    if (!commitmentMatch) {
      errors.push('Chain root hash does not match commitment');
    }

    // Content completeness checks
    const contentComplete = this.checkContentCompleteness(chain, warnings);

    const valid = errors.length === 0;

    log.info('Verification complete', {
      chainId: chain.id.slice(0, 8),
      valid,
      errors: errors.length,
      warnings: warnings.length,
    });

    return {
      valid,
      errors,
      warnings,
      details: {
        chainIntegrity: chainIdMatch && escrowMatch && scoreMatch,
        commitmentMatch,
        stepHashesValid,
        rootHashValid,
        contentComplete,
      },
    };
  }

  /**
   * Verify a chain fetched from IPFS
   */
  async verifyFromIPFS(
    cid: string,
    commitment: ReasoningCommitment
  ): Promise<VerificationResult> {
    const chain = await this.ipfsPublisher.fetch(cid);

    if (!chain) {
      return {
        valid: false,
        errors: ['Failed to fetch chain from IPFS'],
        warnings: [],
        details: {
          chainIntegrity: false,
          commitmentMatch: false,
          stepHashesValid: false,
          rootHashValid: false,
          contentComplete: false,
        },
      };
    }

    return this.verify(chain, commitment);
  }

  /**
   * Generate a comprehensive audit report
   */
  generateAuditReport(chain: ReasoningChain, commitment: ReasoningCommitment): AuditReport {
    const verification = this.verify(chain, commitment);

    // Count debate elements
    const debateSteps = chain.steps.filter((s) => s.type === 'debate');
    const challengeSteps = chain.steps.filter((s) => s.type === 'challenge');
    const debateRounds = debateSteps.length / 2; // Agent + Provider per round

    // Build timeline
    const timeline = chain.steps.map((step) => ({
      step: step.stepNumber,
      type: step.type,
      actor: step.actor,
      timestamp: step.timestamp,
    }));

    // Assess reasoning quality
    const reasoningQuality = this.assessReasoningQuality(chain);

    return {
      chainId: chain.id,
      escrowPda: chain.escrowPda,
      verification,
      summary: {
        totalSteps: chain.steps.length,
        debateRounds,
        challenges: challengeSteps.length,
        finalScore: chain.finalScore,
        confidence: chain.confidence,
      },
      timeline,
      reasoningQuality,
    };
  }

  private verifyStepHashes(steps: ReasoningStep[]): boolean {
    for (const step of steps) {
      const hashInput = `${step.stepNumber}:${step.type}:${step.actor || 'system'}:${step.content}:${step.timestamp}`;
      const calculated = Buffer.from(sha256(hashInput)).toString('hex');

      if (calculated !== step.hash) {
        log.warn('Step hash mismatch', {
          step: step.stepNumber,
          expected: step.hash.slice(0, 16),
          calculated: calculated.slice(0, 16),
        });
        return false;
      }
    }

    return true;
  }

  private calculateRootHash(steps: ReasoningStep[]): string {
    const combined = steps.map((s) => s.hash).join(':');
    return Buffer.from(sha256(combined)).toString('hex');
  }

  private checkContentCompleteness(chain: ReasoningChain, warnings: string[]): boolean {
    let complete = true;

    // Check for context step
    const hasContext = chain.steps.some((s) => s.type === 'context');
    if (!hasContext) {
      warnings.push('Missing context step');
      complete = false;
    }

    // Check for judgment step
    const hasJudgment = chain.steps.some((s) => s.type === 'judgment');
    if (!hasJudgment) {
      warnings.push('Missing judgment step');
      complete = false;
    }

    // Check for at least one debate round
    const hasDebate = chain.steps.some((s) => s.type === 'debate');
    if (!hasDebate) {
      warnings.push('No debate steps found');
      complete = false;
    }

    // Check arbiter reasoning
    if (!chain.arbiterReasoning || chain.arbiterReasoning.length < 50) {
      warnings.push('Arbiter reasoning is too brief');
    }

    return complete;
  }

  private assessReasoningQuality(chain: ReasoningChain): {
    evidenceCited: boolean;
    challengesAddressed: boolean;
    clearReasoning: boolean;
    score: number;
  } {
    let score = 0;

    // Check evidence citation
    const evidenceStep = chain.steps.find((s) => s.type === 'evidence');
    const evidenceCited = !!evidenceStep && evidenceStep.content.length > 100;
    if (evidenceCited) score += 25;

    // Check challenges addressed
    const challenges = chain.steps.filter((s) => s.type === 'challenge');
    const responses = chain.steps.filter((s) => s.type === 'response');
    const challengesAddressed = responses.length >= challenges.length;
    if (challengesAddressed) score += 25;

    // Check reasoning clarity
    const judgmentStep = chain.steps.find((s) => s.type === 'judgment');
    const clearReasoning = !!judgmentStep &&
      judgmentStep.content.includes('Score:') &&
      judgmentStep.content.includes('Reasoning:');
    if (clearReasoning) score += 25;

    // Check debate depth
    const debateRounds = chain.steps.filter((s) => s.type === 'debate').length / 2;
    if (debateRounds >= 3) score += 25;
    else if (debateRounds >= 2) score += 15;
    else if (debateRounds >= 1) score += 5;

    return {
      evidenceCited,
      challengesAddressed,
      clearReasoning,
      score,
    };
  }
}
