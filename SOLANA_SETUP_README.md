# KAMIYO Solana Development Environment Setup

**Phase 2, Week 1 - Task 2.1**

This document describes the Solana development environment setup for the KAMIYO token launch project.

## Overview

The setup includes all necessary tools for Solana smart contract development:

- **Rust** (v1.70.0+) - Systems programming language for Solana programs
- **Solana CLI** (v1.18.0+) - Command-line tools for Solana interaction
- **Anchor Framework** (v0.30.0+) - Smart contract framework with Token-2022 support
- **SPL Token CLI** - Token management utilities

## Quick Start

### Step 1: Run Installation Script

```bash
cd /Users/dennisgoslar/Projekter/kamiyo
bash scripts/setup_solana_dev.sh
```

This script will:
1. Install Rust via rustup (if not already installed)
2. Install Solana CLI (latest stable)
3. Install Anchor Framework (v0.30.0+)
4. Install SPL Token CLI
5. Configure your shell PATH (zsh or bash)

**Note:** The Anchor installation may take 10-15 minutes as it compiles from source.

### Step 2: Restart Terminal

After installation, restart your terminal or run:

```bash
# For zsh (default on macOS)
source ~/.zshrc

# For bash
source ~/.bashrc
```

### Step 3: Verify Installation

```bash
bash scripts/verify_solana_setup.sh
```

This script will:
- ✅ Check all required tools are installed
- ✅ Verify versions meet minimum requirements
- ✅ Create devnet wallet (if needed)
- ✅ Request devnet SOL airdrop (if needed)
- ✅ Initialize Anchor workspace
- ✅ Generate verification report

Expected output:
```
==========================================
  Verification Summary
==========================================

✅ All checks passed! (8/8)

Your Solana development environment is ready!
```

## Directory Structure

After successful setup, you'll have:

```
/Users/dennisgoslar/Projekter/kamiyo/
├── solana-programs/              # Anchor workspace root
│   ├── Anchor.toml               # Anchor configuration
│   ├── Cargo.toml                # Rust workspace manifest
│   ├── package.json              # JavaScript dependencies
│   ├── programs/                 # Smart contract programs
│   │   ├── kamiyo-token/         # Token-2022 mint program
│   │   ├── kamiyo-staking/       # Staking program (10-25% APY)
│   │   ├── kamiyo-airdrop/       # Airdrop distribution system
│   │   └── kamiyo-vesting/       # 24-month vesting contract
│   ├── tests/                    # Integration tests
│   ├── migrations/               # Deployment scripts
│   └── target/                   # Build artifacts
├── scripts/
│   ├── setup_solana_dev.sh       # Installation script
│   └── verify_solana_setup.sh    # Verification script
└── .env.example                  # Environment configuration template
```

## Configuration

### Solana CLI Configuration

After setup, your Solana CLI will be configured for devnet:

```bash
# View configuration
solana config get

# Output:
# Config File: ~/.config/solana/cli/config.yml
# RPC URL: https://api.devnet.solana.com
# WebSocket URL: wss://api.devnet.solana.com/ (computed)
# Keypair Path: ~/.config/solana/devnet.json
# Commitment: confirmed
```

### Devnet Wallet

Location: `~/.config/solana/devnet.json`

**Security:** This wallet is for development only. Never use devnet keys for mainnet!

Get your wallet address:
```bash
solana address
```

Check balance:
```bash
solana balance
```

Request more devnet SOL (if balance < 1):
```bash
solana airdrop 2
```

### Anchor Configuration

Location: `/Users/dennisgoslar/Projekter/kamiyo/solana-programs/Anchor.toml`

Key settings:
- **Cluster:** devnet
- **Wallet:** ~/.config/solana/devnet.json
- **Programs:** 4 placeholder program IDs (updated after deployment)

## Environment Variables

Add to your `.env` file (copy from `.env.example`):

```bash
# Solana Development (Devnet)
SOLANA_DEVNET_KEYPAIR_PATH=~/.config/solana/devnet.json
SOLANA_DEVNET_WALLET_ADDRESS=<your_devnet_address>
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Anchor Programs (populated after deployment)
KAMIYO_TOKEN_PROGRAM_ID=
KAMIYO_STAKING_PROGRAM_ID=
KAMIYO_AIRDROP_PROGRAM_ID=
KAMIYO_VESTING_PROGRAM_ID=
```

Get your wallet address:
```bash
solana address
```

## Verification Checklist

The verification script checks:

1. ✅ **Rust installed** - `rustc --version` (v1.70.0+)
2. ✅ **Solana CLI installed** - `solana --version` (v1.18.0+)
3. ✅ **Connected to devnet** - `solana config get`
4. ✅ **Anchor installed** - `anchor --version` (v0.30.0+)
5. ✅ **SPL Token CLI installed** - `spl-token --version`
6. ✅ **Devnet wallet exists** - `~/.config/solana/devnet.json`
7. ✅ **Wallet has >= 1 SOL** - `solana balance`
8. ✅ **Anchor workspace initialized** - `Anchor.toml` present

## Common Issues & Solutions

### Issue 1: Anchor Installation Takes Too Long

**Symptom:** `cargo install anchor-cli` hangs or takes 20+ minutes

**Solution:**
```bash
# Use pre-built binary (faster)
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force
```

### Issue 2: Devnet Airdrop Fails

**Symptom:** `Error: airdrop request failed`

**Solution:** Devnet is rate-limited. Wait a few minutes and try again:
```bash
# Wait 2-3 minutes, then:
solana airdrop 1
```

Or use the Solana faucet:
```bash
# Visit: https://faucet.solana.com/
```

### Issue 3: Command Not Found After Installation

**Symptom:** `bash: solana: command not found` (after installation)

**Solution:** Reload shell configuration:
```bash
# For zsh
source ~/.zshrc

# For bash
source ~/.bashrc

# Or restart terminal
```

### Issue 4: M1/M2 Mac Architecture Issues

**Symptom:** Compilation errors on Apple Silicon

**Solution:**
```bash
# Install Rosetta 2
softwareupdate --install-rosetta --agree-to-license

# Or compile for ARM explicitly
rustup target add aarch64-apple-darwin
```

### Issue 5: Permission Denied

**Symptom:** `Permission denied` when running scripts

**Solution:**
```bash
chmod +x scripts/setup_solana_dev.sh
chmod +x scripts/verify_solana_setup.sh
```

## Next Steps

After successful setup, proceed to:

### Task 2.2: Implement Token-2022 Mint Program

Location: `solana-programs/programs/kamiyo-token/`

Features:
- Token-2022 standard with extensions
- 2% transfer fee mechanism
- 9 decimal precision
- Freeze authority for security

### Task 2.3: Implement Staking Program

Location: `solana-programs/programs/kamiyo-staking/`

Features:
- 10-25% APY tiered rewards
- Flexible lock periods
- Rewards calculation engine

### Task 2.4: Implement Airdrop System

Location: `solana-programs/programs/kamiyo-airdrop/`

Features:
- 100M token distribution
- Merkle tree verification
- Claim tracking

### Task 2.5: Implement Vesting Contract

Location: `solana-programs/programs/kamiyo-vesting/`

Features:
- 24-month linear vesting
- Multi-beneficiary support
- Cliff periods

## Development Commands

### Build Programs

```bash
cd solana-programs
anchor build
```

### Run Tests

```bash
anchor test
```

### Deploy to Devnet

```bash
anchor deploy
```

### View Logs

```bash
solana logs
```

### Clean Build

```bash
anchor clean
```

## Resources

### Official Documentation

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Book](https://book.anchor-lang.com/)
- [Token-2022 Guide](https://spl.solana.com/token-2022)
- [SPL Token CLI](https://spl.solana.com/token#command-line-utility)

### Helpful Tools

- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)
- [Solana Devnet Faucet](https://faucet.solana.com/)
- [Anchor Examples](https://github.com/coral-xyz/anchor/tree/master/examples)

### Community

- [Solana Stack Exchange](https://solana.stackexchange.com/)
- [Anchor Discord](https://discord.gg/anchor)
- [Solana Discord](https://discord.gg/solana)

## System Requirements

### Minimum Requirements

- **OS:** macOS 10.14+ (Mojave or later)
- **Architecture:** x86_64 or arm64 (M1/M2)
- **RAM:** 8 GB
- **Disk:** 10 GB free space
- **Network:** Stable internet connection

### Recommended Requirements

- **OS:** macOS 12+ (Monterey or later)
- **Architecture:** arm64 (M1/M2)
- **RAM:** 16 GB
- **Disk:** 20 GB free space
- **Network:** High-speed internet

## Support

For issues or questions:

1. Check the [Common Issues](#common-issues--solutions) section
2. Review verification script output for specific error messages
3. Check Solana Discord for community support
4. Review Anchor documentation for framework-specific questions

## Version History

- **v1.0.0** (2025-10-28) - Initial setup script with Rust, Solana CLI v1.18.0+, Anchor v0.30.0+, SPL Token CLI
- **Target:** Solana mainnet-beta deployment in Phase 2, Week 4

---

**Status:** ✅ Development Environment Setup Complete

**Next Phase:** Smart Contract Implementation (Weeks 1-4)
