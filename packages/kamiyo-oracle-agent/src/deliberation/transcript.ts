import { randomUUID } from 'crypto';
import type {
  DebateRound,
  DebateArgument,
  InvestigatorChallenge,
  AdvocateResponse,
  ArbiterAnalysis,
  DeliberationResult,
} from './types';

export class Transcript {
  private id: string;
  private escrowPda: string;
  private rounds: DebateRound[] = [];
  private startTime: number;
  private llmCallCount = 0;

  constructor(escrowPda: string) {
    this.id = randomUUID();
    this.escrowPda = escrowPda;
    this.startTime = Date.now();
  }

  getId(): string {
    return this.id;
  }

  incrementLLMCalls(count = 1): void {
    this.llmCallCount += count;
  }

  getLLMCallCount(): number {
    return this.llmCallCount;
  }

  startRound(roundNumber: number): void {
    this.rounds.push({
      round: roundNumber,
      agentArgument: { position: '', keyPoints: [], evidenceCited: [], confidence: 0 },
      providerArgument: { position: '', keyPoints: [], evidenceCited: [], confidence: 0 },
      investigatorChallenges: [],
      agentResponse: { advocate: 'agent', response: '', strengthenedPoints: [] },
      providerResponse: { advocate: 'provider', response: '', strengthenedPoints: [] },
      timestamp: Date.now(),
    });
  }

  recordAgentArgument(argument: DebateArgument): void {
    const currentRound = this.getCurrentRound();
    if (currentRound) {
      currentRound.agentArgument = argument;
    }
  }

  recordProviderArgument(argument: DebateArgument): void {
    const currentRound = this.getCurrentRound();
    if (currentRound) {
      currentRound.providerArgument = argument;
    }
  }

  recordInvestigatorChallenges(challenges: InvestigatorChallenge[]): void {
    const currentRound = this.getCurrentRound();
    if (currentRound) {
      currentRound.investigatorChallenges = challenges;
    }
  }

  recordAgentResponse(response: AdvocateResponse): void {
    const currentRound = this.getCurrentRound();
    if (currentRound) {
      currentRound.agentResponse = response;
    }
  }

  recordProviderResponse(response: AdvocateResponse): void {
    const currentRound = this.getCurrentRound();
    if (currentRound) {
      currentRound.providerResponse = response;
    }
  }

  private getCurrentRound(): DebateRound | undefined {
    return this.rounds[this.rounds.length - 1];
  }

  getRounds(): DebateRound[] {
    return this.rounds;
  }

  getLastRound(): DebateRound | undefined {
    return this.rounds[this.rounds.length - 1];
  }

  getRoundCount(): number {
    return this.rounds.length;
  }

  getElapsedTimeMs(): number {
    return Date.now() - this.startTime;
  }

  buildResult(
    arbiterAnalysis: ArbiterAnalysis,
    finalScore: number,
    confidence: 'low' | 'medium' | 'high',
    arbiterReasoning: string,
    keyFactors: string[],
    modelUsed: string,
    dissent?: { advocate: 'agent' | 'provider'; argument: string; suggestedScore: number }
  ): DeliberationResult {
    return {
      id: this.id,
      escrowPda: this.escrowPda,
      transcript: this.rounds,
      arbiterAnalysis,
      finalScore,
      confidence,
      arbiterReasoning,
      keyFactors,
      dissent,
      metadata: {
        totalRounds: this.rounds.length,
        totalLLMCalls: this.llmCallCount,
        deliberationTimeMs: this.getElapsedTimeMs(),
        modelUsed,
      },
    };
  }

  toJSON(): string {
    return JSON.stringify({
      id: this.id,
      escrowPda: this.escrowPda,
      rounds: this.rounds,
      metadata: {
        totalRounds: this.rounds.length,
        totalLLMCalls: this.llmCallCount,
        deliberationTimeMs: this.getElapsedTimeMs(),
      },
    }, null, 2);
  }

  getSummary(): string {
    const lines: string[] = [
      `Deliberation ${this.id.slice(0, 8)}`,
      `Escrow: ${this.escrowPda.slice(0, 8)}...`,
      `Rounds: ${this.rounds.length}`,
      `LLM Calls: ${this.llmCallCount}`,
      `Duration: ${this.getElapsedTimeMs()}ms`,
      '',
    ];

    for (const round of this.rounds) {
      lines.push(`Round ${round.round}:`);
      lines.push(`  Agent: ${round.agentArgument.position.slice(0, 50)}...`);
      lines.push(`  Provider: ${round.providerArgument.position.slice(0, 50)}...`);
      lines.push(`  Challenges: ${round.investigatorChallenges.length}`);
    }

    return lines.join('\n');
  }
}
