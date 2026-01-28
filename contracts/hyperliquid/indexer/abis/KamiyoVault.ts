export const KamiyoVaultAbi = [
  {
    type: "event",
    name: "PositionOpened",
    inputs: [
      { name: "positionId", type: "uint256", indexed: true },
      { name: "copier", type: "address", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "leverage", type: "int16", indexed: false },
      { name: "lockUntil", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PositionValueUpdated",
    inputs: [
      { name: "positionId", type: "uint256", indexed: true },
      { name: "oldValue", type: "uint256", indexed: false },
      { name: "newValue", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PositionClosed",
    inputs: [
      { name: "positionId", type: "uint256", indexed: true },
      { name: "finalValue", type: "uint256", indexed: false },
      { name: "pnl", type: "int64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DisputeFiled",
    inputs: [
      { name: "disputeId", type: "uint256", indexed: true },
      { name: "positionId", type: "uint256", indexed: true },
      { name: "filer", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "DisputeResolved",
    inputs: [
      { name: "disputeId", type: "uint256", indexed: true },
      { name: "ruling", type: "bool", indexed: false },
      { name: "refundAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EmergencyWithdrawal",
    inputs: [
      { name: "positionId", type: "uint256", indexed: true },
      { name: "copier", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
