/**
 * Webhook Handler Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  verifyWebhookSignature,
  parseWebhookPayload,
  createWebhookHandler,
  createVerifiedWebhookHandler,
  filterEventsByType,
  groupEventsByEscrow,
  getEventStats,
} from '../src/webhooks';
import { HeliusWebhookPayload, KamiyoEvent } from '../src/types';
import { KAMIYO_PROGRAM_ID, INSTRUCTION_DISCRIMINATORS } from '../src/constants';
import { createHmac } from 'crypto';

describe('Webhooks', () => {
  describe('verifyWebhookSignature', () => {
    const secret = 'test-secret';

    it('should verify valid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signature = createHmac('sha256', secret).update(payload).digest('hex');

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
      const signature = createHmac('sha256', secret).update(originalPayload).digest('hex');

      expect(verifyWebhookSignature(tamperedPayload, signature, secret)).toBe(false);
    });

    it('should work with Buffer payload', () => {
      const payload = Buffer.from(JSON.stringify({ test: 'data' }));
      const signature = createHmac('sha256', secret).update(payload).digest('hex');

      expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    });

    it('should accept signatures with sha256= prefix', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

      expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    });
  });

  describe('parseWebhookPayload', () => {
    it('should skip non-KAMIYO transactions', () => {
      const payload: HeliusWebhookPayload[] = [
        {
          webhookURL: 'https://example.com/webhook',
          accountData: [],
          description: 'Test transaction',
          events: {},
          fee: 5000,
          feePayer: 'SomeWallet',
          instructions: [
            {
              programId: 'OtherProgram',
              accounts: [],
              data: '',
              innerInstructions: [],
            },
          ],
          nativeTransfers: [],
          signature: 'abc123',
          slot: 12345,
          source: 'test',
          timestamp: Math.floor(Date.now() / 1000),
          tokenTransfers: [],
          type: 'UNKNOWN',
          transactionError: null,
        },
      ];

      const events = parseWebhookPayload(payload);
      expect(events.length).toBe(0);
    });

    it('should parse initializeEscrow (escrow_created)', () => {
      const transactionId = 'tx-123';
      const txIdBytes = Buffer.from(transactionId, 'utf8');
      const data = Buffer.alloc(8 + 8 + 8 + 4 + txIdBytes.length);

      INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW.copy(data, 0);
      data.writeBigUInt64LE(1_000_000_000n, 8); // amount
      data.writeBigInt64LE(60n, 16); // timeLock
      data.writeUInt32LE(txIdBytes.length, 24);
      txIdBytes.copy(data, 28);

      const payload: HeliusWebhookPayload[] = [
        {
          webhookURL: 'https://example.com/webhook',
          accountData: [],
          description: 'Initialize escrow',
          events: {},
          fee: 5000,
          feePayer: 'Agent123',
          instructions: [
            {
              programId: KAMIYO_PROGRAM_ID,
              accounts: ['EscrowPDA', 'Agent123', 'Api456'],
              data: data.toString('base64'),
              innerInstructions: [],
            },
          ],
          nativeTransfers: [],
          signature: 'abc123',
          slot: 12345,
          source: 'test',
          timestamp: Math.floor(Date.now() / 1000),
          tokenTransfers: [],
          type: 'UNKNOWN',
          transactionError: null,
        },
      ];

      const events = parseWebhookPayload(payload);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('escrow_created');
      expect(events[0].escrowPda).toBe('EscrowPDA');
      expect(events[0].agent).toBe('Agent123');
      expect(events[0].api).toBe('Api456');
      expect(events[0].amount).toBe(1_000_000_000n);
      expect(events[0].transactionId).toBe(transactionId);
    });
  });

  describe('createWebhookHandler', () => {
    it('should call appropriate handler for each event type', async () => {
      const onEscrowCreated = vi.fn();
      const onDisputeInitiated = vi.fn();

      const handler = createWebhookHandler({
        onEscrowCreated,
        onDisputeInitiated,
      });

      const initData = Buffer.alloc(8 + 8 + 8 + 4);
      INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW.copy(initData, 0);

      const disputeData = Buffer.alloc(8);
      INSTRUCTION_DISCRIMINATORS.MARK_DISPUTED.copy(disputeData, 0);

      const mockReq = {
        body: [
          {
            webhookURL: 'https://example.com/webhook',
            accountData: [],
            description: 'Test',
            events: {},
            fee: 5000,
            feePayer: 'Agent123',
            instructions: [
              {
                programId: KAMIYO_PROGRAM_ID,
                accounts: ['EscrowPDA', 'Agent123', 'Api456'],
                data: initData.toString('base64'),
                innerInstructions: [],
              },
              {
                programId: KAMIYO_PROGRAM_ID,
                accounts: ['EscrowPDA', 'ReputationPDA', 'Agent123'],
                data: disputeData.toString('base64'),
                innerInstructions: [],
              },
            ],
            nativeTransfers: [{ fromUserAccount: 'Agent123', toUserAccount: 'EscrowPDA', amount: 1_000_000_000 }],
            signature: 'abc123',
            slot: 12345,
            source: 'test',
            timestamp: Math.floor(Date.now() / 1000),
            tokenTransfers: [],
            type: 'UNKNOWN',
            transactionError: null,
          },
        ],
        headers: {},
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await handler(mockReq as any, mockRes as any);

      expect(onEscrowCreated).toHaveBeenCalledOnce();
      expect(onDisputeInitiated).toHaveBeenCalledOnce();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should call onError for handler failures', async () => {
      const onEscrowCreated = vi.fn().mockRejectedValue(new Error('Handler error'));
      const onError = vi.fn();

      const handler = createWebhookHandler({
        onEscrowCreated,
        onError,
      });

      const initData = Buffer.alloc(8);
      INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW.copy(initData, 0);

      const mockReq = {
        body: [
          {
            webhookURL: 'https://example.com/webhook',
            accountData: [],
            description: 'Test',
            events: {},
            fee: 5000,
            feePayer: 'Agent123',
            instructions: [
              {
                programId: KAMIYO_PROGRAM_ID,
                accounts: ['EscrowPDA', 'Agent123', 'Api456'],
                data: initData.toString('base64'),
                innerInstructions: [],
              },
            ],
            nativeTransfers: [],
            signature: 'abc123',
            slot: 12345,
            source: 'test',
            timestamp: Math.floor(Date.now() / 1000),
            tokenTransfers: [],
            type: 'UNKNOWN',
            transactionError: null,
          },
        ],
        headers: {},
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await handler(mockReq as any, mockRes as any);

      expect(onError).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  describe('createVerifiedWebhookHandler', () => {
    it('should verify signature using rawBody and then handle the webhook', async () => {
      const secret = 'test-secret';
      const onEscrowCreated = vi.fn();

      const handler = createVerifiedWebhookHandler(secret, { onEscrowCreated });

      const initData = Buffer.alloc(8);
      INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW.copy(initData, 0);

      const body = [
        {
          webhookURL: 'https://example.com/webhook',
          accountData: [],
          description: 'Test',
          events: {},
          fee: 5000,
          feePayer: 'Agent123',
          instructions: [
            {
              programId: KAMIYO_PROGRAM_ID,
              accounts: ['EscrowPDA', 'Agent123', 'Api456'],
              data: initData.toString('base64'),
              innerInstructions: [],
            },
          ],
          nativeTransfers: [],
          signature: 'abc123',
          slot: 12345,
          source: 'test',
          timestamp: Math.floor(Date.now() / 1000),
          tokenTransfers: [],
          type: 'UNKNOWN',
          transactionError: null,
        },
      ];

      const rawBody = JSON.stringify(body);
      const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

      const mockReq = {
        body,
        rawBody,
        headers: { 'x-helius-signature': signature },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await handler(mockReq as any, mockRes as any);

      expect(onEscrowCreated).toHaveBeenCalledOnce();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 when rawBody is missing and body is not a string', async () => {
      const secret = 'test-secret';
      const handler = createVerifiedWebhookHandler(secret, {});

      const mockReq = {
        body: { foo: 'bar' },
        headers: { 'x-helius-signature': 'deadbeef' },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await handler(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('filterEventsByType', () => {
    const events: KamiyoEvent[] = [
      {
        type: 'escrow_created',
        escrowPda: 'pda1',
        transactionId: 'tx-1',
        agent: 'agent1',
        api: 'api1',
        amount: 1000n,
        qualityScore: null,
        refundPercentage: null,
        refundAmount: null,
        signature: 'sig1',
        timestamp: 1000,
        slot: 100,
      },
      {
        type: 'funds_released',
        escrowPda: 'pda1',
        transactionId: null,
        agent: 'agent1',
        api: 'api1',
        amount: 1000n,
        qualityScore: null,
        refundPercentage: null,
        refundAmount: null,
        signature: 'sig2',
        timestamp: 1001,
        slot: 101,
      },
      {
        type: 'dispute_initiated',
        escrowPda: 'pda1',
        transactionId: null,
        agent: 'agent1',
        api: null,
        amount: null,
        qualityScore: null,
        refundPercentage: null,
        refundAmount: null,
        signature: 'sig3',
        timestamp: 1002,
        slot: 102,
      },
    ];

    it('should filter by single type', () => {
      const filtered = filterEventsByType(events, ['escrow_created']);
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe('escrow_created');
    });

    it('should filter by multiple types', () => {
      const filtered = filterEventsByType(events, ['escrow_created', 'funds_released']);
      expect(filtered.length).toBe(2);
    });
  });

  describe('groupEventsByEscrow', () => {
    it('should group events by escrow PDA', () => {
      const events: KamiyoEvent[] = [
        {
          type: 'escrow_created',
          escrowPda: 'pda1',
          transactionId: 'tx-1',
          agent: null,
          api: null,
          amount: null,
          qualityScore: null,
          refundPercentage: null,
          refundAmount: null,
          signature: 'sig1',
          timestamp: 1000,
          slot: 100,
        },
        {
          type: 'funds_released',
          escrowPda: 'pda1',
          transactionId: null,
          agent: null,
          api: null,
          amount: 1000n,
          qualityScore: null,
          refundPercentage: null,
          refundAmount: null,
          signature: 'sig2',
          timestamp: 1001,
          slot: 101,
        },
        {
          type: 'escrow_created',
          escrowPda: 'pda2',
          transactionId: 'tx-2',
          agent: null,
          api: null,
          amount: null,
          qualityScore: null,
          refundPercentage: null,
          refundAmount: null,
          signature: 'sig3',
          timestamp: 1002,
          slot: 102,
        },
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
        {
          type: 'escrow_created',
          escrowPda: 'pda1',
          transactionId: 'tx-1',
          agent: null,
          api: null,
          amount: 1_000_000_000n,
          qualityScore: null,
          refundPercentage: null,
          refundAmount: null,
          signature: 'sig1',
          timestamp: 1000,
          slot: 100,
        },
        {
          type: 'funds_released',
          escrowPda: 'pda1',
          transactionId: null,
          agent: null,
          api: null,
          amount: 1_000_000_000n,
          qualityScore: null,
          refundPercentage: null,
          refundAmount: null,
          signature: 'sig2',
          timestamp: 1001,
          slot: 101,
        },
        {
          type: 'dispute_resolved',
          escrowPda: 'pda1',
          transactionId: null,
          agent: null,
          api: null,
          amount: null,
          qualityScore: 80,
          refundPercentage: 20,
          refundAmount: 200_000_000n,
          signature: 'sig3',
          timestamp: 1002,
          slot: 102,
        },
        {
          type: 'dispute_resolved',
          escrowPda: 'pda2',
          transactionId: null,
          agent: null,
          api: null,
          amount: null,
          qualityScore: 90,
          refundPercentage: 10,
          refundAmount: 100_000_000n,
          signature: 'sig4',
          timestamp: 1003,
          slot: 103,
        },
      ];

      const stats = getEventStats(events);

      expect(stats.total).toBe(4);
      expect(stats.byType.escrow_created).toBe(1);
      expect(stats.byType.funds_released).toBe(1);
      expect(stats.byType.dispute_resolved).toBe(2);
      expect(stats.uniqueEscrows).toBe(2);
      expect(stats.totalVolume).toBe(2_000_000_000n);
      expect(stats.averageQualityScore).toBe(85);
    });
  });
});

