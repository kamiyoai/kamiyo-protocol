import {
  escrowRequirementHeaders,
  parseEscrowHeaders,
  hasEscrowProof,
  calculateRefund,
  X402_ESCROW_REQUIRED,
  X402_ESCROW_TIMELOCK,
  X402_ESCROW_QUALITY_THRESHOLD,
  X402_ESCROW_PDA,
  X402_ESCROW_TRANSACTION_ID,
} from './escrow-extension';

describe('escrowRequirementHeaders', () => {
  it('returns required headers with defaults', () => {
    const headers = escrowRequirementHeaders();
    expect(headers[X402_ESCROW_REQUIRED]).toBe('true');
    expect(headers[X402_ESCROW_TIMELOCK]).toBe('3600');
    expect(headers[X402_ESCROW_QUALITY_THRESHOLD]).toBe('70');
  });

  it('accepts custom timelock', () => {
    const headers = escrowRequirementHeaders(7200);
    expect(headers[X402_ESCROW_TIMELOCK]).toBe('7200');
  });

  it('accepts custom quality threshold', () => {
    const headers = escrowRequirementHeaders(3600, 80);
    expect(headers[X402_ESCROW_QUALITY_THRESHOLD]).toBe('80');
  });
});

describe('parseEscrowHeaders', () => {
  it('parses all escrow headers', () => {
    const headers = {
      [X402_ESCROW_REQUIRED]: 'true',
      [X402_ESCROW_TIMELOCK]: '7200',
      [X402_ESCROW_QUALITY_THRESHOLD]: '80',
      [X402_ESCROW_PDA]: '11111111111111111111111111111111',
      [X402_ESCROW_TRANSACTION_ID]: 'tx-123',
    };

    const parsed = parseEscrowHeaders(headers);
    expect(parsed.required).toBe(true);
    expect(parsed.timelockSeconds).toBe(7200);
    expect(parsed.qualityThreshold).toBe(80);
    expect(parsed.pda).toBe('11111111111111111111111111111111');
    expect(parsed.transactionId).toBe('tx-123');
  });

  it('returns defaults for missing headers', () => {
    const parsed = parseEscrowHeaders({});
    expect(parsed.required).toBe(false);
    expect(parsed.timelockSeconds).toBe(3600);
    expect(parsed.qualityThreshold).toBe(70);
    expect(parsed.pda).toBeUndefined();
    expect(parsed.transactionId).toBeUndefined();
  });

  it('handles lowercase header names', () => {
    const headers = {
      'x-402-escrow-required': 'true',
      'x-402-escrow-pda': 'testpda',
    };
    const parsed = parseEscrowHeaders(headers);
    expect(parsed.required).toBe(true);
    expect(parsed.pda).toBe('testpda');
  });

  it('handles array values', () => {
    const headers = {
      [X402_ESCROW_REQUIRED]: ['true', 'false'],
      [X402_ESCROW_TIMELOCK]: ['1800'],
    };
    const parsed = parseEscrowHeaders(headers);
    expect(parsed.required).toBe(true);
    expect(parsed.timelockSeconds).toBe(1800);
  });
});

describe('hasEscrowProof', () => {
  it('returns true when both PDA and transactionId present', () => {
    const headers = {
      [X402_ESCROW_PDA]: '11111111111111111111111111111111',
      [X402_ESCROW_TRANSACTION_ID]: 'tx-123',
    };
    expect(hasEscrowProof(headers)).toBe(true);
  });

  it('returns false when PDA missing', () => {
    const headers = {
      [X402_ESCROW_TRANSACTION_ID]: 'tx-123',
    };
    expect(hasEscrowProof(headers)).toBe(false);
  });

  it('returns false when transactionId missing', () => {
    const headers = {
      [X402_ESCROW_PDA]: '11111111111111111111111111111111',
    };
    expect(hasEscrowProof(headers)).toBe(false);
  });

  it('returns false for empty headers', () => {
    expect(hasEscrowProof({})).toBe(false);
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
      // threshold = 70, so this is at threshold
      const result = calculateRefund(70, 1000, 80);
      // refundPercent = 1 - (0/10) = 1, refund = 750
      expect(result.agentRefund).toBe(750);
      expect(result.providerPayment).toBe(250);
    });

    it('calculates partial refund near threshold', () => {
      const result = calculateRefund(75, 1000, 80);
      // refundPercent = 1 - (5/10) = 0.5, refund = 375
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

describe('header constants', () => {
  it('exports lowercase header names', () => {
    expect(X402_ESCROW_REQUIRED).toBe('x-402-escrow-required');
    expect(X402_ESCROW_TIMELOCK).toBe('x-402-escrow-timelock');
    expect(X402_ESCROW_QUALITY_THRESHOLD).toBe('x-402-escrow-quality-threshold');
    expect(X402_ESCROW_PDA).toBe('x-402-escrow-pda');
    expect(X402_ESCROW_TRANSACTION_ID).toBe('x-402-escrow-transaction-id');
  });
});
