import { describe, it, expect, beforeEach } from 'vitest';
import { Transcript } from '../deliberation/transcript';
import type { DebateArgument, InvestigatorChallenge, AdvocateResponse } from '../deliberation/types';

describe('Transcript', () => {
  let transcript: Transcript;
  const testEscrowPda = 'testEscrow123456789012345678901234567890123';

  beforeEach(() => {
    transcript = new Transcript(testEscrowPda);
  });

  describe('initialization', () => {
    it('creates transcript with unique ID', () => {
      expect(transcript.getId()).toBeDefined();
      expect(transcript.getId().length).toBeGreaterThan(0);
    });

    it('starts with zero rounds', () => {
      expect(transcript.getRoundCount()).toBe(0);
      expect(transcript.getRounds()).toHaveLength(0);
    });

    it('starts with zero LLM calls', () => {
      expect(transcript.getLLMCallCount()).toBe(0);
    });
  });

  describe('round management', () => {
    it('starts a new round', () => {
      transcript.startRound(1);
      expect(transcript.getRoundCount()).toBe(1);
      expect(transcript.getLastRound()?.round).toBe(1);
    });

    it('tracks multiple rounds', () => {
      transcript.startRound(1);
      completeRound(transcript);
      transcript.startRound(2);
      completeRound(transcript);
      transcript.startRound(3);

      expect(transcript.getRoundCount()).toBe(3);
      expect(transcript.getRounds()).toHaveLength(3);
    });

    it('returns last round', () => {
      transcript.startRound(1);
      completeRound(transcript);
      transcript.startRound(2);

      const lastRound = transcript.getLastRound();
      expect(lastRound?.round).toBe(2);
    });
  });

  describe('argument recording', () => {
    beforeEach(() => {
      transcript.startRound(1);
    });

    it('records agent argument', () => {
      const argument = createMockArgument('agent');
      transcript.recordAgentArgument(argument);

      const round = transcript.getLastRound();
      expect(round?.agentArgument).toBe(argument);
    });

    it('records provider argument', () => {
      const argument = createMockArgument('provider');
      transcript.recordProviderArgument(argument);

      const round = transcript.getLastRound();
      expect(round?.providerArgument).toBe(argument);
    });

    it('records investigator challenges', () => {
      const challenges: InvestigatorChallenge[] = [
        {
          target: 'agent',
          challenge: 'Provide evidence for claim',
          weaknessIdentified: 'No supporting documentation',
        },
        {
          target: 'provider',
          challenge: 'Explain delivery timeline',
          weaknessIdentified: 'Inconsistent timestamps',
        },
      ];

      transcript.recordInvestigatorChallenges(challenges);

      const round = transcript.getLastRound();
      expect(round?.investigatorChallenges).toHaveLength(2);
    });

    it('records advocate responses', () => {
      const agentResponse = createMockResponse('agent');
      const providerResponse = createMockResponse('provider');

      transcript.recordAgentResponse(agentResponse);
      transcript.recordProviderResponse(providerResponse);

      const round = transcript.getLastRound();
      expect(round?.agentResponse.advocate).toBe('agent');
      expect(round?.providerResponse.advocate).toBe('provider');
    });
  });

  describe('LLM call tracking', () => {
    it('increments LLM call count', () => {
      transcript.incrementLLMCalls();
      expect(transcript.getLLMCallCount()).toBe(1);

      transcript.incrementLLMCalls();
      transcript.incrementLLMCalls();
      expect(transcript.getLLMCallCount()).toBe(3);
    });

    it('increments by custom amount', () => {
      transcript.incrementLLMCalls(5);
      expect(transcript.getLLMCallCount()).toBe(5);
    });
  });

  describe('serialization', () => {
    it('serializes transcript to JSON string', () => {
      transcript.startRound(1);
      completeRound(transcript);
      transcript.incrementLLMCalls(3);

      const jsonStr = transcript.toJSON();
      const json = JSON.parse(jsonStr);

      expect(json.escrowPda).toBe(testEscrowPda);
      expect(json.rounds).toHaveLength(1);
      expect(json.metadata.totalLLMCalls).toBe(3);
    });
  });

  describe('summary', () => {
    it('generates readable summary', () => {
      transcript.startRound(1);
      completeRound(transcript);

      const summary = transcript.getSummary();

      expect(summary).toContain('Deliberation');
      expect(summary).toContain('Rounds: 1');
    });
  });
});

function createMockArgument(side: 'agent' | 'provider'): DebateArgument {
  return {
    position: `${side} argues for their position`,
    keyPoints: ['Point 1', 'Point 2', 'Point 3'],
    evidenceCited: ['Evidence A', 'Evidence B'],
    confidence: 75,
  };
}

function createMockResponse(advocate: 'agent' | 'provider'): AdvocateResponse {
  return {
    advocate,
    response: `${advocate} responds to challenges`,
    strengthenedPoints: ['Strengthened point 1'],
  };
}

function completeRound(transcript: Transcript): void {
  transcript.recordAgentArgument(createMockArgument('agent'));
  transcript.recordProviderArgument(createMockArgument('provider'));
  transcript.recordInvestigatorChallenges([
    {
      target: 'both',
      challenge: 'Test challenge',
      weaknessIdentified: 'Test weakness',
    },
  ]);
  transcript.recordAgentResponse(createMockResponse('agent'));
  transcript.recordProviderResponse(createMockResponse('provider'));
}
