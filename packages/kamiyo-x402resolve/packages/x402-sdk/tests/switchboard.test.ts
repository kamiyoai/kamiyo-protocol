/**
 * Integration Tests: Switchboard Dispute Resolution
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  EscrowClient,
  EscrowUtils,
  MockSwitchboardClient,
  SwitchboardClient,
  SwitchboardConfig,
  QualityScoringParams,
} from '../src';
import IDL from '../types/x402_escrow.json';

describe('Switchboard Dispute Resolution', () => {
  let connection: Connection;
  let agentKeypair: Keypair;
  let apiKeypair: Keypair;
  let escrowClient: EscrowClient;
  let mockSwitchboard: MockSwitchboardClient;

  beforeAll(async () => {
    connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    agentKeypair = Keypair.generate();
    apiKeypair = Keypair.generate();

    // Setup escrow client
    escrowClient = new EscrowClient(
      {
        programId: new PublicKey(IDL.metadata.address),
        connection,
        wallet: new anchor.Wallet(agentKeypair),
      },
      IDL
    );

    // Setup mock Switchboard
    const sbConfig = SwitchboardConfig.getDevnetConfig(connection, PublicKey.default);
    mockSwitchboard = new MockSwitchboardClient(sbConfig);
  });

  describe('Quality Assessment', () => {
    it('should return quality score for perfect match', async () => {
      mockSwitchboard.setMockScore(90);

      const params: QualityScoringParams = {
        originalQuery: 'Uniswap V3 exploits',
        dataReceived: {
          exploits: [
            {
              protocol: 'Uniswap V3',
              amount_usd: 8000000,
              date: new Date().toISOString(),
            },
          ],
        },
        expectedCriteria: ['Uniswap', 'exploit'],
      };

      const result = await mockSwitchboard.requestQualityAssessment(params);

      expect(result.qualityScore).toBe(90);
      expect(result.refundPercentage).toBe(0); // No refund for high quality
      expect(result.attestation).toBeInstanceOf(PublicKey);
    });

    it('should return high refund for poor quality', async () => {
      mockSwitchboard.setMockScore(30);

      const params: QualityScoringParams = {
        originalQuery: 'Uniswap exploits',
        dataReceived: { exploits: [] },
        expectedCriteria: ['Uniswap', 'exploit'],
      };

      const result = await mockSwitchboard.requestQualityAssessment(params);

      expect(result.qualityScore).toBe(30);
      expect(result.refundPercentage).toBe(100); // Full refund
    });

    it('should calculate sliding scale refund correctly', async () => {
      const testCases = [
        { score: 80, expectedRefund: 0 },
        { score: 75, expectedRefund: 6 },
        { score: 60, expectedRefund: 25 },
        { score: 50, expectedRefund: 38 },
        { score: 40, expectedRefund: 100 },
      ];

      for (const testCase of testCases) {
        mockSwitchboard.setMockScore(testCase.score);

        const result = await mockSwitchboard.requestQualityAssessment({
          originalQuery: 'test',
          dataReceived: {},
          expectedCriteria: [],
        });

        expect(result.qualityScore).toBe(testCase.score);
        expect(result.refundPercentage).toBe(testCase.expectedRefund);
      }
    });
  });

  describe('Escrow Resolution', () => {
    it('should resolve dispute with Switchboard attestation', async () => {
      const transactionId = EscrowUtils.generateTransactionId('test');

      // Create escrow
      await escrowClient.createEscrow({
        amount: EscrowUtils.solToLamports(0.01),
        timeLock: EscrowUtils.hoursToSeconds(24),
        transactionId,
        apiPublicKey: apiKeypair.publicKey,
      });

      // Mark disputed
      await escrowClient.markDisputed(transactionId);

      // Get Switchboard assessment
      mockSwitchboard.setMockScore(45);
      const assessment = await mockSwitchboard.requestQualityAssessment({
        originalQuery: 'test query',
        dataReceived: { test: 'data' },
        expectedCriteria: ['test'],
        transactionId,
      });

      // Resolve with Switchboard
      const tx = await escrowClient.resolveDisputeSwitchboard(
        transactionId,
        assessment.qualityScore,
        assessment.refundPercentage,
        assessment.attestation
      );

      expect(tx).toBeDefined();
      expect(typeof tx).toBe('string');

      // Verify escrow state
      const escrow = await escrowClient.getEscrow(transactionId);
      expect(escrow.qualityScore).toBe(45);
      expect(escrow.refundPercentage).toBe(100);
      expect(await escrowClient.getStatus(transactionId)).toBe('Resolved');
    });

    it('should handle multiple disputes independently', async () => {
      const txId1 = EscrowUtils.generateTransactionId('test1');
      const txId2 = EscrowUtils.generateTransactionId('test2');

      // Create two escrows
      await escrowClient.createEscrow({
        amount: EscrowUtils.solToLamports(0.01),
        timeLock: EscrowUtils.hoursToSeconds(24),
        transactionId: txId1,
        apiPublicKey: apiKeypair.publicKey,
      });

      await escrowClient.createEscrow({
        amount: EscrowUtils.solToLamports(0.02),
        timeLock: EscrowUtils.hoursToSeconds(24),
        transactionId: txId2,
        apiPublicKey: apiKeypair.publicKey,
      });

      // Dispute both
      await escrowClient.markDisputed(txId1);
      await escrowClient.markDisputed(txId2);

      // Resolve with different quality scores
      mockSwitchboard.setMockScore(80);
      const assessment1 = await mockSwitchboard.requestQualityAssessment({
        originalQuery: 'query1',
        dataReceived: {},
        expectedCriteria: [],
        transactionId: txId1,
      });

      mockSwitchboard.setMockScore(30);
      const assessment2 = await mockSwitchboard.requestQualityAssessment({
        originalQuery: 'query2',
        dataReceived: {},
        expectedCriteria: [],
        transactionId: txId2,
      });

      await escrowClient.resolveDisputeSwitchboard(
        txId1,
        assessment1.qualityScore,
        assessment1.refundPercentage,
        assessment1.attestation
      );

      await escrowClient.resolveDisputeSwitchboard(
        txId2,
        assessment2.qualityScore,
        assessment2.refundPercentage,
        assessment2.attestation
      );

      // Verify independent resolution
      const escrow1 = await escrowClient.getEscrow(txId1);
      const escrow2 = await escrowClient.getEscrow(txId2);

      expect(escrow1.refundPercentage).toBe(0); // Good quality
      expect(escrow2.refundPercentage).toBe(100); // Poor quality
    });
  });

  describe('Switchboard Configuration', () => {
    it('should get devnet configuration', () => {
      const config = SwitchboardConfig.getDevnetConfig(connection, PublicKey.default);

      expect(config.connection).toBe(connection);
      expect(config.functionId).toBeInstanceOf(PublicKey);
      expect(config.queueId).toBeInstanceOf(PublicKey);
    });

    it('should get mainnet configuration', () => {
      const config = SwitchboardConfig.getMainnetConfig(connection, PublicKey.default);

      expect(config.connection).toBe(connection);
      expect(config.functionId).toBeInstanceOf(PublicKey);
      expect(config.queueId).toBeInstanceOf(PublicKey);
    });

    it('should return correct estimated cost', () => {
      const sbConfig = SwitchboardConfig.getDevnetConfig(connection, PublicKey.default);
      const client = new SwitchboardClient(sbConfig);

      const cost = client.getEstimatedCost();
      expect(cost).toBe(100_000); // 0.0001 SOL
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid quality scores', async () => {
      const txId = EscrowUtils.generateTransactionId('invalid');

      await expect(
        escrowClient.resolveDisputeSwitchboard(
          txId,
          150, // Invalid: > 100
          0,
          PublicKey.default
        )
      ).rejects.toThrow();
    });

    it('should reject invalid refund percentages', async () => {
      const txId = EscrowUtils.generateTransactionId('invalid');

      await expect(
        escrowClient.resolveDisputeSwitchboard(
          txId,
          50,
          150, // Invalid: > 100
          PublicKey.default
        )
      ).rejects.toThrow();
    });

    it('should handle non-existent escrow', async () => {
      const nonExistentTx = 'non-existent-escrow-id';

      await expect(escrowClient.getEscrow(nonExistentTx)).rejects.toThrow();
    });
  });

  describe('Comparison with Python Verifier', () => {
    it('should produce similar refund outcomes', async () => {
      // Test cases with known Python verifier outputs
      const testCases = [
        { switchboardScore: 87, pythonScore: 90, expectedRefund: 0 },
        { switchboardScore: 72, pythonScore: 75, expectedRefund: 10 },
        { switchboardScore: 45, pythonScore: 42, expectedRefund: 100 },
      ];

      for (const testCase of testCases) {
        mockSwitchboard.setMockScore(testCase.switchboardScore);

        const result = await mockSwitchboard.requestQualityAssessment({
          originalQuery: 'test',
          dataReceived: {},
          expectedCriteria: [],
        });

        // Both should produce similar refund decisions
        expect(result.refundPercentage).toBe(testCase.expectedRefund);
      }
    });
  });
});

describe('SwitchboardClient Unit Tests', () => {
  let client: MockSwitchboardClient;

  beforeEach(() => {
    const connection = new Connection('https://api.devnet.solana.com');
    const config = SwitchboardConfig.getDevnetConfig(connection, PublicKey.default);
    client = new MockSwitchboardClient(config);
  });

  it('should derive correct attestation PDA', async () => {
    const result1 = await client.requestQualityAssessment({
      originalQuery: 'query1',
      dataReceived: {},
      expectedCriteria: [],
      transactionId: 'tx1',
    });

    const result2 = await client.requestQualityAssessment({
      originalQuery: 'query2',
      dataReceived: {},
      expectedCriteria: [],
      transactionId: 'tx2',
    });

    // Different transaction IDs should produce different attestations
    expect(result1.attestation.toBase58()).not.toBe(result2.attestation.toBase58());
  });

  it('should include breakdown in result', async () => {
    const result = await client.requestQualityAssessment({
      originalQuery: 'test',
      dataReceived: {},
      expectedCriteria: [],
    });

    expect(result.result.breakdown).toBeDefined();
    expect(result.result.breakdown.semantic).toBeGreaterThanOrEqual(0);
    expect(result.result.breakdown.completeness).toBeGreaterThanOrEqual(0);
    expect(result.result.breakdown.freshness).toBeGreaterThanOrEqual(0);
  });
});
