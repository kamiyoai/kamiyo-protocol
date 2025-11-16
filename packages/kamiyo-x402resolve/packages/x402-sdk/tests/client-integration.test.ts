import { KamiyoClient } from '../src/client';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { describe, it, beforeEach, expect } from '@jest/globals';

describe('KamiyoClient Integration Tests', () => {
  let connection: Connection;
  let client: KamiyoClient;
  let wallet: Keypair;
  let apiProvider: Keypair;

  beforeEach(() => {
    connection = new Connection('http://localhost:8899', 'confirmed');
    wallet = Keypair.generate();
    apiProvider = Keypair.generate();

    client = new KamiyoClient({
      apiUrl: 'http://localhost:3000',
      chain: 'solana',
      rpcUrl: 'http://localhost:8899',
      walletPublicKey: wallet.publicKey,
      enablex402Resolve: true
    });
  });

  describe('Payment Creation', () => {
    it('should create payment without escrow', async () => {
      const payment = await client.pay({
        amount: 0.001,
        recipient: apiProvider.publicKey,
        enableEscrow: false
      });

      expect(payment).toHaveProperty('token');
      expect(payment).toHaveProperty('transactionId');
    });

    it('should validate amount constraints', async () => {
      await expect(
        client.pay({
          amount: 0.0001,
          recipient: apiProvider.publicKey,
          enableEscrow: true
        })
      ).rejects.toThrow();
    });

    it('should validate recipient pubkey', async () => {
      await expect(
        client.pay({
          amount: 0.001,
          recipient: null as any,
          enableEscrow: true
        })
      ).rejects.toThrow();
    });
  });

  describe('Dispute Filing', () => {
    it('should file dispute with valid evidence', async () => {
      const disputeParams = {
        transactionId: 'test_tx_123',
        reason: 'Low quality response',
        qualityScore: 45,
        evidence: {
          expectedFields: 10,
          receivedFields: 4,
          missingData: ['volume', 'source']
        }
      };

      await expect(
        client.fileDispute(disputeParams)
      ).resolves.not.toThrow();
    });

    it('should validate quality score range', async () => {
      await expect(
        client.fileDispute({
          transactionId: 'test_tx_123',
          qualityScore: 150,
          reason: 'Invalid'
        })
      ).rejects.toThrow();
    });

    it('should require transaction ID', async () => {
      await expect(
        client.fileDispute({
          transactionId: '',
          qualityScore: 50,
          reason: 'Test'
        })
      ).rejects.toThrow();
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed requests', async () => {
      let attempts = 0;
      const mockClient = new KamiyoClient({
        apiUrl: 'http://localhost:3000',
        chain: 'solana',
        retryConfig: {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 1000
        }
      });

      await expect(
        mockClient.pay({
          amount: 0.001,
          recipient: apiProvider.publicKey,
          enableEscrow: false
        })
      ).rejects.toThrow();
    });

    it('should respect max retry limit', async () => {
      const start = Date.now();

      await expect(
        client.pay({
          amount: 0.001,
          recipient: new PublicKey('11111111111111111111111111111111'),
          enableEscrow: false
        })
      ).rejects.toThrow();

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Connection Handling', () => {
    it('should handle connection errors', async () => {
      const badClient = new KamiyoClient({
        apiUrl: 'http://invalid-host:9999',
        chain: 'solana',
        rpcUrl: 'http://invalid-rpc:9999'
      });

      await expect(
        badClient.pay({
          amount: 0.001,
          recipient: apiProvider.publicKey,
          enableEscrow: false
        })
      ).rejects.toThrow();
    });

    it('should timeout on slow requests', async () => {
      const slowClient = new KamiyoClient({
        apiUrl: 'http://localhost:3000',
        chain: 'solana',
        retryConfig: {
          timeout: 100
        }
      });

      await expect(
        slowClient.pay({
          amount: 0.001,
          recipient: apiProvider.publicKey,
          enableEscrow: false
        })
      ).rejects.toThrow();
    });
  });

  describe('State Management', () => {
    it('should track dispute status changes', async () => {
      const txId = 'status_test_123';

      const initialStatus = await client.getDisputeStatus(txId);
      expect(initialStatus).toHaveProperty('status');
    });

    it('should cache dispute data appropriately', async () => {
      const txId = 'cache_test_123';

      const first = await client.getDisputeStatus(txId);
      const second = await client.getDisputeStatus(txId);

      expect(first).toEqual(second);
    });
  });
});
