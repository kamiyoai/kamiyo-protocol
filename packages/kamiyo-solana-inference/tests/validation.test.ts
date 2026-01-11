import { describe, it, expect, beforeAll } from '@jest/globals';
import { InferenceClient } from '../src/client';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';

// Mock wallet for testing
class MockWallet implements Partial<Wallet> {
  publicKey: PublicKey;
  private keypair: Keypair;

  constructor() {
    this.keypair = Keypair.generate();
    this.publicKey = this.keypair.publicKey;
  }

  async signTransaction(tx: any) {
    return tx;
  }

  async signAllTransactions(txs: any[]) {
    return txs;
  }
}

describe('TETSUO Inference SDK Input Validation', () => {
  let client: InferenceClient;
  let mockWallet: MockWallet;

  beforeAll(() => {
    // Use a mock connection - tests will fail on RPC calls but validate input first
    const connection = new Connection('http://localhost:8899', 'confirmed');
    mockWallet = new MockWallet();
    client = new InferenceClient({
      connection,
      wallet: mockWallet as any,
    });
  });

  describe('createInferenceEscrow validation', () => {
    it('should reject empty model name', async () => {
      await expect(
        client.createInferenceEscrow({
          model: '',
          amount: 1,
        })
      ).rejects.toThrow('Model name is required');
    });

    it('should reject whitespace-only model name', async () => {
      await expect(
        client.createInferenceEscrow({
          model: '   ',
          amount: 1,
        })
      ).rejects.toThrow('Model name is required');
    });

    it('should reject zero amount', async () => {
      await expect(
        client.createInferenceEscrow({
          model: 'tits-7b',
          amount: 0,
        })
      ).rejects.toThrow('positive number');
    });

    it('should reject negative amount', async () => {
      await expect(
        client.createInferenceEscrow({
          model: 'tits-7b',
          amount: -1,
        })
      ).rejects.toThrow('positive number');
    });

    it('should reject excessive amount', async () => {
      await expect(
        client.createInferenceEscrow({
          model: 'tits-7b',
          amount: 2000000, // > 1M SOL
        })
      ).rejects.toThrow('exceeds maximum');
    });

    it('should reject invalid quality threshold (negative)', async () => {
      await expect(
        client.createInferenceEscrow({
          model: 'tits-7b',
          amount: 1,
          qualityThreshold: -10,
        })
      ).rejects.toThrow('0-100');
    });

    it('should reject invalid quality threshold (> 100)', async () => {
      await expect(
        client.createInferenceEscrow({
          model: 'tits-7b',
          amount: 1,
          qualityThreshold: 150,
        })
      ).rejects.toThrow('0-100');
    });

    it('should reject invalid expiration (negative)', async () => {
      await expect(
        client.createInferenceEscrow({
          model: 'tits-7b',
          amount: 1,
          expiresIn: -100,
        })
      ).rejects.toThrow('Expiration');
    });

    it('should reject invalid expiration (too long)', async () => {
      await expect(
        client.createInferenceEscrow({
          model: 'tits-7b',
          amount: 1,
          expiresIn: 86400 * 365, // 1 year - exceeds 30 day max
        })
      ).rejects.toThrow('30 days');
    });
  });

  describe('settleInference validation', () => {
    it('should reject quality score < 0', async () => {
      await expect(
        client.settleInference(
          'test-escrow-id',
          -10,
          mockWallet.publicKey
        )
      ).rejects.toThrow('0-100');
    });

    it('should reject quality score > 100', async () => {
      await expect(
        client.settleInference(
          'test-escrow-id',
          150,
          mockWallet.publicKey
        )
      ).rejects.toThrow('0-100');
    });
  });

  describe('PDA derivation', () => {
    it('should derive consistent escrow PDA', () => {
      const modelId = new Uint8Array(32);
      modelId[0] = 1;

      const [pda1] = client.getInferenceEscrowPDA(mockWallet.publicKey, modelId);
      const [pda2] = client.getInferenceEscrowPDA(mockWallet.publicKey, modelId);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('should derive different PDAs for different users', () => {
      const modelId = new Uint8Array(32);
      const user1 = Keypair.generate().publicKey;
      const user2 = Keypair.generate().publicKey;

      const [pda1] = client.getInferenceEscrowPDA(user1, modelId);
      const [pda2] = client.getInferenceEscrowPDA(user2, modelId);

      expect(pda1.equals(pda2)).toBe(false);
    });
  });
});
