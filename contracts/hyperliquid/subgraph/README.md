# KAMIYO Hyperliquid Subgraph

Indexes events from KAMIYO contracts on Hyperliquid EVM (Chain ID 999).

## Contracts Indexed

| Contract | Address |
|----------|---------|
| AgentRegistry | `0xCa034D63c67ADd6CA127a575F0097C203DAcaE9d` |
| KamiyoVault | `0xF5B2b62f014459B98991AaE001e33aF75f4fbD15` |
| ReputationLimits | `0xbECa9c722EeF9897b5aa87363F3Bd9C94e16fE33` |

## Entities

- **Agent** - Registered trading agents with stake, performance metrics
- **CopyPosition** - User positions copying agents
- **Dispute** - Filed disputes with resolution status
- **AgentTier** - ZK-verified reputation tiers
- **ProtocolStats** - Aggregate protocol metrics
- **DailyStats** - Daily snapshot metrics

## Setup

```bash
npm install
npm run codegen
npm run build
```

## Deploy

### Local (Graph Node)

```bash
npm run create-local
npm run deploy-local
```

### The Graph Studio

```bash
graph auth --studio <DEPLOY_KEY>
npm run deploy-studio
```

## Queries

```graphql
# Top agents by copiers
{
  agents(orderBy: copiers, orderDirection: desc, first: 10) {
    id
    name
    stake
    copiers
    tier
    totalPnl
  }
}

# Active positions for user
{
  copyPositions(where: { user: "0x...", active: true }) {
    id
    agent { name }
    deposit
    currentValue
    minReturnBps
    endTime
  }
}

# Protocol stats
{
  protocolStats(id: "stats") {
    totalAgents
    activeAgents
    totalPositions
    totalVolumeDeposited
    totalStaked
  }
}

# Daily volume
{
  dailyStats(orderBy: timestamp, orderDirection: desc, first: 30) {
    date
    volumeDeposited
    volumeReturned
    newPositions
  }
}
```
