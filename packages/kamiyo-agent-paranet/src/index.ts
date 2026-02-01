/**
 * @kamiyo/agent-paranet
 * Decentralized credit scores for AI agents on OriginTrail DKG
 */

// Types
export * from './types.js';

// Schemas
export {
  TaskCompletionSchema,
  CapabilityAttestationSchema,
  TrustRelationshipSchema,
  buildTaskCompletionAsset,
  buildCapabilityAttestationAsset,
  buildTrustRelationshipAsset,
  parseTaskCompletionResult,
  parseCapabilityAttestationResult,
  parseTrustRelationshipResult,
} from './schemas/index.js';

// Queries
export * as sparqlQueries from './queries/index.js';

// Scoring
export {
  CreditScoreCalculator,
  getQuickScore,
  compareAgents,
} from './scoring/index.js';

// Publishing
export {
  ParanetPublisher,
  createDKGClient,
  quickPublishTask,
} from './publishing/index.js';

// Discovery
export {
  ProviderDiscovery,
  findBestProvider,
} from './discovery/index.js';

// Main client that combines all functionality
import type {
  DKGClient,
  ParanetConfig,
  TaskCompletion,
  CapabilityAttestation,
  TrustRelationship,
  ProviderSearchCriteria,
  ProviderSearchResult,
  CreditScore,
  PublishResult,
  QueryResult,
} from './types.js';
import { ParanetPublisher, createDKGClient } from './publishing/index.js';
import { ProviderDiscovery } from './discovery/index.js';
import { CreditScoreCalculator } from './scoring/index.js';

export class AgentParanetClient {
  private dkg: DKGClient;
  private publisher: ParanetPublisher;
  private discovery: ProviderDiscovery;
  private scorer: CreditScoreCalculator;
  private config: ParanetConfig;

  constructor(dkg: DKGClient, config: ParanetConfig) {
    this.dkg = dkg;
    this.config = config;
    this.publisher = new ParanetPublisher(dkg, config);
    this.discovery = new ProviderDiscovery(dkg);
    this.scorer = new CreditScoreCalculator(dkg);
  }

  /**
   * Create a new client from config
   */
  static async create(config: ParanetConfig): Promise<AgentParanetClient> {
    const dkg = await createDKGClient(config);
    return new AgentParanetClient(dkg, config);
  }

  // Publishing

  async publishTaskCompletion(task: TaskCompletion): Promise<PublishResult> {
    return this.publisher.publishTaskCompletion(task);
  }

  async publishCapabilityAttestation(attestation: CapabilityAttestation): Promise<PublishResult> {
    return this.publisher.publishCapabilityAttestation(attestation);
  }

  async publishTrustRelationship(trust: TrustRelationship): Promise<PublishResult> {
    return this.publisher.publishTrustRelationship(trust);
  }

  async publishTaskWithQuality(task: TaskCompletion, autoAttest = true) {
    return this.publisher.publishTaskWithQuality(task, autoAttest);
  }

  // Discovery

  async findProviders(criteria: ProviderSearchCriteria): Promise<QueryResult<ProviderSearchResult[]>> {
    return this.discovery.findProviders(criteria);
  }

  async getProviderScore(globalId: string): Promise<QueryResult<CreditScore>> {
    return this.discovery.getProviderScore(globalId);
  }

  async meetsRequirements(globalId: string, requirements: {
    minScore?: number;
    minTier?: number;
    minTasks?: number;
    taskType?: string;
  }) {
    return this.discovery.meetsRequirements(globalId, requirements as Parameters<typeof this.discovery.meetsRequirements>[1]);
  }

  async getAgentCapabilities(globalId: string): Promise<string[]> {
    return this.discovery.getAgentCapabilities(globalId);
  }

  async checkTrust(trustorGlobalId: string, trusteeGlobalId: string) {
    return this.discovery.checkTrust(trustorGlobalId, trusteeGlobalId);
  }

  // Scoring

  async calculateCreditScore(globalId: string): Promise<QueryResult<CreditScore>> {
    return this.scorer.calculateScore(globalId);
  }

  clearScoreCache(globalId?: string): void {
    this.scorer.clearCache(globalId);
  }

  // Raw DKG access for advanced use cases
  get rawDKG(): DKGClient {
    return this.dkg;
  }
}

// Default export
export default AgentParanetClient;
