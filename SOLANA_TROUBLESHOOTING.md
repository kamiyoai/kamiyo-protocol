# KAMIYO Solana Development - Troubleshooting Guide

**Quick fixes for common issues during setup and development**

---

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Configuration Issues](#configuration-issues)
3. [Wallet Issues](#wallet-issues)
4. [Build Issues](#build-issues)
5. [Deployment Issues](#deployment-issues)
6. [Network Issues](#network-issues)
7. [Environment Issues](#environment-issues)
8. [macOS Specific Issues](#macos-specific-issues)

---

## Installation Issues

### Issue: Command Not Found After Installation

**Symptoms:**
```bash
$ solana --version
bash: solana: command not found
```

**Causes:**
- Tools not in PATH
- Shell config not reloaded

**Solutions:**

```bash
# Solution 1: Reload shell configuration
source ~/.zshrc      # for zsh (default macOS)
source ~/.bashrc     # for bash

# Solution 2: Restart terminal
# Just close and reopen your terminal

# Solution 3: Manually add to PATH (if script failed)
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Solution 4: Check if actually installed
ls -la ~/.cargo/bin/anchor
ls -la ~/.local/share/solana/install/active_release/bin/solana

# Solution 5: Re-run installation script
bash scripts/setup_solana_dev.sh
```

---

### Issue: Anchor Installation Takes Too Long (20+ minutes)

**Symptoms:**
```bash
Installing anchor-cli...
[Compiling for 20+ minutes...]
```

**Cause:** Compiling Anchor from source is slow

**Solutions:**

```bash
# Solution 1: Be patient (normal for first install)
# Anchor compilation takes 10-20 minutes on average
# Grab a coffee and wait ☕

# Solution 2: Check if actually progressing
# Look for "Compiling" messages with package names
# If stuck on same package for 10+ min, may be hung

# Solution 3: Cancel and retry if truly stuck
Ctrl+C
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force

# Solution 4: Check system resources
# Ensure enough RAM (8GB minimum, 16GB recommended)
# Check Activity Monitor for memory pressure

# Solution 5: Use pre-built binary (if available)
# Currently not officially available, wait for compilation
```

---

### Issue: Rust Installation Fails

**Symptoms:**
```bash
curl: (7) Failed to connect to sh.rustup.rs
```

**Causes:**
- Network connectivity issues
- Firewall blocking rustup.rs
- Proxy configuration needed

**Solutions:**

```bash
# Solution 1: Check network connection
ping sh.rustup.rs

# Solution 2: Try with verbose output
curl -v --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs

# Solution 3: Manual download
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o rustup.sh
chmod +x rustup.sh
./rustup.sh -y

# Solution 4: Use alternative mirror (China users)
export RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static
export RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solution 5: Check if already installed
rustc --version
# If installed, run: rustup update
```

---

### Issue: Permission Denied When Installing

**Symptoms:**
```bash
Permission denied (publickey)
touch: ~/.config/solana: Permission denied
```

**Causes:**
- Insufficient permissions
- Home directory restrictions

**Solutions:**

```bash
# Solution 1: Check home directory permissions
ls -la ~/

# Solution 2: Create .config directory manually
mkdir -p ~/.config/solana
chmod 755 ~/.config/solana

# Solution 3: Fix ownership
sudo chown -R $(whoami) ~/.config

# Solution 4: Avoid sudo for installation
# Never use sudo with rustup or cargo install
# Installation should be in user home directory

# Solution 5: Check disk space
df -h ~
# Ensure at least 10GB free
```

---

## Configuration Issues

### Issue: Solana CLI Not Connected to Devnet

**Symptoms:**
```bash
$ solana config get
RPC URL: https://api.mainnet-beta.solana.com
```

**Solutions:**

```bash
# Solution 1: Switch to devnet
solana config set --url devnet

# Solution 2: Verify switch worked
solana config get | grep devnet

# Solution 3: Manual config edit
nano ~/.config/solana/cli/config.yml
# Change json_rpc_url to: https://api.devnet.solana.com

# Solution 4: Use environment variable (temporary)
export SOLANA_RPC_URL=https://api.devnet.solana.com

# Solution 5: Delete config and reconfigure
rm ~/.config/solana/cli/config.yml
solana config set --url devnet
solana config set --keypair ~/.config/solana/devnet.json
```

---

### Issue: Anchor Workspace Not Recognized

**Symptoms:**
```bash
$ anchor build
Error: Not in anchor workspace.
```

**Causes:**
- Not in correct directory
- Anchor.toml missing or malformed
- Workspace not initialized

**Solutions:**

```bash
# Solution 1: Navigate to workspace
cd /Users/dennisgoslar/Projekter/kamiyo/solana-programs

# Solution 2: Check for Anchor.toml
ls -la Anchor.toml
cat Anchor.toml

# Solution 3: Re-initialize workspace
bash scripts/verify_solana_setup.sh
# Verification script will initialize if missing

# Solution 4: Manual initialization
anchor init kamiyo-programs --javascript
# Then move files up one level

# Solution 5: Check Anchor.toml syntax
anchor build --verbose
# Look for parsing errors
```

---

## Wallet Issues

### Issue: Devnet Airdrop Fails

**Symptoms:**
```bash
$ solana airdrop 2
Error: airdrop request failed. This can happen when the rate limit is reached.
```

**Causes:**
- Rate limiting (1 airdrop per 10 minutes)
- Devnet issues
- Network connectivity

**Solutions:**

```bash
# Solution 1: Wait and retry
# Wait 2-3 minutes
sleep 180
solana airdrop 2

# Solution 2: Request smaller amount
solana airdrop 1

# Solution 3: Use web faucet
# Visit: https://faucet.solana.com/
# Enter your wallet address (solana address)

# Solution 4: Check current balance first
solana balance
# Maybe you already have enough

# Solution 5: Try alternative RPC
solana config set --url https://api.devnet.solana.com
solana airdrop 2
```

---

### Issue: Wallet File Missing or Corrupted

**Symptoms:**
```bash
Error: Failed to read keypair from ~/.config/solana/devnet.json
```

**Solutions:**

```bash
# Solution 1: Check if file exists
ls -la ~/.config/solana/devnet.json

# Solution 2: Regenerate wallet (WARNING: loses funds)
solana-keygen new --outfile ~/.config/solana/devnet.json --force

# Solution 3: Check file permissions
chmod 600 ~/.config/solana/devnet.json

# Solution 4: Validate keypair
solana-keygen verify <PUBKEY> ~/.config/solana/devnet.json

# Solution 5: Use different wallet temporarily
solana-keygen new --outfile ~/.config/solana/temp.json
solana config set --keypair ~/.config/solana/temp.json
```

---

### Issue: Insufficient Funds for Operations

**Symptoms:**
```bash
Error: Insufficient funds (0.00000001 SOL)
```

**Solutions:**

```bash
# Solution 1: Check balance
solana balance

# Solution 2: Request airdrop
solana airdrop 2

# Solution 3: Reduce transaction size
# Split large transactions into smaller ones

# Solution 4: Check if on correct network
solana config get
# Should be devnet for development

# Solution 5: Wait for pending transactions
solana confirm <TRANSACTION_SIGNATURE>
# Then check balance again
```

---

## Build Issues

### Issue: Anchor Build Fails with Rust Errors

**Symptoms:**
```bash
error[E0433]: failed to resolve: use of undeclared crate or module
```

**Solutions:**

```bash
# Solution 1: Clean and rebuild
anchor clean
anchor build

# Solution 2: Update Rust
rustup update

# Solution 3: Check Cargo.toml dependencies
cat programs/kamiyo-token/Cargo.toml
# Ensure all dependencies are declared

# Solution 4: Clear cargo cache
rm -rf target/
cargo clean
anchor build

# Solution 5: Check Anchor version compatibility
anchor --version
# Should be 0.30.0+
```

---

### Issue: Build Fails with "cannot find macro `declare_id`"

**Symptoms:**
```bash
error: cannot find macro `declare_id` in this scope
```

**Cause:** Anchor macros not imported

**Solutions:**

```rust
// Solution 1: Add proper imports
use anchor_lang::prelude::*;

declare_id!("Your_Program_ID_Here");

// Solution 2: Check Anchor version in Cargo.toml
[dependencies]
anchor-lang = "0.30.0"

// Solution 3: Rebuild with verbose output
anchor build --verbose

// Solution 4: Ensure program is in workspace
// Check Cargo.toml in workspace root
[workspace]
members = [
    "programs/kamiyo-token",
]
```

---

### Issue: Tests Fail to Run

**Symptoms:**
```bash
$ anchor test
Error: spawn solana-test-validator ENOENT
```

**Solutions:**

```bash
# Solution 1: Check PATH
which solana-test-validator

# Solution 2: Add Solana to PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Solution 3: Skip local validator (use devnet)
anchor test --skip-deploy --skip-local-validator

# Solution 4: Install test dependencies
cd solana-programs
npm install

# Solution 5: Check test file syntax
cat tests/*.ts
# Look for syntax errors
```

---

## Deployment Issues

### Issue: Deployment Fails with "Program ID Mismatch"

**Symptoms:**
```bash
Error: Program ID mismatch
```

**Cause:** Program ID in code doesn't match keypair

**Solutions:**

```bash
# Solution 1: Get deployed program ID
anchor keys list

# Solution 2: Update program ID in lib.rs
# Copy ID from anchor keys list
declare_id!("PROGRAM_ID_FROM_ANCHOR_KEYS_LIST");

# Solution 3: Rebuild after updating
anchor build

# Solution 4: Update Anchor.toml
# Ensure program ID matches in [programs.devnet]

# Solution 5: Generate new program keypair
solana-keygen new -o target/deploy/kamiyo_token-keypair.json
```

---

### Issue: Deployment Fails with "Insufficient Funds"

**Symptoms:**
```bash
Error: Account XYZ has insufficient funds for rent
```

**Solutions:**

```bash
# Solution 1: Check wallet balance
solana balance
# Need at least 2-5 SOL for deployment

# Solution 2: Request more funds
solana airdrop 5

# Solution 3: Use smaller program
# Optimize program size to reduce rent

# Solution 4: Check if program already deployed
solana program show <PROGRAM_ID>
# If deployed, use: anchor upgrade

# Solution 5: Increase buffer account
anchor deploy --program-id <ID> -- --max-rent-exemption-lamports 999999999
```

---

## Network Issues

### Issue: RPC Timeout

**Symptoms:**
```bash
Error: RPC request timed out
```

**Solutions:**

```bash
# Solution 1: Increase timeout
solana config set --rpc-timeout 120

# Solution 2: Try different RPC endpoint
solana config set --url https://api.devnet.solana.com

# Solution 3: Check network connectivity
ping api.devnet.solana.com

# Solution 4: Use custom RPC (if available)
export SOLANA_RPC_URL=https://your-custom-rpc.com

# Solution 5: Wait and retry
# Devnet may be experiencing high load
sleep 60
anchor deploy
```

---

### Issue: Transaction Confirmation Timeout

**Symptoms:**
```bash
Error: Transaction was not confirmed in 30 seconds
```

**Solutions:**

```bash
# Solution 1: Check transaction status manually
solana confirm <TRANSACTION_SIGNATURE>

# Solution 2: Retry with fresh blockhash
# Most operations can be safely retried

# Solution 3: Increase confirmation timeout
anchor test --skip-build -- --timeout 120000

# Solution 4: Check slot height
solana block-height
# If stuck, network may be halted

# Solution 5: Monitor logs for errors
solana logs
# Run in separate terminal while deploying
```

---

## Environment Issues

### Issue: Environment Variables Not Loading

**Symptoms:**
```bash
console.log(process.env.SOLANA_NETWORK) // undefined
```

**Solutions:**

```bash
# Solution 1: Create .env file
cp .env.example .env
nano .env  # Fill in values

# Solution 2: Check .env location
ls -la .env
# Should be in project root

# Solution 3: Install dotenv (Node.js)
npm install dotenv

# Solution 4: Load in code
// Add to top of file:
require('dotenv').config();

# Solution 5: Export directly (temporary)
export SOLANA_NETWORK=devnet
```

---

### Issue: Wrong Solana Cluster

**Symptoms:**
- Deploying to mainnet by accident
- Tests failing on wrong network

**Solutions:**

```bash
# Solution 1: Always check cluster first
solana config get | grep "RPC URL"

# Solution 2: Set to devnet
solana config set --url devnet

# Solution 3: Update Anchor.toml
[provider]
cluster = "devnet"

# Solution 4: Use explicit cluster in commands
solana balance --url devnet

# Solution 5: Create alias for safety
alias solana-devnet='solana --url devnet'
```

---

## macOS Specific Issues

### Issue: "xcrun: error: invalid active developer path"

**Symptoms:**
```bash
xcrun: error: invalid active developer path
```

**Cause:** Xcode Command Line Tools not installed

**Solutions:**

```bash
# Solution 1: Install Command Line Tools
xcode-select --install

# Solution 2: Accept license agreement
sudo xcodebuild -license accept

# Solution 3: Reset developer directory
sudo xcode-select --reset

# Solution 4: Point to Xcode installation
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer

# Solution 5: Download manually
# Visit: https://developer.apple.com/download/
# Download: Command Line Tools for Xcode
```

---

### Issue: M1/M2 Architecture Incompatibility

**Symptoms:**
```bash
error: failed to run custom build command
arch: Bad CPU type in executable
```

**Solutions:**

```bash
# Solution 1: Install Rosetta 2
softwareupdate --install-rosetta --agree-to-license

# Solution 2: Use ARM native Rust
rustup target add aarch64-apple-darwin

# Solution 3: Force x86_64 build
arch -x86_64 cargo install anchor-cli

# Solution 4: Update Homebrew to ARM version
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Solution 5: Check architecture
uname -m
# Should show: arm64 for M1/M2
```

---

### Issue: Homebrew Permission Issues

**Symptoms:**
```bash
Error: Permission denied @ dir_s_mkdir - /usr/local/Cellar
```

**Solutions:**

```bash
# Solution 1: Fix Homebrew permissions
sudo chown -R $(whoami) /usr/local/*

# Solution 2: Reinstall Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Solution 3: Use user installation
# Homebrew on M1/M2 installs to /opt/homebrew (no sudo needed)

# Solution 4: Check Homebrew doctor
brew doctor

# Solution 5: Avoid sudo with brew
# Never use: sudo brew install
# Always use: brew install
```

---

## Emergency Commands

### Complete Reset (Use as Last Resort)

```bash
# WARNING: This will delete all local Solana data
# Backup your wallet files first!

# 1. Backup wallet
cp ~/.config/solana/devnet.json ~/devnet-backup.json

# 2. Remove all Solana files
rm -rf ~/.config/solana
rm -rf ~/.local/share/solana

# 3. Remove Rust tools
rustup self uninstall

# 4. Remove Anchor workspace
cd /Users/dennisgoslar/Projekter/kamiyo
rm -rf solana-programs

# 5. Re-run setup from scratch
bash scripts/setup_solana_dev.sh

# 6. Restore wallet (if needed)
mkdir -p ~/.config/solana
cp ~/devnet-backup.json ~/.config/solana/devnet.json
```

---

## Getting Help

If none of these solutions work:

### 1. Check Logs
```bash
# Solana logs
solana logs --url devnet

# Anchor verbose output
anchor build --verbose
anchor test --verbose

# System logs (macOS)
log show --predicate 'process == "solana"' --last 1h
```

### 2. Community Support
- **Solana Discord:** https://discord.gg/solana
- **Anchor Discord:** https://discord.gg/anchor
- **Stack Exchange:** https://solana.stackexchange.com/

### 3. Documentation
- **Solana Docs:** https://docs.solana.com/
- **Anchor Book:** https://book.anchor-lang.com/
- **This Project:** See `SOLANA_SETUP_README.md`

### 4. Create Issue Report

When asking for help, include:

```bash
# System info
uname -a
sw_vers  # macOS only

# Tool versions
rustc --version
solana --version
anchor --version

# Configuration
solana config get
cat ~/.config/solana/cli/config.yml

# Error messages (full output)
anchor build 2>&1 | tee build-error.log

# Directory structure
ls -laR solana-programs/
```

---

## Prevention Tips

**Best Practices to Avoid Issues:**

1. ✅ Always run `bash scripts/verify_solana_setup.sh` before starting work
2. ✅ Check cluster before deploying: `solana config get`
3. ✅ Keep tools updated: `rustup update && solana-install update`
4. ✅ Use version control for wallet addresses (not private keys!)
5. ✅ Test on devnet extensively before mainnet
6. ✅ Monitor balance regularly: `solana balance`
7. ✅ Read error messages carefully (often contain solution)
8. ✅ Use `anchor build --verbose` to see detailed errors
9. ✅ Keep documentation handy: `SOLANA_QUICK_REFERENCE.md`
10. ✅ Backup wallet files regularly

---

**Last Updated:** 2025-10-28
**Status:** Comprehensive troubleshooting coverage for Phase 2 setup
