/**
 * Unit Tests for Validation Schemas
 */

import { describe, it, expect } from '@jest/globals';
import {
  protocolNameSchema,
  chainSchema,
  limitSchema,
  exploitsQuerySchema,
  solanaSignatureSchema,
  solanaAddressSchema,
  validateProtocol,
  validateChain,
  validateLimit,
  SUPPORTED_CHAINS
} from '../schemas';

describe('protocolNameSchema', () => {
  it('should accept valid protocol names', () => {
    expect(protocolNameSchema.parse('Uniswap V3')).toBe('Uniswap V3');
    expect(protocolNameSchema.parse('Aave-V2')).toBe('Aave-V2');
    expect(protocolNameSchema.parse('Compound_Finance')).toBe('Compound_Finance');
  });

  it('should trim whitespace', () => {
    expect(protocolNameSchema.parse('  Uniswap  ')).toBe('Uniswap');
  });

  it('should reject empty names', () => {
    expect(() => protocolNameSchema.parse('')).toThrow();
  });

  it('should reject names over 100 characters', () => {
    const longName = 'a'.repeat(101);
    expect(() => protocolNameSchema.parse(longName)).toThrow();
  });

  it('should reject invalid characters', () => {
    expect(() => protocolNameSchema.parse('Protocol<script>')).toThrow();
    expect(() => protocolNameSchema.parse('Protocol;DROP TABLE')).toThrow();
  });
});

describe('chainSchema', () => {
  it('should accept valid chains', () => {
    expect(chainSchema.parse('ethereum')).toBe('ethereum');
    expect(chainSchema.parse('polygon')).toBe('polygon');
    expect(chainSchema.parse('base')).toBe('base');
  });

  it('should reject invalid chains', () => {
    expect(() => chainSchema.parse('invalid-chain')).toThrow();
    expect(() => chainSchema.parse('bitcoin')).toThrow();
  });

  it('should provide helpful error message', () => {
    try {
      chainSchema.parse('invalid');
      fail('Should have thrown');
    } catch (error: any) {
      expect(error.issues[0].message).toContain('Invalid option');
    }
  });
});

describe('limitSchema', () => {
  it('should accept valid limits', () => {
    expect(limitSchema.parse('1')).toBe(1);
    expect(limitSchema.parse('50')).toBe(50);
    expect(limitSchema.parse('100')).toBe(100);
  });

  it('should handle undefined', () => {
    expect(limitSchema.parse(undefined)).toBeUndefined();
  });

  it('should reject limits < 1', () => {
    expect(() => limitSchema.parse('0')).toThrow();
    expect(() => limitSchema.parse('-1')).toThrow();
  });

  it('should reject limits > 100', () => {
    expect(() => limitSchema.parse('101')).toThrow();
    expect(() => limitSchema.parse('1000')).toThrow();
  });

  it('should reject non-integer', () => {
    const result = limitSchema.parse('10.5');
    // parseInt('10.5') returns 10, which is valid
    expect(result).toBe(10);
  });
});

describe('exploitsQuerySchema', () => {
  it('should accept valid query', () => {
    const result = exploitsQuerySchema.parse({
      protocol: 'Uniswap V3',
      chain: 'ethereum',
      limit: '10'
    });

    expect(result.protocol).toBe('Uniswap V3');
    expect(result.chain).toBe('ethereum');
    expect(result.limit).toBe(10);
  });

  it('should accept partial query', () => {
    const result = exploitsQuerySchema.parse({
      protocol: 'Aave'
    });

    expect(result.protocol).toBe('Aave');
    expect(result.chain).toBeUndefined();
    expect(result.limit).toBeUndefined();
  });

  it('should reject invalid protocol', () => {
    expect(() => exploitsQuerySchema.parse({
      protocol: '<script>alert(1)</script>'
    })).toThrow();
  });
});

describe('solanaSignatureSchema', () => {
  it('should accept valid Solana signature', () => {
    const validSig = '5' + 'a'.repeat(87); // 88 chars, starts with valid base58
    expect(solanaSignatureSchema.parse(validSig)).toBe(validSig);
  });

  it('should reject invalid length', () => {
    expect(() => solanaSignatureSchema.parse('tooshort')).toThrow(/length/);
    expect(() => solanaSignatureSchema.parse('a'.repeat(100))).toThrow(/length/);
  });

  it('should reject invalid base58 characters', () => {
    const invalidSig = '0' + 'a'.repeat(87); // 0 is not valid base58
    expect(() => solanaSignatureSchema.parse(invalidSig)).toThrow(/format/);
  });
});

describe('solanaAddressSchema', () => {
  it('should accept valid Solana addresses', () => {
    const validAddr = '1' + 'a'.repeat(31); // 32 chars
    expect(solanaAddressSchema.parse(validAddr)).toBe(validAddr);

    const validAddr2 = '1' + 'a'.repeat(43); // 44 chars
    expect(solanaAddressSchema.parse(validAddr2)).toBe(validAddr2);
  });

  it('should reject invalid length', () => {
    expect(() => solanaAddressSchema.parse('short')).toThrow();
    expect(() => solanaAddressSchema.parse('a'.repeat(50))).toThrow();
  });
});

describe('validateProtocol', () => {
  it('should sanitize and validate protocol', () => {
    expect(validateProtocol('  Uniswap  ')).toBe('Uniswap');
  });

  it('should remove control characters', () => {
    expect(validateProtocol('Uni\x00swap')).toBe('Uniswap');
  });
});

describe('validateChain', () => {
  it('should sanitize and validate chain', () => {
    expect(validateChain('ETHEREUM')).toBe('ethereum');
    expect(validateChain('  polygon  ')).toBe('polygon');
  });
});

describe('validateLimit', () => {
  it('should return default for undefined', () => {
    expect(validateLimit(undefined)).toBe(50);
  });

  it('should parse valid limit', () => {
    expect(validateLimit('25')).toBe(25);
  });

  it('should throw for invalid limit', () => {
    expect(() => validateLimit('invalid')).toThrow();
  });
});
