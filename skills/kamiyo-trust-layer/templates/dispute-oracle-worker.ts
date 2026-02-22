import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { EscrowDisputeManager } from "@kamiyo/sdk";

export interface OracleWorkerConfig {
  rpcUrl: string;
  secretKey: Uint8Array;
}

export async function handleEscrowDispute(
  config: OracleWorkerConfig,
  escrowPda: PublicKey,
  qualityScore: number
) {
  const connection = new Connection(config.rpcUrl, "confirmed");
  const keypair = Keypair.fromSecretKey(config.secretKey);
  const wallet = new Wallet(keypair);

  const manager = new EscrowDisputeManager(connection, wallet);
  const escrow = await manager.fetchEscrow(escrowPda);

  if (!escrow) {
    throw new Error("escrow not found");
  }

  if (manager.isInCommitPhase(escrow)) {
    const commit = await manager.commitVoteWithScore(escrowPda, qualityScore);
    return {
      stage: "commit",
      signature: commit.result.signature,
      alreadyCommitted: commit.alreadyCommitted,
      salt: Buffer.from(commit.salt).toString("hex"),
    };
  }

  if (manager.isInRevealPhase(escrow)) {
    throw new Error("reveal phase active: provide the stored salt and call revealVote directly");
  }

  if (manager.isReadyForFinalization(escrow)) {
    const finalization = await manager.finalizeDispute(escrowPda);
    return {
      stage: "finalize",
      signature: finalization.signature,
      confirmed: finalization.confirmed,
    };
  }

  return {
    stage: "idle",
    message: "escrow is not in a processable dispute phase",
  };
}

export async function revealCommittedVote(
  config: OracleWorkerConfig,
  escrowPda: PublicKey,
  qualityScore: number,
  saltHex: string
) {
  const connection = new Connection(config.rpcUrl, "confirmed");
  const keypair = Keypair.fromSecretKey(config.secretKey);
  const wallet = new Wallet(keypair);
  const manager = new EscrowDisputeManager(connection, wallet);

  const salt = Uint8Array.from(Buffer.from(saltHex, "hex"));
  const reveal = await manager.revealVote(escrowPda, qualityScore, salt);

  return {
    stage: "reveal",
    signature: reveal.signature,
    confirmed: reveal.confirmed,
  };
}
