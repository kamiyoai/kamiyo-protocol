import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";

export {
  anchor,
  Program,
  AnchorError,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  BN,
};

export function getErrorCode(err: any): string | null {
  if (err instanceof AnchorError) {
    return err.error?.errorCode?.code || null;
  }
  if (err?.error?.errorCode?.code) {
    return err.error.errorCode.code;
  }
  if (err?.logs) {
    for (const log of err.logs) {
      const match = log.match(/Error Code: (\w+)/);
      if (match) return match[1];
    }
  }
  if (err?.message) {
    const match = err.message.match(/Error Code: (\w+)/);
    if (match) return match[1];
  }
  if (err?.message?.includes('ConstraintHasOne') || err?.message?.includes('has_one')) {
    return "Unauthorized";
  }
  if (err?.error?.errorMessage) {
    return err.error.errorCode?.code || null;
  }
  return null;
}

export interface TestContext {
  provider: anchor.AnchorProvider;
  program: Program<any>;
  owner: Keypair;
  provider2: Keypair;
  protocolConfigPDA: PublicKey;
  treasuryPDA: PublicKey;
  oracleRegistryPDA: PublicKey;
}

export async function setupTestContext(): Promise<TestContext> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Kamiyo as Program<any>;
  const owner = Keypair.generate();
  const provider2 = Keypair.generate();

  const airdropSig = await provider.connection.requestAirdrop(
    owner.publicKey,
    10 * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(airdropSig);

  const airdropSig2 = await provider.connection.requestAirdrop(
    provider2.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(airdropSig2);

  const [protocolConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    program.programId
  );

  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );

  const [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    program.programId
  );

  try {
    await program.methods
      .initializeProtocol(provider2.publicKey, owner.publicKey)
      .accounts({
        protocolConfig: protocolConfigPDA,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  } catch (e) {}

  try {
    await program.methods
      .initializeTreasury()
      .accounts({
        treasury: treasuryPDA,
        admin: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  } catch (e) {}

  return {
    provider,
    program,
    owner,
    provider2,
    protocolConfigPDA,
    treasuryPDA,
    oracleRegistryPDA,
  };
}

export function deriveAgentPDA(program: Program<any>, owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    program.programId
  );
}

export function deriveEscrowPDA(program: Program<any>, owner: PublicKey, transactionId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), owner.toBuffer(), Buffer.from(transactionId)],
    program.programId
  );
}

export function deriveReputationPDA(program: Program<any>, entity: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), entity.toBuffer()],
    program.programId
  );
}
