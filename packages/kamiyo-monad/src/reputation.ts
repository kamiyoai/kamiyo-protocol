import { ethers } from 'ethers';
import { MonadProvider } from './provider';
import { ReputationState, Groth16Proof, MonadError } from './types';

const MIRROR_ABI = [
  'function submitAttestation((bytes32,uint256,uint256,uint256,bytes32), (uint256[2],uint256[2][2],uint256[2]), uint256[]) external',
  'function verifyProof(uint256[2], uint256[2][2], uint256[2], uint256[]) view returns (bool)',
  'function getReputation(bytes32) view returns (uint256, uint256, uint256)',
  'function reputationExists(bytes32) view returns (bool)',
  'function hasAttestation(bytes32) view returns (bool)',
];

export interface SolanaReputationSource {
  fetchReputation(entity: string): Promise<ReputationState>;
  generateProof(state: ReputationState): Promise<Groth16Proof>;
}

export class ReputationBridge {
  private readonly provider: MonadProvider;
  private readonly mirror: ethers.Contract;
  private readonly solana?: SolanaReputationSource;

  constructor(provider: MonadProvider, solana?: SolanaReputationSource) {
    this.provider = provider;
    this.mirror = new ethers.Contract(
      provider.getContracts().reputationMirror,
      MIRROR_ABI,
      provider.getProvider()
    );
    this.solana = solana;
  }

  hashEntity(entity: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(entity));
  }

  async exists(entity: string): Promise<boolean> {
    try {
      return await this.mirror.reputationExists(this.hashEntity(entity));
    } catch {
      return false;
    }
  }

  async get(entity: string): Promise<{ score: number; txns: bigint; updated: bigint } | null> {
    const hash = this.hashEntity(entity);
    try {
      if (!(await this.mirror.reputationExists(hash))) return null;
      const [score, txns, updated] = await this.mirror.getReputation(hash);
      return { score: Number(score), txns: BigInt(txns), updated: BigInt(updated) };
    } catch (e) {
      throw new MonadError(`getReputation failed: ${e}`, 'CONTRACT_ERROR', { entity });
    }
  }

  async sync(entity: string): Promise<string> {
    if (!this.solana) throw new MonadError('Solana source not configured', 'INVALID_CONFIG');

    try {
      const state = await this.solana.fetchReputation(entity);
      const proof = await this.solana.generateProof(state);
      return this.updateWithProof(entity, state, proof);
    } catch (e) {
      if (e instanceof MonadError) throw e;
      throw new MonadError(`sync failed: ${e}`, 'BRIDGE_ERROR', { entity });
    }
  }

  async updateWithProof(entity: string, state: ReputationState, proof: Groth16Proof): Promise<string> {
    const signer = this.provider.getSigner();
    const contract = this.mirror.connect(signer) as ethers.Contract;
    const hash = this.hashEntity(entity);

    const attestation = {
      entityHash: hash,
      reputationScore: state.reputationScore,
      totalTransactions: state.totalTransactions,
      timestamp: state.lastUpdated,
      solanaSignature: ethers.ZeroHash,
    };

    try {
      const tx = await contract.submitAttestation(attestation, proof, proof.publicInputs);
      return (await tx.wait()).hash;
    } catch (e) {
      throw new MonadError(`updateWithProof failed: ${e}`, 'CONTRACT_ERROR', { entity });
    }
  }

  async verifyProof(proof: Groth16Proof): Promise<boolean> {
    try {
      return await this.mirror.verifyProof(proof.a, proof.b, proof.c, proof.publicInputs);
    } catch (e) {
      throw new MonadError(`verifyProof failed: ${e}`, 'PROOF_ERROR');
    }
  }

  encodeProof(proof: Groth16Proof): string {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256[2]', 'uint256[2][2]', 'uint256[2]', 'uint256[]'],
      [proof.a, proof.b, proof.c, proof.publicInputs]
    );
  }

  decodeProof(data: string): Groth16Proof {
    const [a, b, c, inputs] = ethers.AbiCoder.defaultAbiCoder().decode(
      ['uint256[2]', 'uint256[2][2]', 'uint256[2]', 'uint256[]'],
      data
    );
    return {
      a: a as [bigint, bigint],
      b: b as [[bigint, bigint], [bigint, bigint]],
      c: c as [bigint, bigint],
      publicInputs: inputs as bigint[],
    };
  }

  async batchSync(entities: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    await Promise.all(
      entities.map(async (e) => {
        try {
          results.set(e, await this.sync(e));
        } catch (err) {
          results.set(e, `error: ${err}`);
        }
      })
    );
    return results;
  }
}

export function createReputationBridge(
  provider: MonadProvider,
  solana?: SolanaReputationSource
): ReputationBridge {
  return new ReputationBridge(provider, solana);
}
