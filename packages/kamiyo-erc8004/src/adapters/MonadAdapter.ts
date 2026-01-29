import { ethers } from 'ethers';
import { MirroredIdentity, KamiyoTier, TxResult, parseGlobalId } from '../types';
import { IDENTITY_MIRROR_ABI } from '../abis';

/**
 * ZK proof structure for identity mirroring
 */
export interface MirrorProof {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
}

/**
 * Adapter client for Monad Identity Mirror
 */
export class MonadAdapter {
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
        IDENTITY_MIRROR_ABI,
        providerOrSigner
      );
    } else {
      this.provider = providerOrSigner;
      this.contract = new ethers.Contract(
        address,
        IDENTITY_MIRROR_ABI,
        providerOrSigner
      );
    }
  }

  /**
   * Connect with a signer for write operations
   */
  connect(signer: ethers.Signer): MonadAdapter {
    return new MonadAdapter(this.contract.target as string, signer);
  }

  /**
   * Mirror an identity with ZK proof verification
   */
  async mirrorIdentity(
    globalId: string,
    owner: string,
    wallet: string,
    agentURI: string,
    tier: KamiyoTier,
    proof: MirrorProof,
    pubInputs: bigint[]
  ): Promise<TxResult> {
    parseGlobalId(globalId);

    const tx = await this.contract.mirrorIdentity(
      globalId,
      owner,
      wallet,
      agentURI,
      tier,
      { a: proof.a, b: proof.b, c: proof.c },
      pubInputs
    );
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Mirror identity as admin (no proof required)
   */
  async mirrorIdentityAdmin(
    globalId: string,
    owner: string,
    wallet: string,
    agentURI: string,
    tier: KamiyoTier
  ): Promise<TxResult> {
    parseGlobalId(globalId);

    const tx = await this.contract.mirrorIdentityAdmin(
      globalId,
      owner,
      wallet,
      agentURI,
      tier
    );
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Batch mirror multiple identities (admin only)
   */
  async batchMirrorIdentities(
    identities: Array<{
      globalId: string;
      owner: string;
      wallet: string;
      agentURI: string;
      tier: KamiyoTier;
    }>
  ): Promise<TxResult> {
    const globalIds = identities.map((i) => i.globalId);
    const owners = identities.map((i) => i.owner);
    const wallets = identities.map((i) => i.wallet);
    const agentURIs = identities.map((i) => i.agentURI);
    const tiers = identities.map((i) => i.tier);

    const tx = await this.contract.batchMirrorIdentities(
      globalIds,
      owners,
      wallets,
      agentURIs,
      tiers
    );
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Get mirrored identity by global ID hash
   */
  async getIdentity(globalIdHash: string): Promise<MirroredIdentity | null> {
    const result = await this.contract.getIdentity(globalIdHash);

    if (!result.exists) {
      return null;
    }

    return {
      globalIdHash: result.globalIdHash,
      globalId: result.globalId,
      owner: result.owner,
      wallet: result.wallet,
      agentURI: result.agentURI,
      timestamp: Number(result.timestamp),
      tier: result.tier as KamiyoTier,
    };
  }

  /**
   * Get mirrored identity by global ID string
   */
  async getIdentityByGlobalId(globalId: string): Promise<MirroredIdentity | null> {
    const result = await this.contract.getIdentityByGlobalId(globalId);

    if (!result.exists) {
      return null;
    }

    return {
      globalIdHash: result.globalIdHash,
      globalId: result.globalId,
      owner: result.owner,
      wallet: result.wallet,
      agentURI: result.agentURI,
      timestamp: Number(result.timestamp),
      tier: result.tier as KamiyoTier,
    };
  }

  /**
   * Get mirrored identity by wallet address
   */
  async getIdentityByWallet(wallet: string): Promise<MirroredIdentity | null> {
    const result = await this.contract.getIdentityByWallet(wallet);

    if (!result.exists) {
      return null;
    }

    return {
      globalIdHash: result.globalIdHash,
      globalId: result.globalId,
      owner: result.owner,
      wallet: result.wallet,
      agentURI: result.agentURI,
      timestamp: Number(result.timestamp),
      tier: result.tier as KamiyoTier,
    };
  }

  /**
   * Check if an identity has been mirrored
   */
  async hasIdentity(globalIdHash: string): Promise<boolean> {
    return this.contract.hasIdentity(globalIdHash);
  }

  /**
   * Get agent wallet for a global ID hash
   */
  async getAgentWallet(globalIdHash: string): Promise<string> {
    return this.contract.getAgentWallet(globalIdHash);
  }

  /**
   * Get tier for a global ID hash
   */
  async getTier(globalIdHash: string): Promise<KamiyoTier> {
    const tier = await this.contract.getTier(globalIdHash);
    return tier as KamiyoTier;
  }

  /**
   * Get all identities owned by an address
   */
  async getIdentitiesByOwner(owner: string): Promise<string[]> {
    return this.contract.getIdentitiesByOwner(owner);
  }

  /**
   * Convert tier to ERC-8004 response value
   */
  async tierToResponse(tier: KamiyoTier): Promise<number> {
    return this.contract.tierToResponse(tier);
  }

  /**
   * Get total number of mirrored identities
   */
  async totalIdentities(): Promise<number> {
    const count = await this.contract.totalIdentities();
    return Number(count);
  }

  /**
   * Compute global ID hash
   */
  hashGlobalId(globalId: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(globalId));
  }

  /**
   * Resolve a global ID to mirrored identity on Monad
   */
  async resolveGlobalId(globalId: string): Promise<MirroredIdentity | null> {
    return this.getIdentityByGlobalId(globalId);
  }

  /**
   * Get contract address
   */
  get address(): string {
    return this.contract.target as string;
  }
}
