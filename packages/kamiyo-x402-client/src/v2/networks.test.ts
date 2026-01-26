import {
  toCAIP2,
  fromCAIP2,
  isCAIP2,
  SUPPORTED_NETWORKS,
  NETWORK_NAMES,
  mainnetCAIP2s,
  testnetCAIP2s,
} from './networks';

describe('CAIP-2 Network Mapping', () => {
  describe('toCAIP2', () => {
    it('converts mainnets', () => {
      expect(toCAIP2('base')).toBe('eip155:8453');
      expect(toCAIP2('polygon')).toBe('eip155:137');
      expect(toCAIP2('arbitrum')).toBe('eip155:42161');
      expect(toCAIP2('optimism')).toBe('eip155:10');
      expect(toCAIP2('avalanche')).toBe('eip155:43114');
      expect(toCAIP2('sei')).toBe('eip155:1329');
      expect(toCAIP2('iotex')).toBe('eip155:4689');
      expect(toCAIP2('peaq')).toBe('eip155:3338');
      expect(toCAIP2('xlayer')).toBe('eip155:196');
      expect(toCAIP2('solana')).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    });

    it('converts testnets', () => {
      expect(toCAIP2('base-sepolia')).toBe('eip155:84532');
      expect(toCAIP2('solana-devnet')).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    });

    it('passes through existing CAIP-2 strings', () => {
      expect(toCAIP2('eip155:8453')).toBe('eip155:8453');
      expect(toCAIP2('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    });

    it('throws for unknown network', () => {
      expect(() => toCAIP2('ethereum')).toThrow('Unknown network');
    });
  });

  describe('fromCAIP2', () => {
    it('converts CAIP-2 to friendly name', () => {
      expect(fromCAIP2('eip155:8453')).toBe('base');
      expect(fromCAIP2('eip155:137')).toBe('polygon');
      expect(fromCAIP2('eip155:42161')).toBe('arbitrum');
      expect(fromCAIP2('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('solana');
      expect(fromCAIP2('eip155:84532')).toBe('base-sepolia');
      expect(fromCAIP2('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1')).toBe('solana-devnet');
    });

    it('throws for unknown CAIP-2', () => {
      expect(() => fromCAIP2('eip155:9999')).toThrow('Unknown CAIP-2');
    });
  });

  describe('round-trip', () => {
    it('converts back and forth for all networks', () => {
      for (const name of NETWORK_NAMES) {
        const caip2 = toCAIP2(name);
        expect(fromCAIP2(caip2)).toBe(name);
      }
    });
  });

  describe('isCAIP2', () => {
    it('identifies valid CAIP-2 strings', () => {
      expect(isCAIP2('eip155:8453')).toBe(true);
      expect(isCAIP2('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe(true);
    });

    it('rejects invalid strings', () => {
      expect(isCAIP2('base')).toBe(false);
      expect(isCAIP2('not-caip')).toBe(false);
      expect(isCAIP2('')).toBe(false);
    });
  });

  describe('SUPPORTED_NETWORKS', () => {
    it('contains all CAIP-2 identifiers', () => {
      expect(SUPPORTED_NETWORKS).toContain('eip155:8453');
      expect(SUPPORTED_NETWORKS).toContain('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
      expect(SUPPORTED_NETWORKS.length).toBe(NETWORK_NAMES.length);
    });
  });

  describe('mainnetCAIP2s', () => {
    it('returns only mainnets', () => {
      const mainnets = mainnetCAIP2s();
      expect(mainnets).toContain('eip155:8453');
      expect(mainnets).toContain('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
      expect(mainnets).not.toContain('eip155:84532');
      expect(mainnets).not.toContain('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    });
  });

  describe('testnetCAIP2s', () => {
    it('returns only testnets', () => {
      const testnets = testnetCAIP2s();
      expect(testnets).toContain('eip155:84532');
      expect(testnets).toContain('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
      expect(testnets).not.toContain('eip155:8453');
      expect(testnets).not.toContain('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    });
  });
});
