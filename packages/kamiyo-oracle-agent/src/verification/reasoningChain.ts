import { sha256 } from '@noble/hashes/sha256';
import type { DeliberationResult, GatheredEvidence, DebateRound } from '../deliberation/types';
import type { EvaluationContext } from '../types';
import { createLogger } from '../lib/logger';

const log = createLogger('reasoning-chain');

export interface ReasoningStep {
  stepNumber: number;
  type: 'context' | 'evidence' | 'debate' | 'challenge' | 'response' | 'judgment';
  actor?: 'agent_advocate' | 'provider_advocate' | 'investigator' | 'arbiter';
  content: string;
  timestamp: number;
  hash: string;
}

export interface ReasoningChain {
  id: string;
  escrowPda: string;
  version: string;
  steps: ReasoningStep[];
  finalScore: number;
  confidence: string;
  arbiterReasoning: string;
  rootHash: string;
  createdAt: number;
}

export interface ReasoningCommitment {
  chainId: string;
  escrowPda: string;
  rootHash: string;
  finalScore: number;
  timestamp: number;
  signature?: string;
}

export class ReasoningChainBuilder {
  private readonly VERSION = '1.0.0';

  /**
   * Build a complete reasoning chain from deliberation
   */
  build(
    deliberation: DeliberationResult,
    context: EvaluationContext,
    evidence: GatheredEvidence | null
  ): ReasoningChain {
    const steps: ReasoningStep[] = [];
    let stepNumber = 1;

    // Step 1: Context
    steps.push(this.createStep(
      stepNumber++,
      'context',
      undefined,
      this.formatContext(context)
    ));

    // Step 2: Evidence summary
    if (evidence) {
      steps.push(this.createStep(
        stepNumber++,
        'evidence',
        undefined,
        this.formatEvidence(evidence)
      ));
    }

    // Steps 3+: Debate rounds
    for (const round of deliberation.transcript) {
      // Agent argument
      steps.push(this.createStep(
        stepNumber++,
        'debate',
        'agent_advocate',
        `Round ${round.round} - Agent Advocate:\n${round.agentArgument.position}\nKey points: ${round.agentArgument.keyPoints.join(', ')}\nConfidence: ${round.agentArgument.confidence}%`
      ));

      // Provider argument
      steps.push(this.createStep(
        stepNumber++,
        'debate',
        'provider_advocate',
        `Round ${round.round} - Provider Advocate:\n${round.providerArgument.position}\nKey points: ${round.providerArgument.keyPoints.join(', ')}\nConfidence: ${round.providerArgument.confidence}%`
      ));

      // Investigator challenges
      for (const challenge of round.investigatorChallenges) {
        steps.push(this.createStep(
          stepNumber++,
          'challenge',
          'investigator',
          `Challenge to ${challenge.target}:\n${challenge.challenge}\nWeakness: ${challenge.weaknessIdentified}`
        ));
      }

      // Responses
      steps.push(this.createStep(
        stepNumber++,
        'response',
        'agent_advocate',
        `Agent Response:\n${round.agentResponse.response}${round.agentResponse.concession ? `\nConcession: ${round.agentResponse.concession}` : ''}`
      ));

      steps.push(this.createStep(
        stepNumber++,
        'response',
        'provider_advocate',
        `Provider Response:\n${round.providerResponse.response}${round.providerResponse.concession ? `\nConcession: ${round.providerResponse.concession}` : ''}`
      ));
    }

    // Final judgment
    steps.push(this.createStep(
      stepNumber++,
      'judgment',
      'arbiter',
      this.formatJudgment(deliberation)
    ));

    // Calculate root hash (Merkle root of all step hashes)
    const rootHash = this.calculateRootHash(steps);

    const chain: ReasoningChain = {
      id: deliberation.id,
      escrowPda: deliberation.escrowPda,
      version: this.VERSION,
      steps,
      finalScore: deliberation.finalScore,
      confidence: deliberation.confidence,
      arbiterReasoning: deliberation.arbiterReasoning,
      rootHash,
      createdAt: Date.now(),
    };

    log.info('Reasoning chain built', {
      id: chain.id.slice(0, 8),
      steps: steps.length,
      rootHash: rootHash.slice(0, 16),
    });

    return chain;
  }

  /**
   * Create a commitment from a reasoning chain
   */
  createCommitment(chain: ReasoningChain): ReasoningCommitment {
    return {
      chainId: chain.id,
      escrowPda: chain.escrowPda,
      rootHash: chain.rootHash,
      finalScore: chain.finalScore,
      timestamp: chain.createdAt,
    };
  }

  /**
   * Verify that a reasoning chain matches its commitment
   */
  verify(chain: ReasoningChain, commitment: ReasoningCommitment): boolean {
    // Recalculate root hash
    const calculatedHash = this.calculateRootHash(chain.steps);

    // Verify chain properties
    const valid =
      chain.id === commitment.chainId &&
      chain.escrowPda === commitment.escrowPda &&
      chain.rootHash === commitment.rootHash &&
      chain.finalScore === commitment.finalScore &&
      calculatedHash === commitment.rootHash;

    log.debug('Chain verification', {
      valid,
      chainId: chain.id.slice(0, 8),
    });

    return valid;
  }

  private createStep(
    stepNumber: number,
    type: ReasoningStep['type'],
    actor: ReasoningStep['actor'],
    content: string
  ): ReasoningStep {
    const timestamp = Date.now();
    const hashInput = `${stepNumber}:${type}:${actor || 'system'}:${content}:${timestamp}`;
    const hash = Buffer.from(sha256(hashInput)).toString('hex');

    return {
      stepNumber,
      type,
      actor,
      content,
      timestamp,
      hash,
    };
  }

  private formatContext(context: EvaluationContext): string {
    return `Dispute Context:
- Escrow: ${context.escrow.pda}
- Amount: ${context.escrow.amount} SOL
- Service: ${context.service.type}
- Transaction: ${context.escrow.transactionId}
- Status: ${context.escrow.status}

Agent (Disputer):
- Pubkey: ${context.agent.pubkey}
- Reputation: ${context.agent.reputation}/1000
- Dispute Rate: ${context.agent.disputeRate}%
- Total Escrows: ${context.agent.totalEscrows}

Provider:
- Pubkey: ${context.provider.pubkey}
- Reputation: ${context.provider.reputation}/1000
- Dispute Rate: ${context.provider.disputeRate}%
- Avg Quality: ${context.provider.averageQualityScore}/100

Agent's Claim: ${context.evidence.agentClaim}
${context.evidence.providerClaim ? `Provider's Claim: ${context.evidence.providerClaim}` : ''}`;
  }

  private formatEvidence(evidence: GatheredEvidence): string {
    const lines: string[] = ['Evidence Gathered:'];

    // On-chain
    lines.push('\nOn-Chain Analysis:');
    lines.push(`- Agent transactions: ${evidence.onChain.agentTransactions.length}`);
    lines.push(`- Provider transactions: ${evidence.onChain.providerTransactions.length}`);
    lines.push(`- Previous disputes: ${evidence.onChain.previousDisputes.length}`);

    // Patterns
    if (evidence.patterns.fraudIndicators.length > 0) {
      lines.push('\nFraud Indicators:');
      for (const indicator of evidence.patterns.fraudIndicators) {
        lines.push(`- [${indicator.severity}] ${indicator.description}`);
      }
    }

    if (evidence.patterns.legitimacySignals.length > 0) {
      lines.push('\nLegitimacy Signals:');
      for (const signal of evidence.patterns.legitimacySignals) {
        lines.push(`- [${signal.strength}] ${signal.description}`);
      }
    }

    // Off-chain
    if (evidence.offChain.apiHealthCheck) {
      lines.push('\nAPI Health:');
      lines.push(`- Reachable: ${evidence.offChain.apiHealthCheck.reachable}`);
      if (evidence.offChain.apiHealthCheck.responseTimeMs) {
        lines.push(`- Response time: ${evidence.offChain.apiHealthCheck.responseTimeMs}ms`);
      }
    }

    return lines.join('\n');
  }

  private formatJudgment(deliberation: DeliberationResult): string {
    const analysis = deliberation.arbiterAnalysis;

    return `Final Judgment:

Score: ${deliberation.finalScore}/100
Confidence: ${deliberation.confidence}

Agent Strengths: ${analysis.agentStrengths.join('; ') || 'None identified'}
Agent Weaknesses: ${analysis.agentWeaknesses.join('; ') || 'None identified'}

Provider Strengths: ${analysis.providerStrengths.join('; ') || 'None identified'}
Provider Weaknesses: ${analysis.providerWeaknesses.join('; ') || 'None identified'}

Evidence Weight:
- Supporting Agent: ${analysis.evidenceWeight.supportingAgent}%
- Supporting Provider: ${analysis.evidenceWeight.supportingProvider}%
- Inconclusive: ${analysis.evidenceWeight.inconclusive}%

Key Factors: ${deliberation.keyFactors.join('; ')}

Reasoning: ${deliberation.arbiterReasoning}

${deliberation.dissent ? `Dissent: ${deliberation.dissent.advocate} advocate argued for score of ${deliberation.dissent.suggestedScore}: ${deliberation.dissent.argument}` : ''}`;
  }

  private calculateRootHash(steps: ReasoningStep[]): string {
    // Simple Merkle-like hash: hash all step hashes together
    const combined = steps.map((s) => s.hash).join(':');
    return Buffer.from(sha256(combined)).toString('hex');
  }

  /**
   * Serialize chain for storage/transmission
   */
  serialize(chain: ReasoningChain): string {
    return JSON.stringify(chain, null, 2);
  }

  /**
   * Deserialize chain from storage
   */
  deserialize(json: string): ReasoningChain {
    return JSON.parse(json) as ReasoningChain;
  }
}
