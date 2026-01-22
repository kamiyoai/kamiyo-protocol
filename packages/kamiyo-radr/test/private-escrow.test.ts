/**
 * Private Escrow Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { PrivateEscrowHandler } from '../src/escrow/private-escrow';

// Mock @radr/shadowwire
vi.mock('@radr/shadowwire', () => ({
  ShadowWireClient: vi.fn().mockImplementation(() => ({
    getBalance: vi.fn().mockResolvedValue({ available: 10, poolAddress: 'pool123' }),
    deposit: vi.fn().mockResolvedValue({ transaction: {} }),
    withdraw: vi.fn().mockResolvedValue({ transaction: {} }),
    transfer: vi.fn().mockResolvedValue({ success: true, signature: 'sig123' }),
  })),
}));

// Mock circomlibjs to fail import - forces SHA-256 fallback
vi.mock('circomlibjs', () => {
  throw new Error('circomlibjs not available in test');
});

describe('PrivateEscrowHandler', () => {
  let connection: Connection;
  let handler: PrivateEscrowHandler;
  let wallet: Keypair;
  const programId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

  beforeEach(async () => {
    connection = new Connection('https://api.devnet.solana.com');
    handler = new PrivateEscrowHandler(connection, programId);
    await handler.initialize();
    wallet = Keypair.generate();
  });

  describe('generateAmountCommitment', () => {
    it('should generate valid commitment', async () => {
      const commitment = await handler.generateAmountCommitment(100);

      expect(commitment.amount).toBe(100);
      expect(commitment.blinding).toHaveLength(32);
      // SHA-256 fallback produces 66 chars (0x + 64 hex)
      expect(commitment.commitment.length).toBeGreaterThanOrEqual(64);
    });

    it('should generate different commitments for same amount', async () => {
      const c1 = await handler.generateAmountCommitment(100);
      const c2 = await handler.generateAmountCommitment(100);

      expect(c1.commitment).not.toBe(c2.commitment);
      expect(c1.blinding).not.toEqual(c2.blinding);
    });

    it('should reject negative amounts', async () => {
      await expect(handler.generateAmountCommitment(-100)).rejects.toThrow('non-negative');
    });

    it('should reject non-finite amounts', async () => {
      await expect(handler.generateAmountCommitment(Infinity)).rejects.toThrow('finite');
    });
  });

  describe('createPrivateEscrow', () => {
    it('should create escrow with valid params', async () => {
      const result = await handler.createPrivateEscrow({
        wallet: {
          publicKey: wallet.publicKey,
          signTransaction: async (tx: any) => tx,
        },
        provider: Keypair.generate().publicKey.toBase58(),
        amount: 1.0,
        token: 'SOL',
        transactionId: 'tx_123',
        config: {
          privateDeposit: false, // Skip deposit to avoid connection errors in test
        },
      });

      if (!result.success) {
        console.error('Escrow creation failed:', result.error);
      }
      expect(result.success).toBe(true);
      expect(result.escrowPda).toBeDefined();
      expect(result.transactionId).toBe('tx_123');
      expect(result.shadowProof).toBeDefined();
      expect(result.shadowProof?.commitment.length).toBeGreaterThanOrEqual(64);
    });

    it('should reject invalid provider address', async () => {
      const result = await handler.createPrivateEscrow({
        wallet: {
          publicKey: wallet.publicKey,
          signTransaction: async (tx: any) => tx,
        },
        provider: 'invalid_address',
        amount: 1.0,
        token: 'SOL',
        transactionId: 'tx_123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid provider');
    });

    it('should reject when wallet not connected', async () => {
      const result = await handler.createPrivateEscrow({
        wallet: { publicKey: null },
        provider: Keypair.generate().publicKey.toBase58(),
        amount: 1.0,
        token: 'SOL',
        transactionId: 'tx_123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Wallet not connected');
    });

    it('should reject zero or negative amount', async () => {
      const result = await handler.createPrivateEscrow({
        wallet: {
          publicKey: wallet.publicKey,
          signTransaction: async (tx: any) => tx,
        },
        provider: Keypair.generate().publicKey.toBase58(),
        amount: 0,
        token: 'SOL',
        transactionId: 'tx_123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('should reject self as provider', async () => {
      const result = await handler.createPrivateEscrow({
        wallet: {
          publicKey: wallet.publicKey,
          signTransaction: async (tx: any) => tx,
        },
        provider: wallet.publicKey.toBase58(),
        amount: 1.0,
        token: 'SOL',
        transactionId: 'tx_123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('self as provider');
    });

    it('should reject empty transaction ID', async () => {
      const result = await handler.createPrivateEscrow({
        wallet: {
          publicKey: wallet.publicKey,
          signTransaction: async (tx: any) => tx,
        },
        provider: Keypair.generate().publicKey.toBase58(),
        amount: 1.0,
        token: 'SOL',
        transactionId: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction ID required');
    });
  });

  describe('calculateSettlement', () => {
    it('should calculate 0% refund for high quality (80-100)', () => {
      const settlement = handler.calculateSettlement(95, 100);
      expect(settlement.refundPercentage).toBe(0);
      expect(settlement.agentRefund).toBe(0);
      expect(settlement.providerPayout).toBe(100);
    });

    it('should calculate 35% refund for medium-high quality (65-79)', () => {
      const settlement = handler.calculateSettlement(70, 100);
      expect(settlement.refundPercentage).toBe(35);
      expect(settlement.agentRefund).toBe(35);
      expect(settlement.providerPayout).toBe(65);
    });

    it('should calculate 75% refund for medium quality (50-64)', () => {
      const settlement = handler.calculateSettlement(55, 100);
      expect(settlement.refundPercentage).toBe(75);
      expect(settlement.agentRefund).toBe(75);
      expect(settlement.providerPayout).toBe(25);
    });

    it('should calculate 100% refund for low quality (0-49)', () => {
      const settlement = handler.calculateSettlement(30, 100);
      expect(settlement.refundPercentage).toBe(100);
      expect(settlement.agentRefund).toBe(100);
      expect(settlement.providerPayout).toBe(0);
    });

    it('should handle boundary values correctly', () => {
      expect(handler.calculateSettlement(80, 100).refundPercentage).toBe(0);
      expect(handler.calculateSettlement(79, 100).refundPercentage).toBe(35);
      expect(handler.calculateSettlement(65, 100).refundPercentage).toBe(35);
      expect(handler.calculateSettlement(64, 100).refundPercentage).toBe(75);
      expect(handler.calculateSettlement(50, 100).refundPercentage).toBe(75);
      expect(handler.calculateSettlement(49, 100).refundPercentage).toBe(100);
    });
  });

  describe('fileDispute', () => {
    it('should create dispute with valid params', async () => {
      const escrowPda = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), wallet.publicKey.toBuffer(), Buffer.from('tx_123')],
        programId
      )[0].toBase58();

      const result = await handler.fileDispute({
        escrowPda,
        transactionId: 'tx_123',
        reason: 'Service not delivered',
      });

      expect(result.success).toBe(true);
      expect(result.disputeId).toContain('dispute_tx_123');
      expect(result.oracleCommitDeadline).toBeGreaterThan(Date.now() / 1000);
    });

    it('should reject invalid escrow address', async () => {
      const result = await handler.fileDispute({
        escrowPda: 'invalid',
        transactionId: 'tx_123',
        reason: 'Service not delivered',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid escrow');
    });
  });
});
