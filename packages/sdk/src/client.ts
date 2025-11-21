import { Connection, PublicKey } from '@solana/web3.js';
import { AgentIdentity, AgentType, TestEnvironment, SurfpoolTestEnvironment } from '@mitama/core';
import { MitamaAgentProvider } from './provider';

export interface MitamaSDKConfig {
  solanaRpc: string;
  apiUrl: string;
  surfpoolRpc?: string;
  wallet?: any;
  timeout?: number;
}

export interface Strategy {
  action: string;
  params: any;
}

export interface ExecutionResult {
  executed: boolean;
  signature?: string;
  reasoning?: string;
  testResult?: any;
}

export class MitamaSDK {
  private connection: Connection;
  private provider: MitamaAgentProvider;
  private testEnv?: TestEnvironment;
  private apiUrl: string;
  private timeout: number;

  constructor(config: MitamaSDKConfig) {
    this.connection = new Connection(config.solanaRpc);
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 30000;
    this.provider = new MitamaAgentProvider(config.solanaRpc, config.apiUrl, this.timeout);

    if (config.surfpoolRpc) {
      this.testEnv = new SurfpoolTestEnvironment(config.surfpoolRpc);
    }
  }

  async createAgent(
    owner: PublicKey,
    name: string,
    type: AgentType,
    initialStake: number
  ): Promise<AgentIdentity> {
    return this.provider.createAgent({
      owner,
      name,
      type,
      initialStake
    });
  }

  async getAgent(pda: PublicKey): Promise<AgentIdentity> {
    return this.provider.getAgent(pda);
  }

  async listAgents(skip?: number, limit?: number): Promise<AgentIdentity[]> {
    return this.provider.listAgents(skip, limit);
  }

  async testStrategy(agentId: string, strategy: Strategy): Promise<any> {
    const response = await fetch(`${this.apiUrl}/agents/${agentId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy,
        use_surfpool: true
      })
    });

    if (!response.ok) {
      throw new Error(`Test failed: ${response.statusText}`);
    }

    return response.json();
  }

  async executeAction(
    agentId: string,
    action: string,
    params: any,
    testFirst: boolean = true
  ): Promise<ExecutionResult> {
    const response = await fetch(`${this.apiUrl}/agents/${agentId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        params,
        test_first: testFirst
      })
    });

    if (!response.ok) {
      throw new Error(`Execution failed: ${response.statusText}`);
    }

    return response.json();
  }

  async agentThink(agentId: string, prompt: string): Promise<string> {
    const response = await fetch(`${this.apiUrl}/agents/${agentId}/think`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      throw new Error(`Think failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  getConnection(): Connection {
    return this.connection;
  }

  getTestEnvironment(): TestEnvironment | undefined {
    return this.testEnv;
  }
}
