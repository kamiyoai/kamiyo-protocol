import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  configure,
  getNetworkConfig,
  getAllNetworkConfigs,
  isNetworkConfigured,
  validateConfig,
  resetConfig,
  getConfigHints,
  ConfigError,
} from '../src/config';

describe('config', () => {
  beforeEach(() => {
    resetConfig();
    vi.unstubAllEnvs();
  });

  describe('getNetworkConfig', () => {
    it('returns default config for testnet', () => {
      const config = getNetworkConfig('testnet');
      expect(config.chainId).toBe(998);
      expect(config.rpc).toBe('https://rpc.hyperliquid-testnet.xyz/evm');
      expect(config.contracts.agentRegistry).toBe('0x0000000000000000000000000000000000000000');
    });

    it('returns default config for mainnet', () => {
      const config = getNetworkConfig('mainnet');
      expect(config.chainId).toBe(999);
      expect(config.rpc).toBe('https://rpc.hyperliquid.xyz/evm');
    });
  });

  describe('configure', () => {
    it('allows programmatic address override', () => {
      const testAddr = '0x1234567890123456789012345678901234567890';
      configure({
        testnet: {
          agentRegistry: testAddr,
        },
      });

      const config = getNetworkConfig('testnet');
      expect(config.contracts.agentRegistry).toBe(testAddr);
    });

    it('preserves other addresses when overriding one', () => {
      const testAddr = '0x1234567890123456789012345678901234567890';
      configure({
        testnet: {
          agentRegistry: testAddr,
        },
      });

      const config = getNetworkConfig('testnet');
      expect(config.contracts.agentRegistry).toBe(testAddr);
      // Vault should still be zero
      expect(config.contracts.kamiyoVault).toBe('0x0000000000000000000000000000000000000000');
    });

    it('can configure multiple networks', () => {
      const addr1 = '0x1111111111111111111111111111111111111111';
      const addr2 = '0x2222222222222222222222222222222222222222';
      configure({
        testnet: { agentRegistry: addr1 },
        mainnet: { agentRegistry: addr2 },
      });

      expect(getNetworkConfig('testnet').contracts.agentRegistry).toBe(addr1);
      expect(getNetworkConfig('mainnet').contracts.agentRegistry).toBe(addr2);
    });
  });

  describe('isNetworkConfigured', () => {
    it('returns false when contracts are zero addresses', () => {
      expect(isNetworkConfigured('testnet')).toBe(false);
    });

    it('returns true when required contracts are set', () => {
      configure({
        testnet: {
          agentRegistry: '0x1234567890123456789012345678901234567890',
          kamiyoVault: '0x2345678901234567890123456789012345678901',
        },
      });
      expect(isNetworkConfigured('testnet')).toBe(true);
    });

    it('returns false when only one required contract is set', () => {
      configure({
        testnet: {
          agentRegistry: '0x1234567890123456789012345678901234567890',
        },
      });
      expect(isNetworkConfigured('testnet')).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('throws ConfigError when contracts are not configured', () => {
      expect(() => validateConfig('testnet')).toThrow(ConfigError);
      expect(() => validateConfig('testnet')).toThrow('Missing contract addresses');
    });

    it('does not throw when contracts are configured', () => {
      configure({
        testnet: {
          agentRegistry: '0x1234567890123456789012345678901234567890',
          kamiyoVault: '0x2345678901234567890123456789012345678901',
        },
      });
      expect(() => validateConfig('testnet')).not.toThrow();
    });
  });

  describe('getAllNetworkConfigs', () => {
    it('returns both network configs', () => {
      const configs = getAllNetworkConfigs();
      expect(configs.mainnet).toBeDefined();
      expect(configs.testnet).toBeDefined();
      expect(configs.mainnet.chainId).toBe(999);
      expect(configs.testnet.chainId).toBe(998);
    });
  });

  describe('getConfigHints', () => {
    it('returns env var names for testnet', () => {
      const hints = getConfigHints('testnet');
      expect(hints.agentRegistry).toBe('KAMIYO_TESTNET_AGENT_REGISTRY');
      expect(hints.kamiyoVault).toBe('KAMIYO_TESTNET_VAULT');
      expect(hints.reputationLimits).toBe('KAMIYO_TESTNET_REPUTATION_LIMITS');
    });

    it('returns env var names for mainnet', () => {
      const hints = getConfigHints('mainnet');
      expect(hints.agentRegistry).toBe('KAMIYO_MAINNET_AGENT_REGISTRY');
      expect(hints.kamiyoVault).toBe('KAMIYO_MAINNET_VAULT');
    });
  });

  describe('resetConfig', () => {
    it('clears programmatic overrides', () => {
      const testAddr = '0x1234567890123456789012345678901234567890';
      configure({
        testnet: { agentRegistry: testAddr },
      });
      expect(getNetworkConfig('testnet').contracts.agentRegistry).toBe(testAddr);

      resetConfig();
      expect(getNetworkConfig('testnet').contracts.agentRegistry).toBe(
        '0x0000000000000000000000000000000000000000'
      );
    });
  });

  describe('invalid address handling', () => {
    it('throws ConfigError for invalid address format', () => {
      expect(() =>
        configure({
          testnet: { agentRegistry: 'invalid' },
        })
      ).not.toThrow(); // Configure doesn't validate immediately

      // But getting config should throw when building
      resetConfig();
      configure({
        testnet: { agentRegistry: 'not-an-address' },
      });
      expect(() => getNetworkConfig('testnet')).toThrow(ConfigError);
    });
  });
});
