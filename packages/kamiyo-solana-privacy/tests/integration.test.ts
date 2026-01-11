import { describe, it, expect, beforeAll } from '@jest/globals';
import { PrivateInference } from '../src/proofs';
import {
  verifyReputationProof,
  verifyPaymentProof,
  isSnarkjsVerificationAvailable,
} from '../src/verifier';
import { Keypair } from '@solana/web3.js';

// Mock wallet for testing
class MockWallet {
  publicKey: { toBase58: () => string };

  constructor(keypair: Keypair) {
    this.publicKey = keypair.publicKey;
  }
}

describe('TETSUO Privacy SDK Integration', () => {
  let wallet: MockWallet;
  let privateInference: PrivateInference;

  beforeAll(() => {
    const keypair = Keypair.generate();
    wallet = new MockWallet(keypair);
    privateInference = new PrivateInference(wallet as any);
  });

  describe('Snarkjs Verification Availability', () => {
    it('should report snarkjs verification status', () => {
      const available = isSnarkjsVerificationAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Proof Encoding/Decoding', () => {
    it('should encode and decode reputation proof', async () => {
      const proof = await privateInference.proveReputation({
        threshold: 80,
      });

      expect(proof.agentPk).toBe(wallet.publicKey.toBase58());
      expect(proof.threshold).toBe(80);
      expect(proof.proofBytes).toBeInstanceOf(Uint8Array);
      expect(proof.proofBytes.length).toBe(64);

      const encoded = PrivateInference.encodeReputationProof(proof);
      expect(typeof encoded).toBe('string');

      const decoded = PrivateInference.decodeProof(encoded);
      expect(decoded.type).toBe('reputation');
    });

    it('should encode and decode payment proof', async () => {
      const proof = await privateInference.provePayment({
        escrowId: 'test-escrow-123',
      });

      expect(proof.escrowId).toBe('test-escrow-123');
      expect(proof.proofBytes).toBeInstanceOf(Uint8Array);

      const encoded = PrivateInference.encodePaymentProof(proof);
      const decoded = PrivateInference.decodeProof(encoded);
      expect(decoded.type).toBe('payment');
    });
  });

  describe('Input Validation', () => {
    it('should reject empty proof', async () => {
      const result = await verifyReputationProof('', { minThreshold: 50 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject invalid threshold', async () => {
      const result = await verifyReputationProof('test', { minThreshold: 150 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('0-100');
    });

    it('should reject negative threshold', async () => {
      const result = await verifyReputationProof('test', { minThreshold: -10 });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid maxProofAge', async () => {
      const result = await verifyReputationProof('test', {
        minThreshold: 50,
        maxProofAge: -100,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('should reject empty payment proof', async () => {
      const result = await verifyPaymentProof('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('Proof Verification', () => {
    it('should reject proof with wrong type', async () => {
      // Create a payment proof and try to verify as reputation
      const paymentProof = await privateInference.provePayment({
        escrowId: 'test-escrow',
      });
      const encoded = PrivateInference.encodePaymentProof(paymentProof);

      const result = await verifyReputationProof(encoded, { minThreshold: 50 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid proof type');
    });

    it('should reject proof below threshold', async () => {
      const proof = await privateInference.proveReputation({
        threshold: 60,
      });
      const encoded = PrivateInference.encodeReputationProof(proof);

      const result = await verifyReputationProof(encoded, { minThreshold: 80 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('below minimum');
    });

    it('should handle valid structural proof', async () => {
      const proof = await privateInference.proveReputation({
        threshold: 85,
      });
      const encoded = PrivateInference.encodeReputationProof(proof);

      const result = await verifyReputationProof(encoded, { minThreshold: 70 });

      // Without native crypto, should either:
      // - Return valid with warning (default)
      // - Return invalid if requireCrypto is set
      if (isSnarkjsVerificationAvailable()) {
        // With native, result depends on actual cryptographic verification
        expect(typeof result.valid).toBe('boolean');
      } else {
        // Without native, structural validation passes with warning
        expect(result.valid).toBe(true);
        expect(result.error).toContain('Warning');
      }
    });

    it('should fail with requireCrypto when native unavailable', async () => {
      if (!isSnarkjsVerificationAvailable()) {
        const proof = await privateInference.proveReputation({
          threshold: 85,
        });
        const encoded = PrivateInference.encodeReputationProof(proof);

        const result = await verifyReputationProof(encoded, {
          minThreshold: 70,
          requireCrypto: true,
        });

        expect(result.valid).toBe(false);
        expect(result.error).toContain('unavailable');
      }
    });
  });

  describe('Payment Proof Verification', () => {
    it('should reject escrow ID mismatch', async () => {
      const proof = await privateInference.provePayment({
        escrowId: 'actual-escrow-id',
      });
      const encoded = PrivateInference.encodePaymentProof(proof);

      const result = await verifyPaymentProof(encoded, {
        expectedEscrowId: 'expected-escrow-id',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('mismatch');
    });

    it('should accept matching escrow ID', async () => {
      const escrowId = 'matching-escrow-id';
      const proof = await privateInference.provePayment({ escrowId });
      const encoded = PrivateInference.encodePaymentProof(proof);

      const result = await verifyPaymentProof(encoded, {
        expectedEscrowId: escrowId,
      });

      // Without on-chain verification, this should pass structural validation
      expect(result.valid).toBe(true);
    });

    it('should require on-chain for requireCrypto', async () => {
      const proof = await privateInference.provePayment({
        escrowId: 'test-escrow',
      });
      const encoded = PrivateInference.encodePaymentProof(proof);

      const result = await verifyPaymentProof(encoded, {
        requireCrypto: true,
        // No connection provided
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('on-chain verification');
    });
  });
});
