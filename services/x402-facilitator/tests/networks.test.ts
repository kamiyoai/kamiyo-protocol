import { describe, expect, it } from 'vitest';
import {
  BASE_MAINNET_CAIP2,
  SOLANA_DEVNET_CAIP2,
  SOLANA_MAINNET_CAIP2,
  canonicalizeNetwork,
  getSupportedNetworkIds,
  isBaseMainnet,
  isValidPayerForNetwork,
  isSolanaMainnet,
  isSupportedNetwork,
} from '../src/protocol/networks';

describe('x402 network normalization', () => {
  it('normalizes Solana mainnet aliases', () => {
    expect(canonicalizeNetwork('solana:mainnet')).toBe(SOLANA_MAINNET_CAIP2);
    expect(canonicalizeNetwork('solana:mainnet-beta')).toBe(SOLANA_MAINNET_CAIP2);
    expect(canonicalizeNetwork(SOLANA_MAINNET_CAIP2)).toBe(SOLANA_MAINNET_CAIP2);
  });

  it('normalizes known testnet and base identifiers', () => {
    expect(canonicalizeNetwork('solana:devnet')).toBe(SOLANA_DEVNET_CAIP2);
    expect(canonicalizeNetwork(BASE_MAINNET_CAIP2)).toBe(BASE_MAINNET_CAIP2);
  });

  it('rejects unknown networks', () => {
    expect(canonicalizeNetwork('eip155:1')).toBeNull();
    expect(canonicalizeNetwork('solana:foobar')).toBeNull();
  });

  it('derives supported set from base flag', () => {
    expect(getSupportedNetworkIds(false)).toEqual([SOLANA_MAINNET_CAIP2]);
    expect(getSupportedNetworkIds(true)).toEqual([SOLANA_MAINNET_CAIP2, BASE_MAINNET_CAIP2]);
  });

  it('checks per-network helper predicates', () => {
    expect(isSolanaMainnet('solana:mainnet')).toBe(true);
    expect(isSolanaMainnet(SOLANA_MAINNET_CAIP2)).toBe(true);
    expect(isSolanaMainnet(BASE_MAINNET_CAIP2)).toBe(false);
    expect(isBaseMainnet(BASE_MAINNET_CAIP2)).toBe(true);
    expect(isBaseMainnet('solana:mainnet')).toBe(false);
  });

  it('honors feature flags for supported network checks', () => {
    expect(isSupportedNetwork('solana:mainnet', false)).toBe(true);
    expect(isSupportedNetwork(BASE_MAINNET_CAIP2, false)).toBe(false);
    expect(isSupportedNetwork(BASE_MAINNET_CAIP2, true)).toBe(true);
  });

  it('validates payer format per canonical network', () => {
    const solanaPayer = '11111111111111111111111111111111';
    const basePayer = '0x1111111111111111111111111111111111111111';

    expect(isValidPayerForNetwork(solanaPayer, 'solana:mainnet')).toBe(true);
    expect(isValidPayerForNetwork(basePayer, BASE_MAINNET_CAIP2)).toBe(true);
    expect(isValidPayerForNetwork(solanaPayer, BASE_MAINNET_CAIP2)).toBe(false);
    expect(isValidPayerForNetwork(basePayer, SOLANA_MAINNET_CAIP2)).toBe(false);
    expect(isValidPayerForNetwork(basePayer, 'eip155:1')).toBe(false);
  });
});
