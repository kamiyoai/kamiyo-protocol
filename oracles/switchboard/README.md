# Kamiyo Switchboard Oracle

Evaluates service quality for disputed escrows using Switchboard TEE.

## Setup

```bash
# Install Switchboard CLI
npm install -g @switchboard-xyz/cli

# Build container
docker build -t kamiyo-oracle .

# Create function on Solana
sb solana function create \
  --name "kamiyo-quality-oracle" \
  --container kamiyo-oracle \
  --keypair ~/.config/solana/id.json \
  --cluster mainnet-beta
```

## Register with Kamiyo

After creating the function, register its pubkey:

```bash
cd ../..
RPC_URL=https://api.mainnet-beta.solana.com \
npx ts-node scripts/add-oracle.ts <function-pubkey> 100 --type switchboard
```

## Quality Scoring

| Criteria | Weight | Description |
|----------|--------|-------------|
| Response Time | 20% | API responded within expected time |
| Data Completeness | 30% | All expected fields present |
| Data Accuracy | 30% | Data matches schema |
| Availability | 20% | Service was reachable |

## Refund Scale

| Quality Score | Agent Refund |
|--------------|--------------|
| 80-100% | 0% |
| 65-79% | 35% |
| 50-64% | 75% |
| 0-49% | 100% |
