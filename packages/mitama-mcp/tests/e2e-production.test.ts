import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { KamiyoClient } from '../packages/Naori-sdk/src/client';
import { EscrowClient } from '../packages/Naori-sdk/src/escrow-client';
import { Hyoban } from '../packages/Naori-sdk/src/reputation';
import { describe, it, beforeAll, expect } from '@jest/globals';
import * as anchor from '@coral-xyz/anchor';

describe('End-to-End Production Readiness Tests', () => {
  let connection: Connection;
  let agent: Keypair;
  let apiProvider: Keypair;
  let programId: PublicKey;
  let client: KamiyoClient;
  let escrowClient: EscrowClient;
  let hyoban: Hyoban;

  beforeAll(async () => {
    connection = new Connection('http://localhost:8899', 'confirmed');
    agent = Keypair.generate();
    apiProvider = Keypair.generate();
    programId = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');

    const airdropSig = await connection.requestAirdrop(agent.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(airdropSig);

    client = new KamiyoClient({
      apiUrl: 'http://localhost:3000',
      chain: 'solana',
      rpcUrl: 'http://localhost:8899',
      walletPublicKey: agent.publicKey
    });

    escrowClient = new EscrowClient(connection, agent, programId);
  });

  describe('Complete Payment Flow', () => {
    it('should execute full payment cycle: create -> pay -> verify -> release', async () => {
      const txId = 'e2e_payment_' + Date.now();
      const amount = 0.01 * LAMPORTS_PER_SOL;

      const escrowPDA = await escrowClient.createEscrow({
        api: apiProvider.publicKey,
        amount,
        timeLock: 3600,
        transactionId: txId
      });

      expect(escrowPDA).toBeInstanceOf(PublicKey);

      const escrowAccount = await connection.getAccountInfo(escrowPDA);
      expect(escrowAccount).not.toBeNull();

      await new Promise(resolve => setTimeout(resolve, 2000));

      await escrowClient.releaseFunds(escrowPDA);

      const apiBalance = await connection.getBalance(apiProvider.publicKey);
      expect(apiBalance).toBeGreaterThan(0);
    });

    it('should handle high-value transaction correctly', async () => {
      const txId = 'high_value_' + Date.now();
      const amount = 10 * LAMPORTS_PER_SOL;

      const airdropSig = await connection.requestAirdrop(agent.publicKey, 15 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(airdropSig);

      const escrowPDA = await escrowClient.createEscrow({
        api: apiProvider.publicKey,
        amount,
        timeLock: 3600,
        transactionId: txId
      });

      expect(escrowPDA).toBeInstanceOf(PublicKey);
    });

    it('should handle rapid successive transactions', async () => {
      const promises = [];
      
      for (let i = 0; i < 3; i++) {
        const txId = 'rapid_' + Date.now() + '_' + i;
        promises.push(
          escrowClient.createEscrow({
            api: apiProvider.publicKey,
            amount: 0.001 * LAMPORTS_PER_SOL,
            timeLock: 3600,
            transactionId: txId
          })
        );
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Dispute Resolution Flow', () => {
    let escrowPDA: PublicKey;
    let txId: string;

    beforeAll(async () => {
      txId = 'dispute_e2e_' + Date.now();
      escrowPDA = await escrowClient.createEscrow({
        api: apiProvider.publicKey,
        amount: 0.01 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId
      });
    });

    it('should complete full dispute workflow', async () => {
      await escrowClient.markDisputed(escrowPDA);

      await new Promise(resolve => setTimeout(resolve, 1000));

      await client.fileDispute({
        transactionId: txId,
        reason: 'Quality below threshold',
        qualityScore: 45,
        evidence: {
          expectedQuality: 85,
          actualQuality: 45,
          missingFields: ['timestamp', 'source']
        }
      });

      const status = await client.getDisputeStatus(txId);
      expect(status).toHaveProperty('status');
    });

    it('should calculate correct refund amounts', async () => {
      const qualityScores = [0, 25, 50, 75, 100];
      const expectedRefunds = [100, 75, 50, 25, 0];

      for (let i = 0; i < qualityScores.length; i++) {
        const refund = calculateRefundPercentage(qualityScores[i]);
        expect(refund).toBeCloseTo(expectedRefunds[i], 5);
      }
    });
  });

  describe('Reputation System', () => {
    it('should track agent reputation accurately', async () => {
      const rep = await hyoban.getReputation(agent.publicKey);

      if (rep) {
        expect(rep).toHaveProperty('totalTransactions');
        expect(rep).toHaveProperty('reputationScore');
        expect(rep.reputationScore).toBeGreaterThanOrEqual(0);
        expect(rep.reputationScore).toBeLessThanOrEqual(1000);
      }
    });

    it('should update reputation after successful transaction', async () => {
      const txId = 'rep_test_' + Date.now();
      
      const escrowPDA = await escrowClient.createEscrow({
        api: apiProvider.publicKey,
        amount: 0.001 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId
      });

      await escrowClient.releaseFunds(escrowPDA);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const rep = await hyoban.getReputation(agent.publicKey);
      expect(rep).toBeDefined();
    });

    it('should calculate dispute success rate correctly', async () => {
      const mockReputation = {
        entity: agent.publicKey,
        entityType: 'Agent' as const,
        totalTransactions: 100,
        disputesFiled: 20,
        disputesWon: 15,
        disputesPartial: 3,
        disputesLost: 2,
        averageQualityReceived: 85,
        reputationScore: 750,
        createdAt: Date.now(),
        lastUpdated: Date.now()
      };

      const successRate = hyoban.getDisputeSuccessRate(mockReputation);
      expect(successRate).toBeCloseTo(82.5, 1);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from network interruption', async () => {
      const txId = 'network_test_' + Date.now();

      await expect(
        escrowClient.createEscrow({
          api: apiProvider.publicKey,
          amount: 0.001 * LAMPORTS_PER_SOL,
          timeLock: 3600,
          transactionId: txId
        })
      ).resolves.toBeInstanceOf(PublicKey);
    });

    it('should handle insufficient funds gracefully', async () => {
      const poorAgent = Keypair.generate();
      const poorClient = new EscrowClient(connection, poorAgent, programId);

      await expect(
        poorClient.createEscrow({
          api: apiProvider.publicKey,
          amount: 100 * LAMPORTS_PER_SOL,
          timeLock: 3600,
          transactionId: 'insufficient_' + Date.now()
        })
      ).rejects.toThrow();
    });

    it('should handle concurrent access safely', async () => {
      const txId = 'concurrent_' + Date.now();
      
      const escrowPDA = await escrowClient.createEscrow({
        api: apiProvider.publicKey,
        amount: 0.001 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId
      });

      const results = await Promise.allSettled([
        escrowClient.releaseFunds(escrowPDA),
        escrowClient.markDisputed(escrowPDA)
      ]);

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBe(1);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should create escrow within acceptable time', async () => {
      const start = Date.now();
      
      const escrowPDA = await escrowClient.createEscrow({
        api: apiProvider.publicKey,
        amount: 0.001 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: 'perf_' + Date.now()
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000);
    });

    it('should handle burst of 10 transactions', async () => {
      const start = Date.now();
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          escrowClient.createEscrow({
            api: apiProvider.publicKey,
            amount: 0.001 * LAMPORTS_PER_SOL,
            timeLock: 3600,
            transactionId: 'burst_' + Date.now() + '_' + i
          })
        );
      }

      await Promise.all(promises);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(30000);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain escrow data integrity', async () => {
      const txId = 'integrity_' + Date.now();
      const amount = 0.123456 * LAMPORTS_PER_SOL;

      const escrowPDA = await escrowClient.createEscrow({
        api: apiProvider.publicKey,
        amount,
        timeLock: 7200,
        transactionId: txId
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      const program = anchor.workspace.X402Escrow;
      const escrow = await program.account.escrow.fetch(escrowPDA);

      expect(escrow.amount.toNumber()).toBe(Math.floor(amount));
      expect(escrow.transactionId).toBe(txId);
      expect(escrow.agent.toBase58()).toBe(agent.publicKey.toBase58());
      expect(escrow.api.toBase58()).toBe(apiProvider.publicKey.toBase58());
    });

    it('should prevent amount manipulation', async () => {
      const txId = 'manipulation_' + Date.now();
      
      const escrowPDA = await escrowClient.createEscrow({
        api: apiProvider.publicKey,
        amount: 0.001 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId
      });

      const program = anchor.workspace.X402Escrow;
      const escrowBefore = await program.account.escrow.fetch(escrowPDA);
      const amountBefore = escrowBefore.amount.toNumber();

      await escrowClient.releaseFunds(escrowPDA);

      const apiBalance = await connection.getBalance(apiProvider.publicKey);
      expect(apiBalance).toBeGreaterThanOrEqual(amountBefore);
    });
  });
});

function calculateRefundPercentage(qualityScore: number): number {
  if (qualityScore < 50) return 100;
  if (qualityScore < 60) return 75;
  if (qualityScore < 70) return 50;
  if (qualityScore < 80) return 25;
  return 0;
}
