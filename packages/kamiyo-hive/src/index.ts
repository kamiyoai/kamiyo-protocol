import { Connection, Keypair } from '@solana/web3.js';
import { AgentRegistry } from './registry.js';
import { AgentDiscovery } from './discovery.js';
import { A2AEscrow } from './escrow.js';
import { QualityOracle } from './oracle.js';
import { X402HiveAdapter, type PriceResult } from './x402-adapter.js';
import type {
  HiveConfig,
  AgentInfo,
  Capability,
  DiscoveryQuery,
  DiscoveryResult,
  HireOptions,
  HiredAgent,
  DeliveryResult,
  RegisterOptions,
  RegistrationResult,
  QualityAssessment,
} from './types.js';

export class KamiyoHive {
  private registry: AgentRegistry;
  private discovery: AgentDiscovery;
  private escrow: A2AEscrow;
  private oracle: QualityOracle;
  private x402Adapter?: X402HiveAdapter;

  private keypair: Keypair;
  private connection: Connection;
  private enableReputationPricing: boolean;

  constructor(config: HiveConfig) {
    this.keypair = config.keypair;
    this.connection = config.connection;
    this.enableReputationPricing = config.enableReputationPricing ?? false;

    this.registry = new AgentRegistry({
      connection: config.connection,
      keypair: config.keypair,
      programId: config.programId,
      apiEndpoint: config.apiEndpoint,
    });

    this.discovery = new AgentDiscovery({
      apiEndpoint: config.apiEndpoint,
    });

    this.escrow = new A2AEscrow({
      connection: config.connection,
      keypair: config.keypair,
      programId: config.programId,
      defaultQualityThreshold: config.defaultQualityThreshold,
      defaultTimeLockSeconds: config.defaultTimeLockSeconds,
    });

    this.oracle = new QualityOracle({
      endpoint: config.oracleEndpoint,
      defaultThreshold: config.defaultQualityThreshold,
    });

    if (config.x402Client) {
      this.x402Adapter = new X402HiveAdapter(config.x402Client);
    }
  }

  get address(): string {
    return this.keypair.publicKey.toBase58();
  }

  async register(options: RegisterOptions): Promise<RegistrationResult> {
    return this.registry.register(options);
  }

  async updateRegistration(updates: Partial<RegisterOptions>): Promise<RegistrationResult> {
    const agent = await this.registry.getMyAgent();
    if (!agent) {
      return { success: false, error: 'Not registered' };
    }
    return this.registry.update(agent.id, updates);
  }

  async deactivate(): Promise<RegistrationResult> {
    const agent = await this.registry.getMyAgent();
    if (!agent) {
      return { success: false, error: 'Not registered' };
    }
    return this.registry.deactivate(agent.id);
  }

  async discover(query: DiscoveryQuery = {}): Promise<DiscoveryResult> {
    return this.discovery.discover(query);
  }

  async findBestAgent(
    capability: Capability,
    options: { minReputation?: number; maxPrice?: number } = {}
  ): Promise<AgentInfo | null> {
    return this.discovery.findBestMatch(capability, options);
  }

  async hire(options: HireOptions): Promise<{
    escrowAddress: string;
    agentId: string;
    hire: HiredAgent;
    x402TransactionId?: string;
    priceInfo?: PriceResult;
  } | null> {
    let targetAgent: AgentInfo | null = null;

    if (options.preferredAgents?.length) {
      for (const agentId of options.preferredAgents) {
        const agent = await this.registry.get(agentId);
        if (agent && agent.status === 'active') {
          targetAgent = agent;
          break;
        }
      }
    }

    if (!targetAgent) {
      targetAgent = await this.discovery.findBestMatch(options.capability, {
        minReputation: 500,
        maxPrice: options.budget,
        priceCurrency: options.budgetCurrency,
      });
    }

    if (!targetAgent) {
      return null;
    }

    if (options.excludeAgents?.includes(targetAgent.id)) {
      return null;
    }

    let x402TransactionId: string | undefined;
    let priceInfo: PriceResult | undefined;
    let effectiveBudget = options.budget;

    if (options.paymentProtocol === 'x402' && this.x402Adapter) {
      const basePrice = targetAgent.pricing.perTask ?? options.budget;
      priceInfo = this.x402Adapter.calculateAgentPrice(basePrice, targetAgent.reputation);
      effectiveBudget = priceInfo.price;

      const hireId = `hire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const paymentResult = await this.x402Adapter.payForHire(targetAgent, effectiveBudget, hireId);

      if (!paymentResult.success) {
        return null;
      }

      x402TransactionId = paymentResult.transactionId;
    }

    const result = await this.escrow.createEscrow(targetAgent, {
      ...options,
      budget: effectiveBudget,
    });

    if (!result.success || !result.escrowAddress) {
      return null;
    }

    const hire = this.escrow.getHiredAgent(result.escrowAddress);
    if (!hire) {
      return null;
    }

    if (x402TransactionId) {
      (hire as any).x402TransactionId = x402TransactionId;
    }

    return {
      escrowAddress: result.escrowAddress,
      agentId: targetAgent.id,
      hire,
      x402TransactionId,
      priceInfo,
    };
  }

  async checkDelivery(escrowAddress: string): Promise<{
    status: string;
    deliverable?: unknown;
    qualityScore?: number;
  }> {
    const hire = this.escrow.getHiredAgent(escrowAddress);
    if (!hire) {
      return { status: 'not_found' };
    }

    const updated = await hire.checkStatus();
    return {
      status: updated.status,
    };
  }

  async awaitDelivery(escrowAddress: string, timeoutMs?: number): Promise<DeliveryResult> {
    const hire = this.escrow.getHiredAgent(escrowAddress);
    if (!hire) {
      return { success: false, paid: false, error: 'Hire not found' };
    }

    const result = await hire.awaitDelivery();

    if (this.x402Adapter && hire.x402TransactionId) {
      const hireId = hire.x402TransactionId;
      const quality = result.qualityScore ?? 0;
      const outcome = result.success && result.paid ? 'released' : 'disputed';
      await this.x402Adapter.recordOutcome(hireId, outcome, quality);
    }

    return result;
  }

  async assessQuality(
    spec: string | Record<string, unknown>,
    deliverable: unknown,
    options: { threshold?: number } = {}
  ): Promise<QualityAssessment> {
    return this.oracle.assess(spec, deliverable, options);
  }

  async getAgentReputation(agentId: string): Promise<AgentInfo | null> {
    return this.registry.get(agentId);
  }

  getActiveHires(): HiredAgent[] {
    return this.escrow.getAllActiveHires();
  }

  negotiatePrice(capability: Capability, reputation: number): PriceResult | null {
    if (!this.x402Adapter && !this.enableReputationPricing) {
      return null;
    }

    const basePrices: Record<string, number> = {
      'code-review': 0.05,
      'code-generation': 0.10,
      'image-generation': 0.08,
      'data-analysis': 0.06,
      'text-generation': 0.03,
      'translation': 0.04,
      'summarization': 0.02,
      'research': 0.07,
      'audio-transcription': 0.05,
      'video-analysis': 0.12,
    };

    const basePrice = basePrices[capability] ?? 0.05;

    if (this.x402Adapter) {
      return this.x402Adapter.calculateAgentPrice(basePrice, reputation);
    }

    const { calculateReputationPrice, DEFAULT_TIERS } = require('./x402-adapter.js');
    return calculateReputationPrice(basePrice, reputation, DEFAULT_TIERS);
  }

  setX402Adapter(adapter: X402HiveAdapter): void {
    this.x402Adapter = adapter;
  }
}

export function createHive(config: HiveConfig): KamiyoHive {
  return new KamiyoHive(config);
}

export function createHiveFromEnv(): KamiyoHive {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('AGENT_PRIVATE_KEY environment variable required');
  }

  const bs58 = require('bs58');
  const secretKey = bs58.decode(privateKey);
  const keypair = Keypair.fromSecretKey(secretKey);

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  return new KamiyoHive({
    keypair,
    connection,
    programId: process.env.KAMIYO_PROGRAM_ID,
    apiEndpoint: process.env.KAMIYO_API_ENDPOINT,
  });
}

export { AgentRegistry } from './registry.js';
export { AgentDiscovery } from './discovery.js';
export { A2AEscrow } from './escrow.js';
export { QualityOracle } from './oracle.js';

export * from './types.js';

export { hiveTools, createToolHandlers } from './integrations/claude.js';
export type { ClaudeTool, HiveToolHandlers } from './integrations/claude.js';

export {
  X402HiveAdapter,
  createX402Adapter,
  DEFAULT_TIERS,
  getTierForThreshold,
  calculateReputationPrice,
} from './x402-adapter.js';
export type { PriceResult, X402AdapterConfig, ReputationTier } from './x402-adapter.js';

export { MessageStore, ChannelServer, ChannelClient } from './channels/index.js';
export type {
  ChannelMessage,
  ChannelMember,
  ChannelAccessToken,
  ChannelServerConfig,
  ChannelClientConfig,
  ServerMessage,
  ClientPayload,
} from './channels/index.js';

// SwarmTeams SDK
export * from './swarmteams/index.js';
