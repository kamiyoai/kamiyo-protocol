/**
 * Centralized Configuration Management
 *
 * Supports environment variables, programmatic overrides, and validation.
 * Contract addresses can be configured per-network via environment variables
 * or passed directly to the SDK.
 */

import { HyperliquidNetwork, NetworkConfig, ContractAddresses } from './types';

export interface ConfigOverrides {
  mainnet?: Partial<ContractAddresses>;
  testnet?: Partial<ContractAddresses>;
}

interface ResolvedConfig {
  networks: Record<HyperliquidNetwork, NetworkConfig>;
  initialized: boolean;
}

const DEFAULT_RPC: Record<HyperliquidNetwork, string> = {
  mainnet: 'https://rpc.hyperliquid.xyz/evm',
  testnet: 'https://rpc.hyperliquid-testnet.xyz/evm',
};

const DEFAULT_EXPLORER: Record<HyperliquidNetwork, string> = {
  mainnet: 'https://explorer.hyperliquid.xyz',
  testnet: 'https://explorer.hyperliquid-testnet.xyz',
};

const CHAIN_IDS: Record<HyperliquidNetwork, number> = {
  mainnet: 999,
  testnet: 998,
};

// Environment variable names
const ENV_VARS = {
  mainnet: {
    agentRegistry: 'KAMIYO_MAINNET_AGENT_REGISTRY',
    kamiyoVault: 'KAMIYO_MAINNET_VAULT',
    reputationLimits: 'KAMIYO_MAINNET_REPUTATION_LIMITS',
    rpc: 'KAMIYO_MAINNET_RPC',
  },
  testnet: {
    agentRegistry: 'KAMIYO_TESTNET_AGENT_REGISTRY',
    kamiyoVault: 'KAMIYO_TESTNET_VAULT',
    reputationLimits: 'KAMIYO_TESTNET_REPUTATION_LIMITS',
    rpc: 'KAMIYO_TESTNET_RPC',
  },
} as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Global config state
let resolvedConfig: ResolvedConfig | null = null;
let programmaticOverrides: ConfigOverrides = {};

function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function resolveAddress(
  envVar: string,
  override?: string,
  defaultValue: string = ZERO_ADDRESS
): string {
  // Priority: programmatic override > env var > default
  const address = override ?? getEnv(envVar) ?? defaultValue;
  if (!isValidAddress(address)) {
    throw new ConfigError(`Invalid address format: ${address}`);
  }
  return address;
}

function buildNetworkConfig(network: HyperliquidNetwork): NetworkConfig {
  const envVars = ENV_VARS[network];
  const overrides = programmaticOverrides[network];

  const contracts: ContractAddresses = {
    agentRegistry: resolveAddress(envVars.agentRegistry, overrides?.agentRegistry),
    kamiyoVault: resolveAddress(envVars.kamiyoVault, overrides?.kamiyoVault),
    reputationLimits: resolveAddress(envVars.reputationLimits, overrides?.reputationLimits),
  };

  return {
    chainId: CHAIN_IDS[network],
    rpc: getEnv(envVars.rpc) ?? DEFAULT_RPC[network],
    explorer: DEFAULT_EXPLORER[network],
    contracts,
  };
}

function buildConfig(): ResolvedConfig {
  return {
    networks: {
      mainnet: buildNetworkConfig('mainnet'),
      testnet: buildNetworkConfig('testnet'),
    },
    initialized: true,
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Configure contract addresses programmatically.
 * Call before creating any SDK instances.
 */
export function configure(overrides: ConfigOverrides): void {
  programmaticOverrides = overrides;
  resolvedConfig = null; // Force rebuild on next access
}

/**
 * Get the resolved network configuration.
 * Builds config on first access, caches thereafter.
 */
export function getNetworkConfig(network: HyperliquidNetwork): NetworkConfig {
  if (!resolvedConfig) {
    resolvedConfig = buildConfig();
  }
  return resolvedConfig.networks[network];
}

/**
 * Get all network configurations.
 */
export function getAllNetworkConfigs(): Record<HyperliquidNetwork, NetworkConfig> {
  if (!resolvedConfig) {
    resolvedConfig = buildConfig();
  }
  return resolvedConfig.networks;
}

/**
 * Check if contracts are configured for a network.
 * Returns false if any required contract address is zero.
 */
export function isNetworkConfigured(network: HyperliquidNetwork): boolean {
  const config = getNetworkConfig(network);
  return (
    config.contracts.agentRegistry !== ZERO_ADDRESS &&
    config.contracts.kamiyoVault !== ZERO_ADDRESS
  );
}

/**
 * Validate that all required contracts are configured.
 * Throws ConfigError if validation fails.
 */
export function validateConfig(network: HyperliquidNetwork): void {
  const config = getNetworkConfig(network);
  const missing: string[] = [];

  if (config.contracts.agentRegistry === ZERO_ADDRESS) {
    missing.push('agentRegistry');
  }
  if (config.contracts.kamiyoVault === ZERO_ADDRESS) {
    missing.push('kamiyoVault');
  }

  if (missing.length > 0) {
    const envHints = missing.map((c) => {
      const envVar = ENV_VARS[network][c as keyof typeof ENV_VARS.mainnet];
      return `  ${c}: set ${envVar} or use configure()`;
    });
    throw new ConfigError(
      `Missing contract addresses for ${network}:\n${envHints.join('\n')}`
    );
  }
}

/**
 * Reset configuration to defaults.
 * Useful for testing.
 */
export function resetConfig(): void {
  programmaticOverrides = {};
  resolvedConfig = null;
}

/**
 * Get environment variable hints for configuration.
 */
export function getConfigHints(network: HyperliquidNetwork): Record<string, string> {
  return { ...ENV_VARS[network] };
}
