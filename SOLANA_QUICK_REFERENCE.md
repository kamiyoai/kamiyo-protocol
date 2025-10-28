# KAMIYO Solana Development - Quick Reference Card

**Phase 2, Week 1 - Ready to Use**

---

## 🚀 Quick Start (3 Commands)

```bash
# 1. Install tools (10-20 min)
bash scripts/setup_solana_dev.sh

# 2. Reload shell
source ~/.zshrc  # or source ~/.bashrc

# 3. Verify setup
bash scripts/verify_solana_setup.sh
```

**Expected:** ✅ All checks passed! (8/8)

---

## 📁 Project Structure

```
kamiyo/
├── solana-programs/          # ← Your Solana workspace
│   ├── Anchor.toml           # Anchor config (devnet)
│   ├── programs/             # Smart contracts here
│   │   ├── kamiyo-token/     # Token-2022 mint
│   │   ├── kamiyo-staking/   # Staking (10-25% APY)
│   │   ├── kamiyo-airdrop/   # 100M token drop
│   │   └── kamiyo-vesting/   # 24-month vesting
│   └── tests/                # Integration tests
└── scripts/
    ├── setup_solana_dev.sh   # Install everything
    └── verify_solana_setup.sh # Check setup
```

---

## 🔧 Essential Commands

### Solana CLI

```bash
# Configuration
solana config get                    # View current config
solana config set --url devnet       # Switch to devnet
solana config set --url mainnet-beta # Switch to mainnet

# Wallet
solana address                       # Show your wallet address
solana balance                       # Check SOL balance
solana airdrop 2                     # Get 2 devnet SOL

# Monitoring
solana logs                          # Stream transaction logs
solana block-height                  # Current block height
```

### Anchor CLI

```bash
# Workspace
cd solana-programs                   # Navigate to workspace
anchor build                         # Build all programs
anchor test                          # Run tests
anchor deploy                        # Deploy to configured network
anchor clean                         # Clean build artifacts

# Individual Program
anchor build --program kamiyo-token  # Build specific program
anchor test --skip-build             # Test without rebuilding
```

### SPL Token CLI

```bash
# Token Operations
spl-token create-token               # Create new token
spl-token create-account <TOKEN>     # Create token account
spl-token mint <TOKEN> <AMOUNT>      # Mint tokens
spl-token balance <TOKEN>            # Check token balance
spl-token supply <TOKEN>             # Check total supply
```

---

## 🔑 Wallet Management

### Devnet (Development)

```bash
# Location
~/.config/solana/devnet.json

# Commands
solana address                       # Get wallet address
solana balance                       # Check balance (need >= 1 SOL)
solana airdrop 2                     # Request 2 SOL (rate limited)
```

**⚠️ Security:** Never use devnet keys for mainnet!

### Mainnet (Production - Future)

```bash
# Generate mainnet wallet (when ready)
solana-keygen new --outfile ~/.config/solana/mainnet.json

# Set as default
solana config set --keypair ~/.config/solana/mainnet.json
```

**🔒 Critical:** Backup mainnet keys securely!

---

## 🌐 Environment Variables

Add to `.env` (copy from `.env.example`):

```bash
# Devnet Configuration
SOLANA_DEVNET_KEYPAIR_PATH=~/.config/solana/devnet.json
SOLANA_DEVNET_WALLET_ADDRESS=<run: solana address>
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Program IDs (after deployment)
KAMIYO_TOKEN_PROGRAM_ID=<anchor deploy output>
KAMIYO_STAKING_PROGRAM_ID=<anchor deploy output>
KAMIYO_AIRDROP_PROGRAM_ID=<anchor deploy output>
KAMIYO_VESTING_PROGRAM_ID=<anchor deploy output>
```

**Get wallet address:** `solana address`

---

## 📊 Version Requirements

| Tool | Minimum | Command to Check |
|------|---------|------------------|
| Rust | 1.70.0+ | `rustc --version` |
| Solana CLI | 1.18.0+ | `solana --version` |
| Anchor | 0.30.0+ | `anchor --version` |
| SPL Token | Latest | `spl-token --version` |

**Verify all:** `bash scripts/verify_solana_setup.sh`

---

## 🛠️ Development Workflow

### 1. Create New Program

```bash
cd solana-programs/programs
anchor new my-program              # Creates new program
```

### 2. Write Program

Edit: `programs/my-program/src/lib.rs`

```rust
use anchor_lang::prelude::*;

declare_id!("Your Program ID Here");

#[program]
pub mod my_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // Your code here
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
```

### 3. Write Tests

Edit: `tests/my-program.ts`

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

describe("my-program", () => {
  it("Initializes", async () => {
    // Your test here
  });
});
```

### 4. Build & Test

```bash
anchor build                       # Compile program
anchor test                        # Run tests
```

### 5. Deploy

```bash
anchor deploy                      # Deploy to devnet
```

---

## 🔍 Debugging

### View Logs

```bash
# Stream all transactions
solana logs

# Filter by program
solana logs | grep <PROGRAM_ID>

# Test with logs
anchor test --skip-deploy          # Use deployed program
```

### Common Issues

**Issue:** "Command not found" after installation
**Fix:** `source ~/.zshrc` (or restart terminal)

**Issue:** Airdrop fails (rate limited)
**Fix:** Wait 2-3 minutes, or use https://faucet.solana.com/

**Issue:** "Insufficient funds" when deploying
**Fix:** `solana airdrop 2`

**Issue:** Build fails with errors
**Fix:** `anchor clean && anchor build`

---

## 🌍 Network Endpoints

### Devnet (Development)

```bash
RPC: https://api.devnet.solana.com
WebSocket: wss://api.devnet.solana.com/
Explorer: https://explorer.solana.com/?cluster=devnet
Faucet: https://faucet.solana.com/
```

### Mainnet Beta (Production)

```bash
RPC: https://api.mainnet-beta.solana.com
WebSocket: wss://api.mainnet-beta.solana.com/
Explorer: https://explorer.solana.com/
```

---

## 📚 KAMIYO Program Specs

### Token (kamiyo-token)
- **Standard:** Token-2022
- **Supply:** 10 billion tokens
- **Decimals:** 9
- **Transfer Fee:** 2%
- **Extensions:** Transfer fee, freeze authority

### Staking (kamiyo-staking)
- **APY:** 10-25% (tiered)
- **Lock Periods:** Flexible (7 days to 2 years)
- **Rewards:** Calculated on-chain
- **Compound:** Auto-compound option

### Airdrop (kamiyo-airdrop)
- **Amount:** 100M tokens (1% of supply)
- **Verification:** Merkle tree
- **Claims:** One-time per address
- **Tracking:** On-chain claim registry

### Vesting (kamiyo-vesting)
- **Duration:** 24 months
- **Type:** Linear vesting
- **Cliff:** Configurable
- **Beneficiaries:** Multiple supported

---

## 🚨 Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Blockhash not found` | Transaction expired | Retry with new blockhash |
| `Insufficient funds` | Low SOL balance | `solana airdrop 2` |
| `Custom program error: 0x1` | Generic error | Check program logs |
| `Account not found` | Account doesn't exist | Initialize account first |
| `Transaction too large` | Too many accounts | Split into multiple tx |

**Detailed Logs:** `anchor test --skip-deploy` (after deploying once)

---

## 📖 Resources

### Documentation
- [Solana Docs](https://docs.solana.com/)
- [Anchor Book](https://book.anchor-lang.com/)
- [Token-2022 Guide](https://spl.solana.com/token-2022)

### Tools
- [Solana Explorer](https://explorer.solana.com/?cluster=devnet)
- [Solana Playground](https://beta.solpg.io/)
- [Anchor Examples](https://github.com/coral-xyz/anchor/tree/master/examples)

### Community
- [Solana Stack Exchange](https://solana.stackexchange.com/)
- [Anchor Discord](https://discord.gg/anchor)
- [Solana Discord](https://discord.gg/solana)

---

## ✅ Pre-Flight Checklist

Before deploying to mainnet:

- [ ] All tests pass (`anchor test`)
- [ ] Programs audited by security firm
- [ ] Multisig for upgrade authority
- [ ] Deployment plan documented
- [ ] Rollback procedure defined
- [ ] Monitoring setup (logs, alerts)
- [ ] Mainnet wallet funded (>= 10 SOL)
- [ ] Backup of all keys secured
- [ ] Team notified of deployment
- [ ] Explorer links prepared

---

## 🎯 Task Progress (Phase 2)

- [x] **Task 2.1:** Setup Dev Environment (Week 1) ✅
- [ ] **Task 2.2:** Token-2022 Implementation (Week 1)
- [ ] **Task 2.3:** Staking Program (Week 2)
- [ ] **Task 2.4:** Airdrop System (Week 3)
- [ ] **Task 2.5:** Vesting Contract (Week 3)
- [ ] **Task 2.6:** Deploy & Test (Week 4)

---

## 💡 Pro Tips

1. **Always test on devnet first** - Never deploy untested code to mainnet
2. **Use `--skip-deploy` for faster testing** - After initial deployment
3. **Monitor transaction logs** - `solana logs` is your best friend
4. **Version control your program IDs** - Add to .env after deployment
5. **Keep devnet wallet funded** - Run `solana balance` regularly
6. **Use Anchor.toml for configs** - Avoid hardcoding addresses
7. **Write integration tests** - Test program interactions
8. **Document your instructions** - Clear comments in Rust code

---

## 🔥 Emergency Commands

```bash
# Stop runaway transaction
solana cancel <TRANSACTION_SIGNATURE>

# Check program logs
solana program dump <PROGRAM_ID> program.so
solana program show <PROGRAM_ID>

# Close token accounts (recover rent)
spl-token close --address <TOKEN_ACCOUNT>

# Transfer all SOL (emergency)
solana transfer <DESTINATION> ALL
```

---

**Quick Help:** For detailed setup instructions, see `SOLANA_SETUP_README.md`

**Last Updated:** 2025-10-28
**Status:** ✅ Development Environment Ready
