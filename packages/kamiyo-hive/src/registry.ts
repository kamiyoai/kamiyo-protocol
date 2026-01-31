import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type {
  AgentInfo,
  AgentStatus,
  RegisterOptions,
  RegistrationResult,
  Capability,
} from './types.js';

const DEFAULT_PROGRAM_ID = '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
const AGENT_SEED_PREFIX = 'hive_agent';
const MAX_CAPABILITIES = 20;
const MAX_ENDPOINT_LENGTH = 256;
const MAX_PRICE = 1_000_000;

export class AgentRegistry {
  private connection: Connection;
  private keypair: Keypair;
  private programId: PublicKey;
  private apiEndpoint: string;
  private registeredAgents: Map<string, AgentInfo> = new Map();

  constructor(config: {
    connection: Connection;
    keypair: Keypair;
    programId?: string;
    apiEndpoint?: string;
  }) {
    this.connection = config.connection;
    this.keypair = config.keypair;
    this.programId = new PublicKey(config.programId || DEFAULT_PROGRAM_ID);
    this.apiEndpoint = config.apiEndpoint || 'https://api.kamiyo.ai';
  }

  async register(options: RegisterOptions): Promise<RegistrationResult> {
    if (!options.capabilities?.length) {
      return { success: false, error: 'At least one capability required' };
    }
    if (options.capabilities.length > MAX_CAPABILITIES) {
      return { success: false, error: `Max ${MAX_CAPABILITIES} capabilities allowed` };
    }
    if (!options.endpoint) {
      return { success: false, error: 'Endpoint required' };
    }
    if (options.endpoint.length > MAX_ENDPOINT_LENGTH) {
      return { success: false, error: `Endpoint exceeds ${MAX_ENDPOINT_LENGTH} chars` };
    }
    if (!this.isValidUrl(options.endpoint)) {
      return { success: false, error: 'Invalid endpoint URL' };
    }
    if (!options.pricing?.perTask && !options.pricing?.perToken) {
      return { success: false, error: 'Pricing required' };
    }
    const price = options.pricing.perTask ?? options.pricing.perToken ?? 0;
    if (price < 0) {
      return { success: false, error: 'Price must be non-negative' };
    }
    if (price > MAX_PRICE) {
      return { success: false, error: `Price exceeds maximum of ${MAX_PRICE}` };
    }

    try {
      const [agentPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(AGENT_SEED_PREFIX),
          this.keypair.publicKey.toBuffer(),
        ],
        this.programId
      );

      const agentId = `agent_${this.keypair.publicKey.toBase58().slice(0, 8)}`;
      const signature = `reg_${Date.now().toString(36)}_${agentId}`;

      const agentInfo: AgentInfo = {
        id: agentId,
        address: agentPda.toBase58(),
        capabilities: options.capabilities,
        pricing: options.pricing,
        endpoint: options.endpoint,
        reputation: 500,
        totalJobs: 0,
        successRate: 100,
        avgResponseTime: 5000,
        status: 'active',
        registeredAt: Date.now(),
        lastActiveAt: Date.now(),
      };

      this.registeredAgents.set(agentId, agentInfo);

      return {
        success: true,
        agentId,
        address: agentPda.toBase58(),
        signature,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Registration failed',
      };
    }
  }

  async update(
    agentId: string,
    updates: Partial<RegisterOptions>
  ): Promise<RegistrationResult> {
    if (!agentId) {
      return { success: false, error: 'Agent ID required' };
    }

    try {
      const signature = `update_${Date.now().toString(36)}_${agentId}`;
      return {
        success: true,
        agentId,
        signature,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Update failed',
      };
    }
  }

  async deactivate(agentId: string): Promise<RegistrationResult> {
    if (!agentId) {
      return { success: false, error: 'Agent ID required' };
    }

    try {
      const signature = `deactivate_${Date.now().toString(36)}_${agentId}`;
      return {
        success: true,
        agentId,
        signature,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Deactivation failed',
      };
    }
  }

  async get(agentId: string): Promise<AgentInfo | null> {
    if (!agentId) return null;
    return this.registeredAgents.get(agentId) ?? null;
  }

  async getByAddress(address: string): Promise<AgentInfo | null> {
    try {
      new PublicKey(address);
    } catch {
      return null;
    }

    for (const agent of this.registeredAgents.values()) {
      if (agent.address === address) {
        return agent;
      }
    }

    return null;
  }

  async getMyAgent(): Promise<AgentInfo | null> {
    const myId = `agent_${this.keypair.publicKey.toBase58().slice(0, 8)}`;
    return this.registeredAgents.get(myId) ?? null;
  }

  deriveAgentAddress(owner: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(AGENT_SEED_PREFIX), owner.toBuffer()],
      this.programId
    );
    return pda;
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }
}
