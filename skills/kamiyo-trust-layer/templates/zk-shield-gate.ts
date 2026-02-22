import { Keypair, PublicKey } from "@solana/web3.js";
import {
  PrivateReputation,
  Shield,
  CredentialManager,
  verifyCredential,
} from "@kamiyo/sdk";

export interface AccessGateInput {
  agent: PublicKey;
  threshold: number;
  stats: {
    successfulAgreements: number;
    totalAgreements: number;
    disputesWon: number;
    disputesLost: number;
  };
}

export function evaluateTrustAccess(input: AccessGateInput) {
  const rep = new PrivateReputation(input.agent);
  rep.setStats(input.stats);

  const proof = rep.prepareProof(input.threshold);
  if (!proof.meets) {
    return {
      allow: false,
      reason: "threshold_not_met",
      threshold: input.threshold,
      successRate: rep.getSuccessRate(),
    };
  }

  const shield = new Shield(input.agent);
  shield.setRep({
    successful: input.stats.successfulAgreements,
    total: input.stats.totalAgreements,
    disputesWon: input.stats.disputesWon,
    disputesLost: input.stats.disputesLost,
  });

  const blacklistRoot = Shield.emptySmtRoot();
  const credential = shield.issue(blacklistRoot, 3600);

  if (!verifyCredential(credential, blacklistRoot)) {
    return {
      allow: false,
      reason: "credential_invalid",
    };
  }

  const issuer = Keypair.generate();
  const credentials = new CredentialManager(issuer);
  const signed = credentials.issue(credential);

  return {
    allow: true,
    threshold: input.threshold,
    successRate: rep.getSuccessRate(),
    commitment: proof.commitment,
    signedCredential: signed,
  };
}
