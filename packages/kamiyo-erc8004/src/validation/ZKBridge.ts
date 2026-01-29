import { ethers } from 'ethers';
import {
  AttestationRequest,
  AgentStatus,
  KamiyoTier,
  TxResult,
  TIER_TO_RESPONSE,
} from '../types';
import { ZK_REPUTATION_BRIDGE_ABI } from '../abis';

/**
 * ZK proof structure for tier attestation
 */
export interface ZKProof {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
}

/**
 * Client for ZK Reputation Bridge - bridges ZK proofs to ERC-8004 validations
 */
export class ZKBridgeClient {
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
        ZK_REPUTATION_BRIDGE_ABI,
        providerOrSigner
      );
    } else {
      this.provider = providerOrSigner;
      this.contract = new ethers.Contract(
        address,
        ZK_REPUTATION_BRIDGE_ABI,
        providerOrSigner
      );
    }
  }

  /**
   * Connect with a signer for write operations
   */
  connect(signer: ethers.Signer): ZKBridgeClient {
    return new ZKBridgeClient(this.contract.target as string, signer);
  }

  /**
   * Link an agent address to an identity
   */
  async linkAgent(agentId: bigint): Promise<TxResult> {
    const tx = await this.contract.linkAgent(agentId);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Unlink the caller's agent
   */
  async unlinkAgent(): Promise<TxResult> {
    const tx = await this.contract.unlinkAgent();
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Request attestation for a specific tier
   */
  async requestAttestation(
    agentAddress: string,
    requestedTier: KamiyoTier
  ): Promise<{ txHash: string; requestHash: string }> {
    const tx = await this.contract.requestAttestation(
      agentAddress,
      requestedTier
    );
    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    const event = receipt.logs.find((log: ethers.Log) => {
      try {
        const parsed = this.contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        return parsed?.name === 'AttestationRequested';
      } catch {
        return false;
      }
    });

    if (!event) throw new Error('AttestationRequested event not found');

    const parsed = this.contract.interface.parseLog({
      topics: event.topics as string[],
      data: event.data,
    });

    return {
      txHash: tx.hash,
      requestHash: parsed!.args.requestHash,
    };
  }

  /**
   * Fulfill attestation with ZK proof
   */
  async fulfillAttestation(
    requestHash: string,
    proof: ZKProof,
    threshold: bigint
  ): Promise<TxResult> {
    const tx = await this.contract.fulfillAttestation(
      requestHash,
      proof.pA,
      proof.pB,
      proof.pC,
      threshold
    );
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Attest current tier for an agent (no proof required)
   */
  async attestCurrentTier(
    agentAddress: string
  ): Promise<{ agentId: bigint; tier: KamiyoTier; response: number }> {
    const tx = await this.contract.attestCurrentTier(agentAddress);
    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    const event = receipt.logs.find((log: ethers.Log) => {
      try {
        const parsed = this.contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        return parsed?.name === 'TierAttested';
      } catch {
        return false;
      }
    });

    if (!event) throw new Error('TierAttested event not found');

    const parsed = this.contract.interface.parseLog({
      topics: event.topics as string[],
      data: event.data,
    });

    return {
      agentId: parsed!.args.agentId,
      tier: parsed!.args.tier as KamiyoTier,
      response: parsed!.args.response,
    };
  }

  /**
   * Batch attest tiers for multiple agents
   */
  async batchAttestCurrentTier(agentAddresses: string[]): Promise<TxResult> {
    const tx = await this.contract.batchAttestCurrentTier(agentAddresses);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Get linked identity for an agent address
   */
  async getLinkedIdentity(agentAddress: string): Promise<bigint> {
    return this.contract.getLinkedIdentity(agentAddress);
  }

  /**
   * Get linked agent address for an identity
   */
  async getLinkedAgent(agentId: bigint): Promise<string> {
    return this.contract.getLinkedAgent(agentId);
  }

  /**
   * Get attestation request details
   */
  async getAttestationRequest(requestHash: string): Promise<AttestationRequest> {
    const result = await this.contract.getAttestationRequest(requestHash);

    return {
      requestHash,
      agentAddress: result.agentAddress,
      agentId: result.agentId,
      requestedTier: result.requestedTier as KamiyoTier,
      timestamp: Number(result.timestamp),
      fulfilled: result.fulfilled,
    };
  }

  /**
   * Get agent status including link and tier info
   */
  async getAgentStatus(agentAddress: string): Promise<AgentStatus> {
    const result = await this.contract.getAgentStatus(agentAddress);

    return {
      linked: result.linked,
      agentId: result.agentId,
      tier: result.tier as KamiyoTier,
      response: result.response,
    };
  }

  /**
   * Check if an agent is linked
   */
  async isLinked(agentAddress: string): Promise<boolean> {
    const status = await this.getAgentStatus(agentAddress);
    return status.linked;
  }

  /**
   * Get the expected ERC-8004 response for a tier
   */
  getExpectedResponse(tier: KamiyoTier): number {
    return TIER_TO_RESPONSE[tier];
  }

  /**
   * Get contract address
   */
  get address(): string {
    return this.contract.target as string;
  }
}
