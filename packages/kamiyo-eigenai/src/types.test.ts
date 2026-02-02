import {
  EigenAIError,
  EIGENAI_DEFAULTS,
  QUALITY_TIERS,
  LIMITS,
} from './types';

describe('EigenAIError', () => {
  it('creates error with code and message', () => {
    const error = new EigenAIError('API_ERROR', 'test message');
    expect(error.code).toBe('API_ERROR');
    expect(error.message).toBe('test message');
    expect(error.name).toBe('EigenAIError');
  });

  it('creates error with cause', () => {
    const cause = new Error('original');
    const error = new EigenAIError('NETWORK_ERROR', 'wrapped', cause);
    expect(error.cause).toBe(cause);
  });

  describe('static factory methods', () => {
    it('apiError', () => {
      const error = EigenAIError.apiError('failed');
      expect(error.code).toBe('API_ERROR');
      expect(error.message).toBe('failed');
    });

    it('attestationInvalid', () => {
      const error = EigenAIError.attestationInvalid('bad signature');
      expect(error.code).toBe('ATTESTATION_INVALID');
      expect(error.message).toContain('bad signature');
    });

    it('escrowFailed', () => {
      const error = EigenAIError.escrowFailed('tx failed');
      expect(error.code).toBe('ESCROW_FAILED');
    });

    it('timeout', () => {
      const error = EigenAIError.timeout('inference', 5000);
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toContain('5000ms');
    });

    it('networkError', () => {
      const error = EigenAIError.networkError('connection refused');
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('invalidInput', () => {
      const error = EigenAIError.invalidInput('amount', 'too small');
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.message).toContain('amount');
      expect(error.message).toContain('too small');
    });

    it('insufficientFunds', () => {
      const error = EigenAIError.insufficientFunds(1.5, 0.5);
      expect(error.code).toBe('INSUFFICIENT_FUNDS');
      expect(error.message).toContain('1.5');
      expect(error.message).toContain('0.5');
    });

    it('disputeFailed', () => {
      const error = EigenAIError.disputeFailed('already resolved');
      expect(error.code).toBe('DISPUTE_FAILED');
    });
  });
});

describe('constants', () => {
  it('EIGENAI_DEFAULTS has expected values', () => {
    expect(EIGENAI_DEFAULTS.BASE_URL).toContain('eigencloud');
    expect(EIGENAI_DEFAULTS.ESCROW_AMOUNT_SOL).toBeGreaterThan(0);
    expect(EIGENAI_DEFAULTS.QUALITY_THRESHOLD).toBeGreaterThanOrEqual(0);
    expect(EIGENAI_DEFAULTS.QUALITY_THRESHOLD).toBeLessThanOrEqual(100);
    expect(EIGENAI_DEFAULTS.TIME_LOCK_SECONDS).toBeGreaterThan(0);
    expect(EIGENAI_DEFAULTS.TIMEOUT_MS).toBeGreaterThan(0);
    expect(EIGENAI_DEFAULTS.MAX_TOKENS).toBeGreaterThan(0);
    expect(EIGENAI_DEFAULTS.TEMPERATURE).toBeGreaterThanOrEqual(0);
    expect(EIGENAI_DEFAULTS.TEMPERATURE).toBeLessThanOrEqual(2);
  });

  it('QUALITY_TIERS covers full range', () => {
    expect(QUALITY_TIERS.FAILED.min).toBe(0);
    expect(QUALITY_TIERS.EXCELLENT.max).toBe(100);
    expect(QUALITY_TIERS.EXCELLENT.refundPercent).toBe(0);
    expect(QUALITY_TIERS.FAILED.refundPercent).toBe(100);
  });

  it('LIMITS has reasonable bounds', () => {
    expect(LIMITS.MIN_ESCROW_SOL).toBeLessThan(LIMITS.MAX_ESCROW_SOL);
    expect(LIMITS.MIN_TIME_LOCK_SECONDS).toBeLessThan(LIMITS.MAX_TIME_LOCK_SECONDS);
    expect(LIMITS.MIN_TIMEOUT_MS).toBeLessThan(LIMITS.MAX_TIMEOUT_MS);
    expect(LIMITS.MAX_MESSAGES).toBeGreaterThan(0);
    expect(LIMITS.MAX_MESSAGE_LENGTH).toBeGreaterThan(0);
    expect(LIMITS.MAX_TRANSACTION_ID_LENGTH).toBeGreaterThan(0);
  });
});
