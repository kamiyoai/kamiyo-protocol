/**
 * Transaction Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  parseTransaction,
  parseEscrowState,
  groupByEscrow,
  calculateEscrowLifecycle,
  detectTypeFromLogs,
  extractQualityScoreFromLogs,
  extractRefundFromLogs,
} from '../src/parser';
import { HeliusEnhancedTransaction, ParsedTransaction } from '../src/types';
import { INSTRUCTION_DISCRIMINATORS } from '../src/constants';

describe('Parser', () => {
  describe('parseTransaction', () => {
    it('should return unknown for non-KAMIYO transactions', () => {
      const tx: HeliusEnhancedTransaction = {
        signature: 'abc123',
        slot: 12345,
        timestamp: Math.floor(Date.now() / 1000),
        fee: 5000,
        feePayer: 'SomeWallet123',
        instructions: [
          {
            programId: 'OtherProgram',
            accounts: [],
            data: '',
            innerInstructions: [],
          },
        ],
        accountData: [],
        nativeTransfers: [],
        tokenTransfers: [],
        events: {},
        transactionError: null,
      };

      const parsed = parseTransaction(tx);

      expect(parsed.type).toBe('unknown');
      expect(parsed.signature).toBe('abc123');
      expect(parsed.success).toBe(true);
    });

    it('should parse transaction errors', () => {
      const tx: HeliusEnhancedTransaction = {
        signature: 'abc123',
        slot: 12345,
        timestamp: Math.floor(Date.now() / 1000),
        fee: 5000,
        feePayer: 'SomeWallet123',
        instructions: [],
        accountData: [],
        nativeTransfers: [],
        tokenTransfers: [],
        events: {},
        transactionError: 'InstructionError',
      };

      const parsed = parseTransaction(tx);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('InstructionError');
    });
  });

  describe('parseEscrowState', () => {
    it('should throw for invalid buffer length', () => {
      const shortBuffer = Buffer.alloc(50);
      const pda = PublicKey.unique();

      expect(() => parseEscrowState(shortBuffer, pda)).toThrow();
    });

    it('should parse valid escrow state', () => {
      const now = Math.floor(Date.now() / 1000);
      const buffer = Buffer.alloc(154);
      let offset = 0;

      // Discriminator (8 bytes) - parser ignores the value.
      INSTRUCTION_DISCRIMINATORS.CREATE_ESCROW.copy(buffer, offset);
      offset += 8;

      const user = PublicKey.unique();
      user.toBuffer().copy(buffer, offset);
      offset += 32;

      const treasury = PublicKey.unique();
      treasury.toBuffer().copy(buffer, offset);
      offset += 32;

      const sessionId = Buffer.alloc(32, 7);
      sessionId.copy(buffer, offset);
      offset += 32;

      buffer.writeBigUInt64LE(1_000_000_000n, offset);
      offset += 8;

      buffer.writeBigInt64LE(BigInt(now - 3600), offset);
      offset += 8;

      buffer.writeUInt8(7, offset); // bump
      offset += 1;

      buffer.writeUInt8(0, offset); // active
      offset += 1;

      buffer.writeUInt8(1, offset); // rating Some
      offset += 1;
      buffer.writeUInt8(4, offset);
      offset += 1;

      buffer.writeUInt8(1, offset); // disputedAt Some
      offset += 1;
      buffer.writeBigInt64LE(BigInt(now - 1800), offset);
      offset += 8;

      buffer.writeUInt8(1, offset); // commitPhaseEndsAt Some
      offset += 1;
      buffer.writeBigInt64LE(BigInt(now + 300), offset);
      offset += 8;

      buffer.writeUInt32LE(0, offset); // oracle_commitments len
      offset += 4;

      buffer.writeUInt32LE(0, offset); // oracle_submissions len
      offset += 4;

      buffer.writeUInt8(1, offset); // qualityScore Some
      offset += 1;
      buffer.writeUInt8(85, offset);
      offset += 1;

      buffer.writeUInt8(1, offset); // refundPercentage Some
      offset += 1;
      buffer.writeUInt8(25, offset);

      const pda = PublicKey.unique();
      const state = parseEscrowState(buffer, pda);

      expect(state.pda.equals(pda)).toBe(true);
      expect(state.user.equals(user)).toBe(true);
      expect(state.treasury.equals(treasury)).toBe(true);
      expect(state.sessionId.toString('hex')).toBe(sessionId.toString('hex'));
      expect(state.amount).toBe(1_000_000_000n);
      expect(state.status).toBe('active');
      expect(state.rating).toBe(4);
      expect(state.disputedAt).toBe(now - 1800);
      expect(state.commitPhaseEndsAt).toBe(now + 300);
      expect(state.qualityScore).toBe(85);
      expect(state.refundPercentage).toBe(25);
    });
  });

  describe('groupByEscrow', () => {
    it('should group transactions by escrow PDA', () => {
      const txs: ParsedTransaction[] = [
        {
          signature: 'sig1',
          type: 'create_escrow',
          escrowPda: 'escrow1',
          user: 'user1',
          treasury: 'treasury1',
          amount: 1000n,
          sessionId: 'session-1',
          rating: null,
          qualityScore: null,
          refundPercentage: null,
          paymentAmount: null,
          refundAmount: null,
          timestamp: 1000,
          slot: 100,
          success: true,
          error: null,
        },
        {
          signature: 'sig2',
          type: 'mark_disputed',
          escrowPda: 'escrow1',
          user: 'user1',
          treasury: null,
          amount: null,
          sessionId: null,
          rating: null,
          qualityScore: null,
          refundPercentage: null,
          paymentAmount: null,
          refundAmount: null,
          timestamp: 1001,
          slot: 101,
          success: true,
          error: null,
        },
        {
          signature: 'sig3',
          type: 'create_escrow',
          escrowPda: 'escrow2',
          user: 'user2',
          treasury: 'treasury2',
          amount: 2000n,
          sessionId: 'session-2',
          rating: null,
          qualityScore: null,
          refundPercentage: null,
          paymentAmount: null,
          refundAmount: null,
          timestamp: 1002,
          slot: 102,
          success: true,
          error: null,
        },
      ];

      const grouped = groupByEscrow(txs);

      expect(grouped.size).toBe(2);
      expect(grouped.get('escrow1')?.length).toBe(2);
      expect(grouped.get('escrow2')?.length).toBe(1);
    });

    it('should sort by timestamp within groups', () => {
      const txs: ParsedTransaction[] = [
        {
          signature: 'sig2',
          type: 'mark_disputed',
          escrowPda: 'escrow1',
          user: 'user1',
          treasury: null,
          amount: null,
          sessionId: null,
          rating: null,
          qualityScore: null,
          refundPercentage: null,
          paymentAmount: null,
          refundAmount: null,
          timestamp: 2000,
          slot: 200,
          success: true,
          error: null,
        },
        {
          signature: 'sig1',
          type: 'create_escrow',
          escrowPda: 'escrow1',
          user: 'user1',
          treasury: 'treasury1',
          amount: 1000n,
          sessionId: 'session-1',
          rating: null,
          qualityScore: null,
          refundPercentage: null,
          paymentAmount: null,
          refundAmount: null,
          timestamp: 1000,
          slot: 100,
          success: true,
          error: null,
        },
      ];

      const grouped = groupByEscrow(txs);
      const escrow1Txs = grouped.get('escrow1')!;

      expect(escrow1Txs[0].timestamp).toBe(1000);
      expect(escrow1Txs[1].timestamp).toBe(2000);
    });
  });

  describe('calculateEscrowLifecycle', () => {
    it('should calculate lifecycle from transactions', () => {
      const now = Math.floor(Date.now() / 1000);
      const txs: ParsedTransaction[] = [
        {
          signature: 'sig1',
          type: 'create_escrow',
          escrowPda: 'escrow1',
          user: 'user1',
          treasury: 'treasury1',
          amount: 1_000_000_000n,
          sessionId: 'session-1',
          rating: null,
          qualityScore: null,
          refundPercentage: null,
          paymentAmount: null,
          refundAmount: null,
          timestamp: now - 3600,
          slot: 100,
          success: true,
          error: null,
        },
        {
          signature: 'sig2',
          type: 'mark_disputed',
          escrowPda: 'escrow1',
          user: 'user1',
          treasury: null,
          amount: null,
          sessionId: null,
          rating: null,
          qualityScore: null,
          refundPercentage: null,
          paymentAmount: null,
          refundAmount: null,
          timestamp: now - 1800,
          slot: 101,
          success: true,
          error: null,
        },
        {
          signature: 'sig3',
          type: 'finalize_dispute',
          escrowPda: 'escrow1',
          user: 'user1',
          treasury: 'treasury1',
          amount: null,
          sessionId: null,
          rating: null,
          qualityScore: 75,
          refundPercentage: 25,
          paymentAmount: 750_000_000n,
          refundAmount: 250_000_000n,
          timestamp: now - 900,
          slot: 102,
          success: true,
          error: null,
        },
      ];

      const lifecycle = calculateEscrowLifecycle(txs);

      expect(lifecycle.initialized).toBe(now - 3600);
      expect(lifecycle.disputed).toBe(now - 1800);
      expect(lifecycle.resolved).toBe(now - 900);
      expect(lifecycle.released).toBeNull();
      expect(lifecycle.refunded).toBeNull();
      expect(lifecycle.wasDisputed).toBe(true);
      expect(lifecycle.finalQualityScore).toBe(75);
      expect(lifecycle.refundPercentage).toBe(25);
      expect(lifecycle.totalAmount).toBe(1_000_000_000n);
    });
  });

  describe('detectTypeFromLogs', () => {
    it('should detect create escrow', () => {
      const logs = ['Program log: Instruction: CreateEscrow'];
      expect(detectTypeFromLogs(logs)).toBe('create_escrow');
    });

    it('should detect dispute marked', () => {
      const logs = ['Program log: Instruction: MarkDisputed'];
      expect(detectTypeFromLogs(logs)).toBe('mark_disputed');
    });

    it('should detect dispute resolved', () => {
      const logs = ['Program log: Instruction: FinalizeDispute'];
      expect(detectTypeFromLogs(logs)).toBe('finalize_dispute');
    });

    it('should return unknown for unrecognized logs', () => {
      const logs = ['Program log: Something else'];
      expect(detectTypeFromLogs(logs)).toBe('unknown');
    });
  });

  describe('extractQualityScoreFromLogs', () => {
    it('should extract quality score', () => {
      const logs = ['Program log: Quality Score: 85'];
      expect(extractQualityScoreFromLogs(logs)).toBe(85);
    });

    it('should return null if not found', () => {
      const logs = ['Program log: Something else'];
      expect(extractQualityScoreFromLogs(logs)).toBeNull();
    });
  });

  describe('extractRefundFromLogs', () => {
    it('should extract refund amount', () => {
      const logs = ['Program log: Refund to Agent: 0.25'];
      expect(extractRefundFromLogs(logs)).toBe(0.25);
    });

    it('should return null if not found', () => {
      const logs = ['Program log: Something else'];
      expect(extractRefundFromLogs(logs)).toBeNull();
    });
  });
});
