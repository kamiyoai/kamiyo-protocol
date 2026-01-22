/**
 * ShadowID reputation gate bridging anonymous identity with ZK reputation proofs.
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type {
  ShadowIdentity,
  ShadowIdProof,
  ReputationGateResult,
  WalletAdapter,
} from '../types';

let privateInferenceClass: any = null;
let zkVerifier: any = null;
let zkLoadAttempted = false;

async function getZKInfrastructure(): Promise<{
  prover: any;
  verifier: any;
  available: boolean;
}> {
  if (zkLoadAttempted) {
    return {
      prover: privateInferenceClass,
      verifier: zkVerifier,
      available: privateInferenceClass !== null,
    };
  }
  zkLoadAttempted = true;

  try {
    const privacyModule = await import('@kamiyo/solana-privacy');
    privateInferenceClass = privacyModule.PrivateInference;
    zkVerifier = privacyModule.verifyReputationProof;
    return { prover: privateInferenceClass, verifier: zkVerifier, available: true };
  } catch {
    return { prover: null, verifier: null, available: false };
  }
}

export const REPUTATION_TIERS = {
  none: { min: 0, max: 0, label: 'Unverified' },
  bronze: { min: 1, max: 40, label: 'Bronze' },
  silver: { min: 41, max: 65, label: 'Silver' },
  gold: { min: 66, max: 85, label: 'Gold' },
  platinum: { min: 86, max: 100, label: 'Platinum' },
} as const;

export type ReputationTier = keyof typeof REPUTATION_TIERS;

export const SHADOWID_TIER_BENEFITS = {
  lite: {
    rateLimit: 1,
    poolAccess: ['SOL', 'USDC'],
    maxTransfer: 100, // SOL equivalent
  },
  active: {
    rateLimit: 10,
    poolAccess: 'all',
    maxTransfer: 10000,
  },
} as const;

export class ShadowIdReputationGate {
  private connection: Connection;
  private kamiyoProgramId: PublicKey;

  constructor(connection: Connection, kamiyoProgramId: PublicKey) {
    this.connection = connection;
    this.kamiyoProgramId = kamiyoProgramId;
  }

  async checkReputationGate(
    wallet: WalletAdapter,
    threshold: number
  ): Promise<ReputationGateResult> {
    const walletPubkey = wallet.publicKey;
    if (!walletPubkey) {
      return { eligible: false, meetsThreshold: false, tier: 'none', error: 'Wallet not connected' };
    }

    try {
      const reputation = await this.fetchReputation(walletPubkey);

      if (reputation === null) {
        return {
          eligible: false,
          meetsThreshold: false,
          tier: 'none',
          error: 'No reputation record found',
        };
      }

      const meetsThreshold = reputation >= threshold;
      const tier = this.getTierForScore(reputation);

      let proof: ReputationGateResult['proof'];
      if (meetsThreshold) {
        proof = await this.generateReputationProof(walletPubkey, reputation, threshold);
      }

      return {
        eligible: meetsThreshold,
        meetsThreshold,
        tier,
        proof,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { eligible: false, meetsThreshold: false, tier: 'none', error: message };
    }
  }

  async verifyReputationProof(
    proof: NonNullable<ReputationGateResult['proof']> & { encodedProof?: string },
    options?: {
      /** Require cryptographic verification (default: true in production) */
      requireCrypto?: boolean;
      /** On-chain verification connection */
      connection?: Connection;
    }
  ): Promise<{ valid: boolean; threshold: number; cryptographic: boolean; error?: string }> {
    const requireCrypto = options?.requireCrypto ?? (process.env.NODE_ENV === 'production');

    try {
      if (!/^[a-f0-9]{64}$/.test(proof.commitment)) {
        return { valid: false, threshold: 0, cryptographic: false, error: 'Invalid commitment format' };
      }

      if (proof.proofBytes.length !== 256) {
        return { valid: false, threshold: 0, cryptographic: false, error: 'Invalid proof length' };
      }

      const marker = 'STRUCTURAL_PROOF_NOT_CRYPTOGRAPHIC';
      const proofStart = Buffer.from(proof.proofBytes.slice(0, marker.length)).toString();
      const isStructuralProof = proofStart === marker;

      if (isStructuralProof) {
        if (requireCrypto) {
          return {
            valid: false,
            threshold: proof.threshold,
            cryptographic: false,
            error: 'Structural proofs not accepted in production mode',
          };
        }
        // Accept structural proof in development with warning
        return {
          valid: true,
          threshold: proof.threshold,
          cryptographic: false,
          error: 'Warning: structural proof accepted (development mode only)',
        };
      }

      const zk = await getZKInfrastructure();

      if (proof.encodedProof && zk.available && zk.verifier) {
        try {
          const result = await zk.verifier(proof.encodedProof, {
            minThreshold: proof.threshold,
            connection: options?.connection,
            requireCrypto: true,
          });

          return {
            valid: result.valid,
            threshold: result.threshold ?? proof.threshold,
            cryptographic: true,
            error: result.error,
          };
        } catch (verifyErr) {
          const msg = verifyErr instanceof Error ? verifyErr.message : 'Unknown';
          return {
            valid: false,
            threshold: proof.threshold,
            cryptographic: false,
            error: `Cryptographic verification failed: ${msg}`,
          };
        }
      }

      if (requireCrypto) {
        return {
          valid: false,
          threshold: proof.threshold,
          cryptographic: false,
          error: 'Cryptographic verification required but verifier not available',
        };
      }

      return {
        valid: true,
        threshold: proof.threshold,
        cryptographic: false,
        error: 'Warning: proof format valid but not cryptographically verified',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { valid: false, threshold: 0, cryptographic: false, error: message };
    }
  }

  async generateCombinedCredential(
    wallet: WalletAdapter,
    shadowIdentity: ShadowIdentity,
    reputationThreshold: number
  ): Promise<{
    success: boolean;
    credential?: {
      shadowCommitment: string;
      reputationCommitment: string;
      combinedProof: Uint8Array;
      tier: ReputationTier;
      shadowTier: 'lite' | 'active';
      expiresAt: number;
    };
    error?: string;
  }> {
    const walletPubkey = wallet.publicKey;
    if (!walletPubkey) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const gateResult = await this.checkReputationGate(wallet, reputationThreshold);
      if (!gateResult.eligible || !gateResult.proof) {
        return { success: false, error: gateResult.error || 'Reputation threshold not met' };
      }

      const combinedProof = this.combineShadowAndReputationProofs(
        shadowIdentity.commitment,
        gateResult.proof.proofBytes
      );

      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      return {
        success: true,
        credential: {
          shadowCommitment: shadowIdentity.commitment,
          reputationCommitment: gateResult.proof.commitment,
          combinedProof,
          tier: gateResult.tier,
          shadowTier: shadowIdentity.tier,
          expiresAt,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  calculateEffectiveRateLimit(
    shadowTier: 'lite' | 'active',
    reputationTier: ReputationTier
  ): number {
    const baseLimit = SHADOWID_TIER_BENEFITS[shadowTier].rateLimit;
    const multipliers: Record<ReputationTier, number> = {
      none: 0.5,
      bronze: 1,
      silver: 1.5,
      gold: 2,
      platinum: 3,
    };

    return Math.floor(baseLimit * multipliers[reputationTier]);
  }

  async canAccessPool(
    wallet: WalletAdapter,
    token: string,
    shadowTier: 'lite' | 'active'
  ): Promise<{ allowed: boolean; reason?: string }> {
    const benefits = SHADOWID_TIER_BENEFITS[shadowTier];

    if (benefits.poolAccess === 'all') {
      return { allowed: true };
    }

    if (benefits.poolAccess.includes(token as any)) {
      return { allowed: true };
    }

    const walletPubkey = wallet.publicKey;
    if (!walletPubkey) {
      return { allowed: false, reason: 'Wallet not connected' };
    }

    const reputation = await this.fetchReputation(walletPubkey);
    if (reputation !== null && reputation >= 50) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Token ${token} requires Active ShadowID tier or reputation >= 50`,
    };
  }

  private async fetchReputation(wallet: PublicKey): Promise<number | null> {
    try {
      const [reputationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('reputation'), wallet.toBuffer()],
        this.kamiyoProgramId
      );

      const accountInfo = await this.connection.getAccountInfo(reputationPda);
      if (!accountInfo) return null;

      const reputationScore = accountInfo.data.readUInt16LE(82);
      return Math.max(0, Math.min(100, (reputationScore + 1000) / 20));
    } catch {
      return null;
    }
  }

  private getTierForScore(score: number): ReputationTier {
    if (score >= REPUTATION_TIERS.platinum.min) return 'platinum';
    if (score >= REPUTATION_TIERS.gold.min) return 'gold';
    if (score >= REPUTATION_TIERS.silver.min) return 'silver';
    if (score >= REPUTATION_TIERS.bronze.min) return 'bronze';
    return 'none';
  }

  private async generateReputationProof(
    wallet: PublicKey,
    score: number,
    threshold: number
  ): Promise<NonNullable<ReputationGateResult['proof']> & { cryptographic: boolean; encodedProof?: string }> {
    const zk = await getZKInfrastructure();

    if (zk.available && zk.prover) {
      try {
        // Create a minimal wallet adapter for the prover
        const walletAdapter = {
          publicKey: wallet,
          signMessage: async () => new Uint8Array(64),
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        } as unknown as Wallet;

        const prover = new zk.prover(walletAdapter);
        const proof = await prover.proveReputation({ score, threshold });

        // Return cryptographic proof
        return {
          commitment: proof.commitment,
          threshold: proof.threshold,
          proofBytes: proof.proofBytes,
          cryptographic: true,
          encodedProof: zk.prover.encodeReputationProof(proof),
        };
      } catch (err) {
        console.warn('[kamiyo/radr] ZK prover failed:', err);
      }
    }

    console.warn('[kamiyo/radr] Structural proof only. Install @kamiyo/solana-privacy for production.');

    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);
    const secretBigInt = BigInt('0x' + Buffer.from(secret).toString('hex'));

    const commitmentData = new TextEncoder().encode(
      `reputation:${score}:${secretBigInt.toString()}`
    );
    const hashBuffer = await crypto.subtle.digest('SHA-256', commitmentData);
    const commitment = Buffer.from(hashBuffer).toString('hex');

    const marker = Buffer.from('STRUCTURAL_PROOF_NOT_CRYPTOGRAPHIC');
    const proofBytes = new Uint8Array(256);
    marker.copy(Buffer.from(proofBytes.buffer), 0);
    crypto.getRandomValues(proofBytes.subarray(marker.length));
    proofBytes[marker.length] = threshold;
    proofBytes[marker.length + 1] = score >= threshold ? 1 : 0;

    return {
      commitment,
      threshold,
      proofBytes,
      cryptographic: false,
    };
  }

  private combineShadowAndReputationProofs(
    shadowCommitment: string,
    reputationProof: Uint8Array
  ): Uint8Array {
    const shadowBytes = Buffer.from(shadowCommitment, 'hex');
    const combined = new Uint8Array(32 + reputationProof.length);
    combined.set(shadowBytes, 0);
    combined.set(reputationProof, 32);
    return combined;
  }
}

export function createShadowIdReputationGate(
  connection: Connection,
  kamiyoProgramId: PublicKey | string
): ShadowIdReputationGate {
  const pid = typeof kamiyoProgramId === 'string' ? new PublicKey(kamiyoProgramId) : kamiyoProgramId;
  return new ShadowIdReputationGate(connection, pid);
}

export function meetsReputationTier(score: number, requiredTier: ReputationTier): boolean {
  const tierConfig = REPUTATION_TIERS[requiredTier];
  return score >= tierConfig.min;
}

export function getTierBenefits(tier: ReputationTier): string {
  switch (tier) {
    case 'platinum':
      return 'Full access, 3x rate limits, priority relayer';
    case 'gold':
      return 'Full access, 2x rate limits';
    case 'silver':
      return 'Full access, 1.5x rate limits';
    case 'bronze':
      return 'Basic access, standard rate limits';
    default:
      return 'Limited access, reduced rate limits';
  }
}
