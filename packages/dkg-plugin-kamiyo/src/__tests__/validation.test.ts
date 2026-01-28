import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  validateUal,
  validateStakeAmount,
  validateScore,
  validateSparql,
  validateReason,
  validateOptionalScore,
  UAL_PATTERN,
  MIN_STAKE_SOL,
  MAX_STAKE_SOL,
  MAX_SPARQL_LENGTH,
} from '../validation.js';

describe('Validation Functions', () => {
  describe('ValidationError', () => {
    it('creates error with correct name', () => {
      const error = new ValidationError('test message');
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('test message');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('validateUal', () => {
    it('accepts valid UAL formats', () => {
      const validUals = [
        'did:dkg:otp/0x1234567890abcdef/12345',
        'did:dkg:gnosis/0xABCDEF1234567890/1',
        'did:dkg:base/0xff00ff00ff00ff00/999999',
      ];
      for (const ual of validUals) {
        expect(validateUal(ual)).toBe(ual);
      }
    });

    it('rejects non-string input', () => {
      expect(() => validateUal(123)).toThrow('must be a string');
      expect(() => validateUal(null)).toThrow('must be a string');
      expect(() => validateUal(undefined)).toThrow('must be a string');
      expect(() => validateUal({})).toThrow('must be a string');
    });

    it('rejects empty string', () => {
      expect(() => validateUal('')).toThrow('is required');
      expect(() => validateUal('   ')).toThrow('is required');
    });

    it('rejects invalid UAL formats', () => {
      const invalidUals = [
        'not-a-ual',
        'did:dkg:otp/not-hex/12345',
        'did:dkg:/0x1234/12345',
        'did:other:otp/0x1234/12345',
        'did:dkg:otp/0x1234', // missing token ID
        'did:dkg:OTP/0x1234/12345', // uppercase network
      ];
      for (const ual of invalidUals) {
        expect(() => validateUal(ual)).toThrow('valid UAL format');
      }
    });

    it('uses custom field name in error message', () => {
      expect(() => validateUal('invalid', 'myField')).toThrow('myField must be a valid UAL format');
    });
  });

  describe('validateStakeAmount', () => {
    it('accepts valid amounts', () => {
      expect(validateStakeAmount(0.01)).toBe(0.01);
      expect(validateStakeAmount(1)).toBe(1);
      expect(validateStakeAmount(100)).toBe(100);
      expect(validateStakeAmount(1000)).toBe(1000);
    });

    it('rejects non-number input', () => {
      expect(() => validateStakeAmount('10')).toThrow('must be a number');
      expect(() => validateStakeAmount(null)).toThrow('must be a number');
      expect(() => validateStakeAmount(undefined)).toThrow('must be a number');
      expect(() => validateStakeAmount(NaN)).toThrow('must be a number');
    });

    it('rejects amounts below minimum', () => {
      expect(() => validateStakeAmount(0)).toThrow(`at least ${MIN_STAKE_SOL}`);
      expect(() => validateStakeAmount(0.001)).toThrow(`at least ${MIN_STAKE_SOL}`);
      expect(() => validateStakeAmount(-5)).toThrow(`at least ${MIN_STAKE_SOL}`);
    });

    it('rejects amounts above maximum', () => {
      expect(() => validateStakeAmount(1001)).toThrow(`cannot exceed ${MAX_STAKE_SOL}`);
      expect(() => validateStakeAmount(10000)).toThrow(`cannot exceed ${MAX_STAKE_SOL}`);
    });
  });

  describe('validateScore', () => {
    it('accepts valid scores', () => {
      expect(validateScore(0, 'test')).toBe(0);
      expect(validateScore(50, 'test')).toBe(50);
      expect(validateScore(100, 'test')).toBe(100);
    });

    it('rounds decimal scores', () => {
      expect(validateScore(50.4, 'test')).toBe(50);
      expect(validateScore(50.6, 'test')).toBe(51);
      expect(validateScore(99.9, 'test')).toBe(100);
    });

    it('rejects non-number input', () => {
      expect(() => validateScore('50', 'myScore')).toThrow('myScore must be a number');
      expect(() => validateScore(null, 'myScore')).toThrow('myScore must be a number');
      expect(() => validateScore(NaN, 'myScore')).toThrow('myScore must be a number');
    });

    it('rejects scores outside 0-100 range', () => {
      expect(() => validateScore(-1, 'test')).toThrow('between 0 and 100');
      expect(() => validateScore(101, 'test')).toThrow('between 0 and 100');
      expect(() => validateScore(-100, 'test')).toThrow('between 0 and 100');
    });

    it('includes field name in error message', () => {
      expect(() => validateScore(-1, 'factualAccuracy')).toThrow('factualAccuracy must be between');
    });
  });

  describe('validateSparql', () => {
    it('accepts valid SPARQL queries', () => {
      const validQueries = [
        'SELECT ?s ?p ?o WHERE { ?s ?p ?o }',
        'PREFIX schema: <http://schema.org/> SELECT ?name WHERE { ?s schema:name ?name }',
        'ASK { ?s ?p ?o }',
        'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }',
      ];
      for (const query of validQueries) {
        expect(validateSparql(query)).toBe(query);
      }
    });

    it('rejects non-string input', () => {
      expect(() => validateSparql(123)).toThrow('must be a string');
      expect(() => validateSparql(null)).toThrow('must be a string');
      expect(() => validateSparql(undefined)).toThrow('must be a string');
    });

    it('rejects empty string', () => {
      expect(() => validateSparql('')).toThrow('is required');
      expect(() => validateSparql('   ')).toThrow('is required');
    });

    it('rejects queries exceeding max length', () => {
      const longQuery = 'SELECT ?s WHERE { ' + 'a'.repeat(MAX_SPARQL_LENGTH) + ' }';
      expect(() => validateSparql(longQuery)).toThrow('exceeds maximum length');
    });

    it('rejects dangerous SPARQL operations', () => {
      const dangerousQueries = [
        'DROP GRAPH <http://example.org/>',
        'DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }',
        'INSERT DATA { <s> <p> <o> }',
        'CLEAR DEFAULT',
        'LOAD <http://example.org/data>',
        'CREATE GRAPH <http://example.org/new>',
        'drop graph <http://x>',  // case insensitive
        'Delete { ?s ?p ?o }',    // case insensitive
      ];
      for (const query of dangerousQueries) {
        expect(() => validateSparql(query)).toThrow('prohibited operations');
      }
    });

    it('rejects dangerous keywords even in quoted values (conservative security)', () => {
      // These are rejected because we use conservative pattern matching
      // This prevents injection attacks where attackers might try to embed
      // dangerous operations in seemingly innocent queries
      const conservativelyBlocked = [
        'SELECT ?s WHERE { ?s schema:action "DROP TABLE" }',
        'SELECT ?s WHERE { ?s schema:name "delete button" }',
      ];
      for (const query of conservativelyBlocked) {
        expect(() => validateSparql(query)).toThrow('prohibited operations');
      }
    });
  });

  describe('validateReason', () => {
    it('accepts valid reasons', () => {
      expect(validateReason('Factual inaccuracies found')).toBe('Factual inaccuracies found');
      expect(validateReason('  trimmed  ')).toBe('trimmed');
    });

    it('rejects non-string input', () => {
      expect(() => validateReason(123)).toThrow('must be a string');
      expect(() => validateReason(null)).toThrow('must be a string');
    });

    it('rejects empty string', () => {
      expect(() => validateReason('')).toThrow('is required');
      expect(() => validateReason('   ')).toThrow('is required');
    });

    it('rejects reasons exceeding 1000 characters', () => {
      const longReason = 'a'.repeat(1001);
      expect(() => validateReason(longReason)).toThrow('cannot exceed 1000');
    });

    it('accepts reasons at exactly 1000 characters', () => {
      const maxReason = 'a'.repeat(1000);
      expect(validateReason(maxReason)).toBe(maxReason);
    });
  });

  describe('validateOptionalScore', () => {
    it('returns default for undefined', () => {
      expect(validateOptionalScore(undefined, 'test', 75)).toBe(75);
    });

    it('returns default for null', () => {
      expect(validateOptionalScore(null, 'test', 75)).toBe(75);
    });

    it('validates provided score', () => {
      expect(validateOptionalScore(80, 'test', 75)).toBe(80);
      expect(validateOptionalScore(50.6, 'test', 75)).toBe(51);
    });

    it('throws for invalid provided score', () => {
      expect(() => validateOptionalScore('50', 'test', 75)).toThrow('must be a number');
      expect(() => validateOptionalScore(-1, 'test', 75)).toThrow('between 0 and 100');
    });
  });

  describe('UAL_PATTERN', () => {
    it('matches expected format', () => {
      expect(UAL_PATTERN.test('did:dkg:otp/0x1234567890abcdef/12345')).toBe(true);
      expect(UAL_PATTERN.test('did:dkg:gnosis/0xABCDEF/1')).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(UAL_PATTERN.test('did:dkg:OTP/0x1234/1')).toBe(false); // uppercase network
      expect(UAL_PATTERN.test('did:dkg:otp/1234/1')).toBe(false); // missing 0x
      expect(UAL_PATTERN.test('did:dkg:otp/0x1234/abc')).toBe(false); // non-numeric token
    });
  });
});
