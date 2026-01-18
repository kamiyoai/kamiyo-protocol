import type { EvaluationContext } from '../types';

export interface DebateArgument {
  position: string;
  keyPoints: string[];
  evidenceCited: string[];
  confidence: number;
}

export interface InvestigatorChallenge {
  target: 'agent' | 'provider' | 'both';
  challenge: string;
  evidenceRequested?: string;
  weaknessIdentified: string;
}

export interface AdvocateResponse {
  advocate: 'agent' | 'provider';
  response: string;
  concession?: string;
  strengthenedPoints: string[];
}

export interface DebateRound {
  round: number;
  agentArgument: DebateArgument;
  providerArgument: DebateArgument;
  investigatorChallenges: InvestigatorChallenge[];
  agentResponse: AdvocateResponse;
  providerResponse: AdvocateResponse;
  timestamp: number;
}

export interface ArbiterAnalysis {
  agentStrengths: string[];
  agentWeaknesses: string[];
  providerStrengths: string[];
  providerWeaknesses: string[];
  investigatorInsights: string[];
  evidenceWeight: {
    supportingAgent: number;
    supportingProvider: number;
    inconclusive: number;
  };
}

export interface DeliberationResult {
  id: string;
  escrowPda: string;
  transcript: DebateRound[];
  arbiterAnalysis: ArbiterAnalysis;
  finalScore: number;
  confidence: 'low' | 'medium' | 'high';
  arbiterReasoning: string;
  keyFactors: string[];
  dissent?: {
    advocate: 'agent' | 'provider';
    argument: string;
    suggestedScore: number;
  };
  metadata: {
    totalRounds: number;
    totalLLMCalls: number;
    deliberationTimeMs: number;
    modelUsed: string;
  };
}

export interface DeliberationConfig {
  maxRounds: number;
  advocateModel: string;
  investigatorModel: string;
  arbiterModel: string;
  advocateTemperature: number;
  investigatorTemperature: number;
  arbiterTemperature: number;
  maxTokensPerCall: number;
  timeoutMs: number;
}

export const DEFAULT_DELIBERATION_CONFIG: DeliberationConfig = {
  maxRounds: 5,
  advocateModel: 'claude-3-5-sonnet-20241022',
  investigatorModel: 'claude-3-5-sonnet-20241022',
  arbiterModel: 'claude-3-5-sonnet-20241022',
  advocateTemperature: 0.7,
  investigatorTemperature: 0.5,
  arbiterTemperature: 0.3,
  maxTokensPerCall: 1000,
  timeoutMs: 120000,
};

export interface GatheredEvidence {
  onChain: {
    agentTransactions: TransactionRecord[];
    providerTransactions: TransactionRecord[];
    previousDisputes: DisputeRecord[];
    escrowHistory: EscrowRecord[];
  };
  offChain: {
    apiHealthCheck?: APIHealthResult;
    webSearch?: WebSearchResult[];
    domainInfo?: DomainInfo;
  };
  patterns: {
    similarDisputes: SimilarDispute[];
    fraudIndicators: FraudIndicator[];
    legitimacySignals: LegitimacySignal[];
  };
}

export interface TransactionRecord {
  signature: string;
  timestamp: number;
  type: string;
  amount?: number;
  counterparty?: string;
  success: boolean;
}

export interface DisputeRecord {
  escrowPda: string;
  outcome: 'agent_won' | 'provider_won' | 'split' | 'pending';
  score?: number;
  timestamp: number;
  amount: number;
}

export interface EscrowRecord {
  pda: string;
  status: string;
  amount: number;
  createdAt: number;
  resolvedAt?: number;
}

export interface APIHealthResult {
  endpoint: string;
  reachable: boolean;
  responseTimeMs?: number;
  statusCode?: number;
  error?: string;
}

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  relevance: number;
}

export interface DomainInfo {
  domain: string;
  registeredAt?: string;
  expiresAt?: string;
  registrar?: string;
  hasSSL: boolean;
}

export interface SimilarDispute {
  escrowPda: string;
  similarity: number;
  outcome: string;
  score: number;
  keyFactors: string[];
}

export interface FraudIndicator {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  confidence: number;
}

export interface LegitimacySignal {
  type: string;
  strength: 'weak' | 'moderate' | 'strong';
  description: string;
}
