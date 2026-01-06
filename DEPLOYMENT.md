# Deployment

## Prerequisites

- [Rust](https://rustup.rs/) 1.70+
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) 1.18+
- [Anchor](https://www.anchor-lang.com/docs/installation) 0.31+
- Node.js 18+

## Local Development

### 1. Start local validator

```bash
solana-test-validator --reset
```

### 2. Build program

```bash
anchor build
```

### 3. Deploy locally

```bash
anchor deploy --provider.cluster localnet
```

### 4. Run tests

```bash
anchor test --skip-local-validator
```

## Devnet

### 1. Configure CLI

```bash
solana config set --url devnet
solana config set --keypair ~/.config/solana/devnet.json
```

### 2. Fund deployer

```bash
solana airdrop 2
```

### 3. Build and deploy

```bash
anchor build
anchor deploy --provider.cluster devnet
```

### 4. Initialize protocol

```bash
# Set up protocol config with multisig authorities
npx ts-node scripts/initialize-protocol.ts \
  --authority1 <PUBKEY1> \
  --authority2 <PUBKEY2> \
  --authority3 <PUBKEY3>
```

### 5. Initialize oracle registry

```bash
npx ts-node scripts/initialize-oracle-registry.ts \
  --admin <ADMIN_PUBKEY>
```

## Mainnet

### 1. Configure CLI

```bash
solana config set --url mainnet-beta
solana config set --keypair ~/.config/solana/mainnet-deployer.json
```

### 2. Verify program

```bash
anchor verify <PROGRAM_ID>
```

### 3. Deploy

```bash
anchor deploy --provider.cluster mainnet
```

### 4. Initialize (one-time)

```bash
# Protocol config
npx ts-node scripts/initialize-protocol.ts \
  --authority1 <MULTISIG_1> \
  --authority2 <MULTISIG_2> \
  --authority3 <MULTISIG_3> \
  --cluster mainnet-beta

# Oracle registry
npx ts-node scripts/initialize-oracle-registry.ts \
  --admin <REGISTRY_ADMIN> \
  --cluster mainnet-beta
```

## Program Addresses

| Network | Program ID |
|---------|------------|
| Mainnet | `8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM` |
| Devnet | `8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM` |

## Upgrade Process

### 1. Build new version

```bash
anchor build
```

### 2. Verify buffer

```bash
solana program show <PROGRAM_ID>
```

### 3. Deploy upgrade

```bash
anchor upgrade target/deploy/kamiyo.so --program-id <PROGRAM_ID>
```

## Configuration

### Environment Variables

```bash
# .env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PROGRAM_ID=8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM
```

### Anchor.toml

```toml
[programs.mainnet]
kamiyo = "8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM"

[programs.devnet]
kamiyo = "8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM"

[provider]
cluster = "mainnet"
wallet = "~/.config/solana/deployer.json"
```

## Monitoring

### Check program status

```bash
solana program show <PROGRAM_ID>
```

### View recent transactions

```bash
solana transaction-history <PROGRAM_ID> --limit 10
```

### Check account balances

```bash
# Treasury
solana balance 8xi4TJcPmLqxmhsbCtNoBcu7b8Lfnubr3GY1bkhjuNJF

# Protocol config
solana account E6VhYjktLpT91VJy7bt5VL7DhTurZZKZUEFEgxLdZHna
```

## Emergency Procedures

### Pause protocol

Requires 2-of-3 multisig:

```bash
npx ts-node scripts/pause-protocol.ts \
  --signer1 <KEYPAIR1> \
  --signer2 <KEYPAIR2>
```

### Unpause protocol

```bash
npx ts-node scripts/unpause-protocol.ts \
  --signer1 <KEYPAIR1> \
  --signer2 <KEYPAIR2>
```

### Withdraw treasury

```bash
npx ts-node scripts/withdraw-treasury.ts \
  --signer1 <KEYPAIR1> \
  --signer2 <KEYPAIR2> \
  --amount <LAMPORTS> \
  --destination <PUBKEY>
```
