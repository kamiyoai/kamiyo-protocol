/**
 * Webhook Handler Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
    verifyWebhookSignature,
    parseWebhookPayload,
    createWebhookHandler,
    filterEventsByType,
    groupEventsByEscrow,
    getEventStats
} from '../src/webhooks';
import { HeliusWebhookPayload, KamiyoEvent } from '../src/types';
import { KAMIYO_PROGRAM_ID, INSTRUCTION_DISCRIMINATORS } from '../src/constants';
import { createHmac } from 'crypto';

describe('Webhooks', () => {
    describe('verifyWebhookSignature', () => {
        const secret = 'test-secret';

        it('should verify valid signature', () => {
            const payload = JSON.stringify({ test: 'data' });
            const signature = createHmac('sha256', secret)
                .update(payload)
                .digest('hex');

            expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
        });

        it('should reject invalid signature', () => {
            const payload = JSON.stringify({ test: 'data' });
            const invalidSignature = 'invalid-signature';

            expect(verifyWebhookSignature(payload, invalidSignature, secret)).toBe(false);
        });

        it('should reject tampered payload', () => {
            const originalPayload = JSON.stringify({ test: 'data' });
            const tamperedPayload = JSON.stringify({ test: 'tampered' });
            const signature = createHmac('sha256', secret)
                .update(originalPayload)
                .digest('hex');

            expect(verifyWebhookSignature(tamperedPayload, signature, secret)).toBe(false);
        });

        it('should work with Buffer payload', () => {
            const payload = Buffer.from(JSON.stringify({ test: 'data' }));
            const signature = createHmac('sha256', secret)
                .update(payload.toString('utf-8'))
                .digest('hex');

            expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
        });
    });

    describe('parseWebhookPayload', () => {
        it('should skip non-KAMIYO transactions', () => {
            const payload: HeliusWebhookPayload[] = [{
                webhookURL: 'https://example.com/webhook',
                accountData: [],
                description: 'Test transaction',
                events: {},
                fee: 5000,
                feePayer: 'SomeWallet',
                instructions: [{
                    programId: 'OtherProgram',
                    accounts: [],
                    data: '',
                    innerInstructions: []
                }],
                nativeTransfers: [],
                signature: 'abc123',
                slot: 12345,
                source: 'test',
                timestamp: Math.floor(Date.now() / 1000),
                tokenTransfers: [],
                type: 'UNKNOWN',
                transactionError: null
            }];

            const events = parseWebhookPayload(payload);
            expect(events.length).toBe(0);
        });

        it('should parse KAMIYO transactions', () => {
            const data = Buffer.alloc(32);
            INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW.copy(data, 0);
            data.writeBigUInt64LE(1000000000n, 8);

            const payload: HeliusWebhookPayload[] = [{
                webhookURL: 'https://example.com/webhook',
                accountData: [],
                description: 'Initialize escrow',
                events: {},
                fee: 5000,
                feePayer: 'Agent123',
                instructions: [{
                    programId: KAMIYO_PROGRAM_ID,
                    accounts: ['EscrowPDA', 'Agent123', 'Provider456'],
                    data: data.toString('base64'),
                    innerInstructions: []
                }],
                nativeTransfers: [],
                signature: 'abc123',
                slot: 12345,
                source: 'test',
                timestamp: Math.floor(Date.now() / 1000),
                tokenTransfers: [],
                type: 'UNKNOWN',
                transactionError: null
            }];

            const events = parseWebhookPayload(payload);

            expect(events.length).toBe(1);
            expect(events[0].type).toBe('escrow_created');
            expect(events[0].escrowPda).toBe('EscrowPDA');
            expect(events[0].agent).toBe('Agent123');
            expect(events[0].provider).toBe('Provider456');
        });
    });

    describe('createWebhookHandler', () => {
        it('should call appropriate handler for each event type', async () => {
            const onEscrowCreated = vi.fn();
            const onEscrowFunded = vi.fn();

            const handler = createWebhookHandler({
                onEscrowCreated,
                onEscrowFunded
            });

            const initData = Buffer.alloc(32);
            INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW.copy(initData, 0);

            const fundData = Buffer.alloc(32);
            INSTRUCTION_DISCRIMINATORS.FUND_ESCROW.copy(fundData, 0);

            const mockReq = {
                body: [{
                    webhookURL: 'https://example.com/webhook',
                    accountData: [],
                    description: 'Test',
                    events: {},
                    fee: 5000,
                    feePayer: 'Agent123',
                    instructions: [
                        {
                            programId: KAMIYO_PROGRAM_ID,
                            accounts: ['EscrowPDA', 'Agent123', 'Provider456'],
                            data: initData.toString('base64'),
                            innerInstructions: []
                        },
                        {
                            programId: KAMIYO_PROGRAM_ID,
                            accounts: ['EscrowPDA'],
                            data: fundData.toString('base64'),
                            innerInstructions: []
                        }
                    ],
                    nativeTransfers: [{ fromUserAccount: 'Agent123', toUserAccount: 'EscrowPDA', amount: 1000000000 }],
                    signature: 'abc123',
                    slot: 12345,
                    source: 'test',
                    timestamp: Math.floor(Date.now() / 1000),
                    tokenTransfers: [],
                    type: 'UNKNOWN',
                    transactionError: null
                }],
                headers: {}
            };

            const mockRes = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn()
            };

            await handler(mockReq, mockRes);

            expect(onEscrowCreated).toHaveBeenCalledOnce();
            expect(onEscrowFunded).toHaveBeenCalledOnce();
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should call onError for handler failures', async () => {
            const onEscrowCreated = vi.fn().mockRejectedValue(new Error('Handler error'));
            const onError = vi.fn();

            const handler = createWebhookHandler({
                onEscrowCreated,
                onError
            });

            const initData = Buffer.alloc(32);
            INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW.copy(initData, 0);

            const mockReq = {
                body: [{
                    webhookURL: 'https://example.com/webhook',
                    accountData: [],
                    description: 'Test',
                    events: {},
                    fee: 5000,
                    feePayer: 'Agent123',
                    instructions: [{
                        programId: KAMIYO_PROGRAM_ID,
                        accounts: ['EscrowPDA', 'Agent123', 'Provider456'],
                        data: initData.toString('base64'),
                        innerInstructions: []
                    }],
                    nativeTransfers: [],
                    signature: 'abc123',
                    slot: 12345,
                    source: 'test',
                    timestamp: Math.floor(Date.now() / 1000),
                    tokenTransfers: [],
                    type: 'UNKNOWN',
                    transactionError: null
                }],
                headers: {}
            };

            const mockRes = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn()
            };

            await handler(mockReq, mockRes);

            expect(onError).toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(200); // Still returns 200
        });
    });

    describe('filterEventsByType', () => {
        const events: KamiyoEvent[] = [
            { type: 'escrow_created', escrowId: '1', escrowPda: 'pda1', agent: null, provider: null, amount: null, qualityScore: null, refundAmount: null, signature: 'sig1', timestamp: 1000, slot: 100 },
            { type: 'escrow_funded', escrowId: '1', escrowPda: 'pda1', agent: null, provider: null, amount: 1000n, qualityScore: null, refundAmount: null, signature: 'sig2', timestamp: 1001, slot: 101 },
            { type: 'dispute_initiated', escrowId: '1', escrowPda: 'pda1', agent: null, provider: null, amount: null, qualityScore: null, refundAmount: null, signature: 'sig3', timestamp: 1002, slot: 102 }
        ];

        it('should filter by single type', () => {
            const filtered = filterEventsByType(events, ['escrow_created']);
            expect(filtered.length).toBe(1);
            expect(filtered[0].type).toBe('escrow_created');
        });

        it('should filter by multiple types', () => {
            const filtered = filterEventsByType(events, ['escrow_created', 'escrow_funded']);
            expect(filtered.length).toBe(2);
        });
    });

    describe('groupEventsByEscrow', () => {
        it('should group events by escrow PDA', () => {
            const events: KamiyoEvent[] = [
                { type: 'escrow_created', escrowId: '1', escrowPda: 'pda1', agent: null, provider: null, amount: null, qualityScore: null, refundAmount: null, signature: 'sig1', timestamp: 1000, slot: 100 },
                { type: 'escrow_funded', escrowId: '1', escrowPda: 'pda1', agent: null, provider: null, amount: 1000n, qualityScore: null, refundAmount: null, signature: 'sig2', timestamp: 1001, slot: 101 },
                { type: 'escrow_created', escrowId: '2', escrowPda: 'pda2', agent: null, provider: null, amount: null, qualityScore: null, refundAmount: null, signature: 'sig3', timestamp: 1002, slot: 102 }
            ];

            const grouped = groupEventsByEscrow(events);

            expect(grouped.size).toBe(2);
            expect(grouped.get('pda1')?.length).toBe(2);
            expect(grouped.get('pda2')?.length).toBe(1);
        });
    });

    describe('getEventStats', () => {
        it('should calculate statistics', () => {
            const events: KamiyoEvent[] = [
                { type: 'escrow_created', escrowId: '1', escrowPda: 'pda1', agent: null, provider: null, amount: 1000000000n, qualityScore: null, refundAmount: null, signature: 'sig1', timestamp: 1000, slot: 100 },
                { type: 'escrow_funded', escrowId: '1', escrowPda: 'pda1', agent: null, provider: null, amount: 1000000000n, qualityScore: null, refundAmount: null, signature: 'sig2', timestamp: 1001, slot: 101 },
                { type: 'dispute_resolved', escrowId: '1', escrowPda: 'pda1', agent: null, provider: null, amount: null, qualityScore: 80, refundAmount: 200000000n, signature: 'sig3', timestamp: 1002, slot: 102 },
                { type: 'dispute_resolved', escrowId: '2', escrowPda: 'pda2', agent: null, provider: null, amount: null, qualityScore: 90, refundAmount: 100000000n, signature: 'sig4', timestamp: 1003, slot: 103 }
            ];

            const stats = getEventStats(events);

            expect(stats.total).toBe(4);
            expect(stats.byType.escrow_created).toBe(1);
            expect(stats.byType.escrow_funded).toBe(1);
            expect(stats.byType.dispute_resolved).toBe(2);
            expect(stats.uniqueEscrows).toBe(2);
            expect(stats.totalVolume).toBe(2000000000n);
            expect(stats.averageQualityScore).toBe(85);
        });
    });
});
