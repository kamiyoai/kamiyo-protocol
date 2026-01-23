import {
  declareReputationExtension,
  buildReputationPayload,
  parseReputationExtension,
  parseReputationPayload,
  validateReputationPayload,
  declareEscrowExtension,
  buildEscrowPayload,
  parseEscrowExtension,
  parseEscrowPayload,
  validateEscrowPayload,
  DEFAULT_REPUTATION_TIERS,
  DEFAULT_REFUND_SCHEDULE,
  REPUTATION_EXTENSION_KEY,
  ESCROW_EXTENSION_KEY,
} from './extensions';
import type { PaymentRequired402 } from './types';

describe('Reputation Extension', () => {
  describe('declareReputationExtension', () => {
    it('builds extension with defaults', () => {
      const ext = declareReputationExtension({ minThreshold: 70 });
      expect(ext['kamiyo-reputation']).toBeDefined();
      const info = ext['kamiyo-reputation'].info as any;
      expect(info.minThreshold).toBe(70);
      expect(info.proofType).toBe('groth16-bn254');
      expect(info.tiers).toEqual(DEFAULT_REPUTATION_TIERS);
      expect(info.creditEnabled).toBe(false);
    });

    it('includes JSON Schema for client payload', () => {
      const ext = declareReputationExtension({ minThreshold: 70 });
      expect(ext['kamiyo-reputation'].schema).toBeDefined();
      const schema = ext['kamiyo-reputation'].schema as any;
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.required).toContain('proof');
      expect(schema.required).toContain('commitment');
    });

    it('builds extension with custom tiers', () => {
      const tiers = [{ name: 'custom', minThreshold: 60, discountPercent: 20 }];
      const ext = declareReputationExtension({ minThreshold: 60, tiers, creditEnabled: true });
      const info = ext['kamiyo-reputation'].info as any;
      expect(info.tiers).toEqual(tiers);
      expect(info.creditEnabled).toBe(true);
    });
  });

  describe('buildReputationPayload', () => {
    it('encodes proof as base64 nested under info', () => {
      const proof = new Uint8Array([1, 2, 3, 4]);
      const payload = buildReputationPayload({
        proof,
        commitment: '0xabc',
        threshold: 80,
        agentPk: 'agent123',
        publicSignals: ['111', '222'],
      });

      const rep = payload['kamiyo-reputation'].info as any;
      expect(rep.proof).toBe(Buffer.from(proof).toString('base64'));
      expect(rep.commitment).toBe('0xabc');
      expect(rep.threshold).toBe(80);
      expect(rep.agentPk).toBe('agent123');
      expect(rep.publicSignals).toEqual(['111', '222']);
    });

    it('accepts string proof directly', () => {
      const payload = buildReputationPayload({
        proof: 'already-base64',
        commitment: '0xdef',
        threshold: 90,
        agentPk: 'agent456',
        publicSignals: ['333'],
      });
      expect((payload['kamiyo-reputation'].info as any).proof).toBe('already-base64');
    });
  });

  describe('parseReputationExtension', () => {
    it('extracts info from 402 response', () => {
      const response: PaymentRequired402 = {
        x402Version: 2,
        accepts: [{
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '10000',
          asset: 'USDC',
          payTo: '0x123',
          resource: '/api',
          description: 'test',
          maxTimeoutSeconds: 60,
        }],
        error: 'Payment Required',
        facilitator: 'https://f.test',
        extensions: {
          'kamiyo-reputation': {
            info: {
              minThreshold: 75,
              proofType: 'groth16-bn254',
              tiers: DEFAULT_REPUTATION_TIERS,
              creditEnabled: false,
            },
          },
        },
      };

      const info = parseReputationExtension(response);
      expect(info).not.toBeNull();
      expect(info!.minThreshold).toBe(75);
      expect(info!.proofType).toBe('groth16-bn254');
    });

    it('returns null when no extension', () => {
      const response: PaymentRequired402 = {
        x402Version: 2,
        accepts: [{
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '10000',
          asset: 'USDC',
          payTo: '0x123',
          resource: '/api',
          description: 'test',
          maxTimeoutSeconds: 60,
        }],
        error: 'Payment Required',
        facilitator: 'https://f.test',
      };
      expect(parseReputationExtension(response)).toBeNull();
    });
  });

  describe('parseReputationPayload', () => {
    it('extracts payload from extensions with info nesting', () => {
      const extensions = {
        'kamiyo-reputation': {
          info: {
            proof: 'base64proof',
            commitment: '0xabc',
            threshold: 85,
            agentPk: 'agent',
            publicSignals: ['1', '2'],
          },
        },
      };
      const payload = parseReputationPayload(extensions);
      expect(payload).not.toBeNull();
      expect(payload!.threshold).toBe(85);
    });

    it('returns null for missing extension', () => {
      expect(parseReputationPayload({})).toBeNull();
      expect(parseReputationPayload(undefined)).toBeNull();
    });

    it('returns null for malformed payload', () => {
      expect(parseReputationPayload({ 'kamiyo-reputation': { info: { bad: true } } })).toBeNull();
    });
  });

  describe('validateReputationPayload', () => {
    const valid = {
      proof: 'base64data',
      commitment: '0x' + 'a'.repeat(64),
      threshold: 75,
      agentPk: 'agent123',
      publicSignals: ['123', '456'],
    };

    it('validates correct payload', () => {
      expect(validateReputationPayload(valid)).toEqual({ valid: true, errors: [] });
    });

    it('rejects bad commitment format', () => {
      const result = validateReputationPayload({ ...valid, commitment: 'bad' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('commitment');
    });

    it('rejects out-of-range threshold', () => {
      expect(validateReputationPayload({ ...valid, threshold: 101 }).valid).toBe(false);
      expect(validateReputationPayload({ ...valid, threshold: -1 }).valid).toBe(false);
    });

    it('rejects non-numeric publicSignals', () => {
      const result = validateReputationPayload({ ...valid, publicSignals: ['abc'] });
      expect(result.valid).toBe(false);
    });

    it('rejects empty publicSignals', () => {
      const result = validateReputationPayload({ ...valid, publicSignals: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects non-object', () => {
      expect(validateReputationPayload(null).valid).toBe(false);
      expect(validateReputationPayload('str').valid).toBe(false);
    });
  });
});

describe('Escrow Extension', () => {
  describe('declareEscrowExtension', () => {
    it('builds extension with defaults', () => {
      const ext = declareEscrowExtension({ programId: 'ProgramPubkey123456789012345678901234' });
      expect(ext['kamiyo-escrow']).toBeDefined();
      const info = ext['kamiyo-escrow'].info as any;
      expect(info.required).toBe(true);
      expect(info.timelockSeconds).toBe(3600);
      expect(info.qualityThreshold).toBe(70);
      expect(info.programId).toBe('ProgramPubkey123456789012345678901234');
      expect(info.refundSchedule).toEqual(DEFAULT_REFUND_SCHEDULE);
    });

    it('includes JSON Schema for client payload', () => {
      const ext = declareEscrowExtension({ programId: 'Prog1234' });
      expect(ext['kamiyo-escrow'].schema).toBeDefined();
      const schema = ext['kamiyo-escrow'].schema as any;
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.required).toContain('escrowPda');
      expect(schema.required).toContain('transactionId');
      expect(schema.required).toContain('agentPk');
    });

    it('accepts custom options', () => {
      const ext = declareEscrowExtension({
        programId: 'Prog1234',
        timelockSeconds: 7200,
        qualityThreshold: 80,
        required: false,
      });
      const info = ext['kamiyo-escrow'].info as any;
      expect(info.timelockSeconds).toBe(7200);
      expect(info.qualityThreshold).toBe(80);
      expect(info.required).toBe(false);
    });
  });

  describe('buildEscrowPayload', () => {
    it('builds correct structure nested under info', () => {
      const payload = buildEscrowPayload({
        escrowPda: 'EscrowPDA12345678901234567890123456',
        transactionId: 'tx-123',
        agentPk: 'AgentPK12345678901234567890123456789',
      });
      const escrow = payload['kamiyo-escrow'].info as any;
      expect(escrow.escrowPda).toBe('EscrowPDA12345678901234567890123456');
      expect(escrow.transactionId).toBe('tx-123');
      expect(escrow.agentPk).toBe('AgentPK12345678901234567890123456789');
    });
  });

  describe('parseEscrowExtension', () => {
    it('extracts info from 402 response', () => {
      const response: PaymentRequired402 = {
        x402Version: 2,
        accepts: [{
          x402Version: 2,
          scheme: 'exact',
          network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          amount: '50000',
          asset: 'USDC',
          payTo: 'Provider123',
          resource: '/api',
          description: 'test',
          maxTimeoutSeconds: 60,
        }],
        error: 'Payment Required',
        facilitator: 'https://f.test',
        extensions: {
          'kamiyo-escrow': {
            info: {
              required: true,
              timelockSeconds: 3600,
              qualityThreshold: 70,
              programId: 'Prog123',
              refundSchedule: DEFAULT_REFUND_SCHEDULE,
            },
          },
        },
      };

      const info = parseEscrowExtension(response);
      expect(info).not.toBeNull();
      expect(info!.required).toBe(true);
      expect(info!.programId).toBe('Prog123');
    });

    it('returns null when no extension', () => {
      const response: PaymentRequired402 = {
        x402Version: 2,
        accepts: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453', amount: '10000', asset: 'USDC', payTo: '0x', resource: '/', description: '', maxTimeoutSeconds: 60 }],
        error: 'Payment Required',
        facilitator: '',
      };
      expect(parseEscrowExtension(response)).toBeNull();
    });
  });

  describe('parseEscrowPayload', () => {
    it('extracts payload from info nesting', () => {
      const extensions = {
        'kamiyo-escrow': {
          info: {
            escrowPda: 'PDA123',
            transactionId: 'tx-456',
            agentPk: 'Agent789',
          },
        },
      };
      const payload = parseEscrowPayload(extensions);
      expect(payload).not.toBeNull();
      expect(payload!.transactionId).toBe('tx-456');
    });

    it('returns null for incomplete payload', () => {
      expect(parseEscrowPayload({ 'kamiyo-escrow': { info: { escrowPda: 'x' } } })).toBeNull();
    });
  });

  describe('validateEscrowPayload', () => {
    const valid = {
      escrowPda: 'A'.repeat(44),
      transactionId: 'tx-test-123',
      agentPk: 'B'.repeat(44),
    };

    it('validates correct payload', () => {
      expect(validateEscrowPayload(valid)).toEqual({ valid: true, errors: [] });
    });

    it('rejects short PDA', () => {
      expect(validateEscrowPayload({ ...valid, escrowPda: 'short' }).valid).toBe(false);
    });

    it('rejects empty transactionId', () => {
      expect(validateEscrowPayload({ ...valid, transactionId: '' }).valid).toBe(false);
    });

    it('rejects too-long transactionId', () => {
      expect(validateEscrowPayload({ ...valid, transactionId: 'x'.repeat(129) }).valid).toBe(false);
    });

    it('rejects non-object', () => {
      expect(validateEscrowPayload(null).valid).toBe(false);
    });
  });
});

describe('Extension keys', () => {
  it('has correct key names', () => {
    expect(REPUTATION_EXTENSION_KEY).toBe('kamiyo-reputation');
    expect(ESCROW_EXTENSION_KEY).toBe('kamiyo-escrow');
  });
});
