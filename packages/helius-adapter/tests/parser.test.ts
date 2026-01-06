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
    extractRefundFromLogs
} from '../src/parser';
import { HeliusEnhancedTransaction, ParsedTransaction } from '../src/types';
import { KAMIYO_PROGRAM_ID, INSTRUCTION_DISCRIMINATORS } from '../src/constants';

describe('Parser', () => {
    describe('parseTransaction', () => {
        it('should return unknown for non-KAMIYO transactions', () => {
            const tx: HeliusEnhancedTransaction = {
                signature: 'abc123',
                slot: 12345,
                timestamp: Math.floor(Date.now() / 1000),
                fee: 5000,
                feePayer: 'SomeWallet123',
                instructions: [{
                    programId: 'OtherProgram',
                    accounts: [],
                    data: '',
                    innerInstructions: []
                }],
                accountData: [],
                nativeTransfers: [],
                tokenTransfers: [],
                events: {},
                transactionError: null
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
                transactionError: 'InstructionError'
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
            const buffer = Buffer.alloc(150);
            let offset = 0;

            // Discriminator (8 bytes)
            INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW.copy(buffer, offset);
            offset += 8;

            // Agent (32 bytes)
            const agent = PublicKey.unique();
            agent.toBuffer().copy(buffer, offset);
            offset += 32;

            // Provider (32 bytes)
            const provider = PublicKey.unique();
            provider.toBuffer().copy(buffer, offset);
            offset += 32;

            // Amount (8 bytes)
            buffer.writeBigUInt64LE(1000000000n, offset);
            offset += 8;

            // Status (1 byte)
            buffer.writeUInt8(0, offset); // active
            offset += 1;

            // Quality score (1 byte)
            buffer.writeUInt8(85, offset);
            offset += 1;

            // Refund amount (8 bytes)
            buffer.writeBigUInt64LE(0n, offset);
            offset += 8;

            // Time lock (4 bytes)
            buffer.writeUInt32LE(86400, offset);
            offset += 4;

            // Created at (8 bytes)
            buffer.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) - 3600), offset);
            offset += 8;

            // Updated at (8 bytes)
            buffer.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), offset);

            const pda = PublicKey.unique();
            const state = parseEscrowState(buffer, pda);

            expect(state.pda.equals(pda)).toBe(true);
            expect(state.agent.equals(agent)).toBe(true);
            expect(state.provider.equals(provider)).toBe(true);
            expect(state.amount).toBe(1000000000n);
            expect(state.status).toBe('active');
            expect(state.qualityScore).toBe(85);
            expect(state.timeLock).toBe(86400);
        });
    });

    describe('groupByEscrow', () => {
        it('should group transactions by escrow PDA', () => {
            const txs: ParsedTransaction[] = [
                {
                    signature: 'sig1',
                    type: 'initialize_escrow',
                    escrowPda: 'escrow1',
                    agent: 'agent1',
                    provider: 'provider1',
                    amount: 1000n,
                    qualityScore: null,
                    refundAmount: null,
                    timestamp: 1000,
                    slot: 100,
                    success: true,
                    error: null
                },
                {
                    signature: 'sig2',
                    type: 'fund_escrow',
                    escrowPda: 'escrow1',
                    agent: null,
                    provider: null,
                    amount: 1000n,
                    qualityScore: null,
                    refundAmount: null,
                    timestamp: 1001,
                    slot: 101,
                    success: true,
                    error: null
                },
                {
                    signature: 'sig3',
                    type: 'initialize_escrow',
                    escrowPda: 'escrow2',
                    agent: 'agent2',
                    provider: 'provider2',
                    amount: 2000n,
                    qualityScore: null,
                    refundAmount: null,
                    timestamp: 1002,
                    slot: 102,
                    success: true,
                    error: null
                }
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
                    type: 'fund_escrow',
                    escrowPda: 'escrow1',
                    agent: null,
                    provider: null,
                    amount: 1000n,
                    qualityScore: null,
                    refundAmount: null,
                    timestamp: 2000,
                    slot: 200,
                    success: true,
                    error: null
                },
                {
                    signature: 'sig1',
                    type: 'initialize_escrow',
                    escrowPda: 'escrow1',
                    agent: 'agent1',
                    provider: 'provider1',
                    amount: 1000n,
                    qualityScore: null,
                    refundAmount: null,
                    timestamp: 1000,
                    slot: 100,
                    success: true,
                    error: null
                }
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
                    type: 'initialize_escrow',
                    escrowPda: 'escrow1',
                    agent: 'agent1',
                    provider: 'provider1',
                    amount: 1000000000n,
                    qualityScore: null,
                    refundAmount: null,
                    timestamp: now - 3600,
                    slot: 100,
                    success: true,
                    error: null
                },
                {
                    signature: 'sig2',
                    type: 'fund_escrow',
                    escrowPda: 'escrow1',
                    agent: null,
                    provider: null,
                    amount: 1000000000n,
                    qualityScore: null,
                    refundAmount: null,
                    timestamp: now - 3500,
                    slot: 101,
                    success: true,
                    error: null
                },
                {
                    signature: 'sig3',
                    type: 'initiate_dispute',
                    escrowPda: 'escrow1',
                    agent: null,
                    provider: null,
                    amount: null,
                    qualityScore: null,
                    refundAmount: null,
                    timestamp: now - 1800,
                    slot: 102,
                    success: true,
                    error: null
                },
                {
                    signature: 'sig4',
                    type: 'resolve_dispute',
                    escrowPda: 'escrow1',
                    agent: null,
                    provider: null,
                    amount: null,
                    qualityScore: 75,
                    refundAmount: 250000000n,
                    timestamp: now - 900,
                    slot: 103,
                    success: true,
                    error: null
                }
            ];

            const lifecycle = calculateEscrowLifecycle(txs);

            expect(lifecycle.initialized).toBe(now - 3600);
            expect(lifecycle.funded).toBe(now - 3500);
            expect(lifecycle.disputed).toBe(now - 1800);
            expect(lifecycle.resolved).toBe(now - 900);
            expect(lifecycle.released).toBeNull();
            expect(lifecycle.wasDisputed).toBe(true);
            expect(lifecycle.finalQualityScore).toBe(75);
            expect(lifecycle.totalAmount).toBe(1000000000n);
        });
    });

    describe('detectTypeFromLogs', () => {
        it('should detect initialize escrow', () => {
            const logs = ['Program log: Instruction: InitializeEscrow'];
            expect(detectTypeFromLogs(logs)).toBe('initialize_escrow');
        });

        it('should detect dispute resolved', () => {
            const logs = ['Program log: Quality Score: 85', 'Some other log'];
            expect(detectTypeFromLogs(logs)).toBe('resolve_dispute');
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
