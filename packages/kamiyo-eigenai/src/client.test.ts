import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { KamiyoEigenAI } from './client';
import { EigenAIError, LIMITS } from './types';

describe('KamiyoEigenAI', () => {
  const mockConnection = {
    getBalance: jest.fn().mockResolvedValue(1_000_000_000),
    getAccountInfo: jest.fn().mockResolvedValue(null),
  } as unknown as Connection;

  const mockWallet = Keypair.generate();
  const mockProgramId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

  describe('constructor', () => {
    it('throws on missing API key', () => {
      expect(
        () =>
          new KamiyoEigenAI({
            eigenAiApiKey: '',
            connection: mockConnection,
            wallet: mockWallet,
            programId: mockProgramId,
          })
      ).toThrow(EigenAIError);
    });

    it('creates client with valid config', () => {
      const client = new KamiyoEigenAI({
        eigenAiApiKey: 'test-key',
        connection: mockConnection,
        wallet: mockWallet,
        programId: mockProgramId,
      });
      expect(client).toBeInstanceOf(KamiyoEigenAI);
    });

    it('uses default values', () => {
      const client = new KamiyoEigenAI({
        eigenAiApiKey: 'test-key',
        connection: mockConnection,
        wallet: mockWallet,
        programId: mockProgramId,
      });
      expect(client.getActiveEscrows()).toEqual([]);
    });
  });

  describe('input validation', () => {
    let client: KamiyoEigenAI;

    beforeEach(() => {
      client = new KamiyoEigenAI({
        eigenAiApiKey: 'test-key',
        connection: mockConnection,
        wallet: mockWallet,
        programId: mockProgramId,
      });
    });

    it('rejects empty messages', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [],
          escrowAmount: 0.01,
        })
      ).rejects.toThrow('At least one message is required');
    });

    it('rejects too many messages', async () => {
      const messages = Array(LIMITS.MAX_MESSAGES + 1).fill({
        role: 'user' as const,
        content: 'test',
      });
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages,
          escrowAmount: 0.01,
        })
      ).rejects.toThrow(`Maximum ${LIMITS.MAX_MESSAGES} messages`);
    });

    it('rejects message too long', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'x'.repeat(LIMITS.MAX_MESSAGE_LENGTH + 1) }],
          escrowAmount: 0.01,
        })
      ).rejects.toThrow(`exceeds ${LIMITS.MAX_MESSAGE_LENGTH}`);
    });

    it('rejects escrow amount too small', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'test' }],
          escrowAmount: 0.0001,
        })
      ).rejects.toThrow(`Minimum ${LIMITS.MIN_ESCROW_SOL}`);
    });

    it('rejects escrow amount too large', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'test' }],
          escrowAmount: LIMITS.MAX_ESCROW_SOL + 1,
        })
      ).rejects.toThrow(`Maximum ${LIMITS.MAX_ESCROW_SOL}`);
    });

    it('rejects time lock too short', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'test' }],
          escrowAmount: 0.01,
          timeLockSeconds: 10,
        })
      ).rejects.toThrow(`Minimum ${LIMITS.MIN_TIME_LOCK_SECONDS}`);
    });

    it('rejects time lock too long', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'test' }],
          escrowAmount: 0.01,
          timeLockSeconds: LIMITS.MAX_TIME_LOCK_SECONDS + 1,
        })
      ).rejects.toThrow(`Maximum ${LIMITS.MAX_TIME_LOCK_SECONDS}`);
    });

    it('rejects timeout too short', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'test' }],
          escrowAmount: 0.01,
          timeoutMs: 100,
        })
      ).rejects.toThrow(`Minimum ${LIMITS.MIN_TIMEOUT_MS}`);
    });

    it('rejects timeout too long', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'test' }],
          escrowAmount: 0.01,
          timeoutMs: LIMITS.MAX_TIMEOUT_MS + 1,
        })
      ).rejects.toThrow(`Maximum ${LIMITS.MAX_TIMEOUT_MS}`);
    });

    it('rejects transaction ID too long', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'test' }],
          escrowAmount: 0.01,
          transactionId: 'x'.repeat(LIMITS.MAX_TRANSACTION_ID_LENGTH + 1),
        })
      ).rejects.toThrow(`Maximum ${LIMITS.MAX_TRANSACTION_ID_LENGTH}`);
    });

    it('rejects invalid quality threshold', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'test' }],
          escrowAmount: 0.01,
          qualityThreshold: 150,
        })
      ).rejects.toThrow('between 0 and 100');
    });

    it('rejects invalid temperature', async () => {
      await expect(
        client.inferenceWithEscrow({
          model: 'qwen3-32b',
          messages: [{ role: 'user', content: 'test' }],
          escrowAmount: 0.01,
          temperature: 3,
        })
      ).rejects.toThrow('between 0 and 2');
    });
  });

  describe('getQualityTier', () => {
    let client: KamiyoEigenAI;

    beforeEach(() => {
      client = new KamiyoEigenAI({
        eigenAiApiKey: 'test-key',
        connection: mockConnection,
        wallet: mockWallet,
        programId: mockProgramId,
      });
    });

    it('returns excellent for score >= 80', () => {
      expect(client.getQualityTier(80)).toEqual({ tier: 'excellent', refundPercent: 0 });
      expect(client.getQualityTier(100)).toEqual({ tier: 'excellent', refundPercent: 0 });
    });

    it('returns good for score 65-79', () => {
      expect(client.getQualityTier(65)).toEqual({ tier: 'good', refundPercent: 35 });
      expect(client.getQualityTier(79)).toEqual({ tier: 'good', refundPercent: 35 });
    });

    it('returns poor for score 50-64', () => {
      expect(client.getQualityTier(50)).toEqual({ tier: 'poor', refundPercent: 75 });
      expect(client.getQualityTier(64)).toEqual({ tier: 'poor', refundPercent: 75 });
    });

    it('returns failed for score < 50', () => {
      expect(client.getQualityTier(49)).toEqual({ tier: 'failed', refundPercent: 100 });
      expect(client.getQualityTier(0)).toEqual({ tier: 'failed', refundPercent: 100 });
    });
  });
});
