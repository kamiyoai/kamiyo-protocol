import { expect } from "chai";
import {
  anchor,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  BN,
  getErrorCode,
} from "./helpers";

describe("Oracle Registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Kamiyo as anchor.Program<any>;

  let oracleRegistryPDA: PublicKey;
  const admin = Keypair.generate();
  const oracle1 = Keypair.generate();
  const oracle2 = Keypair.generate();

  before(async () => {
    const airdropSig = await provider.connection.requestAirdrop(
      admin.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const airdropSig2 = await provider.connection.requestAirdrop(
      oracle1.publicKey,
      3 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig2);

    const airdropSig3 = await provider.connection.requestAirdrop(
      oracle2.publicKey,
      3 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig3);

    [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_registry")],
      program.programId
    );
  });

  it("Initializes oracle registry", async () => {
    const minConsensus = 3;
    const maxScoreDeviation = 15;

    await program.methods
      .initializeOracleRegistry(minConsensus, maxScoreDeviation)
      .accounts({
        oracleRegistry: oracleRegistryPDA,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
    expect(registry.admin.toString()).to.equal(admin.publicKey.toString());
    expect(registry.minConsensus).to.equal(minConsensus);
    expect(registry.maxScoreDeviation).to.equal(maxScoreDeviation);
    expect(registry.oracles.length).to.equal(0);
  });

  it("Adds an oracle to registry", async () => {
    const oracleType = { ed25519: {} };
    const weight = 100;
    const stakeAmount = new BN(1 * LAMPORTS_PER_SOL);

    await program.methods
      .addOracle(oracle1.publicKey, oracleType, weight, stakeAmount)
      .accounts({
        oracleRegistry: oracleRegistryPDA,
        admin: admin.publicKey,
        oracleSigner: oracle1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin, oracle1])
      .rpc();

    const registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
    expect(registry.oracles.length).to.equal(1);
    expect(registry.oracles[0].pubkey.toString()).to.equal(oracle1.publicKey.toString());
    expect(registry.oracles[0].weight).to.equal(weight);
  });

  it("Removes an oracle from registry", async () => {
    const stakeAmount = new BN(1 * LAMPORTS_PER_SOL);
    await program.methods
      .addOracle(oracle2.publicKey, { ed25519: {} }, 50, stakeAmount)
      .accounts({
        oracleRegistry: oracleRegistryPDA,
        admin: admin.publicKey,
        oracleSigner: oracle2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin, oracle2])
      .rpc();

    let registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
    const initialCount = registry.oracles.length;

    await program.methods
      .removeOracle(oracle2.publicKey)
      .accounts({
        oracleRegistry: oracleRegistryPDA,
        admin: admin.publicKey,
        oracleWallet: oracle2.publicKey,
      })
      .signers([admin])
      .rpc();

    registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
    expect(registry.oracles.length).to.equal(initialCount - 1);
  });

  it("Non-admin cannot add oracle", async () => {
    const nonAdmin = Keypair.generate();
    const fakeOracle = Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      nonAdmin.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
    const airdropSig2 = await provider.connection.requestAirdrop(
      fakeOracle.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig2);

    try {
      await program.methods
        .addOracle(fakeOracle.publicKey, { ed25519: {} }, 100, new BN(1 * LAMPORTS_PER_SOL))
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: nonAdmin.publicKey,
          oracleSigner: fakeOracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([nonAdmin, fakeOracle])
        .rpc();
      expect.fail("Should have thrown Unauthorized error");
    } catch (err: any) {
      expect(getErrorCode(err)).to.equal("Unauthorized");
    }
  });
});
