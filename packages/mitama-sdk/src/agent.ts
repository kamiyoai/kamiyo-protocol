/**
 * Agent Identity Management
 */

import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { MitamaClient } from "./client";
import { AgentIdentity, AgentType, CreateAgentParams } from "./types";

/**
 * Agent Manager - High-level agent identity operations
 */
export class AgentManager {
  constructor(private client: MitamaClient) {}

  /**
   * Create a new agent identity
   */
  async create(
    name: string,
    agentType: AgentType,
    stakeAmountSol: number
  ): Promise<{ signature: string; pda: PublicKey }> {
    const params: CreateAgentParams = {
      name,
      agentType,
      stakeAmount: new BN(stakeAmountSol * 1e9), // Convert SOL to lamports
    };

    const signature = await this.client.createAgent(params);
    const [pda] = this.client.getAgentPDA(this.client.wallet.publicKey);

    return { signature, pda };
  }

  /**
   * Get agent by owner
   */
  async getByOwner(owner: PublicKey): Promise<AgentIdentity | null> {
    return this.client.getAgentByOwner(owner);
  }

  /**
   * Get my agent identity
   */
  async getMine(): Promise<AgentIdentity | null> {
    return this.client.getAgentByOwner(this.client.wallet.publicKey);
  }

  /**
   * Check if an agent exists and is active
   */
  async isActive(owner: PublicKey): Promise<boolean> {
    const agent = await this.client.getAgentByOwner(owner);
    return agent?.isActive ?? false;
  }

  /**
   * Get agent reputation score (0-1000)
   */
  async getReputationScore(owner: PublicKey): Promise<number | null> {
    const agent = await this.client.getAgentByOwner(owner);
    return agent?.reputation.toNumber() ?? null;
  }

  /**
   * Get agent PDA
   */
  getPDA(owner: PublicKey): PublicKey {
    const [pda] = this.client.getAgentPDA(owner);
    return pda;
  }

  /**
   * Calculate trust level based on reputation and stake
   */
  calculateTrustLevel(agent: AgentIdentity): "low" | "medium" | "high" | "trusted" {
    const reputation = agent.reputation.toNumber();
    const stake = agent.stakeAmount.toNumber() / 1e9; // Convert to SOL

    if (reputation >= 800 && stake >= 10) return "trusted";
    if (reputation >= 600 && stake >= 1) return "high";
    if (reputation >= 400 && stake >= 0.5) return "medium";
    return "low";
  }

  /**
   * Get agent statistics
   */
  getStats(agent: AgentIdentity): {
    totalEscrows: number;
    successRate: number;
    disputeRate: number;
    averageQuality: number;
  } {
    const total = agent.totalEscrows.toNumber();
    const successful = agent.successfulEscrows.toNumber();
    const disputed = agent.disputedEscrows.toNumber();

    return {
      totalEscrows: total,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      disputeRate: total > 0 ? (disputed / total) * 100 : 0,
      averageQuality: 0, // Would need additional tracking
    };
  }
}
