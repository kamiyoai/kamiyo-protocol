import { describe, it, expect } from 'vitest';
import {
  ViolationType,
  Severity,
  getSeverity,
  calculateRefund,
  calculateLatencyRefund,
  hashEvidence,
  createViolation,
  validateViolation,
} from '../src/violations.js';

describe('violations', () => {
  describe('getSeverity', () => {
    it('returns critical for timeout', () => {
      const result = getSeverity(ViolationType.Timeout);
      expect(result.severity).toBe(Severity.Critical);
      expect(result.refundPercent).toBe(100);
    });

    it('returns critical for server error', () => {
      const result = getSeverity(ViolationType.ServerError);
      expect(result.severity).toBe(Severity.Critical);
      expect(result.refundPercent).toBe(100);
    });

    it('returns high for malformed', () => {
      const result = getSeverity(ViolationType.Malformed);
      expect(result.severity).toBe(Severity.High);
      expect(result.refundPercent).toBe(75);
    });

    it('returns low for rate limit', () => {
      const result = getSeverity(ViolationType.RateLimit);
      expect(result.severity).toBe(Severity.Low);
      expect(result.refundPercent).toBe(25);
    });
  });

  describe('calculateLatencyRefund', () => {
    it('returns 0 for within SLA', () => {
      expect(calculateLatencyRefund(5000, 4000)).toBe(0);
    });

    it('returns 25 for 1-2x SLA', () => {
      expect(calculateLatencyRefund(5000, 6000)).toBe(25);
      expect(calculateLatencyRefund(5000, 9000)).toBe(25);
    });

    it('returns 50 for 2-3x SLA', () => {
      expect(calculateLatencyRefund(5000, 10000)).toBe(50);
      expect(calculateLatencyRefund(5000, 14000)).toBe(50);
    });

    it('returns 75 for >3x SLA', () => {
      expect(calculateLatencyRefund(5000, 15000)).toBe(75);
      expect(calculateLatencyRefund(5000, 20000)).toBe(75);
    });

    it('returns 100 for timeout (negative actual)', () => {
      expect(calculateLatencyRefund(5000, -1)).toBe(100);
    });
  });

  describe('calculateRefund', () => {
    it('uses latency calculation for latency violations', () => {
      const violation = createViolation(
        ViolationType.Latency,
        5000,
        15000,
        'response data'
      );
      expect(calculateRefund(violation)).toBe(75);
    });

    it('uses fixed refund for other violation types', () => {
      const violation = createViolation(
        ViolationType.Timeout,
        5000,
        -1,
        'timeout error'
      );
      expect(calculateRefund(violation)).toBe(100);
    });
  });

  describe('hashEvidence', () => {
    it('produces consistent 64-char hex hash', () => {
      const hash1 = hashEvidence('test data');
      const hash2 = hashEvidence('test data');
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(hash1)).toBe(true);
    });

    it('produces different hashes for different data', () => {
      const hash1 = hashEvidence('data 1');
      const hash2 = hashEvidence('data 2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createViolation', () => {
    it('creates valid violation with hashed evidence', () => {
      const violation = createViolation(
        ViolationType.ServerError,
        'OK',
        '500 Internal Server Error',
        'error response body'
      );

      expect(violation.type).toBe(ViolationType.ServerError);
      expect(violation.expected).toBe('OK');
      expect(violation.actual).toBe('500 Internal Server Error');
      expect(violation.evidence.length).toBe(64);
      expect(violation.timestamp).toBeGreaterThan(0);
    });
  });

  describe('validateViolation', () => {
    it('accepts valid violation', () => {
      const violation = createViolation(
        ViolationType.Latency,
        5000,
        10000,
        'response'
      );
      const result = validateViolation(violation);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid violation type', () => {
      const violation = {
        type: 'invalid' as ViolationType,
        expected: 5000,
        actual: 10000,
        evidence: hashEvidence('test'),
        timestamp: Date.now(),
      };
      const result = validateViolation(violation);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid violation type');
    });

    it('rejects missing expected value', () => {
      const violation = {
        type: ViolationType.Latency,
        expected: undefined as any,
        actual: 10000,
        evidence: hashEvidence('test'),
        timestamp: Date.now(),
      };
      const result = validateViolation(violation);
      expect(result.valid).toBe(false);
    });

    it('rejects invalid evidence hash', () => {
      const violation = {
        type: ViolationType.Latency,
        expected: 5000,
        actual: 10000,
        evidence: 'short',
        timestamp: Date.now(),
      };
      const result = validateViolation(violation);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Evidence must be a 64-char hex hash');
    });
  });
});
