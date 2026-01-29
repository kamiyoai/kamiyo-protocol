import { ethers } from 'ethers';
import {
  Feedback,
  FeedbackParams,
  FeedbackResult,
  FeedbackResponse,
  TxResult,
} from '../types';
import { ERC8004_REPUTATION_REGISTRY_ABI } from '../abis';

/**
 * Client for ERC-8004 Reputation Registry feedback operations
 */
export class FeedbackManager {
  private contract: ethers.Contract;
  private provider: ethers.Provider;

  constructor(
    address: string,
    providerOrSigner: ethers.Provider | ethers.Signer
  ) {
    if ('getAddress' in providerOrSigner) {
      this.provider = providerOrSigner.provider!;
      this.contract = new ethers.Contract(
        address,
        ERC8004_REPUTATION_REGISTRY_ABI,
        providerOrSigner
      );
    } else {
      this.provider = providerOrSigner;
      this.contract = new ethers.Contract(
        address,
        ERC8004_REPUTATION_REGISTRY_ABI,
        providerOrSigner
      );
    }
  }

  /**
   * Connect with a signer for write operations
   */
  connect(signer: ethers.Signer): FeedbackManager {
    return new FeedbackManager(this.contract.target as string, signer);
  }

  /**
   * Give feedback to an agent
   */
  async giveFeedback(params: FeedbackParams): Promise<FeedbackResult> {
    const decimals = 2;
    const scaledValue = BigInt(Math.round(params.value * 100));

    const tag1 = params.tag1
      ? ethers.encodeBytes32String(params.tag1.slice(0, 31))
      : ethers.ZeroHash;
    const tag2 = params.tag2
      ? ethers.encodeBytes32String(params.tag2.slice(0, 31))
      : ethers.ZeroHash;
    const endpoint = params.endpoint
      ? ethers.encodeBytes32String(params.endpoint.slice(0, 31))
      : ethers.ZeroHash;
    const feedbackURI = params.feedbackURI || '';
    const feedbackHash = feedbackURI
      ? ethers.keccak256(ethers.toUtf8Bytes(feedbackURI))
      : ethers.ZeroHash;

    const tx = await this.contract.giveFeedback(
      params.agentId,
      scaledValue,
      decimals,
      tag1,
      tag2,
      endpoint,
      feedbackURI,
      feedbackHash
    );

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    const feedbackEvent = receipt.logs.find((log: ethers.Log) => {
      try {
        const parsed = this.contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        return parsed?.name === 'NewFeedback';
      } catch {
        return false;
      }
    });

    if (!feedbackEvent) throw new Error('Feedback event not found');

    const parsed = this.contract.interface.parseLog({
      topics: feedbackEvent.topics as string[],
      data: feedbackEvent.data,
    });

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      success: true,
      feedbackIndex: parsed!.args.feedbackIndex,
    };
  }

  /**
   * Revoke previously submitted feedback
   */
  async revokeFeedback(
    agentId: bigint,
    feedbackIndex: bigint
  ): Promise<TxResult> {
    const tx = await this.contract.revokeFeedback(agentId, feedbackIndex);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Append a response to feedback
   */
  async appendResponse(
    agentId: bigint,
    clientAddress: string,
    feedbackIndex: bigint,
    responseURI: string
  ): Promise<TxResult> {
    const responseHash = ethers.keccak256(ethers.toUtf8Bytes(responseURI));

    const tx = await this.contract.appendResponse(
      agentId,
      clientAddress,
      feedbackIndex,
      responseURI,
      responseHash
    );

    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Read a single feedback entry
   */
  async readFeedback(
    agentId: bigint,
    clientAddress: string,
    feedbackIndex: bigint
  ): Promise<Feedback> {
    const result = await this.contract.readFeedback(
      agentId,
      clientAddress,
      feedbackIndex
    );

    return {
      agentId,
      value: result.value,
      valueDecimals: result.valueDecimals,
      tag1: ethers.decodeBytes32String(result.tag1),
      tag2: ethers.decodeBytes32String(result.tag2),
      endpoint: '',
      feedbackURI: '',
      feedbackHash: '',
      timestamp: 0,
      client: clientAddress,
      isRevoked: result.isRevoked,
    };
  }

  /**
   * Read full feedback with extended data
   */
  async readFeedbackFull(
    agentId: bigint,
    clientAddress: string,
    feedbackIndex: bigint
  ): Promise<Feedback> {
    const result = await this.contract.getFeedbackFull(
      agentId,
      clientAddress,
      feedbackIndex
    );

    return {
      agentId,
      value: result.value,
      valueDecimals: result.valueDecimals,
      tag1: this.decodeTag(result.tag1),
      tag2: this.decodeTag(result.tag2),
      endpoint: this.decodeTag(result.endpoint),
      feedbackURI: result.feedbackURI,
      feedbackHash: result.feedbackHash,
      timestamp: Number(result.timestamp),
      client: clientAddress,
      isRevoked: result.isRevoked,
    };
  }

  /**
   * Get all clients who have given feedback
   */
  async getClients(agentId: bigint): Promise<string[]> {
    return this.contract.getClients(agentId);
  }

  /**
   * Get last feedback index for a client
   */
  async getLastIndex(agentId: bigint, clientAddress: string): Promise<bigint> {
    return this.contract.getLastIndex(agentId, clientAddress);
  }

  /**
   * Get response count for a feedback
   */
  async getResponseCount(
    agentId: bigint,
    clientAddress: string,
    feedbackIndex: bigint
  ): Promise<number> {
    const count = await this.contract.getResponseCount(
      agentId,
      clientAddress,
      feedbackIndex
    );
    return Number(count);
  }

  /**
   * Get a specific response
   */
  async getResponse(
    agentId: bigint,
    clientAddress: string,
    feedbackIndex: bigint,
    responseIndex: number
  ): Promise<FeedbackResponse> {
    const result = await this.contract.getResponse(
      agentId,
      clientAddress,
      feedbackIndex,
      responseIndex
    );

    return {
      responder: result.responder,
      responseURI: result.responseURI,
      responseHash: result.responseHash,
      timestamp: Number(result.timestamp),
    };
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
