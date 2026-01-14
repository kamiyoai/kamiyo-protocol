/**
 * Tests for wallet signature verification.
 */

import { describe, it, expect } from 'vitest';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Import functions to test
import {
  generateChallenge,
  verifySignature,
  isChallengeExpired,
  formatSigningInstructions,
} from '../src/wallet-verify';

describe('Wallet Verification', () => {
  // Generate a test keypair
  const keypair = Keypair.generate();
  const wallet = keypair.publicKey.toBase58();

  describe('generateChallenge', () => {
    it('should generate a valid challenge', () => {
      const challenge = generateChallenge(wallet);

      expect(challenge.wallet).toBe(wallet);
      expect(challenge.nonce).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(challenge.message).toContain('KAMIYO');
      expect(challenge.message).toContain(challenge.nonce);
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should reject invalid wallet address', () => {
      expect(() => generateChallenge('invalid-wallet')).toThrow();
    });

    it('should generate unique nonces', () => {
      const c1 = generateChallenge(wallet);
      const c2 = generateChallenge(wallet);
      expect(c1.nonce).not.toBe(c2.nonce);
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid signature', () => {
      const message = 'Test message to sign';
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      const isValid = verifySignature(wallet, signatureBase58, message);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const message = 'Test message';
      const fakeSignature = bs58.encode(new Uint8Array(64).fill(0));

      const isValid = verifySignature(wallet, fakeSignature, message);
      expect(isValid).toBe(false);
    });

    it('should reject wrong message', () => {
      const originalMessage = 'Original message';
      const messageBytes = new TextEncoder().encode(originalMessage);
      const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      // Try to verify with different message
      const isValid = verifySignature(wallet, signatureBase58, 'Different message');
      expect(isValid).toBe(false);
    });

    it('should reject signature from different wallet', () => {
      const otherKeypair = Keypair.generate();
      const message = 'Test message';
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, otherKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      // Try to verify with original wallet (should fail)
      const isValid = verifySignature(wallet, signatureBase58, message);
      expect(isValid).toBe(false);
    });
  });

  describe('isChallengeExpired', () => {
    it('should return false for future timestamp', () => {
      const future = Date.now() + 60000;
      expect(isChallengeExpired(future)).toBe(false);
    });

    it('should return true for past timestamp', () => {
      const past = Date.now() - 1000;
      expect(isChallengeExpired(past)).toBe(true);
    });
  });

  describe('formatSigningInstructions', () => {
    it('should include wallet and message', () => {
      const challenge = generateChallenge(wallet);
      const instructions = formatSigningInstructions(challenge);

      expect(instructions).toContain(wallet.slice(0, 8));
      expect(instructions).toContain(challenge.message);
      expect(instructions).toContain('!sign');
    });
  });

  describe('Full verification flow', () => {
    it('should work end-to-end', () => {
      // 1. Generate challenge
      const challenge = generateChallenge(wallet);

      // 2. Sign the message (simulating wallet signature)
      const messageBytes = new TextEncoder().encode(challenge.message);
      const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      // 3. Verify
      const isValid = verifySignature(wallet, signatureBase58, challenge.message);
      expect(isValid).toBe(true);
    });
  });
});
