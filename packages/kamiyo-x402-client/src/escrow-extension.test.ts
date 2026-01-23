import {
  escrowExtensionInfo,
  buildEscrowPayloadV2,
  parseEscrowRequirement,
  hasEscrowProof,
  calculateRefund,
  ESCROW_EXTENSION_KEY,
} from './escrow-extension';
import type { PaymentRequired402 } from './v2/types';

describe('escrowExtensionInfo', () => {
  it('builds extension declaration with defaults', () => {
    const ext = escrowExtensionInfo('ProgramPubkey123456789012345678901234');
    expect(ext[ESCROW_EXTENSION_KEY]).toBeDefined();
    const info = ext[ESCROW_EXTENSION_KEY].info as any;
    expect(info.required).toBe(true);
    expect(info.timelockSeconds).toBe(3600);
    expect(info.qualityThreshold).toBe(70);
    expect(info.programId).toBe('ProgramPubkey123456789012345678901234');
  });

  it('accepts custom options', () => {
    const ext = escrowExtensionInfo('Prog1234', {
      timelockSeconds: 7200,
      qualityThreshold: 80,
      required: false,
    });
    const info = ext[ESCROW_EXTENSION_KEY].info as any;
    expect(info.timelockSeconds).toBe(7200);
    expect(info.qualityThreshold).toBe(80);
    expect(info.required).toBe(false);
  });
});

describe('buildEscrowPayloadV2', () => {
  it('builds correct structure nested under info', () => {
    const payload = buildEscrowPayloadV2({
      escrowPda: 'EscrowPDA12345678901234567890123456',
      transactionId: 'tx-123',
      agentPk: 'AgentPK12345678901234567890123456789',
    });
    const escrow = payload[ESCROW_EXTENSION_KEY].info as any;
    expect(escrow.escrowPda).toBe('EscrowPDA12345678901234567890123456');
    expect(escrow.transactionId).toBe('tx-123');
    expect(escrow.agentPk).toBe('AgentPK12345678901234567890123456789');
  });
});

describe('parseEscrowRequirement', () => {
  it('extracts requirement from 402 response with top-level extensions', () => {
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
            refundSchedule: [],
          },
        },
      },
    };

    const req = parseEscrowRequirement(response);
    expect(req).not.toBeNull();
    expect(req!.required).toBe(true);
    expect(req!.timelockSeconds).toBe(3600);
    expect(req!.qualityThreshold).toBe(70);
    expect(req!.programId).toBe('Prog123');
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
        payTo: '0x',
        resource: '/',
        description: '',
        maxTimeoutSeconds: 60,
      }],
      error: 'Payment Required',
      facilitator: '',
    };
    expect(parseEscrowRequirement(response)).toBeNull();
  });
});

describe('hasEscrowProof', () => {
  it('returns true when valid escrow payload present with info nesting', () => {
    const extensions = {
      'kamiyo-escrow': {
        info: {
          escrowPda: 'A'.repeat(44),
          transactionId: 'tx-123',
          agentPk: 'B'.repeat(44),
        },
      },
    };
    expect(hasEscrowProof(extensions)).toBe(true);
  });

  it('returns false when extension missing', () => {
    expect(hasEscrowProof({})).toBe(false);
  });

  it('returns false for undefined extensions', () => {
    expect(hasEscrowProof(undefined)).toBe(false);
  });

  it('returns false for incomplete payload', () => {
    const extensions = {
      'kamiyo-escrow': {
        info: {
          escrowPda: 'short',
        },
      },
    };
    expect(hasEscrowProof(extensions)).toBe(false);
  });
});

describe('calculateRefund', () => {
  const amount = 1000;
  const threshold = 70;

  describe('quality meets threshold', () => {
    it('returns full payment to provider when quality >= threshold', () => {
      const result = calculateRefund(70, amount, threshold);
      expect(result.agentRefund).toBe(0);
      expect(result.providerPayment).toBe(1000);
    });

    it('returns full payment for quality above threshold', () => {
      const result = calculateRefund(85, amount, threshold);
      expect(result.agentRefund).toBe(0);
      expect(result.providerPayment).toBe(1000);
    });

    it('returns full payment for perfect quality', () => {
      const result = calculateRefund(100, amount, threshold);
      expect(result.agentRefund).toBe(0);
      expect(result.providerPayment).toBe(1000);
    });
  });

  describe('quality severely lacking (< 50)', () => {
    it('returns full refund to agent when quality < 50', () => {
      const result = calculateRefund(49, amount, threshold);
      expect(result.agentRefund).toBe(1000);
      expect(result.providerPayment).toBe(0);
    });

    it('returns full refund for zero quality', () => {
      const result = calculateRefund(0, amount, threshold);
      expect(result.agentRefund).toBe(1000);
      expect(result.providerPayment).toBe(0);
    });

    it('returns full refund for quality just below 50', () => {
      const result = calculateRefund(49, amount, threshold);
      expect(result.agentRefund).toBe(1000);
      expect(result.providerPayment).toBe(0);
    });
  });

  describe('quality between 50-69', () => {
    it('returns 75% refund for quality in 50-69 range', () => {
      const result = calculateRefund(50, amount, threshold);
      expect(result.agentRefund).toBe(750);
      expect(result.providerPayment).toBe(250);
    });

    it('returns 75% refund for quality at 60', () => {
      const result = calculateRefund(60, amount, threshold);
      expect(result.agentRefund).toBe(750);
      expect(result.providerPayment).toBe(250);
    });

    it('returns 75% refund for quality at 69', () => {
      const result = calculateRefund(69, amount, threshold);
      expect(result.agentRefund).toBe(750);
      expect(result.providerPayment).toBe(250);
    });
  });

  describe('quality between 70 and threshold (linear scale)', () => {
    it('calculates graduated refund between 70 and threshold', () => {
      const result = calculateRefund(70, 1000, 80);
      // refundPercent = 1 - (0/10) = 1, refund = floor(1000 * 1 * 0.75) = 750
      expect(result.agentRefund).toBe(750);
      expect(result.providerPayment).toBe(250);
    });

    it('calculates partial refund near threshold', () => {
      const result = calculateRefund(75, 1000, 80);
      // refundPercent = 1 - (5/10) = 0.5, refund = floor(1000 * 0.5 * 0.75) = 375
      expect(result.agentRefund).toBe(375);
      expect(result.providerPayment).toBe(625);
    });
  });

  describe('uses default threshold', () => {
    it('uses 70 as default threshold', () => {
      const result = calculateRefund(70, 1000);
      expect(result.agentRefund).toBe(0);
      expect(result.providerPayment).toBe(1000);
    });
  });

  describe('edge cases', () => {
    it('handles zero amount', () => {
      const result = calculateRefund(50, 0, threshold);
      expect(result.agentRefund).toBe(0);
      expect(result.providerPayment).toBe(0);
    });

    it('handles very large amount', () => {
      const result = calculateRefund(100, 1_000_000_000, threshold);
      expect(result.agentRefund).toBe(0);
      expect(result.providerPayment).toBe(1_000_000_000);
    });
  });
});

describe('ESCROW_EXTENSION_KEY', () => {
  it('has correct key name', () => {
    expect(ESCROW_EXTENSION_KEY).toBe('kamiyo-escrow');
  });
});
