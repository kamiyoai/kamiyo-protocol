/**
 * Tests for Quality Oracle
 */

import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import BN from "bn.js";
import {
  QualityOracle,
  ServiceSpec,
  ServiceResponse,
  createServiceSpec,
} from "./quality-oracle";
import { CompanionEscrow, CompanionEscrowStatus } from "./types";

// Mock wallet
const mockWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: jest.fn(),
  signAllTransactions: jest.fn(),
};

// Mock connection
const mockConnection = {} as Connection;

describe("QualityOracle", () => {
  let oracle: QualityOracle;

  beforeEach(() => {
    oracle = new QualityOracle(mockConnection, mockWallet);
  });

  describe("assessQuality", () => {
    const spec: ServiceSpec = {
      schema: {
        name: { type: "string", required: true },
        value: { type: "number", required: true },
        optional: { type: "string", required: false },
      },
      requiredFields: ["name", "value"],
      optionalFields: ["optional"],
      expectedValues: { value: 100 },
      tolerance: { value: 5 },
      maxResponseTime: 1000,
      maxDataAge: 3600,
    };

    it("should assess high quality response", () => {
      const response: ServiceResponse = {
        data: { name: "test", value: 100, optional: "extra" },
        responseTimeMs: 200,
        dataTimestamp: Math.floor(Date.now() / 1000),
      };

      const report = oracle.assessQuality(response, spec);

      expect(report.overallScore).toBeGreaterThan(80);
      expect(report.passed).toBe(true);
      expect(report.assessment.schemaCompliance).toBe(100);
      expect(report.assessment.completeness).toBe(100);
      expect(report.assessment.factualAccuracy).toBe(100);
    });

    it("should penalize slow response", () => {
      const response: ServiceResponse = {
        data: { name: "test", value: 100 },
        responseTimeMs: 5000,
        dataTimestamp: Math.floor(Date.now() / 1000),
      };

      const report = oracle.assessQuality(response, spec);

      expect(report.breakdown.responseTime.raw).toBeLessThan(50);
    });

    it("should penalize stale data", () => {
      const response: ServiceResponse = {
        data: { name: "test", value: 100 },
        responseTimeMs: 200,
        dataTimestamp: Math.floor(Date.now() / 1000) - 7200, // 2 hours old
      };

      const report = oracle.assessQuality(response, spec);

      expect(report.assessment.freshness).toBe(0);
    });

    it("should penalize schema violations", () => {
      const response: ServiceResponse = {
        data: { name: 123, value: "not a number" }, // Wrong types
        responseTimeMs: 200,
        dataTimestamp: Math.floor(Date.now() / 1000),
      };

      const report = oracle.assessQuality(response, spec);

      expect(report.assessment.schemaCompliance).toBeLessThan(100);
    });

    it("should penalize missing required fields", () => {
      const response: ServiceResponse = {
        data: { name: "test" }, // Missing value
        responseTimeMs: 200,
        dataTimestamp: Math.floor(Date.now() / 1000),
      };

      const report = oracle.assessQuality(response, spec);

      expect(report.assessment.completeness).toBeLessThan(100);
    });

    it("should penalize factual inaccuracy", () => {
      const response: ServiceResponse = {
        data: { name: "test", value: 50 }, // Expected 100
        responseTimeMs: 200,
        dataTimestamp: Math.floor(Date.now() / 1000),
      };

      const report = oracle.assessQuality(response, spec);

      expect(report.assessment.factualAccuracy).toBe(0);
    });
  });

  describe("generateVote", () => {
    it("should generate valid vote", async () => {
      const escrowPda = Keypair.generate().publicKey;
      const sessionId = new Uint8Array(32).fill(1);

      const spec: ServiceSpec = {
        schema: { data: { type: "string", required: true } },
        requiredFields: ["data"],
      };

      const response: ServiceResponse = {
        data: { data: "test" },
        responseTimeMs: 100,
      };

      const vote = await oracle.generateVote(escrowPda, sessionId, response, spec);

      expect(vote.escrowPda.equals(escrowPda)).toBe(true);
      expect(vote.qualityScore).toBeGreaterThanOrEqual(0);
      expect(vote.qualityScore).toBeLessThanOrEqual(100);
      expect(vote.salt.length).toBe(32);
      expect(vote.commitmentHash.length).toBe(32);
      expect(vote.report).toBeDefined();
    });
  });

  describe("shouldVote", () => {
    const createMockEscrow = (
      status: CompanionEscrowStatus,
      commitPhaseEndsAt: number | null,
      hasCommitted: boolean = false
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
      oracleCommitments: hasCommitted
        ? [
            {
              oracle: mockWallet.publicKey,
              commitmentHash: new Uint8Array(32),
              committedAt: new BN(0),
              revealed: false,
            },
          ]
        : [],
      oracleSubmissions: [],
      qualityScore: null,
      refundPercentage: null,
    });

    it("should allow voting in commit phase", () => {
      const futureEnd = Math.floor(Date.now() / 1000) + 300;
      const escrow = createMockEscrow(CompanionEscrowStatus.Disputed, futureEnd);

      const result = oracle.shouldVote(escrow);
      expect(result.should).toBe(true);
    });

    it("should reject voting for non-disputed escrow", () => {
      const escrow = createMockEscrow(CompanionEscrowStatus.Active, null);

      const result = oracle.shouldVote(escrow);
      expect(result.should).toBe(false);
      expect(result.reason).toContain("not disputed");
    });

    it("should reject voting after commit phase", () => {
      const pastEnd = Math.floor(Date.now() / 1000) - 60;
      const escrow = createMockEscrow(CompanionEscrowStatus.Disputed, pastEnd);

      const result = oracle.shouldVote(escrow);
      expect(result.should).toBe(false);
      expect(result.reason).toContain("commit phase");
    });

    it("should reject voting if already committed", () => {
      const futureEnd = Math.floor(Date.now() / 1000) + 300;
      const escrow = createMockEscrow(CompanionEscrowStatus.Disputed, futureEnd, true);

      const result = oracle.shouldVote(escrow);
      expect(result.should).toBe(false);
      expect(result.reason).toContain("Already committed");
    });
  });

  describe("filterPendingDisputes", () => {
    const createTestEscrow = (
      status: CompanionEscrowStatus,
      disputedAt: BN | null,
      commitPhaseEndsAt: BN | null
    ): CompanionEscrow => ({
      user: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
      sessionId: new Uint8Array(32),
      amount: new BN(100),
      createdAt: new BN(Date.now() / 1000 - 3600),
      bump: 255,
      status,
      rating: null,
      disputedAt,
      commitPhaseEndsAt,
      oracleCommitments: [],
      oracleSubmissions: [],
      qualityScore: null,
      refundPercentage: null,
    });

    it("should filter and sort disputes", () => {
      const now = Math.floor(Date.now() / 1000);

      const escrows = [
        {
          pda: Keypair.generate().publicKey,
          escrow: createTestEscrow(
            CompanionEscrowStatus.Disputed,
            new BN(now - 100),
            new BN(now + 200)
          ),
        },
        {
          pda: Keypair.generate().publicKey,
          escrow: createTestEscrow(
            CompanionEscrowStatus.Active,
            null,
            null
          ),
        },
        {
          pda: Keypair.generate().publicKey,
          escrow: createTestEscrow(
            CompanionEscrowStatus.Disputed,
            new BN(now - 50),
            new BN(now + 100)
          ),
        },
      ];

      const pending = oracle.filterPendingDisputes(escrows);

      expect(pending.length).toBe(2);
      // Should be sorted by commit phase ending soonest
      expect(pending[0].commitPhaseEndsAt).toBe(now + 100);
      expect(pending[1].commitPhaseEndsAt).toBe(now + 200);
    });
  });

  describe("estimateOutcome", () => {
    it("should estimate user wins for poor quality", () => {
      const report = {
        overallScore: 30,
        passed: false,
      } as any;

      const result = oracle.estimateOutcome(report, new BN(1000));

      expect(result.verdict).toBe("user_wins");
      expect(result.refundPercentage).toBe(100);
      expect(result.refundAmount.toNumber()).toBe(1000);
      expect(result.paymentAmount.toNumber()).toBe(0);
    });

    it("should estimate provider wins for good quality", () => {
      const report = {
        overallScore: 90,
        passed: true,
      } as any;

      const result = oracle.estimateOutcome(report, new BN(1000));

      expect(result.verdict).toBe("provider_wins");
      expect(result.refundPercentage).toBe(0);
      expect(result.refundAmount.toNumber()).toBe(0);
      expect(result.paymentAmount.toNumber()).toBe(1000);
    });

    it("should estimate partial for medium quality", () => {
      const report = {
        overallScore: 60,
        passed: false,
      } as any;

      const result = oracle.estimateOutcome(report, new BN(1000));

      expect(result.verdict).toBe("partial");
      expect(result.refundPercentage).toBe(75);
      expect(result.refundAmount.toNumber()).toBe(750);
      expect(result.paymentAmount.toNumber()).toBe(250);
    });
  });

  describe("configuration", () => {
    it("should allow setting weights", () => {
      const newWeights = {
        factualAccuracy: 0.5,
        schemaCompliance: 0.2,
        completeness: 0.2,
        freshness: 0.05,
        responseTime: 0.05,
      };

      oracle.setWeights(newWeights);
      const config = oracle.getConfig();

      expect(config.weights).toEqual(newWeights);
    });

    it("should allow setting threshold", () => {
      oracle.setThreshold(80);
      const config = oracle.getConfig();

      expect(config.threshold).toBe(80);
    });

    it("should reject invalid threshold", () => {
      expect(() => oracle.setThreshold(-1)).toThrow();
      expect(() => oracle.setThreshold(101)).toThrow();
    });
  });
});

describe("createServiceSpec", () => {
  it("should create valid spec", () => {
    const spec = createServiceSpec({
      fields: {
        name: { type: "string", required: true },
        age: { type: "number", required: false },
      },
      expectedValues: { name: "test" },
      maxResponseTime: 1000,
    });

    expect(spec.schema.name.type).toBe("string");
    expect(spec.schema.name.required).toBe(true);
    expect(spec.requiredFields).toContain("name");
    expect(spec.optionalFields).toContain("age");
    expect(spec.expectedValues).toEqual({ name: "test" });
  });
});
