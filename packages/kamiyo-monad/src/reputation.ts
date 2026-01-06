/**
 * Cross-chain reputation bridge: Solana -> Monad
 */

import { ethers } from 'ethers';
import { MonadProvider } from './provider';
import {
  ReputationState,
  Groth16Proof,
  MonadError,
} from './types';

const REPUTATION_MIRROR_ABI = [
  'function updateReputation(bytes32 entityHash, uint256 reputationScore, uint256 totalTransactions, uint256 lastUpdated, bytes calldata proof) external',
  'function verifyProof(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[] publicInputs) view returns (bool)',
  'function getReputation(bytes32 entityHash) view returns (uint256 score, uint256 transactions, uint256 updated)',
  'function reputationExists(bytes32 entityHash) view returns (bool)',
  'event ReputationUpdated(bytes32 indexed entityHash, uint256 score, uint256 transactions)',
  'event ProofVerified(bytes32 indexed entityHash, bool valid)',
];

export interface SolanaReputationSource {
  fetchReputation(entity: string): Promise<ReputationState>;
  generateProof(state: ReputationState): Promise<Groth16Proof>;
}

export class ReputationBridge {
  private readonly provider: MonadProvider;
  private readonly mirrorAddress: string;
  private readonly mirror: ethers.Contract;
  private readonly solanaSource?: SolanaReputationSource;

  constructor(
    provider: MonadProvider,
    solanaSource?: SolanaReputationSource
  ) {
    this.provider = provider;
    this.mirrorAddress = provider.getContracts().reputationMirror;
    this.mirror = new ethers.Contract(
      this.mirrorAddress,
      REPUTATION_MIRROR_ABI,
      provider.getProvider()
    );
    this.solanaSource = solanaSource;
  }

  hashEntity(entity: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(entity));
  }

  async reputationExists(entity: string): Promise<boolean> {
    const entityHash = this.hashEntity(entity);
    try {
      return await this.mirror.reputationExists(entityHash);
    } catch {
      return false;
    }
  }

  async getReputation(entity: string): Promise<{
    score: number;
    transactions: bigint;
    updated: bigint;
  } | null> {
    const entityHash = this.hashEntity(entity);

    try {
      const exists = await this.mirror.reputationExists(entityHash);
      if (!exists) return null;

      const [score, transactions, updated] = await this.mirror.getReputation(
        entityHash
      );
      return {
        score: Number(score),
        transactions: BigInt(transactions),
        updated: BigInt(updated),
      };
    } catch (e) {
      throw new MonadError(
        `Failed to fetch reputation: ${e}`,
        'CONTRACT_ERROR',
        { entity }
      );
    }
  }

  async syncReputation(entity: string): Promise<string> {
    if (!this.solanaSource) {
      throw new MonadError(
        'Solana source not configured',
        'INVALID_CONFIG'
      );
    }

    try {
      const state = await this.solanaSource.fetchReputation(entity);
      const proof = await this.solanaSource.generateProof(state);

      return this.updateWithProof(entity, state, proof);
    } catch (e) {
      if (e instanceof MonadError) throw e;
      throw new MonadError(
        `Failed to sync reputation: ${e}`,
        'BRIDGE_ERROR',
        { entity }
      );
    }
  }

  async updateWithProof(
    entity: string,
    state: ReputationState,
    proof: Groth16Proof
  ): Promise<string> {
    const signer = this.provider.getSigner();
    const mirrorWithSigner = this.mirror.connect(signer) as ethers.Contract;
    const entityHash = this.hashEntity(entity);

    const proofBytes = this.encodeProof(proof);

    try {
      const tx = await mirrorWithSigner.updateReputation(
        entityHash,
        state.reputationScore,
        state.totalTransactions,
        state.lastUpdated,
        proofBytes
      );
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (e) {
      throw new MonadError(
        `Failed to update reputation: ${e}`,
        'CONTRACT_ERROR',
        { entity, score: state.reputationScore }
      );
    }
  }

  async verifyProof(proof: Groth16Proof): Promise<boolean> {
    try {
      return await this.mirror.verifyProof(
        proof.a,
        proof.b,
        proof.c,
        proof.publicInputs
      );
    } catch (e) {
      throw new MonadError(
        `Proof verification failed: ${e}`,
        'PROOF_ERROR'
      );
    }
  }

  private encodeProof(proof: Groth16Proof): string {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256[2]', 'uint256[2][2]', 'uint256[2]', 'uint256[]'],
      [proof.a, proof.b, proof.c, proof.publicInputs]
    );
  }

  decodeProof(proofBytes: string): Groth16Proof {
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
      ['uint256[2]', 'uint256[2][2]', 'uint256[2]', 'uint256[]'],
      proofBytes
    );
    return {
      a: decoded[0] as [bigint, bigint],
      b: decoded[1] as [[bigint, bigint], [bigint, bigint]],
      c: decoded[2] as [bigint, bigint],
      publicInputs: decoded[3] as bigint[],
    };
  }

  async batchSync(entities: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const promises = entities.map(async (entity) => {
      try {
        const txHash = await this.syncReputation(entity);
        results.set(entity, txHash);
      } catch (e) {
        results.set(entity, `error: ${e}`);
      }
    });

    await Promise.all(promises);
    return results;
  }
}

export function createReputationBridge(
  provider: MonadProvider,
  solanaSource?: SolanaReputationSource
): ReputationBridge {
  return new ReputationBridge(provider, solanaSource);
}
