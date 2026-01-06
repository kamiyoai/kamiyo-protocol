import { PublicKey } from '@solana/web3.js';
import {
  validatePublicKey,
  validateAmountSol,
  validateAmountLamports,
  validateTimeLock,
  validateQualityThreshold,
  validateTransactionId,
  validateUrl,
  validateTimeout,
  assertValid,
  validateAll,
  sanitizeTransactionId,
  generateTransactionId,
  LIMITS,
} from './validation';
import { X402Error } from './errors';

describe('validatePublicKey', () => {
  it('accepts valid PublicKey instance', () => {
    const pk = new PublicKey('11111111111111111111111111111111');
    const result = validatePublicKey(pk, 'test');
    expect(result.valid).toBe(true);
  });

  it('accepts valid base58 string', () => {
    const result = validatePublicKey('11111111111111111111111111111111', 'test');
    expect(result.valid).toBe(true);
  });

  it('rejects null value', () => {
    const result = validatePublicKey(null, 'test');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  it('rejects invalid base58 string', () => {
    const result = validatePublicKey('not-a-valid-key', 'test');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not a valid public key');
  });

  it('rejects non-string/non-PublicKey values', () => {
    const result = validatePublicKey(12345, 'test');
    expect(result.valid).toBe(false);
  });
});

describe('validateAmountSol', () => {
  it('accepts valid SOL amount', () => {
    const result = validateAmountSol(1.5, 'amount');
    expect(result.valid).toBe(true);
  });

  it('accepts minimum amount', () => {
    const result = validateAmountSol(LIMITS.MIN_AMOUNT_SOL, 'amount');
    expect(result.valid).toBe(true);
  });

  it('accepts maximum amount', () => {
    const result = validateAmountSol(LIMITS.MAX_AMOUNT_SOL, 'amount');
    expect(result.valid).toBe(true);
  });

  it('rejects below minimum', () => {
    const result = validateAmountSol(LIMITS.MIN_AMOUNT_SOL / 10, 'amount');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least');
  });

  it('rejects above maximum', () => {
    const result = validateAmountSol(LIMITS.MAX_AMOUNT_SOL + 1, 'amount');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceed');
  });

  it('rejects non-number', () => {
    const result = validateAmountSol('1.5' as unknown as number, 'amount');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be a number');
  });

  it('rejects Infinity', () => {
    const result = validateAmountSol(Infinity, 'amount');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('finite');
  });

  it('rejects NaN', () => {
    const result = validateAmountSol(NaN, 'amount');
    expect(result.valid).toBe(false);
  });
});

describe('validateAmountLamports', () => {
  it('accepts valid lamport amount', () => {
    const result = validateAmountLamports(1_000_000, 'amount');
    expect(result.valid).toBe(true);
  });

  it('accepts bigint', () => {
    const result = validateAmountLamports(BigInt(1_000_000), 'amount');
    expect(result.valid).toBe(true);
  });

  it('rejects below minimum', () => {
    const result = validateAmountLamports(100, 'amount');
    expect(result.valid).toBe(false);
  });

  it('rejects above maximum', () => {
    const result = validateAmountLamports(LIMITS.MAX_AMOUNT_LAMPORTS + 1, 'amount');
    expect(result.valid).toBe(false);
  });
});

describe('validateTimeLock', () => {
  it('accepts valid time lock', () => {
    const result = validateTimeLock(3600, 'timeLock');
    expect(result.valid).toBe(true);
  });

  it('accepts minimum time lock', () => {
    const result = validateTimeLock(LIMITS.MIN_TIME_LOCK_SECONDS, 'timeLock');
    expect(result.valid).toBe(true);
  });

  it('accepts maximum time lock', () => {
    const result = validateTimeLock(LIMITS.MAX_TIME_LOCK_SECONDS, 'timeLock');
    expect(result.valid).toBe(true);
  });

  it('rejects below minimum', () => {
    const result = validateTimeLock(30, 'timeLock');
    expect(result.valid).toBe(false);
  });

  it('rejects above maximum', () => {
    const result = validateTimeLock(LIMITS.MAX_TIME_LOCK_SECONDS + 1, 'timeLock');
    expect(result.valid).toBe(false);
  });

  it('rejects non-integer', () => {
    const result = validateTimeLock(3600.5, 'timeLock');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('integer');
  });
});

describe('validateQualityThreshold', () => {
  it('accepts valid threshold', () => {
    const result = validateQualityThreshold(75, 'threshold');
    expect(result.valid).toBe(true);
  });

  it('accepts 0', () => {
    const result = validateQualityThreshold(0, 'threshold');
    expect(result.valid).toBe(true);
  });

  it('accepts 100', () => {
    const result = validateQualityThreshold(100, 'threshold');
    expect(result.valid).toBe(true);
  });

  it('rejects negative', () => {
    const result = validateQualityThreshold(-1, 'threshold');
    expect(result.valid).toBe(false);
  });

  it('rejects above 100', () => {
    const result = validateQualityThreshold(101, 'threshold');
    expect(result.valid).toBe(false);
  });

  it('rejects non-integer', () => {
    const result = validateQualityThreshold(75.5, 'threshold');
    expect(result.valid).toBe(false);
  });
});

describe('validateTransactionId', () => {
  it('accepts valid alphanumeric ID', () => {
    const result = validateTransactionId('tx-12345-abc', 'txId');
    expect(result.valid).toBe(true);
  });

  it('accepts underscores and dashes', () => {
    const result = validateTransactionId('my_tx-id_123', 'txId');
    expect(result.valid).toBe(true);
  });

  it('rejects empty string', () => {
    const result = validateTransactionId('', 'txId');
    expect(result.valid).toBe(false);
  });

  it('rejects too long string', () => {
    const result = validateTransactionId('a'.repeat(65), 'txId');
    expect(result.valid).toBe(false);
  });

  it('rejects special characters', () => {
    const result = validateTransactionId('tx@id#123', 'txId');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('alphanumeric');
  });
});

describe('validateUrl', () => {
  it('accepts valid https URL', () => {
    const result = validateUrl('https://api.example.com/v1/resource', 'url');
    expect(result.valid).toBe(true);
  });

  it('accepts valid http URL', () => {
    const result = validateUrl('http://localhost:3000/api', 'url');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = validateUrl('not-a-url', 'url');
    expect(result.valid).toBe(false);
  });

  it('rejects non-http protocols', () => {
    const result = validateUrl('ftp://files.example.com', 'url');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('http or https');
  });

  it('rejects too long URL', () => {
    const result = validateUrl('https://example.com/' + 'a'.repeat(2100), 'url');
    expect(result.valid).toBe(false);
  });
});

describe('validateTimeout', () => {
  it('accepts valid timeout', () => {
    const result = validateTimeout(30000, 'timeout');
    expect(result.valid).toBe(true);
  });

  it('accepts minimum timeout', () => {
    const result = validateTimeout(LIMITS.MIN_TIMEOUT_MS, 'timeout');
    expect(result.valid).toBe(true);
  });

  it('accepts maximum timeout', () => {
    const result = validateTimeout(LIMITS.MAX_TIMEOUT_MS, 'timeout');
    expect(result.valid).toBe(true);
  });

  it('rejects below minimum', () => {
    const result = validateTimeout(500, 'timeout');
    expect(result.valid).toBe(false);
  });

  it('rejects above maximum', () => {
    const result = validateTimeout(LIMITS.MAX_TIMEOUT_MS + 1, 'timeout');
    expect(result.valid).toBe(false);
  });

  it('rejects non-integer', () => {
    const result = validateTimeout(30000.5, 'timeout');
    expect(result.valid).toBe(false);
  });
});

describe('assertValid', () => {
  it('does not throw for valid result', () => {
    expect(() => assertValid({ valid: true }, 'test')).not.toThrow();
  });

  it('throws X402Error for invalid result', () => {
    expect(() => assertValid({ valid: false, error: 'bad value' }, 'test')).toThrow(X402Error);
  });

  it('includes field name in error', () => {
    try {
      assertValid({ valid: false, error: 'bad value' }, 'myField');
    } catch (e) {
      expect(e).toBeInstanceOf(X402Error);
      expect((e as X402Error).message).toContain('myField');
    }
  });
});

describe('validateAll', () => {
  it('returns valid for all passing validations', () => {
    const result = validateAll([
      { result: { valid: true }, field: 'a' },
      { result: { valid: true }, field: 'b' },
    ]);
    expect(result.valid).toBe(true);
  });

  it('returns first failure', () => {
    const result = validateAll([
      { result: { valid: true }, field: 'a' },
      { result: { valid: false, error: 'b failed' }, field: 'b' },
      { result: { valid: false, error: 'c failed' }, field: 'c' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('b');
  });
});

describe('sanitizeTransactionId', () => {
  it('passes valid ID unchanged', () => {
    expect(sanitizeTransactionId('tx-123-abc')).toBe('tx-123-abc');
  });

  it('removes invalid characters', () => {
    expect(sanitizeTransactionId('tx@123#abc!')).toBe('tx123abc');
  });

  it('truncates to max length', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeTransactionId(long).length).toBe(LIMITS.MAX_TRANSACTION_ID_LENGTH);
  });
});

describe('generateTransactionId', () => {
  it('generates unique IDs', () => {
    const id1 = generateTransactionId();
    const id2 = generateTransactionId();
    expect(id1).not.toBe(id2);
  });

  it('uses custom prefix', () => {
    const id = generateTransactionId('custom');
    expect(id).toMatch(/^custom-/);
  });

  it('uses default prefix', () => {
    const id = generateTransactionId();
    expect(id).toMatch(/^kamiyo-/);
  });

  it('generates valid transaction IDs', () => {
    const id = generateTransactionId();
    const result = validateTransactionId(id, 'test');
    expect(result.valid).toBe(true);
  });
});
