/**
 * Hyperliquid network configuration
 */

export type HyperliquidNetwork = 'mainnet' | 'testnet';

export interface NetworkConfig {
  chainId: number;
  rpc: string;
  explorer: string;
  contracts: {
    agentRegistry: string;
    kamiyoVault: string;
  };
}

export const NETWORKS: Record<HyperliquidNetwork, NetworkConfig> = {
  mainnet: {
    chainId: 999,  // Hyperliquid mainnet chain ID
    rpc: 'https://rpc.hyperliquid.xyz/evm',
    explorer: 'https://explorer.hyperliquid.xyz',
    contracts: {
      agentRegistry: '0x0000000000000000000000000000000000000000',
      kamiyoVault: '0x0000000000000000000000000000000000000000',
    },
  },
  testnet: {
    chainId: 998,  // Hyperliquid testnet chain ID
    rpc: 'https://rpc.hyperliquid-testnet.xyz/evm',
    explorer: 'https://explorer.hyperliquid-testnet.xyz',
    contracts: {
      agentRegistry: '0x0000000000000000000000000000000000000000',
      kamiyoVault: '0x0000000000000000000000000000000000000000',
    },
  },
};

export interface Agent {
  owner: string;
  name: string;
  stake: bigint;
  registeredAt: number;
  totalTrades: number;
  totalPnl: bigint;
  copiers: number;
  active: boolean;
}

export interface CopyPosition {
  user: string;
  agent: string;
  deposit: bigint;
  startValue: bigint;
  minReturnBps: number;
  startTime: number;
  lockPeriod: number;
  endTime: number;
  active: boolean;
  disputed: boolean;
}

export interface DisputeInfo {
  positionId: bigint;
  user: string;
  agent: string;
  filedAt: number;
  actualReturnBps: number;
  expectedReturnBps: number;
  resolved: boolean;
  userWon: boolean;
}

export interface OpenPositionParams {
  agent: string;
  minReturnBps: number;
  lockPeriodSeconds: number;
  depositAmount: bigint;
}
