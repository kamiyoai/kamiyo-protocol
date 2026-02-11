import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { KamiyoEigenAI } from './client';
import { EigenAIError, LIMITS, EigenAIAuthConfig } from './types';

describe('KamiyoEigenAI', () => {
  const mockConnection = {
    getBalance: jest.fn().mockResolvedValue(1_000_000_000),
    getAccountInfo: jest.fn().mockResolvedValue(null),
  } as unknown as Connection;

  const mockWallet = Keypair.generate();
  const mockProgramId = new PublicKey('FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u');
  const mockTreasury = Keypair.generate().publicKey;
  const mockTokenAccount = Keypair.generate().publicKey;
  const testAuth: EigenAIAuthConfig = { type: 'apiKey', apiKey: 'test-api-key-12345' };

  describe('constructor', () => {
    it('creates client with valid config', () => {
      const client = new KamiyoEigenAI({
        connection: mockConnection,
        wallet: mockWallet,
        programId: mockProgramId,
        eigenAiAuth: testAuth,
      });
      expect(client).toBeInstanceOf(KamiyoEigenAI);
    });

    it('uses default values', () => {
      const client = new KamiyoEigenAI({
        connection: mockConnection,
        wallet: mockWallet,
        programId: mockProgramId,
        eigenAiAuth: testAuth,
      });
      expect(client.getActiveEscrows()).toEqual([]);
    });
  });

  describe('input validation', () => {
    let client: KamiyoEigenAI;

    beforeEach(() => {
      client = new KamiyoEigenAI({
        connection: mockConnection,
        wallet: mockWallet,
        programId: mockProgramId,
        eigenAiAuth: testAuth,
      });
    });

    it('rejects empty messages', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [],
            escrowAmount: 0.01,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow('At least one message required');
    });

    it('rejects too many messages', async () => {
      const messages = Array(LIMITS.MAX_MESSAGES + 1).fill({
        role: 'user' as const,
        content: 'test',
      });
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages,
            escrowAmount: 0.01,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow(`Max ${LIMITS.MAX_MESSAGES} messages`);
    });

    it('rejects message too long', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'x'.repeat(LIMITS.MAX_MESSAGE_LENGTH + 1) }],
            escrowAmount: 0.01,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow(`exceeds ${LIMITS.MAX_MESSAGE_LENGTH}`);
    });

    it('rejects escrow amount too small', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'test' }],
            escrowAmount: 0.0001,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow(`Min ${LIMITS.MIN_ESCROW_SOL}`);
    });

    it('rejects escrow amount too large', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'test' }],
            escrowAmount: LIMITS.MAX_ESCROW_SOL + 1,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow(`Max ${LIMITS.MAX_ESCROW_SOL}`);
    });

    it('rejects time lock too short', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'test' }],
            escrowAmount: 0.01,
            timeLockSeconds: 10,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow(`Min ${LIMITS.MIN_TIME_LOCK_SECONDS}`);
    });

    it('rejects time lock too long', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'test' }],
            escrowAmount: 0.01,
            timeLockSeconds: LIMITS.MAX_TIME_LOCK_SECONDS + 1,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow(`Max ${LIMITS.MAX_TIME_LOCK_SECONDS}`);
    });

    it('rejects timeout too short', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'test' }],
            escrowAmount: 0.01,
            timeoutMs: 100,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow(`Min ${LIMITS.MIN_TIMEOUT_MS}`);
    });

    it('rejects timeout too long', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'test' }],
            escrowAmount: 0.01,
            timeoutMs: LIMITS.MAX_TIMEOUT_MS + 1,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow(`Max ${LIMITS.MAX_TIMEOUT_MS}`);
    });

    it('rejects session ID wrong length', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'test' }],
            escrowAmount: 0.01,
            sessionId: new Uint8Array(16),
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow(`Must be ${LIMITS.SESSION_ID_LENGTH} bytes`);
    });

    it('rejects invalid quality threshold', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'test' }],
            escrowAmount: 0.01,
            qualityThreshold: 150,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow('0-100');
    });

    it('rejects invalid temperature', async () => {
      await expect(
        client.inferenceWithEscrow(
          {
            model: 'gpt-oss-120b-f16',
            messages: [{ role: 'user', content: 'test' }],
            escrowAmount: 0.01,
            temperature: 3,
          },
          mockTokenAccount,
          mockTreasury
        )
      ).rejects.toThrow('0-2');
    });
  });

  describe('getQualityTier', () => {
    let client: KamiyoEigenAI;

    beforeEach(() => {
      client = new KamiyoEigenAI({
        connection: mockConnection,
        wallet: mockWallet,
        programId: mockProgramId,
        eigenAiAuth: testAuth,
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

  describe('generateSessionId', () => {
    let client: KamiyoEigenAI;

    beforeEach(() => {
      client = new KamiyoEigenAI({
        connection: mockConnection,
        wallet: mockWallet,
        programId: mockProgramId,
        eigenAiAuth: testAuth,
      });
    });

    it('generates 32-byte session ID', () => {
      const sessionId = client.generateSessionId();
      expect(sessionId.length).toBe(32);
    });

    it('generates unique session IDs', () => {
      const id1 = client.generateSessionId();
      const id2 = client.generateSessionId();
      expect(Buffer.from(id1).toString('hex')).not.toBe(Buffer.from(id2).toString('hex'));
    });
  });
});
