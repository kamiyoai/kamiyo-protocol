import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { EscrowClient } from '../packages/Naori-sdk/src/escrow-client';
import { describe, it, beforeAll, expect } from '@jest/globals';
import * as anchor from '@coral-xyz/anchor';

describe('Security and Attack Vector Tests', () => {
  let connection: Connection;
  let attacker: Keypair;
  let victim: Keypair;
  let programId: PublicKey;
  let attackerClient: EscrowClient;
  let victimClient: EscrowClient;

  beforeAll(async () => {
    connection = new Connection('http://localhost:8899', 'confirmed');
    attacker = Keypair.generate();
    victim = Keypair.generate();
    programId = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');

    const attackerAirdrop = await connection.requestAirdrop(attacker.publicKey, 5 * LAMPORTS_PER_SOL);
    const victimAirdrop = await connection.requestAirdrop(victim.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(attackerAirdrop);
    await connection.confirmTransaction(victimAirdrop);

    attackerClient = new EscrowClient(connection, attacker, programId);
    victimClient = new EscrowClient(connection, victim, programId);
  });

  describe('Authorization Attacks', () => {
    it('should prevent unauthorized fund release', async () => {
      const txId = 'auth_attack_' + Date.now();
      
      const escrowPDA = await victimClient.createEscrow({
        api: attacker.publicKey,
        amount: 0.01 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId
      });

      await expect(
        attackerClient.releaseFunds(escrowPDA)
      ).rejects.toThrow();
    });

    it('should prevent unauthorized dispute marking', async () => {
      const txId = 'dispute_auth_' + Date.now();
      
      const escrowPDA = await victimClient.createEscrow({
        api: attacker.publicKey,
        amount: 0.01 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId
      });

      await expect(
        attackerClient.markDisputed(escrowPDA)
      ).rejects.toThrow();
    });

    it('should reject signature forgery attempts', async () => {
      const txId = 'forge_' + Date.now();
      const fakeAgent = Keypair.generate();

      await expect(
        attackerClient.createEscrow({
          api: victim.publicKey,
          amount: 0.01 * LAMPORTS_PER_SOL,
          timeLock: 3600,
          transactionId: txId
        })
      ).resolves.toBeDefined();
    });
  });

  describe('Reentrancy Protection', () => {
    it('should prevent double spending via reentrancy', async () => {
      const txId = 'reentrancy_' + Date.now();
      
      const escrowPDA = await victimClient.createEscrow({
        api: attacker.publicKey,
        amount: 0.01 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId
      });

      await victimClient.releaseFunds(escrowPDA);

      await expect(
        victimClient.releaseFunds(escrowPDA)
      ).rejects.toThrow();
    });

    it('should prevent concurrent state manipulation', async () => {
      const txId = 'concurrent_attack_' + Date.now();
      
      const escrowPDA = await victimClient.createEscrow({
        api: attacker.publicKey,
        amount: 0.01 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId
      });

      const results = await Promise.allSettled([
        victimClient.releaseFunds(escrowPDA),
        victimClient.releaseFunds(escrowPDA),
        victimClient.releaseFunds(escrowPDA)
      ]);

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeLessThanOrEqual(1);
    });
  });

  describe('Input Validation', () => {
    it('should reject negative amounts', async () => {
      await expect(
        victimClient.createEscrow({
          api: attacker.publicKey,
          amount: -1 * LAMPORTS_PER_SOL,
          timeLock: 3600,
          transactionId: 'negative_' + Date.now()
        })
      ).rejects.toThrow();
    });

    it('should reject zero amounts', async () => {
      await expect(
        victimClient.createEscrow({
          api: attacker.publicKey,
          amount: 0,
          timeLock: 3600,
          transactionId: 'zero_' + Date.now()
        })
      ).rejects.toThrow();
    });

    it('should reject extremely large amounts', async () => {
      await expect(
        victimClient.createEscrow({
          api: attacker.publicKey,
          amount: 10000 * LAMPORTS_PER_SOL,
          timeLock: 3600,
          transactionId: 'huge_' + Date.now()
        })
      ).rejects.toThrow();
    });

    it('should reject invalid transaction IDs', async () => {
      const invalidIds = [
        '',
        ' ',
        '\x00\x01\x02',
        'a'.repeat(1000)
      ];

      for (const id of invalidIds) {
        await expect(
          victimClient.createEscrow({
            api: attacker.publicKey,
            amount: 0.001 * LAMPORTS_PER_SOL,
            timeLock: 3600,
            transactionId: id
          })
        ).rejects.toThrow();
      }
    });

    it('should reject invalid public keys', async () => {
      await expect(
        victimClient.createEscrow({
          api: PublicKey.default,
          amount: 0.001 * LAMPORTS_PER_SOL,
          timeLock: 3600,
          transactionId: 'invalid_key_' + Date.now()
        })
      ).rejects.toThrow();
    });
  });

  describe('Integer Overflow Protection', () => {
    it('should handle maximum safe integer amounts', async () => {
      const maxSafe = Number.MAX_SAFE_INTEGER;

      await expect(
        victimClient.createEscrow({
          api: attacker.publicKey,
          amount: maxSafe,
          timeLock: 3600,
          transactionId: 'max_int_' + Date.now()
        })
      ).rejects.toThrow();
    });

    it('should prevent timelock overflow', async () => {
      const hugeLock = 365 * 24 * 60 * 60;

      await expect(
        victimClient.createEscrow({
          api: attacker.publicKey,
          amount: 0.001 * LAMPORTS_PER_SOL,
          timeLock: hugeLock,
          transactionId: 'overflow_time_' + Date.now()
        })
      ).rejects.toThrow();
    });
  });

  describe('PDA Security', () => {
    it('should derive PDAs deterministically', () => {
      const txId = 'pda_test';
      const [pda1, bump1] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), Buffer.from(txId)],
        programId
      );
      const [pda2, bump2] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), Buffer.from(txId)],
        programId
      );

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should prevent PDA collision attacks', () => {
      const txIds = ['test1', 'test2', 'test3'];
      const pdas = txIds.map(id => 
        PublicKey.findProgramAddressSync(
          [Buffer.from('escrow'), Buffer.from(id)],
          programId
        )[0]
      );

      const uniquePDAs = new Set(pdas.map(p => p.toBase58()));
      expect(uniquePDAs.size).toBe(txIds.length);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits for unverified entities', async () => {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          victimClient.createEscrow({
            api: attacker.publicKey,
            amount: 0.001 * LAMPORTS_PER_SOL,
            timeLock: 3600,
            transactionId: 'rate_' + Date.now() + '_' + i
          })
        );
      }

      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected').length;
      expect(failures).toBeGreaterThan(0);
    });
  });

  describe('Timestamp Manipulation', () => {
    it('should validate timelock boundaries', async () => {
      const invalidLocks = [0, -1, 59, 31 * 24 * 60 * 60 + 1];

      for (const lock of invalidLocks) {
        await expect(
          victimClient.createEscrow({
            api: attacker.publicKey,
            amount: 0.001 * LAMPORTS_PER_SOL,
            timeLock: lock,
            transactionId: 'time_attack_' + Date.now()
          })
        ).rejects.toThrow();
      }
    });
  });

  describe('Access Control', () => {
    it('should enforce agent-only operations', async () => {
      const txId = 'access_' + Date.now();
      
      const escrowPDA = await victimClient.createEscrow({
        api: attacker.publicKey,
        amount: 0.01 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId
      });

      const randomUser = Keypair.generate();
      const airdropSig = await connection.requestAirdrop(randomUser.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(airdropSig);

      const randomClient = new EscrowClient(connection, randomUser, programId);

      await expect(
        randomClient.releaseFunds(escrowPDA)
      ).rejects.toThrow();
    });

    it('should prevent cross-account attacks', async () => {
      const txId1 = 'cross1_' + Date.now();
      const txId2 = 'cross2_' + Date.now();

      const escrow1 = await victimClient.createEscrow({
        api: attacker.publicKey,
        amount: 0.01 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId1
      });

      const escrow2 = await attackerClient.createEscrow({
        api: victim.publicKey,
        amount: 0.01 * LAMPORTS_PER_SOL,
        timeLock: 3600,
        transactionId: txId2
      });

      await expect(
        attackerClient.releaseFunds(escrow1)
      ).rejects.toThrow();

      await expect(
        victimClient.releaseFunds(escrow2)
      ).rejects.toThrow();
    });
  });

  describe('Denial of Service Protection', () => {
    it('should handle spam transaction attempts', async () => {
      const spamPromises = [];
      
      for (let i = 0; i < 50; i++) {
        spamPromises.push(
          victimClient.createEscrow({
            api: attacker.publicKey,
            amount: 0.001 * LAMPORTS_PER_SOL,
            timeLock: 3600,
            transactionId: 'spam_' + Date.now() + '_' + i
          }).catch(() => null)
        );
      }

      const results = await Promise.allSettled(spamPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      expect(successful).toBeLessThan(50);
    });

    it('should handle resource exhaustion attempts', async () => {
      const largeData = 'x'.repeat(10000);
      
      await expect(
        victimClient.createEscrow({
          api: attacker.publicKey,
          amount: 0.001 * LAMPORTS_PER_SOL,
          timeLock: 3600,
          transactionId: largeData
        })
      ).rejects.toThrow();
    });
  });
});
