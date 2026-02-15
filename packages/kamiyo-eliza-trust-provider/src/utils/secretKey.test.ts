import { describe, expect, it } from 'vitest';
import { parseSecretKey } from './secretKey';

describe('parseSecretKey', () => {
  it('parses base64', () => {
    const bytes = Uint8Array.from(Array.from({ length: 64 }, (_, i) => i));
    const b64 = Buffer.from(bytes).toString('base64');
    expect(parseSecretKey(b64)).toEqual(bytes);
  });

  it('parses json array', () => {
    const bytes = Uint8Array.from(Array.from({ length: 64 }, (_, i) => i));
    const json = JSON.stringify(Array.from(bytes));
    expect(parseSecretKey(json)).toEqual(bytes);
  });

  it('parses comma-separated bytes', () => {
    const bytes = Uint8Array.from(Array.from({ length: 64 }, (_, i) => i));
    const csv = Array.from(bytes).join(',');
    expect(parseSecretKey(csv)).toEqual(bytes);
  });

  it('rejects invalid input', () => {
    expect(parseSecretKey('')).toBeNull();
    expect(parseSecretKey('not-base64')).toBeNull();
    expect(parseSecretKey('[1,2,"x"]')).toBeNull();
    expect(parseSecretKey('1,2,3')).toBeNull();
  });
});

