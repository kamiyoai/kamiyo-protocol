/**
 * Tests for EscrowDisputeManager
 */

import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import BN from "bn.js";
import { EscrowDisputeManager } from "./escrow-dispute";
import {
  CompanionEscrow,
  CompanionEscrowStatus,
  COMPANION_ESCROW_REVEAL_PHASE_DURATION,
  QUALITY_REFUND_SCALE,
} from "./types";

// Mock wallet for testing
const mockWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: jest.fn(),
  signAllTransactions: jest.fn(),
};

// Mock connection
const mockConnection = {} as Connection;

describe("EscrowDisputeManager", () => {
  let manager: EscrowDisputeManager;

  beforeEach(() => {
    manager = new EscrowDisputeManager(mockConnection, mockWallet as any);
  });

  describe("generateSalt", () => {
    it("should generate 32-byte salt", () => {
      const salt = manager.generateSalt();
      expect(salt.length).toBe(32);
    });

    it("should generate unique salts", () => {
      const salt1 = manager.generateSalt();
      const salt2 = manager.generateSalt();
      expect(Buffer.from(salt1).equals(Buffer.from(salt2))).toBe(false);
    });
  });

  describe("computeCommitmentHash", () => {
    it("should compute consistent hash", async () => {
      const sessionId = new Uint8Array(32).fill(1);
      const oracle = Keypair.generate().publicKey;
      const score = 75;
      const salt = new Uint8Array(32).fill(2);

      const hash1 = await manager.computeCommitmentHash(sessionId, oracle, score, salt);
      const hash2 = await manager.computeCommitmentHash(sessionId, oracle, score, salt);

      expect(hash1.length).toBe(32);
      expect(Buffer.from(hash1).equals(Buffer.from(hash2))).toBe(true);
    });

    it("should produce different hash for different scores", async () => {
      const sessionId = new Uint8Array(32).fill(1);
      const oracle = Keypair.generate().publicKey;
      const salt = new Uint8Array(32).fill(2);

      const hash1 = await manager.computeCommitmentHash(sessionId, oracle, 75, salt);
      const hash2 = await manager.computeCommitmentHash(sessionId, oracle, 80, salt);

      expect(Buffer.from(hash1).equals(Buffer.from(hash2))).toBe(false);
    });

    it("should produce different hash for different salts", async () => {
      const sessionId = new Uint8Array(32).fill(1);
      const oracle = Keypair.generate().publicKey;
      const score = 75;

      const hash1 = await manager.computeCommitmentHash(
        sessionId,
        oracle,
        score,
        new Uint8Array(32).fill(1)
      );
      const hash2 = await manager.computeCommitmentHash(
        sessionId,
        oracle,
        score,
        new Uint8Array(32).fill(2)
      );

      expect(Buffer.from(hash1).equals(Buffer.from(hash2))).toBe(false);
    });
  });

  describe("Phase detection", () => {
    const createMockEscrow = (
      status: CompanionEscrowStatus,
      commitPhaseEndsAt: number | null
    ): CompanionEscrow => ({
      user: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
      sessionId: new Uint8Array(32),
      amount: new BN(100),
      createdAt: new BN(Date.now() / 1000 - 3600),
      bump: 255,
      status,
      rating: null,
      disputedAt: commitPhaseEndsAt ? new BN(commitPhaseEndsAt - 300) : null,
      commitPhaseEndsAt: commitPhaseEndsAt ? new BN(commitPhaseEndsAt) : null,
      oracleCommitments: [],
      oracleSubmissions: [],
      qualityScore: null,
      refundPercentage: null,
    });

    it("should detect commit phase", () => {
      const futureCommitEnd = Math.floor(Date.now() / 1000) + 60; // 60 seconds in future
      const escrow = createMockEscrow(CompanionEscrowStatus.Disputed, futureCommitEnd);

      expect(manager.isInCommitPhase(escrow)).toBe(true);
      expect(manager.isInRevealPhase(escrow)).toBe(false);
      expect(manager.isReadyForFinalization(escrow)).toBe(false);
    });

    it("should detect reveal phase", () => {
      const pastCommitEnd = Math.floor(Date.now() / 1000) - 60; // 60 seconds in past
      const escrow = createMockEscrow(CompanionEscrowStatus.Disputed, pastCommitEnd);

      expect(manager.isInCommitPhase(escrow)).toBe(false);
      expect(manager.isInRevealPhase(escrow)).toBe(true);
      expect(manager.isReadyForFinalization(escrow)).toBe(false);
    });

    it("should detect ready for finalization", () => {
      const pastRevealEnd =
        Math.floor(Date.now() / 1000) - COMPANION_ESCROW_REVEAL_PHASE_DURATION - 60;
      const escrow = createMockEscrow(CompanionEscrowStatus.Disputed, pastRevealEnd);

      expect(manager.isInCommitPhase(escrow)).toBe(false);
      expect(manager.isInRevealPhase(escrow)).toBe(false);
      expect(manager.isReadyForFinalization(escrow)).toBe(true);
    });

    it("should return false for non-disputed escrow", () => {
      const escrow = createMockEscrow(CompanionEscrowStatus.Active, null);

      expect(manager.isInCommitPhase(escrow)).toBe(false);
      expect(manager.isInRevealPhase(escrow)).toBe(false);
      expect(manager.isReadyForFinalization(escrow)).toBe(false);
    });

    it("should return correct phase time remaining", () => {
      const futureCommitEnd = Math.floor(Date.now() / 1000) + 120;
      const escrow = createMockEscrow(CompanionEscrowStatus.Disputed, futureCommitEnd);

      const result = manager.getPhaseTimeRemaining(escrow);
      expect(result.phase).toBe("commit");
      expect(result.remaining).toBeGreaterThan(100);
      expect(result.remaining).toBeLessThanOrEqual(120);
    });
  });

  describe("Consensus calculation", () => {
    it("should calculate median correctly with odd number of scores", () => {
      const submissions = [
        { oracle: Keypair.generate().publicKey, qualityScore: 70, submittedAt: new BN(0) },
        { oracle: Keypair.generate().publicKey, qualityScore: 75, submittedAt: new BN(0) },
        { oracle: Keypair.generate().publicKey, qualityScore: 80, submittedAt: new BN(0) },
      ];

      const result = manager.calculateConsensus(submissions);
      expect(result.medianScore).toBe(75);
      expect(result.validSubmissions.length).toBe(3);
      expect(result.outliers.length).toBe(0);
    });

    it("should calculate median correctly with even number of scores", () => {
      const submissions = [
        { oracle: Keypair.generate().publicKey, qualityScore: 70, submittedAt: new BN(0) },
        { oracle: Keypair.generate().publicKey, qualityScore: 74, submittedAt: new BN(0) },
        { oracle: Keypair.generate().publicKey, qualityScore: 76, submittedAt: new BN(0) },
        { oracle: Keypair.generate().publicKey, qualityScore: 80, submittedAt: new BN(0) },
      ];

      const result = manager.calculateConsensus(submissions);
      // Median of [70, 74, 76, 80] = (74 + 76) / 2 = 75
      expect(result.medianScore).toBe(75);
    });

    it("should identify outliers", () => {
      const oracle1 = Keypair.generate().publicKey;
      const oracle2 = Keypair.generate().publicKey;
      const oracle3 = Keypair.generate().publicKey;
      const oracle4 = Keypair.generate().publicKey;

      const submissions = [
        { oracle: oracle1, qualityScore: 70, submittedAt: new BN(0) },
        { oracle: oracle2, qualityScore: 72, submittedAt: new BN(0) },
        { oracle: oracle3, qualityScore: 75, submittedAt: new BN(0) },
        { oracle: oracle4, qualityScore: 95, submittedAt: new BN(0) }, // Outlier
      ];

      const result = manager.calculateConsensus(submissions);
      expect(result.outliers.length).toBe(1);
      expect(result.outliers[0].equals(oracle4)).toBe(true);
      expect(result.validSubmissions.length).toBe(3);
    });

    it("should throw with insufficient submissions", () => {
      const submissions = [
        { oracle: Keypair.generate().publicKey, qualityScore: 70, submittedAt: new BN(0) },
        { oracle: Keypair.generate().publicKey, qualityScore: 75, submittedAt: new BN(0) },
      ];

      expect(() => manager.calculateConsensus(submissions)).toThrow(
        "At least 3 submissions required"
      );
    });
  });

  describe("Refund percentage calculation", () => {
    it("should return 100% for poor quality (0-49)", () => {
      expect(manager.calculateRefundPercentage(0)).toBe(100);
      expect(manager.calculateRefundPercentage(25)).toBe(100);
      expect(manager.calculateRefundPercentage(49)).toBe(100);
    });

    it("should return 75% for below average quality (50-64)", () => {
      expect(manager.calculateRefundPercentage(50)).toBe(75);
      expect(manager.calculateRefundPercentage(55)).toBe(75);
      expect(manager.calculateRefundPercentage(64)).toBe(75);
    });

    it("should return 35% for average quality (65-79)", () => {
      expect(manager.calculateRefundPercentage(65)).toBe(35);
      expect(manager.calculateRefundPercentage(70)).toBe(35);
      expect(manager.calculateRefundPercentage(79)).toBe(35);
    });

    it("should return 0% for good quality (80-100)", () => {
      expect(manager.calculateRefundPercentage(80)).toBe(0);
      expect(manager.calculateRefundPercentage(90)).toBe(0);
      expect(manager.calculateRefundPercentage(100)).toBe(0);
    });
  });

  describe("Amount calculations", () => {
    it("should calculate correct refund and payment amounts", () => {
      const total = new BN(1000);

      const result100 = manager.calculateAmounts(total, 100);
      expect(result100.refundAmount.toNumber()).toBe(1000);
      expect(result100.paymentAmount.toNumber()).toBe(0);

      const result75 = manager.calculateAmounts(total, 75);
      expect(result75.refundAmount.toNumber()).toBe(750);
      expect(result75.paymentAmount.toNumber()).toBe(250);

      const result35 = manager.calculateAmounts(total, 35);
      expect(result35.refundAmount.toNumber()).toBe(350);
      expect(result35.paymentAmount.toNumber()).toBe(650);

      const result0 = manager.calculateAmounts(total, 0);
      expect(result0.refundAmount.toNumber()).toBe(0);
      expect(result0.paymentAmount.toNumber()).toBe(1000);
    });
  });

  describe("Status labels", () => {
    it("should return correct status labels", () => {
      expect(manager.getStatusLabel(CompanionEscrowStatus.Active)).toBe("Active");
      expect(manager.getStatusLabel(CompanionEscrowStatus.Disputed)).toBe("Disputed");
      expect(manager.getStatusLabel(CompanionEscrowStatus.Resolved)).toBe("Resolved");
      expect(manager.getStatusLabel(CompanionEscrowStatus.Released)).toBe("Released");
      expect(manager.getStatusLabel(CompanionEscrowStatus.Refunded)).toBe("Refunded");
    });
  });

  describe("Validation", () => {
    it("should validate quality score range", () => {
      expect(() => manager.validateQualityScore(0)).not.toThrow();
      expect(() => manager.validateQualityScore(50)).not.toThrow();
      expect(() => manager.validateQualityScore(100)).not.toThrow();

      expect(() => manager.validateQualityScore(-1)).toThrow();
      expect(() => manager.validateQualityScore(101)).toThrow();
      expect(() => manager.validateQualityScore(50.5)).toThrow();
    });

    it("should validate salt length", () => {
      expect(() => manager.validateSalt(new Uint8Array(32))).not.toThrow();
      expect(() => manager.validateSalt(new Uint8Array(31))).toThrow();
      expect(() => manager.validateSalt(new Uint8Array(33))).toThrow();
    });
  });

  describe("Commitment verification", () => {
    it("should verify correct commitment", async () => {
      const sessionId = new Uint8Array(32).fill(1);
      const oracle = Keypair.generate().publicKey;
      const score = 75;
      const salt = new Uint8Array(32).fill(2);

      const storedHash = await manager.computeCommitmentHash(sessionId, oracle, score, salt);
      const isValid = await manager.verifyCommitment(
        sessionId,
        oracle,
        score,
        salt,
        storedHash
      );

      expect(isValid).toBe(true);
    });

    it("should reject wrong score", async () => {
      const sessionId = new Uint8Array(32).fill(1);
      const oracle = Keypair.generate().publicKey;
      const correctScore = 75;
      const wrongScore = 80;
      const salt = new Uint8Array(32).fill(2);

      const storedHash = await manager.computeCommitmentHash(
        sessionId,
        oracle,
        correctScore,
        salt
      );
      const isValid = await manager.verifyCommitment(
        sessionId,
        oracle,
        wrongScore,
        salt,
        storedHash
      );

      expect(isValid).toBe(false);
    });

    it("should reject wrong salt", async () => {
      const sessionId = new Uint8Array(32).fill(1);
      const oracle = Keypair.generate().publicKey;
      const score = 75;
      const correctSalt = new Uint8Array(32).fill(2);
      const wrongSalt = new Uint8Array(32).fill(3);

      const storedHash = await manager.computeCommitmentHash(
        sessionId,
        oracle,
        score,
        correctSalt
      );
      const isValid = await manager.verifyCommitment(
        sessionId,
        oracle,
        score,
        wrongSalt,
        storedHash
      );

      expect(isValid).toBe(false);
    });
  });
});
