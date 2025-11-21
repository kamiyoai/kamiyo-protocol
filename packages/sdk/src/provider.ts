import { Connection, PublicKey } from '@solana/web3.js';
import {
  AgentProvider,
  AgentIdentity,
  CreateAgentParams,
  AgentType
} from '@mitama/core';

export class MitamaAgentProvider implements AgentProvider {
  private connection: Connection;
  private apiUrl: string;
  private timeout: number;

  constructor(rpcUrl: string, apiUrl: string, timeout: number = 30000) {
    this.connection = new Connection(rpcUrl);
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.timeout = timeout;
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(`API Error: ${error.detail || response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  async createAgent(params: CreateAgentParams): Promise<AgentIdentity> {
    const response = await this.fetchWithTimeout(`${this.apiUrl}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.name,
        owner_address: params.owner.toString(),
        agent_type: params.type,
        initial_stake: params.initialStake
      })
    });

    const data = await response.json();

    return {
      pda: new PublicKey(data.pda_address),
      owner: params.owner,
      name: data.name,
      type: params.type,
      reputation: BigInt(data.reputation_score || 0),
      stakeAmount: BigInt(params.initialStake),
      isActive: true
    };
  }

  async getAgent(pda: PublicKey): Promise<AgentIdentity> {
    const response = await this.fetchWithTimeout(`${this.apiUrl}/agents/${pda.toString()}`, {
      method: 'GET'
    });

    const data = await response.json();

    return {
      pda: new PublicKey(data.pda_address),
      owner: new PublicKey(data.owner_address),
      name: data.name,
      type: data.agent_type as AgentType,
      reputation: BigInt(data.reputation_score || 0),
      stakeAmount: BigInt(data.stake_amount || 0),
      isActive: data.is_active || true
    };
  }

  async updateReputation(pda: PublicKey, delta: number): Promise<void> {
    await this.fetchWithTimeout(`${this.apiUrl}/agents/${pda.toString()}/reputation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta })
    });
  }

  async listAgents(skip: number = 0, limit: number = 100): Promise<AgentIdentity[]> {
    const response = await this.fetchWithTimeout(
      `${this.apiUrl}/agents?skip=${skip}&limit=${limit}`,
      { method: 'GET' }
    );

    const data = await response.json();

    return data.agents.map((agent: any) => ({
      pda: new PublicKey(agent.pda_address),
      owner: new PublicKey(agent.owner_address),
      name: agent.name,
      type: agent.agent_type as AgentType,
      reputation: BigInt(agent.reputation_score || 0),
      stakeAmount: BigInt(agent.stake_amount || 0),
      isActive: agent.is_active || true
    }));
  }
}
