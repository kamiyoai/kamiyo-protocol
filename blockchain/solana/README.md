# KAMIYO Solana Programs

This workspace contains the Solana smart contracts (programs) for the KAMIYO token launch.

## Programs

### 1. kamiyo-token
Token-2022 mint implementation with:
- 2% transfer fee
- Freeze authority
- Metadata support

### 2. kamiyo-staking
Staking program with:
- 10-25% APY tiers
- Flexible lock periods
- Compound rewards

### 3. kamiyo-airdrop
Airdrop distribution system:
- Merkle tree verification
- 100M token allocation
- Multi-claim support

### 4. kamiyo-vesting
Token vesting contract:
- 24-month linear vesting
- Team/advisor allocations
- Cliff periods

## Development

### Prerequisites
- Rust 1.70.0+
- Solana CLI 1.18.0+
- Anchor Framework 0.30.0+
- SPL Token CLI

### Build
```bash
anchor build
```

### Test
```bash
anchor test
```

### Deploy to Devnet
```bash
anchor deploy --provider.cluster devnet
```

## Directory Structure
```
solana-programs/
├── Anchor.toml          # Anchor configuration
├── Cargo.toml           # Rust workspace
├── programs/            # Smart contracts
│   ├── kamiyo-token/
│   ├── kamiyo-staking/
│   ├── kamiyo-airdrop/
│   └── kamiyo-vesting/
├── tests/               # Integration tests
└── migrations/          # Deployment scripts
```

## Configuration

### Devnet Wallet
Set your devnet keypair path in Anchor.toml:
```toml
[provider]
wallet = "~/.config/solana/devnet.json"
```

### Program IDs
Update program IDs in Anchor.toml after first deployment.

## Resources
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Token-2022 Guide](https://spl.solana.com/token-2022)
