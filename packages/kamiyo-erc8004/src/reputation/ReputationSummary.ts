import { ethers } from 'ethers';
import { ReputationSummary, Feedback } from '../types';
import { ERC8004_REPUTATION_REGISTRY_ABI } from '../abis';

/**
 * Client for querying ERC-8004 Reputation Registry summaries
 */
export class ReputationSummaryClient {
  private contract: ethers.Contract;

  constructor(address: string, provider: ethers.Provider) {
    this.contract = new ethers.Contract(
      address,
      ERC8004_REPUTATION_REGISTRY_ABI,
      provider
    );
  }

  /**
   * Get aggregated reputation summary for an agent
   */
  async getSummary(
    agentId: bigint,
    clientAddresses: string[] = [],
    tag1?: string,
    tag2?: string
  ): Promise<ReputationSummary> {
    const tag1Bytes = tag1
      ? ethers.encodeBytes32String(tag1.slice(0, 31))
      : ethers.ZeroHash;
    const tag2Bytes = tag2
      ? ethers.encodeBytes32String(tag2.slice(0, 31))
      : ethers.ZeroHash;

    const result = await this.contract.getSummary(
      agentId,
      clientAddresses,
      tag1Bytes,
      tag2Bytes
    );

    return {
      count: Number(result.count),
      totalValue: result.summaryValue,
      averageValue:
        result.count > 0
          ? Number(result.summaryValue) /
            Number(result.count) /
            Math.pow(10, result.decimals)
          : 0,
      decimals: result.decimals,
    };
  }

  /**
   * Get all feedback for an agent with filters
   */
  async getAllFeedback(
    agentId: bigint,
    clientAddresses: string[] = [],
    tag1?: string,
    tag2?: string,
    includeRevoked: boolean = false
  ): Promise<Feedback[]> {
    const tag1Bytes = tag1
      ? ethers.encodeBytes32String(tag1.slice(0, 31))
      : ethers.ZeroHash;
    const tag2Bytes = tag2
      ? ethers.encodeBytes32String(tag2.slice(0, 31))
      : ethers.ZeroHash;

    const result = await this.contract.readAllFeedback(
      agentId,
      clientAddresses,
      tag1Bytes,
      tag2Bytes,
      includeRevoked
    );

    const feedbacks: Feedback[] = [];
    for (let i = 0; i < result.clients.length; i++) {
      feedbacks.push({
        agentId,
        value: result.values[i],
        valueDecimals: result.valueDecimals[i],
        tag1: this.decodeTag(result.tag1s[i]),
        tag2: this.decodeTag(result.tag2s[i]),
        endpoint: '',
        feedbackURI: '',
        feedbackHash: '',
        timestamp: 0,
        client: result.clients[i],
        isRevoked: result.revoked[i],
      });
    }

    return feedbacks;
  }

  /**
   * Get reputation score as a percentage (0-100)
   */
  async getReputationScore(
    agentId: bigint,
    clientAddresses: string[] = []
  ): Promise<number> {
    const summary = await this.getSummary(agentId, clientAddresses);
    return Math.max(0, Math.min(100, summary.averageValue));
  }

  /**
   * Get reputation by tag
   */
  async getReputationByTag(
    agentId: bigint,
    tag: string,
    clientAddresses: string[] = []
  ): Promise<ReputationSummary> {
    return this.getSummary(agentId, clientAddresses, tag);
  }

  /**
   * Get clients who have interacted with an agent
   */
  async getClients(agentId: bigint): Promise<string[]> {
    return this.contract.getClients(agentId);
  }

  /**
   * Check if an address has given feedback
   */
  async hasGivenFeedback(agentId: bigint, clientAddress: string): Promise<boolean> {
    const lastIndex = await this.contract.getLastIndex(agentId, clientAddress);
    return lastIndex > 0n;
  }

  /**
   * Get feedback count from a specific client
   */
  async getFeedbackCount(agentId: bigint, clientAddress: string): Promise<number> {
    const lastIndex = await this.contract.getLastIndex(agentId, clientAddress);
    return Number(lastIndex);
  }

  /**
   * Get contract address
   */
  get address(): string {
    return this.contract.target as string;
  }

  private decodeTag(tag: string): string {
    if (tag === ethers.ZeroHash) return '';
    try {
      return ethers.decodeBytes32String(tag);
    } catch {
      return '';
    }
  }
}
