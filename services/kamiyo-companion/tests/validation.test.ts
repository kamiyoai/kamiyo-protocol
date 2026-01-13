import { describe, it, expect } from 'vitest';

// Test validation functions
function isValidPublicKey(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

function truncateMessage(text: string, maxLength: number = 1000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

describe('PublicKey Validation', () => {
  it('should accept valid Solana addresses', () => {
    expect(isValidPublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump')).toBe(true);
    expect(isValidPublicKey('368a921tfDvsiQwxbXnh3ZFJdxQLwK4QPboWCPJ97xca')).toBe(true);
  });

  it('should reject empty strings', () => {
    expect(isValidPublicKey('')).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(isValidPublicKey(null as unknown as string)).toBe(false);
    expect(isValidPublicKey(undefined as unknown as string)).toBe(false);
  });

  it('should reject strings that are too short', () => {
    expect(isValidPublicKey('abc123')).toBe(false);
  });

  it('should reject strings that are too long', () => {
    expect(isValidPublicKey('a'.repeat(50))).toBe(false);
  });

  it('should reject strings with invalid characters', () => {
    expect(isValidPublicKey('0OIl' + 'a'.repeat(40))).toBe(false); // 0, O, I, l are not valid base58
  });

  it('should reject non-string values', () => {
    expect(isValidPublicKey(123 as unknown as string)).toBe(false);
    expect(isValidPublicKey({} as unknown as string)).toBe(false);
  });
});

describe('Rating Validation', () => {
  it('should accept ratings 1-5', () => {
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(2)).toBe(true);
    expect(isValidRating(3)).toBe(true);
    expect(isValidRating(4)).toBe(true);
    expect(isValidRating(5)).toBe(true);
  });

  it('should reject 0', () => {
    expect(isValidRating(0)).toBe(false);
  });

  it('should reject negative numbers', () => {
    expect(isValidRating(-1)).toBe(false);
  });

  it('should reject numbers above 5', () => {
    expect(isValidRating(6)).toBe(false);
  });

  it('should reject non-integers', () => {
    expect(isValidRating(3.5)).toBe(false);
  });

  it('should reject NaN', () => {
    expect(isValidRating(NaN)).toBe(false);
  });
});

describe('Message Truncation', () => {
  it('should not truncate short messages', () => {
    const msg = 'Hello world';
    expect(truncateMessage(msg)).toBe(msg);
  });

  it('should truncate long messages', () => {
    const msg = 'a'.repeat(1500);
    const result = truncateMessage(msg);
    expect(result.length).toBe(1000);
  });

  it('should respect custom max length', () => {
    const msg = 'a'.repeat(100);
    const result = truncateMessage(msg, 50);
    expect(result.length).toBe(50);
  });

  it('should handle empty strings', () => {
    expect(truncateMessage('')).toBe('');
  });

  it('should handle exact length messages', () => {
    const msg = 'a'.repeat(1000);
    expect(truncateMessage(msg)).toBe(msg);
    expect(truncateMessage(msg).length).toBe(1000);
  });
});
