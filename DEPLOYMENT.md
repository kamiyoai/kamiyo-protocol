# Deployment

Deployment workflows in this repository cover Solana Anchor programs and EVM Hyperliquid contracts.

## Prerequisites

- Rust stable
- Node.js 20+
- pnpm 9+
- Solana CLI 2.x
- Anchor CLI 0.31.1

## Localnet

```bash
solana-test-validator --reset
anchor build
anchor deploy --provider.cluster localnet
anchor test --skip-local-validator
```

## Devnet (Solana Programs)

### Configure wallet + cluster

```bash
solana config set --url devnet
solana config set --keypair ~/.config/solana/devnet.json
solana airdrop 2
```

### Build and deploy

```bash
anchor build
anchor deploy --provider.cluster devnet
```

### Initialize protocol state (repo scripts)

```bash
npx tsx scripts/init-escrow-devnet.ts
npx tsx scripts/register-escrow-oracles-devnet.ts
npx tsx scripts/register-bot-devnet.ts
```

## Mainnet (Solana Programs)

### Configure wallet + cluster

```bash
solana config set --url mainnet-beta
solana config set --keypair ~/.config/solana/mainnet-deployer.json
```

### Run predeploy checks

```bash
./scripts/mainnet-predeploy-check.sh
```

### Build and deploy

```bash
anchor build
anchor deploy --provider.cluster mainnet
```

### Initialize/maintain protocol state (repo scripts)

```bash
node scripts/init-programs-mainnet.js
npx tsx scripts/init-oracle-registry-mainnet.ts
npx tsx scripts/migrate-oracle-registry-mainnet.ts
npx tsx scripts/add-oracles-batch-mainnet.ts
```

## Mainnet (Hyperliquid Contracts)

```bash
cd contracts/hyperliquid
forge build
forge test -vvv
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $HYPERLIQUID_RPC_URL \
  --broadcast \
  --verify \
  -vvvv
```

## Upgrade Process

```bash
anchor build
solana program show <PROGRAM_ID>
anchor upgrade target/deploy/kamiyo.so --program-id <PROGRAM_ID>
```

## Monitoring

```bash
solana program show <PROGRAM_ID>
solana transaction-history <PROGRAM_ID> --limit 10
```

## Governance and Emergency Handling

Operational pause/unpause/treasury controls are executed through governance and multisig authorities.
Use the governance docs and your signer policy, not ad-hoc local scripts, for emergency actions.
