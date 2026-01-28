import { createConfig } from "@ponder/core";
import { http } from "viem";

import { AgentRegistryAbi } from "./abis/AgentRegistry";
import { KamiyoVaultAbi } from "./abis/KamiyoVault";
import { ReputationLimitsAbi } from "./abis/ReputationLimits";

export default createConfig({
  networks: {
    hyperliquid: {
      chainId: 999,
      transport: http(process.env.HYPERLIQUID_RPC_URL || "https://hyperliquid.drpc.org"),
      maxRequestsPerSecond: 10,
    },
  },
  contracts: {
    AgentRegistry: {
      network: "hyperliquid",
      abi: AgentRegistryAbi,
      address: "0xCa034D63c67ADd6CA127a575F0097C203DAcaE9d",
      startBlock: 25779000,
    },
    KamiyoVault: {
      network: "hyperliquid",
      abi: KamiyoVaultAbi,
      address: "0xF5B2b62f014459B98991AaE001e33aF75f4fbD15",
      startBlock: 25779000,
    },
    ReputationLimits: {
      network: "hyperliquid",
      abi: ReputationLimitsAbi,
      address: "0xbECa9c722EeF9897b5aa87363F3Bd9C94e16fE33",
      startBlock: 25779000,
    },
  },
});
