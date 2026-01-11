import { describe, it, expect, beforeAll } from '@jest/globals';
import { ReputationClient } from '../src/client';
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

describe('TETSUO Reputation SDK Input Validation', () => {
  let client: ReputationClient;
  let clientWithWallet: ReputationClient;
  let mockWallet: MockWallet;

  beforeAll(() => {
    const connection = new Connection('http://localhost:8899', 'confirmed');
    mockWallet = new MockWallet();

    // Client without wallet (read-only)
    client = new ReputationClient({ connection });

    // Client with wallet (write operations)
    clientWithWallet = new ReputationClient({
      connection,
      wallet: mockWallet as any,
    });
  });

  describe('getModelReputation validation', () => {
    it('should reject empty model name', async () => {
      await expect(client.getModelReputation('')).rejects.toThrow(
        'Model name is required'
      );
    });

    it('should reject whitespace-only model name', async () => {
      await expect(client.getModelReputation('   ')).rejects.toThrow(
        'Model name is required'
      );
    });
  });

  describe('meetsThreshold validation', () => {
    it('should reject threshold < 0', async () => {
      await expect(client.meetsThreshold('tits-7b', -10)).rejects.toThrow(
        '0-100'
      );
    });

    it('should reject threshold > 100', async () => {
      await expect(client.meetsThreshold('tits-7b', 150)).rejects.toThrow(
        '0-100'
      );
    });

    // Note: empty model validation happens in getModelReputation
    it('should reject empty model name', async () => {
      await expect(client.meetsThreshold('', 80)).rejects.toThrow(
        'Model name is required'
      );
    });
  });

  describe('registerModel validation', () => {
    it('should require wallet', async () => {
      const clientNoWallet = new ReputationClient({
        connection: new Connection('http://localhost:8899'),
      });

      await expect(clientNoWallet.registerModel('test-model')).rejects.toThrow(
        'Wallet required'
      );
    });

    it('should reject empty model name', async () => {
      await expect(clientWithWallet.registerModel('')).rejects.toThrow(
        'Model name is required'
      );
    });

    it('should reject model name > 64 chars', async () => {
      const longName = 'a'.repeat(65);
      await expect(clientWithWallet.registerModel(longName)).rejects.toThrow(
        '64 characters'
      );
    });
  });

  describe('updateModelStats validation', () => {
    it('should require wallet', async () => {
      await expect(
        client.updateModelStats('test', 80, true)
      ).rejects.toThrow('Wallet required');
    });

    it('should reject empty model name', async () => {
      await expect(
        clientWithWallet.updateModelStats('', 80, true)
      ).rejects.toThrow('Model name is required');
    });

    it('should reject quality score < 0', async () => {
      await expect(
        clientWithWallet.updateModelStats('test', -10, true)
      ).rejects.toThrow('0-100');
    });

    it('should reject quality score > 100', async () => {
      await expect(
        clientWithWallet.updateModelStats('test', 150, true)
      ).rejects.toThrow('0-100');
    });

    it('should reject non-integer quality score', async () => {
      await expect(
        clientWithWallet.updateModelStats('test', 85.5, true)
      ).rejects.toThrow('integer');
    });
  });

  describe('PDA derivation', () => {
    it('should derive consistent model PDA', () => {
      const modelId = new Uint8Array(32);
      modelId[0] = 1;

      const [pda1] = client.getModelPDA(modelId);
      const [pda2] = client.getModelPDA(modelId);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('should derive consistent user reputation PDA', () => {
      const user = Keypair.generate().publicKey;

      const [pda1] = client.getUserReputationPDA(user);
      const [pda2] = client.getUserReputationPDA(user);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('should derive different PDAs for different users', () => {
      const user1 = Keypair.generate().publicKey;
      const user2 = Keypair.generate().publicKey;

      const [pda1] = client.getUserReputationPDA(user1);
      const [pda2] = client.getUserReputationPDA(user2);

      expect(pda1.equals(pda2)).toBe(false);
    });
  });
});
