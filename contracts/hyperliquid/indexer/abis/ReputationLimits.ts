export const ReputationLimitsAbi = [
  {
    type: "event",
    name: "TierVerified",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "tier", type: "uint8", indexed: false },
      { name: "expiresAt", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TierConfigured",
    inputs: [
      { name: "tier", type: "uint8", indexed: true },
      { name: "minReputation", type: "uint256", indexed: false },
      { name: "maxPosition", type: "uint256", indexed: false },
      { name: "maxLeverage", type: "uint256", indexed: false },
    ],
  },
] as const;
