import { expect } from "chai";
import crypto from "crypto";
import * as nacl from "tweetnacl";
import { Ed25519Program } from "@solana/web3.js";
import {
  anchor,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  BN,
  getErrorCode,
} from "./helpers.ts";

function deriveMeishiPDA(
  program: any,
  agentIdentity: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("meishi"), agentIdentity.toBuffer()],
    program.programId
  );
}

function deriveKamiyoAgentPDA(
  kamiyoProgram: any,
  owner: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    kamiyoProgram.programId
  );
}

function deriveKamiyoOracleRegistryPDA(
  kamiyoProgram: any
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    kamiyoProgram.programId
  );
}

function deriveMandatePDA(
  program: any,
  passport: PublicKey,
  version: number
): [PublicKey, number] {
  const versionBuffer = Buffer.alloc(4);
  versionBuffer.writeUInt32LE(version);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mandate"), passport.toBuffer(), versionBuffer],
    program.programId
  );
}

function deriveAuditPDA(
  program: any,
  passport: PublicKey,
  nonce: number
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(4);
  nonceBuffer.writeUInt32LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("audit"), passport.toBuffer(), nonceBuffer],
    program.programId
  );
}

function deriveLiabilityPDA(
  program: any,
  passport: PublicKey,
  counterparty: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("liability"), passport.toBuffer(), counterparty.toBuffer()],
    program.programId
  );
}

function buildMandateMessageHash(params: {
  passport: PublicKey;
  version: number;
  spendingLimitUsd: any;
  dailyLimitUsd: any;
  monthlyLimitUsd: any;
  categoryWhitelist: number[];
  merchantWhitelistHash: number[];
  requiresHumanApprovalAbove: any;
  geoRestrictions: number;
  validFrom: any;
  validUntil: any;
}): Buffer {
  const parts = [
    Buffer.from("meishi-mandate-v1"),
    params.passport.toBuffer(),
    Buffer.alloc(4),
    params.spendingLimitUsd.toArrayLike(Buffer, "le", 8),
    params.dailyLimitUsd.toArrayLike(Buffer, "le", 8),
    params.monthlyLimitUsd.toArrayLike(Buffer, "le", 8),
    Buffer.from(params.categoryWhitelist),
    Buffer.from(params.merchantWhitelistHash),
    params.requiresHumanApprovalAbove.toArrayLike(Buffer, "le", 8),
    Buffer.from([params.geoRestrictions]),
    params.validFrom.toTwos(64).toArrayLike(Buffer, "le", 8),
    params.validUntil.toTwos(64).toArrayLike(Buffer, "le", 8),
  ];

  parts[2].writeUInt32LE(params.version, 0);
  return crypto.createHash("sha256").update(Buffer.concat(parts)).digest();
}

describe("Meishi Protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Meishi as any;
  const kamiyoProgram = anchor.workspace.Kamiyo as any;

  const owner = Keypair.generate();
  let agentIdentity: PublicKey;
  const oracle = Keypair.generate();
  const counterparty = Keypair.generate();
  const newPrincipal = Keypair.generate();

  let passportPDA: PublicKey;
  let passportBump: number;
  let oracleRegistryPDA: PublicKey;

  before(async () => {
    // Airdrop SOL to test accounts
    const airdropOwner = await provider.connection.requestAirdrop(
      owner.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropOwner);

    const airdropOracle = await provider.connection.requestAirdrop(
      oracle.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropOracle);

    const airdropCounterparty = await provider.connection.requestAirdrop(
      counterparty.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropCounterparty);

    [agentIdentity] = deriveKamiyoAgentPDA(kamiyoProgram, owner.publicKey);
    const stakeAmount = new BN(0.2 * LAMPORTS_PER_SOL);
    await kamiyoProgram.methods
      .createAgent("MeishiOwnerAgent", { service: {} }, stakeAmount)
      .accounts({
        agent: agentIdentity,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    [oracleRegistryPDA] = deriveKamiyoOracleRegistryPDA(kamiyoProgram);
    const existingRegistry = await kamiyoProgram.account.oracleRegistry
      .fetchNullable(oracleRegistryPDA)
      .catch(() => null);

    if (!existingRegistry) {
      await kamiyoProgram.methods
        .initializeOracleRegistry(3, 15)
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const ensureOracleRegistered = async (oracleSigner: Keypair) => {
      const registry = await kamiyoProgram.account.oracleRegistry.fetch(oracleRegistryPDA);
      if (registry.oracles.some((o: any) => o.pubkey.toString() === oracleSigner.publicKey.toString())) {
        return;
      }

      await kamiyoProgram.methods
        .addOracle(
          oracleSigner.publicKey,
          { ed25519: {} },
          100,
          new BN(500_000_000)
        )
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: provider.wallet.publicKey,
          oracleSigner: oracleSigner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([oracleSigner])
        .rpc();
    };

    await ensureOracleRegistered(owner);
    await ensureOracleRegistered(oracle);
    await ensureOracleRegistered(counterparty);

    [passportPDA, passportBump] = deriveMeishiPDA(program, agentIdentity);
  });


  describe("create_meishi", () => {
    it("creates a new passport", async () => {
      await program.methods
        .createMeishi(1) // EU jurisdiction
        .accounts({
          owner: owner.publicKey,
          agentIdentity,
          passport: passportPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.agentIdentity.toString()).to.equal(
        agentIdentity.toString()
      );
      expect(passport.issuer.toString()).to.equal(owner.publicKey.toString());
      expect(passport.principal.toString()).to.equal(owner.publicKey.toString());
      expect(passport.complianceScore).to.equal(0);
      expect(passport.suspended).to.be.false;
      expect(passport.mandateVersion).to.equal(0);
      expect(passport.totalTransactions.toNumber()).to.equal(0);
      expect(passport.disputesFiled).to.equal(0);

      // Kamon hash should not be all zeros
      expect(passport.kamonHash.some((b: number) => b !== 0)).to.be.true;
    });

    it("rejects invalid jurisdiction", async () => {
      const badAgent = Keypair.generate();
      const [badPDA] = deriveMeishiPDA(program, badAgent.publicKey);

      try {
        await program.methods
          .createMeishi(5) // Invalid
          .accounts({
            owner: owner.publicKey,
            agentIdentity: badAgent.publicKey,
            passport: badPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        const code = getErrorCode(err);
        expect(code).to.equal("InvalidJurisdiction");
      }
    });
  });


  describe("update_mandate", () => {
    it("creates a mandate for the passport", async () => {
      const slot = await provider.connection.getSlot();
      const blockTime = await provider.connection.getBlockTime(slot);
      const now = blockTime ?? Math.floor(Date.now() / 1000);
      const validFrom = now + 120; // well into the future to avoid MandateInPast
      const validUntil = now + 86400; // +24h

      // Passport mandate_version is 0, so new mandate version = 1
      const [mandatePDA] = deriveMandatePDA(program, passportPDA, 1);

      const categoryWhitelist = new Array(32).fill(0);
      categoryWhitelist[0] = 0xff; // categories 0-7 enabled
      const merchantWhitelistHash = new Array(32).fill(0);
      const messageHash = buildMandateMessageHash({
        passport: passportPDA,
        version: 1,
        spendingLimitUsd: new BN(1_000_000_000),
        dailyLimitUsd: new BN(5_000_000_000),
        monthlyLimitUsd: new BN(50_000_000_000),
        categoryWhitelist,
        merchantWhitelistHash,
        requiresHumanApprovalAbove: new BN(500_000_000),
        geoRestrictions: 0x03,
        validFrom: new BN(validFrom),
        validUntil: new BN(validUntil),
      });
      const signature = nacl.sign.detached(messageHash, owner.secretKey);
      const edIx = Ed25519Program.createInstructionWithPublicKey({
        publicKey: owner.publicKey.toBytes(),
        message: messageHash,
        signature,
      });

      await program.methods
        .updateMandate(
          new BN(1_000_000_000), // $1000 spending limit
          new BN(5_000_000_000), // $5000 daily
          new BN(50_000_000_000), // $50000 monthly
          categoryWhitelist,
          merchantWhitelistHash,
          new BN(500_000_000), // $500 human approval threshold
          0x03, // EU + US geo restrictions
          new BN(validFrom),
          new BN(validUntil),
          Array.from(signature)
        )
        .preInstructions([edIx])
        .accounts({
          principal: owner.publicKey,
          passport: passportPDA,
          mandate: mandatePDA,
          instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const mandate = await program.account.meishiMandate.fetch(mandatePDA);
      expect(mandate.meishi.toString()).to.equal(passportPDA.toString());
      expect(mandate.version).to.equal(1);
      expect(mandate.spendingLimitUsd.toNumber()).to.equal(1_000_000_000);
      expect(mandate.dailyLimitUsd.toNumber()).to.equal(5_000_000_000);
      expect(mandate.revoked).to.be.false;
      expect(mandate.geoRestrictions).to.equal(3);

      // Passport should be updated
      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.mandateVersion).to.equal(1);
      expect(passport.mandateExpires.toNumber()).to.equal(validUntil);
      expect(passport.mandateHash.some((b: number) => b !== 0)).to.be.true;
    });

    it("rejects spending limit hierarchy violation", async () => {
      const slot = await provider.connection.getSlot();
      const blockTime = await provider.connection.getBlockTime(slot);
      const ts = blockTime ?? Math.floor(Date.now() / 1000);
      const [mandatePDA] = deriveMandatePDA(program, passportPDA, 2);

      try {
        await program.methods
          .updateMandate(
            new BN(10_000_000_000), // per-tx > daily = invalid
            new BN(5_000_000_000),
            new BN(50_000_000_000),
            new Array(32).fill(0),
            new Array(32).fill(0),
            new BN(0),
            0,
            new BN(ts + 120),
            new BN(ts + 86400),
            Array.from(new Uint8Array(64))
          )
          .accounts({
            principal: owner.publicKey,
            passport: passportPDA,
            mandate: mandatePDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        const code = getErrorCode(err);
        expect(code).to.equal("InvalidSpendingHierarchy");
      }
    });

    it("rejects unauthorized mandate update", async () => {
      const unauthorized = Keypair.generate();
      const airdrop = await provider.connection.requestAirdrop(
        unauthorized.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop);

      const [mandatePDA] = deriveMandatePDA(program, passportPDA, 2);

      try {
        await program.methods
          .updateMandate(
            new BN(1_000_000_000),
            new BN(5_000_000_000),
            new BN(50_000_000_000),
            new Array(32).fill(0),
            new Array(32).fill(0),
            new BN(0),
            0,
            new BN(Math.floor(Date.now() / 1000) + 120),
            new BN(Math.floor(Date.now() / 1000) + 86400),
            Array.from(new Uint8Array(64))
          )
          .accounts({
            principal: unauthorized.publicKey,
            passport: passportPDA,
            mandate: mandatePDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorized])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        // Constraint error — Unauthorized
        expect(err).to.exist;
      }
    });
  });


  describe("revoke_mandate", () => {
    it("revokes the current mandate", async () => {
      const [mandatePDA] = deriveMandatePDA(program, passportPDA, 1);

      await program.methods
        .revokeMandate()
        .accounts({
          principal: owner.publicKey,
          passport: passportPDA,
          mandate: mandatePDA,
        })
        .signers([owner])
        .rpc();

      const mandate = await program.account.meishiMandate.fetch(mandatePDA);
      expect(mandate.revoked).to.be.true;
      expect(mandate.revokedAt.toNumber()).to.be.greaterThan(0);

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.mandateHash.every((b: number) => b === 0)).to.be.true;
      expect(passport.mandateExpires.toNumber()).to.equal(0);
    });

    it("rejects double revocation", async () => {
      const [mandatePDA] = deriveMandatePDA(program, passportPDA, 1);

      try {
        await program.methods
          .revokeMandate()
          .accounts({
            principal: owner.publicKey,
            passport: passportPDA,
            mandate: mandatePDA,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.exist;
      }
    });
  });


  describe("record_audit", () => {
    it("records an audit result", async () => {
      const [auditPDA] = deriveAuditPDA(program, passportPDA, 0);
      const findingsHash = new Array(32).fill(1);

      await program.methods
        .recordAudit(
          1, // Periodic audit
          500, // Score after
          findingsHash,
          "urn:kamiyo:meishi:audit:test-01",
          true // Passed
        )
        .accounts({
          oracle: owner.publicKey,
          passport: passportPDA,
          audit: auditPDA,
          oracleRegistry: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const audit = await program.account.meishiAudit.fetch(auditPDA);
      expect(audit.meishi.toString()).to.equal(passportPDA.toString());
      expect(audit.auditor.toString()).to.equal(owner.publicKey.toString());
      expect(audit.complianceScoreBefore).to.equal(0);
      expect(audit.complianceScoreAfter).to.equal(500);
      expect(audit.passed).to.be.true;
      expect(audit.findingsUal).to.equal("urn:kamiyo:meishi:audit:test-01");

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.auditNonce).to.equal(1);
      expect(passport.complianceScore).to.equal(500);
      expect(passport.lastAudit.toNumber()).to.be.greaterThan(0);
    });

    it("rejects invalid compliance score", async () => {
      const [auditPDA] = deriveAuditPDA(program, passportPDA, 1);

      try {
        await program.methods
          .recordAudit(0, 1500, new Array(32).fill(0), "", true)
          .accounts({
            oracle: owner.publicKey,
            passport: passportPDA,
            audit: auditPDA,
            oracleRegistry: null,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        const code = getErrorCode(err);
        expect(code).to.equal("InvalidComplianceScore");
      }
    });

    it("rejects non-authority oracle without registry proof", async () => {
      const [auditPDA] = deriveAuditPDA(program, passportPDA, 1);

      try {
        await program.methods
          .recordAudit(0, 520, new Array(32).fill(7), "urn:kamiyo:meishi:audit:test-02", true)
          .accounts({
            oracle: oracle.publicKey,
            passport: passportPDA,
            audit: auditPDA,
            oracleRegistry: null,
            systemProgram: SystemProgram.programId,
          })
          .signers([oracle])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        const code = getErrorCode(err);
        expect(code).to.equal("OracleRegistryMissing");
      }
    });

    it("accepts registered oracle quorum with registry cosigners", async () => {
      const [auditPDA] = deriveAuditPDA(program, passportPDA, 1);

      await program.methods
        .recordAudit(2, 520, new Array(32).fill(9), "urn:kamiyo:meishi:audit:test-03", true)
        .accounts({
          oracle: oracle.publicKey,
          passport: passportPDA,
          audit: auditPDA,
          oracleRegistry: oracleRegistryPDA,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: owner.publicKey, isSigner: true, isWritable: false },
          { pubkey: counterparty.publicKey, isSigner: true, isWritable: false },
        ])
        .signers([oracle, owner, counterparty])
        .rpc();

      const audit = await program.account.meishiAudit.fetch(auditPDA);
      expect(audit.auditor.toString()).to.equal(oracle.publicKey.toString());
      expect(audit.complianceScoreAfter).to.equal(520);
    });
  });


  describe("update_compliance_score", () => {
    it("updates the compliance score", async () => {
      await program.methods
        .updateComplianceScore(750)
        .accounts({
          oracle: owner.publicKey,
          passport: passportPDA,
          oracleRegistry: null,
        })
        .signers([owner])
        .rpc();

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.complianceScore).to.equal(750);
    });

    it("auto-suspends on critical score drop", async () => {
      await program.methods
        .updateComplianceScore(-600)
        .accounts({
          oracle: owner.publicKey,
          passport: passportPDA,
          oracleRegistry: null,
        })
        .signers([owner])
        .rpc();

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.complianceScore).to.equal(-600);
      expect(passport.suspended).to.be.true;
    });

    it("rejects registered oracle update when quorum is insufficient", async () => {
      try {
        await program.methods
          .updateComplianceScore(100)
          .accounts({
            oracle: oracle.publicKey,
            passport: passportPDA,
            oracleRegistry: oracleRegistryPDA,
          })
          .remainingAccounts([
            { pubkey: owner.publicKey, isSigner: true, isWritable: false },
          ])
          .signers([oracle, owner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        const code = getErrorCode(err);
        expect(code).to.equal("OracleConsensusInsufficient");
      }
    });

    it("allows registered oracle update with quorum signers", async () => {
      await program.methods
        .updateComplianceScore(640)
        .accounts({
          oracle: oracle.publicKey,
          passport: passportPDA,
          oracleRegistry: oracleRegistryPDA,
        })
        .remainingAccounts([
          { pubkey: owner.publicKey, isSigner: true, isWritable: false },
          { pubkey: counterparty.publicKey, isSigner: true, isWritable: false },
        ])
        .signers([oracle, owner, counterparty])
        .rpc();

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.complianceScore).to.equal(640);
    });
  });


  describe("suspend_meishi / unsuspend_meishi", () => {
    it("unsuspends a passport", async () => {
      // Already suspended from auto-suspend test above
      await program.methods
        .unsuspendMeishi()
        .accounts({
          authority: owner.publicKey,
          passport: passportPDA,
        })
        .signers([owner])
        .rpc();

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.suspended).to.be.false;
    });

    it("suspends a passport manually", async () => {
      await program.methods
        .suspendMeishi(2) // FraudDetected
        .accounts({
          authority: owner.publicKey,
          passport: passportPDA,
        })
        .signers([owner])
        .rpc();

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.suspended).to.be.true;
    });

    it("rejects unsuspend when not suspended", async () => {
      // First unsuspend
      await program.methods
        .unsuspendMeishi()
        .accounts({
          authority: owner.publicKey,
          passport: passportPDA,
        })
        .signers([owner])
        .rpc();

      // Then try again
      try {
        await program.methods
          .unsuspendMeishi()
          .accounts({
            authority: owner.publicKey,
            passport: passportPDA,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.exist;
      }
    });
  });


  describe("record_transaction", () => {
    it("records a clean transaction", async () => {
      await program.methods
        .recordTransaction(
          new BN(150_000_000), // $150 in micro-USD
          false, // not disputed
          false // not lost
        )
        .accounts({
          authority: owner.publicKey,
          passport: passportPDA,
        })
        .signers([owner])
        .rpc();

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.totalTransactions.toNumber()).to.equal(1);
      expect(passport.totalVolumeUsd.toNumber()).to.equal(150_000_000);
      expect(passport.disputesFiled).to.equal(0);
    });

    it("records a disputed transaction", async () => {
      await program.methods
        .recordTransaction(new BN(200_000_000), true, true)
        .accounts({
          authority: owner.publicKey,
          passport: passportPDA,
        })
        .signers([owner])
        .rpc();

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.totalTransactions.toNumber()).to.equal(2);
      expect(passport.totalVolumeUsd.toNumber()).to.equal(350_000_000);
      expect(passport.disputesFiled).to.equal(1);
      expect(passport.disputesLost).to.equal(1);
    });

    it("rejects dispute_lost without disputed", async () => {
      try {
        await program.methods
          .recordTransaction(new BN(100_000_000), false, true)
          .accounts({
            authority: owner.publicKey,
            passport: passportPDA,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        const code = getErrorCode(err);
        expect(code).to.equal("InvalidDisputeState");
      }
    });
  });


  describe("set_liability_allocation", () => {
    it("creates a liability allocation", async () => {
      const [liabilityPDA] = deriveLiabilityPDA(
        program,
        passportPDA,
        counterparty.publicKey
      );
      const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days

      await program.methods
        .setLiabilityAllocation(
          3000, // consumer 30%
          2000, // developer 20%
          3000, // merchant 30%
          2000, // platform 20%
          new BN(10_000_000_000), // $10K max liability
          new BN(expiresAt)
        )
        .accounts({
          agentOwner: owner.publicKey,
          counterparty: counterparty.publicKey,
          passport: passportPDA,
          arbitrationOracle: oracle.publicKey,
          liability: liabilityPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner, counterparty])
        .rpc();

      const liability = await program.account.liabilityAllocation.fetch(
        liabilityPDA
      );
      expect(liability.consumerLiabilityBps).to.equal(3000);
      expect(liability.developerLiabilityBps).to.equal(2000);
      expect(liability.merchantLiabilityBps).to.equal(3000);
      expect(liability.platformLiabilityBps).to.equal(2000);
      expect(liability.arbitrationOracle.toString()).to.equal(
        oracle.publicKey.toString()
      );
    });

    it("rejects unbalanced liability allocation", async () => {
      const otherCounterparty = Keypair.generate();
      const airdrop = await provider.connection.requestAirdrop(
        otherCounterparty.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop);

      const [liabilityPDA] = deriveLiabilityPDA(
        program,
        passportPDA,
        otherCounterparty.publicKey
      );

      try {
        await program.methods
          .setLiabilityAllocation(
            3000,
            2000,
            3000,
            1000, // total = 9000 != 10000
            new BN(10_000_000_000),
            new BN(Math.floor(Date.now() / 1000) + 86400)
          )
          .accounts({
            agentOwner: owner.publicKey,
            counterparty: otherCounterparty.publicKey,
            passport: passportPDA,
            arbitrationOracle: oracle.publicKey,
            liability: liabilityPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner, otherCounterparty])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        const code = getErrorCode(err);
        expect(code).to.equal("LiabilityBpsMismatch");
      }
    });
  });


  describe("transfer_principal", () => {
    it("transfers principal to a new address", async () => {
      await program.methods
        .transferPrincipal()
        .accounts({
          currentPrincipal: owner.publicKey,
          passport: passportPDA,
          newPrincipal: newPrincipal.publicKey,
        })
        .signers([owner])
        .rpc();

      const passport = await program.account.meishiPassport.fetch(passportPDA);
      expect(passport.principal.toString()).to.equal(
        newPrincipal.publicKey.toString()
      );
    });

    it("old principal can no longer update mandate", async () => {
      const [mandatePDA] = deriveMandatePDA(program, passportPDA, 2);
      const now = Math.floor(Date.now() / 1000);

      try {
        await program.methods
          .updateMandate(
            new BN(1_000_000_000),
            new BN(5_000_000_000),
            new BN(50_000_000_000),
            new Array(32).fill(0),
            new Array(32).fill(0),
            new BN(0),
            0,
            new BN(now + 10),
            new BN(now + 86400),
            Array.from(new Uint8Array(64))
          )
          .accounts({
            principal: owner.publicKey,
            passport: passportPDA,
            mandate: mandatePDA,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.exist;
      }
    });
  });


  describe("PDA derivation", () => {
    it("passport PDA is deterministic", () => {
      const [pda1] = deriveMeishiPDA(program, agentIdentity);
      const [pda2] = deriveMeishiPDA(program, agentIdentity);
      expect(pda1.toString()).to.equal(pda2.toString());
    });

    it("different agents get different PDAs", () => {
      const other = Keypair.generate();
      const [pda1] = deriveMeishiPDA(program, agentIdentity);
      const [pda2] = deriveMeishiPDA(program, other.publicKey);
      expect(pda1.toString()).to.not.equal(pda2.toString());
    });

    it("mandate PDA includes version", () => {
      const [v1] = deriveMandatePDA(program, passportPDA, 1);
      const [v2] = deriveMandatePDA(program, passportPDA, 2);
      expect(v1.toString()).to.not.equal(v2.toString());
    });

    it("liability PDA includes counterparty", () => {
      const cp1 = Keypair.generate();
      const cp2 = Keypair.generate();
      const [l1] = deriveLiabilityPDA(program, passportPDA, cp1.publicKey);
      const [l2] = deriveLiabilityPDA(program, passportPDA, cp2.publicKey);
      expect(l1.toString()).to.not.equal(l2.toString());
    });
  });
});
