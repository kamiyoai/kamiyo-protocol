import { ethers, Provider } from 'ethers';

export enum Tier {
  Unverified = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Platinum = 4,
}

export const TIER_THRESHOLDS: Record<Tier, number> = {
  [Tier.Unverified]: 0,
  [Tier.Bronze]: 25,
  [Tier.Silver]: 50,
  [Tier.Gold]: 75,
  [Tier.Platinum]: 90,
};

export interface ReputationConfig {
  contractAddress: string;
  provider: Provider;
}

const ZK_REPUTATION_ABI = [
  'function getAgentTier(address agent) view returns (uint8)',
  'function getAgentCommitment(address agent) view returns (uint256)',
  'function isRegistered(address agent) view returns (bool)',
  'function agents(address) view returns (uint256 commitment, uint8 verifiedTier, uint256 lastProofBlock, bool registered)',
];

// Deployed contract addresses
export const DEPLOYED_CONTRACTS = {
  sepolia: '0x0feb48737d7f47AF432a094E69e716c9E8fA8A22',
} as const;

export class ReputationClient {
  private contract: ethers.Contract;

  constructor(config: ReputationConfig) {
    this.contract = new ethers.Contract(
      config.contractAddress,
      ZK_REPUTATION_ABI,
      config.provider
    );
  }

  async getAgentTier(agent: string): Promise<Tier> {
    const tier = await this.contract.getAgentTier(agent);
    return Number(tier) as Tier;
  }

  async isRegistered(agent: string): Promise<boolean> {
    return this.contract.isRegistered(agent);
  }

  async getCommitment(agent: string): Promise<bigint> {
    return this.contract.getAgentCommitment(agent);
  }

  async getAgentInfo(agent: string): Promise<{
    commitment: bigint;
    tier: Tier;
    lastProofBlock: bigint;
    registered: boolean;
  }> {
    const [commitment, tier, lastProofBlock, registered] = await this.contract.agents(agent);
    return {
      commitment,
      tier: Number(tier) as Tier,
      lastProofBlock,
      registered,
    };
  }

  async meetsMinimumTier(agent: string, minimumTier: Tier): Promise<boolean> {
    const tier = await this.getAgentTier(agent);
    return tier >= minimumTier;
  }
}

export function createSepoliaClient(rpcUrl?: string): ReputationClient {
  const provider = new ethers.JsonRpcProvider(
    rpcUrl || 'https://ethereum-sepolia-rpc.publicnode.com'
  );
  return new ReputationClient({
    contractAddress: DEPLOYED_CONTRACTS.sepolia,
    provider,
  });
}
