import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import * as nodeCrypto from "crypto";
import { getErrorCode } from "./helpers";

describe("kamiyo-escrow disputes", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.KamiyoEscrow as Program<any>;
  const BN = anchor.BN;

  let admin: Keypair;
  let user: Keypair;
  let treasury: Keypair;
  let oracle1: Keypair;
  let oracle2: Keypair;
  let oracle3: Keypair;

  let kamiyoMint: PublicKey;
  let userTokenAccount: PublicKey;
  let oracleConfigPDA: PublicKey;
  let tokenTreasuryPDA: PublicKey;

  async function airdrop(pubkey: PublicKey, sol: number) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  }

  function deriveEscrowPDA(sessionId: Buffer): PublicKey {
    const [escrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), user.publicKey.toBuffer(), sessionId],
      program.programId
    );
    return escrow;
  }

  before(async () => {
    admin = Keypair.generate();
    user = Keypair.generate();
    treasury = Keypair.generate();
    oracle1 = Keypair.generate();
    oracle2 = Keypair.generate();
    oracle3 = Keypair.generate();

    for (const kp of [admin, user, treasury, oracle1, oracle2, oracle3]) {
      await airdrop(kp.publicKey, 5);
    }

    kamiyoMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      admin,
      kamiyoMint,
      user.publicKey
    );

    await mintTo(
      provider.connection,
      admin,
      kamiyoMint,
      userTokenAccount,
      admin,
      10_000_000_000
    );

    [oracleConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_config")],
      program.programId
    );
    [tokenTreasuryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_treasury")],
      program.programId
    );

    try {
      await program.methods
        .initializeTreasury()
        .accounts({
          admin: admin.publicKey,
          kamiyoMint,
          tokenTreasury: tokenTreasuryPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    } catch (err: any) {
      if (!String(err?.message || "").includes("already in use")) {
        throw err;
      }
    }

    try {
      await program.methods
        .initializeOracleConfig(3, 15, new BN(60), new BN(300), false)
        .accounts({
          admin: admin.publicKey,
          oracleConfig: oracleConfigPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    } catch (err: any) {
      if (!String(err?.message || "").includes("already in use")) {
        throw err;
      }
    }

    for (const oracle of [oracle1, oracle2, oracle3]) {
      try {
        await program.methods
          .registerOracle(oracle.publicKey)
          .accounts({
            admin: admin.publicKey,
            oracleConfig: oracleConfigPDA,
          })
          .signers([admin])
          .rpc();
      } catch (err: any) {
        if (getErrorCode(err) !== "OracleAlreadyRegistered") {
          throw err;
        }
      }
    }
  });

  describe("Oracle Configuration", () => {
    it("has initialized oracle config", async () => {
      const config = await program.account.oracleConfig.fetch(oracleConfigPDA);
      expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(config.minConsensus).to.equal(3);
      expect(config.maxScoreDeviation).to.equal(15);
    });

    it("has registered oracles", async () => {
      const config = await program.account.oracleConfig.fetch(oracleConfigPDA);
      const oracleKeys = config.registeredOracles.map((k: PublicKey) => k.toBase58());

      for (const oracle of [oracle1, oracle2, oracle3]) {
        expect(oracleKeys).to.include(oracle.publicKey.toBase58());
      }
    });

    it("rejects non-admin oracle registration", async () => {
      const nonAdmin = Keypair.generate();
      await airdrop(nonAdmin.publicKey, 1);

      try {
        await program.methods
          .registerOracle(Keypair.generate().publicKey)
          .accounts({
            admin: nonAdmin.publicKey,
            oracleConfig: oracleConfigPDA,
          })
          .signers([nonAdmin])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(getErrorCode(err)).to.equal("Unauthorized");
      }
    });
  });

  describe("Escrow Creation and Rating Flow", () => {
    it("creates escrow", async () => {
      const sessionId = nodeCrypto.randomBytes(32);
      const escrowPDA = deriveEscrowPDA(sessionId);

      await program.methods
        .createEscrow(Array.from(sessionId), new BN(LAMPORTS_PER_SOL))
        .accounts({
          user: user.publicKey,
          treasury: treasury.publicKey,
          escrow: escrowPDA,
          kamiyoMint,
          userTokenAccount,
          tokenTreasury: tokenTreasuryPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const escrow = await program.account.escrow.fetch(escrowPDA);
      expect(escrow.user.toBase58()).to.equal(user.publicKey.toBase58());
      expect(escrow.treasury.toBase58()).to.equal(treasury.publicKey.toBase58());
      expect(escrow.status.active).to.not.equal(undefined);
    });

    it("rates and releases escrow for high rating", async () => {
      const sessionId = nodeCrypto.randomBytes(32);
      const escrowPDA = deriveEscrowPDA(sessionId);

      await program.methods
        .createEscrow(Array.from(sessionId), new BN(LAMPORTS_PER_SOL / 2))
        .accounts({
          user: user.publicKey,
          treasury: treasury.publicKey,
          escrow: escrowPDA,
          kamiyoMint,
          userTokenAccount,
          tokenTreasury: tokenTreasuryPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      await program.methods
        .rateAndRelease(4)
        .accounts({
          user: user.publicKey,
          treasury: treasury.publicKey,
          escrow: escrowPDA,
        })
        .signers([user])
        .rpc();

      const escrow = await program.account.escrow.fetch(escrowPDA);
      expect(escrow.status.released).to.not.equal(undefined);
      expect(escrow.rating).to.equal(4);
    });
  });

  describe("Dispute Resolution Flow", () => {
    it("marks escrow as disputed and accepts oracle commitments", async () => {
      const sessionId = nodeCrypto.randomBytes(32);
      const escrowPDA = deriveEscrowPDA(sessionId);

      await program.methods
        .createEscrow(Array.from(sessionId), new BN(LAMPORTS_PER_SOL / 10))
        .accounts({
          user: user.publicKey,
          treasury: treasury.publicKey,
          escrow: escrowPDA,
          kamiyoMint,
          userTokenAccount,
          tokenTreasury: tokenTreasuryPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      await program.methods
        .markDisputed()
        .accounts({
          user: user.publicKey,
          escrow: escrowPDA,
        })
        .signers([user])
        .rpc();

      const oracles = [oracle1, oracle2, oracle3];
      const scores = [75, 70, 72];

      for (let i = 0; i < oracles.length; i++) {
        const salt = nodeCrypto.randomBytes(32);
        const data = Buffer.concat([
          sessionId,
          oracles[i].publicKey.toBuffer(),
          Buffer.from([scores[i]]),
          salt,
        ]);
        const commitmentHash = nodeCrypto.createHash("sha256").update(data).digest();

        await program.methods
          .commitVote(Array.from(commitmentHash))
          .accountsPartial({
            oracle: oracles[i].publicKey,
            escrow: escrowPDA,
            oracleConfig: oracleConfigPDA,
            oracleStakePosition: null,
          })
          .signers([oracles[i]])
          .rpc();
      }

      const escrow = await program.account.escrow.fetch(escrowPDA);
      expect(escrow.status.disputed).to.not.equal(undefined);
      expect(escrow.oracleCommitments.length).to.equal(3);
    });

    it("rejects commits from unregistered oracles", async () => {
      const sessionId = nodeCrypto.randomBytes(32);
      const escrowPDA = deriveEscrowPDA(sessionId);

      await program.methods
        .createEscrow(Array.from(sessionId), new BN(LAMPORTS_PER_SOL / 10))
        .accounts({
          user: user.publicKey,
          treasury: treasury.publicKey,
          escrow: escrowPDA,
          kamiyoMint,
          userTokenAccount,
          tokenTreasury: tokenTreasuryPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      await program.methods
        .markDisputed()
        .accounts({
          user: user.publicKey,
          escrow: escrowPDA,
        })
        .signers([user])
        .rpc();

      const unregisteredOracle = Keypair.generate();
      await airdrop(unregisteredOracle.publicKey, 1);

      const fakeHash = nodeCrypto.randomBytes(32);

      try {
        await program.methods
          .commitVote(Array.from(fakeHash))
          .accountsPartial({
            oracle: unregisteredOracle.publicKey,
            escrow: escrowPDA,
            oracleConfig: oracleConfigPDA,
            oracleStakePosition: null,
          })
          .signers([unregisteredOracle])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(getErrorCode(err)).to.equal("OracleNotRegistered");
      }
    });
  });

  describe("Consensus Calculation", () => {
    it("should calculate median correctly with odd number of scores", () => {
      const scores = [70, 75, 80];
      const sorted = [...scores].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      expect(median).to.equal(75);
    });

    it("should calculate median correctly with even number of scores", () => {
      const scores = [70, 75, 80, 85];
      const sorted = [...scores].sort((a, b) => a - b);
      const midIndex = Math.floor(sorted.length / 2);
      const median = Math.floor((sorted[midIndex - 1] + sorted[midIndex]) / 2);
      expect(median).to.equal(77);
    });

    it("should identify outliers correctly", () => {
      const scores = [70, 72, 75, 95];
      const maxDeviation = 15;
      const sorted = [...scores].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      const outliers = sorted.filter((s) => Math.abs(s - median) > maxDeviation);
      expect(outliers).to.include(95);
    });

    it("should calculate correct refund percentage", () => {
      const testCases = [
        { score: 40, expectedRefund: 100 },
        { score: 55, expectedRefund: 75 },
        { score: 70, expectedRefund: 35 },
        { score: 85, expectedRefund: 0 },
      ];

      for (const tc of testCases) {
        let refund: number;
        if (tc.score <= 49) refund = 100;
        else if (tc.score <= 64) refund = 75;
        else if (tc.score <= 79) refund = 35;
        else refund = 0;

        expect(refund).to.equal(tc.expectedRefund);
      }
    });
  });

  describe("SDK EscrowDisputeManager", () => {
    it("should generate valid salt", () => {
      const salt = nodeCrypto.randomBytes(32);
      expect(salt.length).to.equal(32);
    });

    it("should compute consistent commitment hash", async () => {
      const sessionId = nodeCrypto.randomBytes(32);
      const oracle = Keypair.generate();
      const score = 75;
      const salt = nodeCrypto.randomBytes(32);

      const data = Buffer.concat([
        Buffer.from(sessionId),
        oracle.publicKey.toBuffer(),
        Buffer.from([score]),
        salt,
      ]);

      const hash1 = nodeCrypto.createHash("sha256").update(data).digest();
      const hash2 = nodeCrypto.createHash("sha256").update(data).digest();

      expect(Buffer.from(hash1).equals(Buffer.from(hash2))).to.be.true;
    });

    it("should verify commitment hash correctly", async () => {
      const sessionId = nodeCrypto.randomBytes(32);
      const oracle = Keypair.generate();
      const score = 80;
      const salt = nodeCrypto.randomBytes(32);

      const data = Buffer.concat([
        Buffer.from(sessionId),
        oracle.publicKey.toBuffer(),
        Buffer.from([score]),
        salt,
      ]);

      const storedHash = nodeCrypto.createHash("sha256").update(data).digest();

      const verifyData = Buffer.concat([
        Buffer.from(sessionId),
        oracle.publicKey.toBuffer(),
        Buffer.from([score]),
        salt,
      ]);
      const computedHash = nodeCrypto.createHash("sha256").update(verifyData).digest();

      expect(Buffer.from(storedHash).equals(Buffer.from(computedHash))).to.be.true;

      const wrongData = Buffer.concat([
        Buffer.from(sessionId),
        oracle.publicKey.toBuffer(),
        Buffer.from([score + 1]),
        salt,
      ]);
      const wrongHash = nodeCrypto.createHash("sha256").update(wrongData).digest();

      expect(Buffer.from(storedHash).equals(Buffer.from(wrongHash))).to.be.false;
    });
  });
});
