import { describe, expect, it } from 'vitest';
import { parseSolanaSignature } from './solanaSignature';

describe('parseSolanaSignature', () => {
  it('parses solscan url', () => {
    const sig = '2iJ3KNvcuqxPSCNhgkUNkMRzzDVEmHTepwAEJ6zeMWKH8XLsUfE3ira11ZMxo2RX1A8WLuJLERW2vaZFNqyeEBk5';
    const url = `https://solscan.io/tx/${sig}`;
    expect(parseSolanaSignature(url)).toBe(sig);
  });

  it('parses raw signature', () => {
    const sig = '2iJ3KNvcuqxPSCNhgkUNkMRzzDVEmHTepwAEJ6zeMWKH8XLsUfE3ira11ZMxo2RX1A8WLuJLERW2vaZFNqyeEBk5';
    expect(parseSolanaSignature(sig)).toBe(sig);
  });

  it('rejects invalid input', () => {
    expect(parseSolanaSignature('')).toBeNull();
    expect(parseSolanaSignature('https://solscan.io/tx/not-a-sig')).toBeNull();
    expect(parseSolanaSignature('not-a-sig')).toBeNull();
  });
});

