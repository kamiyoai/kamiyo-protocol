export const AgentRegistryAbi = [
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentDeactivated",
    inputs: [{ name: "agent", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "AgentReactivated",
    inputs: [{ name: "agent", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "StakeAdded",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newTotal", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WithdrawalRequested",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "availableAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WithdrawalCancelled",
    inputs: [{ name: "agent", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "StakeWithdrawn",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "remaining", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentSlashed",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "remaining", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TradeRecorded",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "pnl", type: "int64", indexed: false },
      { name: "successful", type: "bool", indexed: false },
    ],
  },
] as const;
