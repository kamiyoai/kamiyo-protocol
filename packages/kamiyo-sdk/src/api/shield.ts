import { PublicKey } from '@solana/web3.js';
import { Shield, RepData, SmtProof, ShieldProof, Credential, serialize } from '../shield';

export interface VerifyAgentRequest {
  agentPubkey: PublicKey;
  stats: RepData;
  threshold: number;
  blacklistRoot?: string;
  smtSiblings?: string[];
}

export interface VerifyAgentResponse {
  eligible: boolean;
  meetsThreshold: boolean;
  notBlacklisted: boolean;
  successRate: number;
  proof: {
    reputation: {
      commitment: string;
      threshold: number;
    };
    exclusion: {
      root: string;
      key: string;
    } | null;
  };
}

export interface IssueCredentialRequest {
  agentPubkey: PublicKey;
  stats: RepData;
  blacklistRoot: string;
  ttl?: number;
}

export interface IssueCredentialResponse {
  credential: {
    agentPk: string;
    repCommitment: string;
    blacklistRoot: string;
    issuedAt: number;
    expiresAt: number;
  };
  serialized: string;
}

export class ShieldAPI {
  private cache = new Map<string, Shield>();

  verifyAgent(req: VerifyAgentRequest): VerifyAgentResponse {
    const key = req.agentPubkey.toBase58();
    let shield = this.cache.get(key);
    if (!shield) {
      shield = new Shield(req.agentPubkey);
      this.cache.set(key, shield);
    }
    shield.setRep(req.stats);

    const meetsThreshold = shield.meetsThreshold(req.threshold);
    let notBlacklisted = true;
    let smtProof: SmtProof | undefined;

    if (req.blacklistRoot && req.smtSiblings) {
      const root = BigInt('0x' + req.blacklistRoot);
      const siblings = req.smtSiblings.map(s => BigInt('0x' + s));
      smtProof = Shield.exclusionProof(root, BigInt('0x' + Buffer.from(req.agentPubkey.toBytes()).toString('hex')), siblings);
    }

    const proof = shield.prove(req.threshold, smtProof);

    return {
      eligible: meetsThreshold && notBlacklisted,
      meetsThreshold,
      notBlacklisted,
      successRate: shield.successRate(),
      proof: {
        reputation: {
          commitment: proof.reputation.commitment.toString(16),
          threshold: proof.reputation.threshold,
        },
        exclusion: proof.exclusion ? {
          root: proof.exclusion.root.toString(16),
          key: proof.exclusion.key.toString(16),
        } : null,
      },
    };
  }

  issueCredential(req: IssueCredentialRequest): IssueCredentialResponse {
    const key = req.agentPubkey.toBase58();
    let shield = this.cache.get(key);
    if (!shield) {
      shield = new Shield(req.agentPubkey);
      this.cache.set(key, shield);
    }
    shield.setRep(req.stats);

    const cred = shield.issue(BigInt('0x' + req.blacklistRoot), req.ttl);
    const serialized = Buffer.from(serialize(cred)).toString('hex');

    return {
      credential: {
        agentPk: cred.agentPk.toString(16),
        repCommitment: cred.repCommitment.toString(16),
        blacklistRoot: cred.blacklistRoot.toString(16),
        issuedAt: cred.issuedAt,
        expiresAt: cred.expiresAt,
      },
      serialized,
    };
  }

  getEmptyBlacklist(): { root: string; siblings: string[] } {
    return {
      root: Shield.emptySmtRoot().toString(16),
      siblings: Shield.emptySmtSiblings().map(s => s.toString(16)),
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const shieldAPI = new ShieldAPI();
