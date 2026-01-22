/**
 * ShadowID Reputation Gate Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import {
  ShadowIdReputationGate,
  createShadowIdReputationGate,
  REPUTATION_TIERS,
  meetsReputationTier,
  getTierBenefits,
} from '../src/reputation/shadow-id-gate';

describe('ShadowIdReputationGate', () => {
  let connection: Connection;
  let gate: ShadowIdReputationGate;
  let wallet: Keypair;
  const programId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

  beforeEach(() => {
    connection = new Connection('https://api.devnet.solana.com');
    gate = createShadowIdReputationGate(connection, programId);
    wallet = Keypair.generate();
  });

  describe('checkReputationGate', () => {
    it('should return ineligible for wallet without reputation', async () => {
      // Mock getAccountInfo to return null (no reputation account)
      vi.spyOn(connection, 'getAccountInfo').mockResolvedValue(null);

      const result = await gate.checkReputationGate(
        { publicKey: wallet.publicKey },
        50
      );

      expect(result.eligible).toBe(false);
      expect(result.tier).toBe('none');
      expect(result.error).toContain('No reputation record');
    });

    it('should return eligible with valid proof for high reputation', async () => {
      // Mock reputation account with high score
      const mockAccountData = Buffer.alloc(100);
      // Write high reputation score at offset 82 (normalized from -1000 to 1000 scale)
      // Score 1700 -> (1700 + 1000) / 20 = 135, clamped to 100 -> platinum
      mockAccountData.writeUInt16LE(1700, 82);

      vi.spyOn(connection, 'getAccountInfo').mockResolvedValue({
        data: mockAccountData,
        executable: false,
        lamports: 1000000,
        owner: programId,
      } as any);

      const result = await gate.checkReputationGate(
        { publicKey: wallet.publicKey },
        50
      );

      expect(result.eligible).toBe(true);
      expect(result.meetsThreshold).toBe(true);
      // Score normalizes to 100 (clamped), which is platinum tier
      expect(result.tier).toBe('platinum');
      expect(result.proof).toBeDefined();
      expect(result.proof?.threshold).toBe(50);
    });

    it('should return ineligible for score below threshold', async () => {
      // Mock reputation account with low score
      // Using a value that produces a low normalized score
      // Score 200 -> (200 + 1000) / 20 = 60 (silver tier)
      const mockAccountData = Buffer.alloc(100);
      mockAccountData.writeUInt16LE(200, 82);

      vi.spyOn(connection, 'getAccountInfo').mockResolvedValue({
        data: mockAccountData,
        executable: false,
        lamports: 1000000,
        owner: programId,
      } as any);

      const result = await gate.checkReputationGate(
        { publicKey: wallet.publicKey },
        80 // High threshold - score of 60 won't meet this
      );

      expect(result.eligible).toBe(false);
      expect(result.meetsThreshold).toBe(false);
    });
  });

  describe('verifyReputationProof', () => {
    it('should accept valid proof format', async () => {
      const validProof = {
        commitment: 'a'.repeat(64),
        threshold: 50,
        proofBytes: new Uint8Array(256),
      };

      const result = await gate.verifyReputationProof(validProof);
      expect(result.valid).toBe(true);
      expect(result.threshold).toBe(50);
    });

    it('should reject invalid commitment format', async () => {
      const invalidProof = {
        commitment: 'invalid',
        threshold: 50,
        proofBytes: new Uint8Array(256),
      };

      const result = await gate.verifyReputationProof(invalidProof);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('commitment');
    });

    it('should reject invalid proof length', async () => {
      const invalidProof = {
        commitment: 'a'.repeat(64),
        threshold: 50,
        proofBytes: new Uint8Array(100), // Wrong length
      };

      const result = await gate.verifyReputationProof(invalidProof);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('length');
    });
  });

  describe('calculateEffectiveRateLimit', () => {
    it('should calculate correct rate limits', () => {
      // Lite tier: base 1
      expect(gate.calculateEffectiveRateLimit('lite', 'none')).toBe(0); // 1 * 0.5 = 0.5 -> 0
      expect(gate.calculateEffectiveRateLimit('lite', 'bronze')).toBe(1);
      expect(gate.calculateEffectiveRateLimit('lite', 'gold')).toBe(2);
      expect(gate.calculateEffectiveRateLimit('lite', 'platinum')).toBe(3);

      // Active tier: base 10
      expect(gate.calculateEffectiveRateLimit('active', 'none')).toBe(5);
      expect(gate.calculateEffectiveRateLimit('active', 'bronze')).toBe(10);
      expect(gate.calculateEffectiveRateLimit('active', 'gold')).toBe(20);
      expect(gate.calculateEffectiveRateLimit('active', 'platinum')).toBe(30);
    });
  });
});

describe('Utility functions', () => {
  describe('meetsReputationTier', () => {
    it('should correctly check tier requirements', () => {
      expect(meetsReputationTier(0, 'none')).toBe(true);
      expect(meetsReputationTier(50, 'silver')).toBe(true);
      expect(meetsReputationTier(30, 'silver')).toBe(false);
      expect(meetsReputationTier(90, 'platinum')).toBe(true);
      expect(meetsReputationTier(85, 'platinum')).toBe(false);
    });
  });

  describe('getTierBenefits', () => {
    it('should return benefit descriptions', () => {
      expect(getTierBenefits('platinum')).toContain('3x');
      expect(getTierBenefits('gold')).toContain('2x');
      expect(getTierBenefits('silver')).toContain('1.5x');
      expect(getTierBenefits('bronze')).toContain('standard');
      expect(getTierBenefits('none')).toContain('Limited');
    });
  });

  describe('REPUTATION_TIERS', () => {
    it('should have correct tier boundaries', () => {
      expect(REPUTATION_TIERS.none).toEqual({ min: 0, max: 0, label: 'Unverified' });
      expect(REPUTATION_TIERS.bronze).toEqual({ min: 1, max: 40, label: 'Bronze' });
      expect(REPUTATION_TIERS.silver).toEqual({ min: 41, max: 65, label: 'Silver' });
      expect(REPUTATION_TIERS.gold).toEqual({ min: 66, max: 85, label: 'Gold' });
      expect(REPUTATION_TIERS.platinum).toEqual({ min: 86, max: 100, label: 'Platinum' });
    });
  });
});
