# SPL Token-2022 Implementation Research for $KAMIYO

**Research Date:** October 28, 2025
**Project:** KAMIYO - Crypto Exploit Aggregator with x402 Payment Hub
**Prepared By:** Technical Research Team
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Token-2022 Architecture Overview](#2-token-2022-architecture-overview)
3. [Transfer Fee Extension Deep Dive](#3-transfer-fee-extension-deep-dive)
4. [Code Examples (Rust/Anchor)](#4-code-examples-rustanchor)
5. [Python Backend Integration Patterns](#5-python-backend-integration-patterns)
6. [Token-2022 vs Legacy SPL Token Comparison](#6-token-2022-vs-legacy-spl-token-comparison)
7. [Security Considerations](#7-security-considerations)
8. [Integration Checklist](#8-integration-checklist)
9. [FAQ](#9-faq)
10. [References](#10-references)

---

## 1. Executive Summary

SPL Token-2022 (also known as Token Extensions) represents a revolutionary upgrade to Solana's token standard, offering extensible functionality while maintaining backward compatibility with the legacy SPL Token program. This research document provides comprehensive technical specifications for implementing the $KAMIYO token using the Token-2022 standard, with particular focus on the Transfer Fee extension that enables protocol-level fee collection.

### Key Findings

**Token-2022 Program ID:** `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`

**Critical Capabilities for $KAMIYO:**
- **Transfer Fee Extension**: Enables automatic 2% fee collection on every token transfer
- **Fee Configuration**: Configurable basis points (200 = 2%) with maximum fee caps
- **Dual Authority System**: Separate authorities for fee configuration and withdrawal
- **Fee Accumulation**: Fees automatically accumulate in recipient token accounts
- **Backward Compatibility**: Maintains byte-for-byte compatibility with legacy Token program for the first 165 bytes

### Implementation Strategy for $KAMIYO

The $KAMIYO token will leverage the Transfer Fee extension to implement a 2% transfer fee split between treasury (1%) and liquidity pool (1%). Due to Token-2022 architecture constraints, the fee splitting will require a two-stage approach:

1. **Stage 1 - Fee Collection**: Transfer fees automatically accumulate using the native Transfer Fee extension (2% = 200 basis points)
2. **Stage 2 - Fee Distribution**: A custom Solana program or manual distribution process will split collected fees 50/50 between treasury and LP wallets

This hybrid approach maintains the performance and parallelization benefits of Token-2022's native fee collection while enabling flexible multi-wallet distribution.

### Python Backend Compatibility

The existing `payment_verifier.py` infrastructure is compatible with Token-2022 payments through `solana-py v0.30.2+`. Key integration points include:

- Transaction parsing using `jsonParsed` encoding (automatic Token-2022 instruction decoding)
- Net amount calculation after fee deduction
- Support for both `transfer` and `transferChecked` instructions
- Extension data parsing for fee configuration retrieval

---

## 2. Token-2022 Architecture Overview

### 2.1 Program Design Philosophy

Token-2022 was developed to address a fundamental limitation of the original Token program deployed in 2020: **lack of extensibility**. Rather than modifying the battle-tested legacy program, Solana Labs created a separate program that:

1. **Maintains instruction compatibility**: All 25 original Token instructions (indices 0-24) work identically
2. **Preserves account structure**: First 165 bytes of accounts remain unchanged
3. **Enables opt-in features**: Extensions append data after baseline structures
4. **Prevents ecosystem disruption**: Separate program address ensures legacy tokens remain unaffected

### 2.2 Program Address and Deployment

```
Program ID: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
Network: Mainnet-beta, Devnet, Testnet
Deployment Date: March 2024 (production-ready as of Q1 2024)
```

The program is deployed on all Solana networks and has undergone multiple security audits, making it production-ready for mainnet deployment.

### 2.3 Extension System Architecture

Token-2022 implements extensions using a **Type-Length-Value (TLV)** encoding scheme appended to account data:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Base Account Data (165 bytes)                │
│  - Original SPL Token account structure                         │
│  - Maintains backward compatibility                             │
├─────────────────────────────────────────────────────────────────┤
│                    Extension Data (Variable)                    │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Extension Type (2 bytes) │ Length (2 bytes) │ Value (...)  │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Extension Type (2 bytes) │ Length (2 bytes) │ Value (...)  │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Available Extensions

Token-2022 provides **20 total extensions** categorized as mint extensions and account extensions:

#### Mint Extensions (16 available)

| Extension | Description | Use Case for $KAMIYO |
|-----------|-------------|----------------------|
| **Transfer Fee** | Automatic fee collection on transfers | **Primary**: 2% fee collection |
| Interest-Bearing | Tokens accrue interest over time | Not applicable |
| Non-Transferable | Tokens cannot be transferred | Not applicable |
| Transfer Hook | Custom program execution on transfer | **Optional**: Advanced compliance |
| Metadata | On-chain token metadata | **Recommended**: Token info storage |
| Permanent Delegate | Irrevocable delegate authority | Not applicable |
| Group Functionality | Token grouping and membership | Not applicable |
| Confidential Transfers | Private transaction amounts | **Future**: Privacy features |
| Pausable | Emergency pause capability | **Optional**: Security feature |
| Closing Mint | Allow mint account closure | Not applicable |
| Metadata Pointer | Points to metadata location | **Recommended**: With metadata |
| Scaled UI Amount | Display amount scaling | Not applicable |

#### Account Extensions (4 available)

| Extension | Description | Use Case for $KAMIYO |
|-----------|-------------|----------------------|
| Memo Required | Forces memo on incoming transfers | **Optional**: Compliance tracking |
| Immutable Ownership | Prevents ownership changes | Not applicable |
| Default Account State | Sets initial account state | Not applicable |
| CPI Guard | Prevents CPI-based transfers | **Optional**: Additional security |

### 2.5 Instruction Set

Token-2022 supports all legacy instructions plus new extension-specific instructions:

**Legacy Instructions (0-24):**
- Initialize Mint/Account
- Transfer/TransferChecked
- Approve/Revoke
- MintTo/Burn
- CloseAccount
- FreezeAccount/ThawAccount
- SetAuthority
- (20 more standard operations)

**New Extension Instructions (25+):**
- InitializeTransferFeeConfig (Index 26)
- TransferCheckedWithFee (Index 27)
- WithdrawWithheldTokensFromMint (Index 28)
- WithdrawWithheldTokensFromAccounts (Index 29)
- HarvestWithheldTokensToMint (Index 30)
- SetTransferFee (Index 31)
- (Additional extension-specific instructions)

### 2.6 Account Size Calculation

Account sizes must accommodate extension data. The calculation formula:

```rust
use spl_token_2022::extension::{ExtensionType, BaseStateWithExtensions};

// For a mint with TransferFee extension
let extensions = vec![ExtensionType::TransferFeeConfig];
let mint_size = ExtensionType::try_calculate_account_len::<Mint>(&extensions)?;
// Result: 82 (base) + 83 (TransferFeeConfig) = 165 bytes

// For multiple extensions
let extensions = vec![
    ExtensionType::TransferFeeConfig,
    ExtensionType::MetadataPointer,
];
let mint_size = ExtensionType::try_calculate_account_len::<Mint>(&extensions)?;
// Result: 82 + 83 + 32 = 197 bytes
```

---

## 3. Transfer Fee Extension Deep Dive

### 3.1 Transfer Fee Mechanism Overview

The Transfer Fee extension implements **protocol-level fee collection** that operates automatically on every token transfer. This is fundamentally different from manually implemented fee mechanisms that rely on smart contract logic.

**Core Mechanism:**
```
User initiates transfer: 1000 KAMIYO
├─ Fee calculation: 1000 × 200 / 10,000 = 20 KAMIYO (2%)
├─ Net transfer to recipient: 980 KAMIYO
└─ Withheld in recipient account: 20 KAMIYO (inaccessible to recipient)
```

### 3.2 Transfer Fee Configuration Structure

The `TransferFeeConfig` extension stores configuration data in the mint account:

```rust
pub struct TransferFeeConfig {
    /// Authority to modify transfer fee configuration
    pub transfer_fee_config_authority: OptionalNonZeroPubkey,

    /// Authority to withdraw withheld fees
    pub withdraw_withheld_authority: OptionalNonZeroPubkey,

    /// Amount of transfer withheld as fee (in basis points, 100 = 1%)
    pub transfer_fee_basis_points: u16,

    /// Maximum fee cap (prevents excessive fees on large transfers)
    pub maximum_fee: u64,
}
```

**For $KAMIYO Implementation:**
```rust
TransferFeeConfig {
    transfer_fee_config_authority: Some(treasury_authority_pubkey),
    withdraw_withheld_authority: Some(fee_collector_authority_pubkey),
    transfer_fee_basis_points: 200,  // 2% fee
    maximum_fee: 1_000_000_000,      // 1,000 KAMIYO max fee (with 6 decimals)
}
```

### 3.3 Fee Calculation Mathematics

**Basis Points System:**
- 1 basis point = 0.01% = 1/10,000
- 100 basis points = 1%
- 200 basis points = 2%

**Fee Calculation Formula:**
```
fee_amount = min(
    (transfer_amount × transfer_fee_basis_points) / 10,000,
    maximum_fee
)

net_amount_received = transfer_amount - fee_amount
```

**Example Calculations for $KAMIYO (200 basis points, 1B max fee):**

| Transfer Amount | Fee (2%) | Max Fee Applied? | Net Received |
|----------------|----------|------------------|--------------|
| 100 KAMIYO | 2 KAMIYO | No | 98 KAMIYO |
| 1,000 KAMIYO | 20 KAMIYO | No | 980 KAMIYO |
| 10,000 KAMIYO | 200 KAMIYO | No | 9,800 KAMIYO |
| 100,000 KAMIYO | 2,000 KAMIYO | No | 98,000 KAMIYO |
| 60,000 KAMIYO | 1,000 KAMIYO | Yes (cap) | 59,000 KAMIYO |
| 1,000,000 KAMIYO | 1,000 KAMIYO | Yes (cap) | 999,000 KAMIYO |

### 3.4 Fee Accumulation Mechanism

Fees accumulate in a **special withheld balance** within recipient token accounts:

```
Token Account Structure (with TransferFee extension):
┌───────────────────────────────────────┐
│ Base Account (165 bytes)              │
│  - mint: Pubkey                       │
│  - owner: Pubkey                      │
│  - amount: 980_000_000 (available)    │
│  - delegate: Option<Pubkey>           │
│  - state: AccountState                │
│  - ...                                │
├───────────────────────────────────────┤
│ TransferFeeAmount Extension           │
│  - withheld_amount: 20_000_000        │ ← Inaccessible to owner
└───────────────────────────────────────┘

Total tokens in account: 1,000 KAMIYO
├─ Available to owner: 980 KAMIYO
└─ Withheld as fees: 20 KAMIYO (only withdraw authority can access)
```

**Key Properties:**
- Withheld fees are **separate from the owner's balance**
- Owner cannot spend withheld fees
- Only `withdraw_withheld_authority` can extract fees
- Accounts with withheld fees **cannot be closed** until fees are harvested

### 3.5 Fee Collection Methods

Token-2022 provides three approaches for collecting accumulated fees:

#### Method 1: Direct Withdrawal from Token Accounts

**Use Case:** Batch withdrawal from multiple recipient accounts to a single destination

```rust
// Instruction: WithdrawWithheldTokensFromAccounts
pub fn withdraw_withheld_tokens_from_accounts(
    token_program_id: &Pubkey,
    destination: &Pubkey,           // Where fees go
    mint: &Pubkey,
    source_accounts: &[&Pubkey],    // Accounts to withdraw from
    authority: &Pubkey,             // withdraw_withheld_authority
) -> Result<Instruction, ProgramError>
```

**Flow:**
```
Source Account 1: 20 KAMIYO withheld ──┐
Source Account 2: 35 KAMIYO withheld ──┼──> Destination Account: +100 KAMIYO
Source Account 3: 45 KAMIYO withheld ──┘
```

**Advantages:**
- Direct transfer to collection wallet
- Can process multiple accounts per transaction (up to ~26 accounts due to transaction size limits)
- Gas-efficient for large batches

**Disadvantages:**
- Requires knowing which accounts hold withheld fees
- Need to iterate through all token accounts (can be expensive)

#### Method 2: Harvesting to Mint + Withdrawal

**Use Case:** Permissionless fee consolidation, then centralized withdrawal

**Step 1 - Harvest (Permissionless):**
```rust
// Instruction: HarvestWithheldTokensToMint
pub fn harvest_withheld_tokens_to_mint(
    token_program_id: &Pubkey,
    mint: &Pubkey,
    sources: &[&Pubkey],    // Token accounts to harvest from
) -> Result<Instruction, ProgramError>
```

**Step 2 - Withdraw (Authority Only):**
```rust
// Instruction: WithdrawWithheldTokensFromMint
pub fn withdraw_withheld_tokens_from_mint(
    token_program_id: &Pubkey,
    mint: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,     // withdraw_withheld_authority
) -> Result<Instruction, ProgramError>
```

**Flow:**
```
[Permissionless Harvest Phase]
Source Account 1: 20 KAMIYO withheld ──┐
Source Account 2: 35 KAMIYO withheld ──┼──> Mint Account: +100 KAMIYO withheld
Source Account 3: 45 KAMIYO withheld ──┘
                                         └──> Source accounts now have 0 withheld
                                              (can be closed if desired)

[Authority Withdrawal Phase]
Mint Account: 100 KAMIYO withheld ──────> Treasury Account: +100 KAMIYO
```

**Advantages:**
- Harvesting is **permissionless** (anyone can trigger, including bots/cron jobs)
- Users can clear their accounts before closure
- Enables automated "cranking" with clockwork or other automation tools
- Gas costs can be socialized across users

**Disadvantages:**
- Two-step process (harvest, then withdraw)
- Mint account holds fees temporarily

#### Method 3: Hybrid Approach (Recommended for $KAMIYO)

**Use Case:** Flexible fee collection with automated harvesting and strategic withdrawal

```
Continuous Harvesting (Automated)
  ↓
Fees accumulate in Mint Account
  ↓
Periodic Withdrawal (Authority-triggered)
  ↓
Fee Splitting Program
  ↓
├─ 50% → Treasury Wallet
└─ 50% → LP Rewards Wallet
```

**Implementation:**
1. Set up automated harvesting (cron job or Clockwork)
2. Harvest withheld fees to mint every N blocks
3. Withdraw from mint to intermediate program-controlled account weekly/monthly
4. Execute custom program to split fees 50/50
5. Transfer to treasury and LP wallets

### 3.6 Fee Withdrawal and Splitting Strategy

**Challenge:** Token-2022's Transfer Fee extension only supports a **single withdraw authority**, but $KAMIYO requires splitting fees between two destinations (treasury and LP).

**Solution Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Fee Collection Flow                      │
└─────────────────────────────────────────────────────────────┘

[1] Automatic Fee Accumulation (Native Token-2022)
    User transfers 1000 KAMIYO
     ├─ 980 KAMIYO → Recipient (available balance)
     └─ 20 KAMIYO → Withheld in recipient account

[2] Harvesting to Mint (Permissionless, Automated)
    Cron job calls HarvestWithheldTokensToMint
     └─ All withheld fees → Mint account

[3] Withdrawal to Splitter Program (Authority-triggered)
    Withdraw authority calls WithdrawWithheldTokensFromMint
     └─ Fees → Fee Splitter Program PDA (Program Derived Address)

[4] Fee Distribution (Custom Program Logic)
    Fee Splitter Program executes:
     ├─ 50% (10 KAMIYO) → Treasury Wallet (operations, development)
     └─ 50% (10 KAMIYO) → LP Rewards Wallet (liquidity incentives)
```

**Custom Fee Splitter Program (Anchor):**

```rust
#[program]
pub mod kamiyo_fee_splitter {
    pub fn distribute_fees(ctx: Context<DistributeFees>, amount: u64) -> Result<()> {
        let treasury_amount = amount / 2;
        let lp_amount = amount - treasury_amount;  // Handle odd amounts

        // Transfer to treasury
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: ctx.accounts.fee_vault.to_account_info(),
                },
            ),
            treasury_amount,
        )?;

        // Transfer to LP rewards
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.lp_rewards.to_account_info(),
                    authority: ctx.accounts.fee_vault.to_account_info(),
                },
            ),
            lp_amount,
        )?;

        emit!(FeeDistributionEvent {
            treasury_amount,
            lp_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
```

**Alternative: Manual Distribution (Simpler, Less Automated):**

If a custom program is not immediately feasible, manual distribution can be implemented:

```typescript
// Withdraw all fees to treasury wallet
await withdrawWithheldTokensFromMint(
  connection,
  treasuryWallet,
  mint,
  treasuryTokenAccount,
  withdrawAuthority
);

// Calculate split amounts
const balance = await getTokenAccountBalance(treasuryTokenAccount);
const lpAmount = balance.div(2);

// Transfer 50% to LP wallet
await transfer(
  connection,
  treasuryWallet,
  treasuryTokenAccount,
  lpTokenAccount,
  treasuryWallet,
  lpAmount
);
```

### 3.7 Authority Management

Two critical authorities control the Transfer Fee extension:

#### Transfer Fee Config Authority

**Permissions:**
- Modify `transfer_fee_basis_points` (change fee percentage)
- Modify `maximum_fee` (change fee cap)
- Update this authority (transfer control)
- Update `withdraw_withheld_authority` (change who can withdraw)

**Security Recommendation:** Use a multisig wallet (e.g., Squads Protocol) with 3-of-5 signature requirement.

#### Withdraw Withheld Authority

**Permissions:**
- Withdraw fees from token accounts
- Withdraw fees from mint account
- Update this authority (transfer control)

**Security Recommendation:** Use a secure operations wallet or multisig with automated monitoring.

**Changing Authorities:**

```rust
use spl_token_2022::instruction::set_authority;
use spl_token_2022::instruction::AuthorityType;

// Change transfer fee config authority
let ix = set_authority(
    &TOKEN_2022_PROGRAM_ID,
    &mint_pubkey,
    Some(&new_authority),
    AuthorityType::TransferFeeConfig,
    &current_authority,
    &[],
)?;

// Change withdraw authority
let ix = set_authority(
    &TOKEN_2022_PROGRAM_ID,
    &mint_pubkey,
    Some(&new_authority),
    AuthorityType::WithheldWithdraw,
    &current_authority,
    &[],
)?;
```

### 3.8 Fee Configuration Updates

Transfer fee configuration can be updated **after mint creation**, but changes take effect **after 2 epoch boundaries** to prevent rug pulls:

```rust
use spl_token_2022::extension::transfer_fee::instruction::set_transfer_fee;

// Update fee configuration
let ix = set_transfer_fee(
    &TOKEN_2022_PROGRAM_ID,
    &mint_pubkey,
    &transfer_fee_config_authority,
    &[],
    300,            // New fee: 3% (300 basis points)
    2_000_000_000,  // New max fee: 2,000 KAMIYO
)?;
```

**Timeline:**
```
Epoch 0: Current fee = 2% (200 basis points)
  ↓ Authority calls set_transfer_fee(300) [3%]
Epoch 1: Fee change pending, still 2%
Epoch 2: Fee change pending, still 2%
Epoch 3: New fee active = 3% (300 basis points)
```

This **2-epoch delay** protects users from sudden fee increases and provides transparency for fee changes.

---

## 4. Code Examples (Rust/Anchor)

### 4.1 Creating a Mint with Transfer Fee Extension (Rust)

**Complete working example using `spl-token-2022` crate:**

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};
use spl_token_2022::{
    extension::{
        transfer_fee::{
            instruction::initialize_transfer_fee_config,
            TransferFeeConfig,
        },
        ExtensionType,
    },
    instruction::initialize_mint,
    state::Mint,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Configuration
    let rpc_url = "https://api.devnet.solana.com";
    let client = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());

    // Keypairs
    let payer = Keypair::new();  // Fund this wallet on devnet
    let mint_authority = Keypair::new();
    let mint_keypair = Keypair::new();
    let transfer_fee_authority = mint_authority.pubkey();
    let withdraw_authority = mint_authority.pubkey();

    // Token configuration for $KAMIYO
    const DECIMALS: u8 = 6;
    const TRANSFER_FEE_BASIS_POINTS: u16 = 200;  // 2%
    const MAXIMUM_FEE: u64 = 1_000_000_000;      // 1,000 KAMIYO (with 6 decimals)

    println!("Creating $KAMIYO Token-2022 mint...");
    println!("Mint address: {}", mint_keypair.pubkey());

    // Step 1: Calculate space for mint account with TransferFeeConfig extension
    let extension_types = vec![ExtensionType::TransferFeeConfig];
    let mint_size = ExtensionType::try_calculate_account_len::<Mint>(&extension_types)?;
    println!("Mint account size: {} bytes", mint_size);

    // Step 2: Calculate rent exemption
    let rent_exemption = client.get_minimum_balance_for_rent_exemption(mint_size)?;
    println!("Rent exemption: {} lamports", rent_exemption);

    // Step 3: Create mint account instruction
    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &mint_keypair.pubkey(),
        rent_exemption,
        mint_size as u64,
        &spl_token_2022::id(),
    );

    // Step 4: Initialize transfer fee config instruction
    let initialize_transfer_fee_ix = initialize_transfer_fee_config(
        &spl_token_2022::id(),
        &mint_keypair.pubkey(),
        Some(&transfer_fee_authority),
        Some(&withdraw_authority),
        TRANSFER_FEE_BASIS_POINTS,
        MAXIMUM_FEE,
    )?;

    // Step 5: Initialize mint instruction
    let initialize_mint_ix = initialize_mint(
        &spl_token_2022::id(),
        &mint_keypair.pubkey(),
        &mint_authority.pubkey(),
        None,  // No freeze authority for $KAMIYO
        DECIMALS,
    )?;

    // Step 6: Create and send transaction
    let recent_blockhash = client.get_latest_blockhash()?;
    let transaction = Transaction::new_signed_with_payer(
        &[
            create_account_ix,
            initialize_transfer_fee_ix,
            initialize_mint_ix,
        ],
        Some(&payer.pubkey()),
        &[&payer, &mint_keypair],
        recent_blockhash,
    );

    let signature = client.send_and_confirm_transaction(&transaction)?;
    println!("✅ $KAMIYO mint created successfully!");
    println!("Transaction signature: {}", signature);
    println!("Mint address: {}", mint_keypair.pubkey());
    println!("Transfer fee: {}% (max: {} tokens)",
             TRANSFER_FEE_BASIS_POINTS as f64 / 100.0,
             MAXIMUM_FEE as f64 / 1_000_000.0);

    Ok(())
}
```

### 4.2 Creating a Mint with Transfer Fee Extension (Anchor)

**Anchor program with full extension support:**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

declare_id!("KAMiYoFeeExtension11111111111111111111111111");

#[program]
pub mod kamiyo_token {
    use super::*;

    pub fn create_kamiyo_mint(
        ctx: Context<CreateKamiyoMint>,
        decimals: u8,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> Result<()> {
        msg!("Creating $KAMIYO Token-2022 mint");
        msg!("Transfer fee: {}%", transfer_fee_basis_points as f64 / 100.0);
        msg!("Maximum fee: {} tokens", maximum_fee as f64 / 1_000_000.0);

        // Note: Extension initialization is handled by Anchor constraints
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(decimals: u8, transfer_fee_basis_points: u16, maximum_fee: u64)]
pub struct CreateKamiyoMint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub authority: Signer<'info>,

    /// The $KAMIYO mint account with TransferFee extension
    #[account(
        init,
        signer,
        payer = payer,
        mint::token_program = token_program,
        mint::decimals = decimals,
        mint::authority = authority,
        mint::freeze_authority = authority,  // Optional: can be None
        extensions::transfer_fee::transfer_fee_config_authority = authority,
        extensions::transfer_fee::withdraw_withheld_authority = authority,
        extensions::transfer_fee::transfer_fee_basis_points = transfer_fee_basis_points,
        extensions::transfer_fee::maximum_fee = maximum_fee,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}
```

**Client-side TypeScript to call Anchor program:**

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { KamiyoToken } from "../target/types/kamiyo_token";

async function createKamiyoMint() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.KamiyoToken as Program<KamiyoToken>;

  // Generate mint keypair
  const mintKeypair = anchor.web3.Keypair.generate();

  // $KAMIYO configuration
  const decimals = 6;
  const transferFeeBasisPoints = 200;  // 2%
  const maximumFee = new anchor.BN(1_000_000_000);  // 1,000 KAMIYO

  console.log("Creating $KAMIYO mint:", mintKeypair.publicKey.toString());

  // Create mint with transfer fee extension
  const tx = await program.methods
    .createKamiyoMint(decimals, transferFeeBasisPoints, maximumFee)
    .accounts({
      payer: provider.wallet.publicKey,
      authority: provider.wallet.publicKey,
      mint: mintKeypair.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([mintKeypair])
    .rpc();

  console.log("✅ $KAMIYO mint created!");
  console.log("Transaction:", tx);
  console.log("Mint address:", mintKeypair.publicKey.toString());
}

createKamiyoMint().catch(console.error);
```

### 4.3 Token Transfer with Automatic Fee Deduction

**Using `transferChecked` instruction (handles fees automatically):**

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_token_2022::instruction::transfer_checked;

fn transfer_kamiyo_with_fees(
    client: &RpcClient,
    mint: &Pubkey,
    source_account: &Pubkey,
    destination_account: &Pubkey,
    owner: &Keypair,
    amount: u64,
    decimals: u8,
) -> Result<String, Box<dyn std::error::Error>> {
    println!("Transferring {} KAMIYO (raw: {})",
             amount as f64 / 1_000_000.0, amount);

    // Create transfer instruction
    // Note: Token-2022 automatically deducts fees
    let transfer_ix = transfer_checked(
        &spl_token_2022::id(),
        source_account,
        mint,
        destination_account,
        &owner.pubkey(),
        &[],
        amount,
        decimals,
    )?;

    // Send transaction
    let recent_blockhash = client.get_latest_blockhash()?;
    let transaction = Transaction::new_signed_with_payer(
        &[transfer_ix],
        Some(&owner.pubkey()),
        &[owner],
        recent_blockhash,
    );

    let signature = client.send_and_confirm_transaction(&transaction)?;
    println!("✅ Transfer successful!");
    println!("Transaction: {}", signature);

    Ok(signature.to_string())
}

// Example usage
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = RpcClient::new("https://api.devnet.solana.com");

    // Transfer 1,000 KAMIYO
    // Recipient will receive: 980 KAMIYO (available)
    // Withheld as fees: 20 KAMIYO (2%)
    transfer_kamiyo_with_fees(
        &client,
        &mint_pubkey,
        &sender_token_account,
        &recipient_token_account,
        &sender_keypair,
        1_000_000_000,  // 1,000 KAMIYO (6 decimals)
        6,
    )?;

    Ok(())
}
```

### 4.4 Harvesting Fees to Mint (Permissionless)

**Anyone can call this to clear withheld fees from token accounts:**

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_token_2022::extension::transfer_fee::instruction::harvest_withheld_tokens_to_mint;

fn harvest_fees_to_mint(
    client: &RpcClient,
    mint: &Pubkey,
    source_accounts: &[Pubkey],
    fee_payer: &Keypair,
) -> Result<String, Box<dyn std::error::Error>> {
    println!("Harvesting fees from {} accounts to mint", source_accounts.len());

    // Convert to references for instruction builder
    let source_refs: Vec<&Pubkey> = source_accounts.iter().collect();

    // Create harvest instruction (permissionless)
    let harvest_ix = harvest_withheld_tokens_to_mint(
        &spl_token_2022::id(),
        mint,
        &source_refs,
    )?;

    // Send transaction
    let recent_blockhash = client.get_latest_blockhash()?;
    let transaction = Transaction::new_signed_with_payer(
        &[harvest_ix],
        Some(&fee_payer.pubkey()),
        &[fee_payer],
        recent_blockhash,
    );

    let signature = client.send_and_confirm_transaction(&transaction)?;
    println!("✅ Fees harvested to mint!");
    println!("Transaction: {}", signature);

    Ok(signature.to_string())
}

// Automated harvesting cron job example
fn automated_fee_harvesting() -> Result<(), Box<dyn std::error::Error>> {
    let client = RpcClient::new("https://api.mainnet-beta.solana.com");
    let fee_payer = Keypair::new();  // Load from secure storage

    // Find all token accounts with withheld fees
    let accounts_with_fees = find_accounts_with_withheld_fees(&client, &mint_pubkey)?;

    if accounts_with_fees.is_empty() {
        println!("No accounts with withheld fees found");
        return Ok(());
    }

    // Process in batches of 25 (transaction size limit)
    for chunk in accounts_with_fees.chunks(25) {
        harvest_fees_to_mint(&client, &mint_pubkey, chunk, &fee_payer)?;
    }

    Ok(())
}
```

### 4.5 Withdrawing Fees from Mint to Treasury

**Authority-only operation to extract collected fees:**

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_token_2022::extension::transfer_fee::instruction::withdraw_withheld_tokens_from_mint;

fn withdraw_fees_from_mint(
    client: &RpcClient,
    mint: &Pubkey,
    destination_account: &Pubkey,
    withdraw_authority: &Keypair,
) -> Result<u64, Box<dyn std::error::Error>> {
    println!("Withdrawing fees from mint to treasury");

    // Check current withheld amount in mint
    let mint_account = client.get_account(mint)?;
    let mint_data = Mint::unpack(&mint_account.data)?;
    let withheld_amount = get_withheld_amount_from_mint(&mint_data)?;

    println!("Withheld amount in mint: {} KAMIYO",
             withheld_amount as f64 / 1_000_000.0);

    if withheld_amount == 0 {
        println!("No fees to withdraw");
        return Ok(0);
    }

    // Create withdraw instruction (requires authority)
    let withdraw_ix = withdraw_withheld_tokens_from_mint(
        &spl_token_2022::id(),
        mint,
        destination_account,
        &withdraw_authority.pubkey(),
        &[],
    )?;

    // Send transaction
    let recent_blockhash = client.get_latest_blockhash()?;
    let transaction = Transaction::new_signed_with_payer(
        &[withdraw_ix],
        Some(&withdraw_authority.pubkey()),
        &[withdraw_authority],
        recent_blockhash,
    );

    let signature = client.send_and_confirm_transaction(&transaction)?;
    println!("✅ Fees withdrawn to treasury!");
    println!("Transaction: {}", signature);
    println!("Amount: {} KAMIYO", withheld_amount as f64 / 1_000_000.0);

    Ok(withheld_amount)
}
```

### 4.6 Fee Splitting Program (50/50 Treasury + LP)

**Custom Anchor program for automatic fee distribution:**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Token2022, TokenAccount, transfer_checked, TransferChecked};

declare_id!("KAMiYoFeeSplitter11111111111111111111111111");

#[program]
pub mod kamiyo_fee_splitter {
    use super::*;

    /// Distributes collected fees 50/50 between treasury and LP rewards
    pub fn distribute_fees(ctx: Context<DistributeFees>) -> Result<()> {
        let fee_vault = &ctx.accounts.fee_vault;
        let total_amount = fee_vault.amount;

        require!(total_amount > 0, ErrorCode::NoFeesToDistribute);

        // Calculate split (handle odd amounts by giving remainder to treasury)
        let lp_amount = total_amount / 2;
        let treasury_amount = total_amount - lp_amount;

        msg!("Distributing {} KAMIYO in fees", total_amount as f64 / 1_000_000.0);
        msg!("  → Treasury: {} KAMIYO", treasury_amount as f64 / 1_000_000.0);
        msg!("  → LP Rewards: {} KAMIYO", lp_amount as f64 / 1_000_000.0);

        // Transfer to treasury (50%)
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.treasury_account.to_account_info(),
                    authority: ctx.accounts.fee_vault_authority.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            treasury_amount,
            6,  // $KAMIYO decimals
        )?;

        // Transfer to LP rewards (50%)
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.lp_rewards_account.to_account_info(),
                    authority: ctx.accounts.fee_vault_authority.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            lp_amount,
            6,  // $KAMIYO decimals
        )?;

        emit!(FeeDistributionEvent {
            total_amount,
            treasury_amount,
            lp_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("✅ Fees distributed successfully!");

        Ok(())
    }
}

#[derive(Accounts)]
pub struct DistributeFees<'info> {
    /// The fee vault holding collected fees
    #[account(mut)]
    pub fee_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Authority over the fee vault (PDA)
    /// CHECK: PDA authority
    pub fee_vault_authority: UncheckedAccount<'info>,

    /// $KAMIYO mint
    pub mint: Box<InterfaceAccount<'info, anchor_spl::token_interface::Mint>>,

    /// Treasury token account (receives 50%)
    #[account(
        mut,
        token::mint = mint,
        token::authority = treasury_authority,
    )]
    pub treasury_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// LP rewards token account (receives 50%)
    #[account(
        mut,
        token::mint = mint,
        token::authority = lp_authority,
    )]
    pub lp_rewards_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Treasury wallet authority
    pub treasury_authority: UncheckedAccount<'info>,

    /// CHECK: LP rewards wallet authority
    pub lp_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[event]
pub struct FeeDistributionEvent {
    pub total_amount: u64,
    pub treasury_amount: u64,
    pub lp_amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("No fees available to distribute")]
    NoFeesToDistribute,
}
```

### 4.7 Updating Fee Configuration

**Changing fee percentage after mint creation (2-epoch delay applies):**

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_token_2022::extension::transfer_fee::instruction::set_transfer_fee;

fn update_transfer_fee_config(
    client: &RpcClient,
    mint: &Pubkey,
    transfer_fee_config_authority: &Keypair,
    new_fee_basis_points: u16,
    new_maximum_fee: u64,
) -> Result<String, Box<dyn std::error::Error>> {
    println!("Updating transfer fee configuration");
    println!("  New fee: {}%", new_fee_basis_points as f64 / 100.0);
    println!("  New max fee: {} KAMIYO", new_maximum_fee as f64 / 1_000_000.0);
    println!("  ⚠️  Changes take effect after 2 epoch boundaries");

    // Create set transfer fee instruction
    let set_fee_ix = set_transfer_fee(
        &spl_token_2022::id(),
        mint,
        &transfer_fee_config_authority.pubkey(),
        &[],
        new_fee_basis_points,
        new_maximum_fee,
    )?;

    // Send transaction
    let recent_blockhash = client.get_latest_blockhash()?;
    let transaction = Transaction::new_signed_with_payer(
        &[set_fee_ix],
        Some(&transfer_fee_config_authority.pubkey()),
        &[transfer_fee_config_authority],
        recent_blockhash,
    );

    let signature = client.send_and_confirm_transaction(&transaction)?;
    println!("✅ Fee configuration updated!");
    println!("Transaction: {}", signature);

    Ok(signature.to_string())
}

// Example: Reduce fee from 2% to 1% after community vote
fn reduce_fee_after_governance() -> Result<(), Box<dyn std::error::Error>> {
    let client = RpcClient::new("https://api.mainnet-beta.solana.com");
    let config_authority = load_authority_from_secure_storage()?;

    update_transfer_fee_config(
        &client,
        &mint_pubkey,
        &config_authority,
        100,            // New fee: 1% (down from 2%)
        500_000_000,    // New max: 500 KAMIYO (down from 1,000)
    )?;

    Ok(())
}
```

---

## 5. Python Backend Integration Patterns

### 5.1 Payment Verifier Integration Overview

The existing `api/x402/payment_verifier.py` infrastructure supports Solana legacy SPL tokens and can be extended to support Token-2022 with minimal changes. The key integration points are:

1. **RPC Client Configuration**: Already uses `AsyncClient` from `solana-py`
2. **Transaction Parsing**: Uses `jsonParsed` encoding (supports Token-2022)
3. **Instruction Detection**: Parses `transfer` and `transferChecked` instructions
4. **Amount Extraction**: Calculates net received amount

### 5.2 Detecting Token-2022 Mint

**Add function to detect if a mint uses Token-2022:**

```python
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
from typing import Optional

# Token-2022 Program ID
TOKEN_2022_PROGRAM_ID = Pubkey.from_string("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")

async def is_token_2022_mint(
    client: AsyncClient,
    mint_address: str
) -> bool:
    """
    Check if a mint is a Token-2022 mint by checking its owner program

    Args:
        client: Solana RPC client
        mint_address: Mint address to check

    Returns:
        True if Token-2022, False if legacy SPL Token
    """
    try:
        mint_pubkey = Pubkey.from_string(mint_address)
        account_info = await client.get_account_info(mint_pubkey)

        if not account_info.value:
            raise ValueError(f"Mint account not found: {mint_address}")

        # Check if owner is Token-2022 program
        owner_program = account_info.value.owner
        is_token_2022 = owner_program == TOKEN_2022_PROGRAM_ID

        if is_token_2022:
            logger.info(f"✅ Detected Token-2022 mint: {mint_address}")
        else:
            logger.info(f"Legacy SPL Token mint: {mint_address}")

        return is_token_2022

    except Exception as e:
        logger.error(f"Error checking mint type: {e}")
        raise
```

### 5.3 Parsing Transfer Fee Configuration

**Extract transfer fee settings from mint account:**

```python
import struct
from typing import Optional, Tuple
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey

# Extension type discriminator for TransferFeeConfig
TRANSFER_FEE_CONFIG_EXTENSION_TYPE = 1

async def get_transfer_fee_config(
    client: AsyncClient,
    mint_address: str
) -> Optional[Tuple[int, int]]:
    """
    Extract transfer fee configuration from Token-2022 mint

    Args:
        client: Solana RPC client
        mint_address: Token-2022 mint address

    Returns:
        Tuple of (fee_basis_points, maximum_fee) or None if no transfer fee
    """
    try:
        mint_pubkey = Pubkey.from_string(mint_address)
        account_info = await client.get_account_info(mint_pubkey)

        if not account_info.value:
            raise ValueError(f"Mint account not found: {mint_address}")

        account_data = account_info.value.data

        # Mint base size is 82 bytes, extensions start after
        BASE_MINT_SIZE = 82

        if len(account_data) <= BASE_MINT_SIZE:
            # No extensions present
            return None

        # Parse extension data (TLV format)
        extension_data = account_data[BASE_MINT_SIZE:]
        offset = 0

        while offset < len(extension_data):
            # Read extension type (2 bytes)
            if offset + 2 > len(extension_data):
                break

            ext_type = struct.unpack("<H", extension_data[offset:offset+2])[0]
            offset += 2

            # Read extension length (2 bytes)
            if offset + 2 > len(extension_data):
                break

            ext_length = struct.unpack("<H", extension_data[offset:offset+2])[0]
            offset += 2

            # Check if this is TransferFeeConfig extension
            if ext_type == TRANSFER_FEE_CONFIG_EXTENSION_TYPE:
                # Parse TransferFeeConfig structure
                # Offset 0-32: transfer_fee_config_authority (OptionalNonZeroPubkey)
                # Offset 32-64: withdraw_withheld_authority (OptionalNonZeroPubkey)
                # Offset 64-66: transfer_fee_basis_points (u16)
                # Offset 66-74: maximum_fee (u64)

                if offset + ext_length > len(extension_data):
                    break

                config_data = extension_data[offset:offset+ext_length]

                # Extract fee configuration
                fee_basis_points = struct.unpack("<H", config_data[64:66])[0]
                maximum_fee = struct.unpack("<Q", config_data[66:74])[0]

                logger.info(f"Transfer fee config: {fee_basis_points} bps, max {maximum_fee}")

                return (fee_basis_points, maximum_fee)

            offset += ext_length

        # No TransferFeeConfig found
        return None

    except Exception as e:
        logger.error(f"Error parsing transfer fee config: {e}")
        return None
```

### 5.4 Calculating Net Amount After Fees

**Calculate actual amount received after transfer fees:**

```python
from decimal import Decimal
from typing import Tuple

def calculate_net_amount_after_fees(
    transfer_amount: Decimal,
    fee_basis_points: int,
    maximum_fee: int,
    decimals: int = 6
) -> Tuple[Decimal, Decimal]:
    """
    Calculate net amount received after Token-2022 transfer fees

    Args:
        transfer_amount: Gross transfer amount (in token units, e.g., 1000.0 KAMIYO)
        fee_basis_points: Fee in basis points (200 = 2%)
        maximum_fee: Maximum fee cap in raw units (with decimals)
        decimals: Token decimals

    Returns:
        Tuple of (net_amount, fee_amount) in token units
    """
    # Convert to raw units for calculation
    transfer_raw = int(transfer_amount * Decimal(10 ** decimals))

    # Calculate fee: (amount × basis_points) / 10,000
    calculated_fee = (transfer_raw * fee_basis_points) // 10_000

    # Apply maximum fee cap
    actual_fee = min(calculated_fee, maximum_fee)

    # Calculate net amount
    net_raw = transfer_raw - actual_fee

    # Convert back to token units
    net_amount = Decimal(net_raw) / Decimal(10 ** decimals)
    fee_amount = Decimal(actual_fee) / Decimal(10 ** decimals)

    logger.debug(f"Transfer calculation: {transfer_amount} KAMIYO")
    logger.debug(f"  Fee: {fee_amount} KAMIYO ({fee_basis_points} bps)")
    logger.debug(f"  Net received: {net_amount} KAMIYO")

    return (net_amount, fee_amount)

# Example usage
transfer_amount = Decimal("1000.0")  # 1,000 KAMIYO
fee_basis_points = 200  # 2%
maximum_fee = 1_000_000_000  # 1,000 KAMIYO (with 6 decimals)

net, fee = calculate_net_amount_after_fees(
    transfer_amount,
    fee_basis_points,
    maximum_fee,
    decimals=6
)

print(f"Gross: {transfer_amount} KAMIYO")
print(f"Fee: {fee} KAMIYO")
print(f"Net: {net} KAMIYO")
# Output:
# Gross: 1000.0 KAMIYO
# Fee: 20.0 KAMIYO
# Net: 980.0 KAMIYO
```

### 5.5 Enhanced Solana Payment Verification for Token-2022

**Updated `_verify_solana_payment` method with Token-2022 support:**

```python
async def _verify_solana_payment_with_token2022(
    self,
    tx_hash: str,
    config: ChainConfig,
    expected_amount: Optional[Decimal]
) -> PaymentVerification:
    """
    Enhanced Solana payment verification with Token-2022 support
    Handles both legacy SPL Token and Token-2022 transfers
    """
    try:
        if not self.solana_client:
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain='solana',
                amount_usdc=Decimal('0'),
                from_address='',
                to_address='',
                block_number=0,
                confirmations=0,
                risk_score=1.0,
                error_message="Solana client not initialized"
            )

        # Parse transaction signature
        try:
            signature = Signature.from_string(tx_hash)
        except Exception as e:
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain='solana',
                amount_usdc=Decimal('0'),
                from_address='',
                to_address='',
                block_number=0,
                confirmations=0,
                risk_score=1.0,
                error_message=f"Invalid Solana signature format: {e}"
            )

        # Get transaction details with jsonParsed encoding
        # This automatically handles Token-2022 instruction parsing
        response = await self.solana_client.get_transaction(
            signature,
            encoding="jsonParsed",
            commitment=Confirmed,
            max_supported_transaction_version=0
        )

        if not response.value:
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain='solana',
                amount_usdc=Decimal('0'),
                from_address='',
                to_address='',
                block_number=0,
                confirmations=0,
                risk_score=1.0,
                error_message="Transaction not found on Solana"
            )

        tx_data = response.value

        # Check transaction error status
        if tx_data.transaction.meta.err:
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain='solana',
                amount_usdc=Decimal('0'),
                from_address='',
                to_address='',
                block_number=tx_data.slot if tx_data.slot else 0,
                confirmations=0,
                risk_score=1.0,
                error_message=f"Transaction failed: {tx_data.transaction.meta.err}"
            )

        # Get slot and calculate confirmations
        slot = tx_data.slot if tx_data.slot else 0
        current_slot_response = await self.solana_client.get_slot()
        current_slot = current_slot_response.value if current_slot_response.value else slot
        confirmations = current_slot - slot

        # Check if this is a $KAMIYO Token-2022 payment
        kamiyo_mint = self.config.kamiyo_token_address  # New config field
        is_kamiyo_payment = False

        # Detect mint type for fee calculation
        mint_is_token_2022 = await is_token_2022_mint(
            self.solana_client,
            config.usdc_contract_address
        )

        # Get transfer fee config if Token-2022
        transfer_fee_config = None
        if mint_is_token_2022:
            transfer_fee_config = await get_transfer_fee_config(
                self.solana_client,
                config.usdc_contract_address
            )

        # Parse SPL token transfer from instructions
        amount_gross = Decimal('0')  # Amount before fees
        amount_net = Decimal('0')    # Amount after fees (actual received)
        from_address = ''
        to_address = ''

        # Look through instructions for SPL token transfers
        instructions = tx_data.transaction.transaction.message.instructions

        for instruction in instructions:
            # Check if this is a parsed SPL token transfer
            if hasattr(instruction, 'parsed') and instruction.parsed:
                parsed = instruction.parsed

                # Check if it's a transfer or transferChecked instruction
                if isinstance(parsed, dict):
                    info = parsed.get('info', {})
                    instruction_type = parsed.get('type', '')

                    if instruction_type in ['transfer', 'transferChecked']:
                        # Get source, destination, and amount
                        source = info.get('source', '')
                        destination = info.get('destination', '')

                        # For transferChecked, amount is in tokenAmount
                        if instruction_type == 'transferChecked':
                            token_amount = info.get('tokenAmount', {})
                            amount_raw = token_amount.get('amount', '0')
                            decimals = token_amount.get('decimals', 6)
                        else:
                            # For regular transfer
                            amount_raw = info.get('amount', '0')
                            decimals = 6  # Assume USDC/KAMIYO decimals

                        # Convert amount from raw to decimal
                        amount_gross = Decimal(str(amount_raw)) / Decimal(10 ** decimals)

                        # Check if this is a transfer to our payment address
                        if destination.lower() == self.config.solana_payment_address.lower():
                            # Calculate net amount after Token-2022 fees
                            if transfer_fee_config:
                                fee_basis_points, maximum_fee = transfer_fee_config
                                amount_net, fee_amount = calculate_net_amount_after_fees(
                                    amount_gross,
                                    fee_basis_points,
                                    maximum_fee,
                                    decimals
                                )
                                logger.info(
                                    f"Token-2022 transfer: {amount_gross} KAMIYO "
                                    f"(fee: {fee_amount}, net: {amount_net})"
                                )
                            else:
                                # No transfer fee, net = gross
                                amount_net = amount_gross

                            to_address = destination
                            from_address = source
                            break

        # Verify we found a valid transfer to our address
        if amount_net == Decimal('0'):
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain='solana',
                amount_usdc=Decimal('0'),
                from_address=from_address,
                to_address=to_address,
                block_number=slot,
                confirmations=confirmations,
                risk_score=0.8,
                error_message="No token transfer to payment address found in transaction"
            )

        # Check confirmations
        if confirmations < config.required_confirmations:
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain='solana',
                amount_usdc=amount_net,
                from_address=from_address,
                to_address=to_address,
                block_number=slot,
                confirmations=confirmations,
                risk_score=0.5,
                error_message=f"Insufficient confirmations: {confirmations}/{config.required_confirmations}"
            )

        # Check minimum payment amount (use net amount after fees)
        if amount_net < self.min_payment_amount:
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain='solana',
                amount_usdc=amount_net,
                from_address=from_address,
                to_address=to_address,
                block_number=slot,
                confirmations=confirmations,
                risk_score=0.3,
                error_message=f"Payment amount too low: {amount_net} < {self.min_payment_amount}"
            )

        # Calculate risk score
        risk_score = await self._calculate_risk_score(tx_hash, 'solana', from_address)

        # Payment is valid!
        logger.info(
            f"✅ Verified Solana payment: {amount_net} tokens from {from_address} "
            f"(gross: {amount_gross}, Token-2022: {mint_is_token_2022})"
        )

        return PaymentVerification(
            is_valid=True,
            tx_hash=tx_hash,
            chain='solana',
            amount_usdc=amount_net,  # Return net amount after fees
            from_address=from_address,
            to_address=to_address,
            block_number=slot,
            confirmations=confirmations,
            risk_score=risk_score
        )

    except Exception as e:
        logger.error(f"❌ Error verifying Solana payment: {e}")
        return PaymentVerification(
            is_valid=False,
            tx_hash=tx_hash,
            chain='solana',
            amount_usdc=Decimal('0'),
            from_address='',
            to_address='',
            block_number=0,
            confirmations=0,
            risk_score=1.0,
            error_message=f"Error verifying Solana payment: {str(e)}"
        )
```

### 5.6 Configuration Updates for $KAMIYO

**Add $KAMIYO token configuration to `api/x402/config.py`:**

```python
from pydantic_settings import BaseSettings
from typing import Optional

class X402Config(BaseSettings):
    # ... existing config fields ...

    # Solana Token-2022 Configuration
    kamiyo_token_address: str = "KAMiYo..." # $KAMIYO Token-2022 mint address
    kamiyo_decimals: int = 6
    kamiyo_payment_enabled: bool = True

    # Fee collection configuration
    kamiyo_fee_basis_points: int = 200  # 2%
    kamiyo_max_fee: int = 1_000_000_000  # 1,000 KAMIYO

    # Fee splitting configuration
    treasury_wallet: str = "TREASury..."  # Treasury wallet address
    lp_rewards_wallet: str = "LPRewards..."  # LP rewards wallet address
    fee_split_percentage: int = 50  # 50% to each destination

    class Config:
        env_prefix = "X402_"
        case_sensitive = False
```

### 5.7 Complete Payment Verifier Enhancement

**Extended `setup_chains()` method with $KAMIYO support:**

```python
def setup_chains(self):
    """Initialize supported blockchain configurations with Token-2022 support"""
    # ... existing Base and Ethereum configs ...

    # Solana - USDC SPL (Legacy)
    self.chains['solana'] = ChainConfig(
        name='solana',
        rpc_url=self.config.solana_rpc_url,
        usdc_contract_address='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        required_confirmations=self.config.solana_confirmations,
        usdc_decimals=6,
        chain_id=-1
    )

    # Solana - $KAMIYO Token-2022
    if self.config.kamiyo_payment_enabled:
        self.chains['solana-kamiyo'] = ChainConfig(
            name='solana-kamiyo',
            rpc_url=self.config.solana_rpc_url,
            usdc_contract_address=self.config.kamiyo_token_address,
            required_confirmations=self.config.solana_confirmations,
            usdc_decimals=self.config.kamiyo_decimals,
            chain_id=-2  # Distinguish from legacy USDC
        )
        logger.info(f"✅ $KAMIYO Token-2022 payments enabled: {self.config.kamiyo_token_address}")

    # ... existing Web3 and Solana client initialization ...
```

---

## 6. Token-2022 vs Legacy SPL Token Comparison

### 6.1 Feature Comparison Table

| Feature | Legacy SPL Token | Token-2022 | Impact for $KAMIYO |
|---------|-----------------|------------|-------------------|
| **Program ID** | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | Requires separate mint |
| **Account Size** | Fixed (165 bytes) | Variable (165+ bytes) | Larger rent cost |
| **Transfer Fees** | Manual implementation | Native extension | Built-in 2% fee |
| **Fee Collection** | Custom smart contract | Automatic accumulation | Simplified operations |
| **Metadata** | External (Metaplex) | Native extension | On-chain token info |
| **Interest-Bearing** | Not supported | Native extension | Future yield options |
| **Non-Transferable** | Not supported | Native extension | Future SBT support |
| **Transfer Hooks** | Not supported | Native extension | Advanced compliance |
| **Confidential Transfers** | Not supported | Native extension | Future privacy |
| **Pausability** | Manual implementation | Native extension | Emergency controls |
| **Instruction Count** | 25 instructions | 40+ instructions | More functionality |
| **ATA Program** | Separate | Unified (same ATA program) | Compatible wallets |
| **Backward Compatibility** | N/A | First 165 bytes identical | Easy migration path |
| **Audit Status** | Extensively audited | Multiple audits (2024) | Production-ready |
| **Ecosystem Support** | Universal | Growing (2024-2025) | Phantom, Solflare support |

### 6.2 Performance Comparison

| Metric | Legacy SPL Token | Token-2022 | Notes |
|--------|-----------------|------------|-------|
| **Mint Creation Cost** | ~0.00203 SOL | ~0.00215 SOL (+5.9%) | Higher due to extension data |
| **Token Account Cost** | ~0.00203 SOL | ~0.00215 SOL (+5.9%) | Slightly more rent |
| **Transfer Cost** | ~0.000005 SOL | ~0.000005 SOL | Identical |
| **Transfer with Fee** | N/A | ~0.000005 SOL | No extra cost |
| **Fee Withdrawal** | N/A | ~0.000005 SOL | Standard transaction |
| **Transaction Speed** | ~400ms (average) | ~400ms (average) | No performance impact |
| **Parallelization** | High | High | Fee design maintains parallelism |

### 6.3 Developer Experience Comparison

**Legacy SPL Token Manual Fee Implementation:**

```rust
// Manual fee calculation and transfer (legacy approach)
pub fn transfer_with_manual_fee(
    ctx: Context<TransferWithFee>,
    amount: u64,
) -> Result<()> {
    // Calculate fee manually
    let fee_amount = amount * 2 / 100;  // 2%
    let net_amount = amount - fee_amount;

    // Transfer net amount to recipient
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.from.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        net_amount,
    )?;

    // Transfer fee to treasury (separate transaction)
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.from.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        fee_amount,
    )?;

    Ok(())
}

// Requires:
// - Custom smart contract for every transfer
// - Higher gas costs (2 transfers instead of 1)
// - Users must interact with your contract, not standard Token Program
// - Wallet compatibility issues
```

**Token-2022 Native Fee (Modern Approach):**

```rust
// Native fee automatically applied (Token-2022)
pub fn transfer_with_native_fee(
    ctx: Context<TransferToken2022>,
    amount: u64,
) -> Result<()> {
    // Just use standard transfer instruction
    // Fee is automatically deducted and accumulated
    token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.from.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        amount,
        6,  // decimals
    )?;

    Ok(())
}

// Benefits:
// - No custom contract needed for transfers
// - Standard wallet compatibility
// - Lower gas costs (single transfer)
// - Automatic fee accumulation
// - Protocol-level fee enforcement
```

### 6.4 Migration Path

**Migrating from Legacy SPL Token to Token-2022:**

Tokens cannot be "upgraded" in place. Migration requires:

1. **Create New Token-2022 Mint** with desired extensions
2. **Deploy Migration Contract** that swaps old tokens for new tokens 1:1
3. **Announce Migration Period** (e.g., 6 months)
4. **Provide Swap Interface** for users to exchange tokens
5. **Update Integrations** (DEXs, wallets, dApps)
6. **Sunset Old Token** after migration period

**For $KAMIYO (New Launch):**
- No migration needed
- Launch directly with Token-2022
- Avoid legacy limitations from day one

### 6.5 Ecosystem Compatibility (2025)

| Platform/Service | Legacy SPL Token | Token-2022 | Notes |
|-----------------|-----------------|------------|-------|
| **Wallets** |
| Phantom | Full support | Full support | Transfer fee display in UI |
| Solflare | Full support | Full support | Extension metadata shown |
| Backpack | Full support | Full support | Token-2022 native |
| Ledger Hardware | Full support | Full support (v2.1.0+) | Requires firmware update |
| **DEXs** |
| Jupiter | Full support | Full support | Aggregator handles fees |
| Raydium | Full support | Full support | Fee-adjusted pricing |
| Orca | Full support | Full support | Whirlpool v2 optimized |
| **Infrastructure** |
| Metaplex | Full support | Partial (growing) | Metadata migration underway |
| Pyth Network | Full support | Full support | Price feeds compatible |
| Chainlink | Full support | Full support | Oracle data available |
| **Development** |
| Anchor | Full support | Full support (v0.30.0+) | Native extension constraints |
| solana-py | Full support | Full support | jsonParsed encoding |
| @solana/web3.js | Full support | Full support | @solana/spl-token package |

---

## 7. Security Considerations

### 7.1 Authority Management

**Critical Security Recommendation:** Use multisig wallets for all authorities.

**Recommended Setup:**
```
Transfer Fee Config Authority: 3-of-5 Multisig (Squads Protocol)
├─ Team Member 1 (Founder)
├─ Team Member 2 (CTO)
├─ Team Member 3 (Operations)
├─ Team Member 4 (Security)
└─ Team Member 5 (Advisory Board)

Withdraw Withheld Authority: 2-of-3 Multisig (Operations Team)
├─ Operations Lead
├─ Finance Lead
└─ Technical Lead

Mint Authority: Cold storage (only for emergency mints, if any)
Freeze Authority: None (immutable, pro-decentralization)
```

**Security Implications:**

1. **Transfer Fee Config Authority Compromise:**
   - Attacker can change fee percentage to 100% (rug pull)
   - **Mitigation:** 2-epoch delay gives 48-96 hours to respond
   - **Mitigation:** Multisig prevents single-point-of-failure
   - **Mitigation:** Set up monitoring alerts for fee config changes

2. **Withdraw Withheld Authority Compromise:**
   - Attacker can drain accumulated fees
   - **Mitigation:** Regular fee withdrawals minimize accumulated value
   - **Mitigation:** Multisig requires multiple compromises
   - **Mitigation:** Set up monitoring for withdrawal transactions

3. **Authority Key Loss:**
   - Lost keys = permanent loss of authority control
   - **Mitigation:** Use Squads Protocol with social recovery
   - **Mitigation:** Maintain secure backup procedures
   - **Mitigation:** Document recovery procedures

### 7.2 Fee Configuration Attacks

**Attack Vector: Fee Manipulation**

Malicious actor with `transfer_fee_config_authority` could:
- Increase fees to 100% (10,000 basis points)
- Set maximum fee to u64::MAX (effectively infinite)
- Drain user funds through excessive fees

**Mitigations:**

1. **2-Epoch Delay (Built-in Protection):**
   ```
   Attacker calls set_transfer_fee(10000)  // 100% fee
       ↓
   Epoch boundary 1 (waiting...)
       ↓
   Epoch boundary 2 (waiting...)
   Community notices suspicious change!
       ↓
   Emergency response:
   - Announce attack to community
   - Freeze trading on DEXs (if possible)
   - Counter-transaction to revert fee change
       ↓
   New fee reverted before taking effect
   ```

2. **Governance for Fee Changes:**
   ```rust
   // Require governance vote before fee changes
   pub fn propose_fee_change(
       ctx: Context<ProposeFeeChange>,
       new_fee_basis_points: u16,
   ) -> Result<()> {
       require!(
           new_fee_basis_points <= 500,  // Max 5% allowed by governance
           ErrorCode::FeeExceedsLimit
       );

       // Create governance proposal
       // Requires community vote + multisig approval
       // ...
   }
   ```

3. **On-Chain Fee Limits:**
   ```rust
   // Smart contract enforces maximum fee
   const MAX_ALLOWED_FEE_BPS: u16 = 500;  // 5% absolute maximum

   pub fn set_transfer_fee_protected(
       ctx: Context<SetFeeProtected>,
       new_fee_basis_points: u16,
   ) -> Result<()> {
       require!(
           new_fee_basis_points <= MAX_ALLOWED_FEE_BPS,
           ErrorCode::FeeExceedsProtectionLimit
       );

       // Call Token-2022 set_transfer_fee
       // ...
   }
   ```

### 7.3 Fee Accumulation Security

**Attack Vector: Withheld Fee Theft**

If `withdraw_withheld_authority` is compromised, attacker can steal all accumulated fees.

**Mitigations:**

1. **Regular Fee Withdrawals:**
   - Withdraw fees daily/weekly to minimize exposure
   - Reduces accumulated value at risk

2. **Automated Harvesting + Scheduled Withdrawals:**
   ```python
   # Cron job: Harvest every 1000 blocks
   async def automated_harvesting():
       while True:
           await harvest_fees_to_mint(mint_address)
           await asyncio.sleep(1000 * 0.4)  # ~400ms per block

   # Cron job: Withdraw weekly to cold storage
   async def scheduled_withdrawal():
       await withdraw_fees_from_mint(
           mint_address,
           cold_storage_address,
           withdraw_authority_multisig
       )
       # Wait 7 days
       await asyncio.sleep(7 * 24 * 60 * 60)
   ```

3. **Monitoring and Alerts:**
   ```python
   # Alert on unexpected withdrawals
   async def monitor_fee_withdrawals():
       async for tx in monitor_transactions(mint_address):
           if tx.instruction_type == "WithdrawWithheldTokens":
               alert_team(
                   f"⚠️ Fee withdrawal detected: {tx.amount} KAMIYO "
                   f"to {tx.destination} by {tx.authority}"
               )
   ```

### 7.4 Account Closure Issues

**Problem:** Token accounts with withheld fees cannot be closed.

**User Impact:**
```
User wants to close token account
├─ Available balance: 0 KAMIYO ✅
├─ Withheld fees: 0.5 KAMIYO ❌
└─ Result: CloseAccount fails, rent deposit locked
```

**Solutions:**

1. **Permissionless Harvesting:**
   - Users can call `harvest_withheld_tokens_to_mint` themselves
   - Clears withheld balance, allows account closure
   - Requires small SOL for transaction fee

2. **UI Warnings:**
   ```typescript
   // Wallet UI should check for withheld fees before closure
   async function checkBeforeClose(tokenAccount: PublicKey) {
     const accountInfo = await getAccount(connection, tokenAccount);
     const withheldAmount = getWithheldAmount(accountInfo);

     if (withheldAmount > 0) {
       alert(
         `This account has ${withheldAmount} KAMIYO in withheld fees. ` +
         `You must harvest these fees before closing the account.`
       );
       return false;
     }

     return true;
   }
   ```

3. **Automated Harvesting Service:**
   - KAMIYO team runs public harvesting bot
   - Permissionlessly clears withheld fees from all accounts
   - Users benefit without manual intervention

### 7.5 Smart Contract Risks

**Attack Vector: Fee Splitter Program Vulnerabilities**

The custom fee splitter program introduces additional attack surface.

**Potential Vulnerabilities:**

1. **Reentrancy Attacks:**
   ```rust
   // VULNERABLE (pseudocode)
   pub fn distribute_fees(ctx: Context<DistributeFees>) -> Result<()> {
       let amount = ctx.accounts.fee_vault.amount;

       // Transfer to treasury
       transfer(treasury, amount / 2)?;

       // Transfer to LP
       transfer(lp, amount / 2)?;  // Reentrancy here could double-withdraw

       Ok(())
   }
   ```

   **Mitigation:** Use checks-effects-interactions pattern:
   ```rust
   pub fn distribute_fees(ctx: Context<DistributeFees>) -> Result<()> {
       let amount = ctx.accounts.fee_vault.amount;

       // Check: Ensure sufficient balance
       require!(amount > 0, ErrorCode::InsufficientFees);

       // Effect: Update state BEFORE external calls
       ctx.accounts.fee_vault.amount = 0;

       // Interaction: External transfers
       transfer(treasury, amount / 2)?;
       transfer(lp, amount / 2)?;

       Ok(())
   }
   ```

2. **Access Control Bypass:**
   ```rust
   // VULNERABLE: Missing authority check
   pub fn distribute_fees(ctx: Context<DistributeFees>) -> Result<()> {
       // Anyone can call this and drain fees!
       // ...
   }

   // SECURE: Proper authority validation
   pub fn distribute_fees(ctx: Context<DistributeFees>) -> Result<()> {
       // Only authorized accounts can trigger distribution
       require!(
           ctx.accounts.authority.key() == AUTHORIZED_DISTRIBUTOR,
           ErrorCode::Unauthorized
       );
       // ...
   }
   ```

3. **Integer Overflow/Underflow:**
   ```rust
   // SECURE: Anchor uses overflow checks by default
   // But be explicit with checked arithmetic
   pub fn distribute_fees(ctx: Context<DistributeFees>) -> Result<()> {
       let total = ctx.accounts.fee_vault.amount;

       let lp_amount = total.checked_div(2)
           .ok_or(ErrorCode::MathOverflow)?;
       let treasury_amount = total.checked_sub(lp_amount)
           .ok_or(ErrorCode::MathOverflow)?;

       // ...
   }
   ```

**Security Audit Recommendations:**

1. **Pre-Launch Audit:** Engage professional auditors (e.g., OtterSec, Neodyme, Sec3)
2. **Bug Bounty Program:** Offer rewards for vulnerability disclosure
3. **Gradual Rollout:** Start with small fee amounts, increase over time
4. **Timelocked Upgrades:** Use Squads with timelock for program upgrades

### 7.6 RPC Node Security

**Attack Vector: Malicious RPC Responses**

If using untrusted RPC nodes, payment verifier could receive false transaction data.

**Mitigations:**

1. **Use Reputable RPC Providers:**
   - Alchemy, Helius, QuickNode (paid, reliable)
   - Multiple providers for redundancy

2. **Transaction Verification:**
   ```python
   async def verify_with_multiple_rpcs(tx_hash: str) -> bool:
       """Verify transaction with 3 independent RPC nodes"""
       rpcs = [
           AsyncClient("https://api.mainnet-beta.solana.com"),
           AsyncClient("https://solana-mainnet.g.alchemy.com/v2/..."),
           AsyncClient("https://rpc.helius.xyz/?api-key=..."),
       ]

       results = await asyncio.gather(*[
           rpc.get_transaction(tx_hash) for rpc in rpcs
       ])

       # Require 2-of-3 consensus
       if results[0] == results[1] or results[0] == results[2]:
           return True
       return False
   ```

3. **On-Chain Verification:**
   - For high-value payments, verify on-chain state
   - Check actual token account balances after transfer

### 7.7 Compliance and Regulatory Considerations

**Transfer Fee Transparency:**

Ensure clear disclosure of transfer fees to users:

1. **Wallet UI Warnings:**
   ```
   ⚠️ This token has a 2% transfer fee

   You are sending: 1,000 KAMIYO
   Recipient receives: 980 KAMIYO
   Transfer fee: 20 KAMIYO (automatically deducted)
   ```

2. **Documentation:**
   - Publish tokenomics documentation
   - Explain fee structure and purpose
   - Disclose fee destinations (treasury, LP)

3. **On-Chain Metadata:**
   ```json
   {
     "name": "KAMIYO",
     "symbol": "KAMIYO",
     "description": "Crypto exploit intelligence token with 2% transfer fee",
     "transfer_fee": {
       "basis_points": 200,
       "description": "2% fee split between treasury (1%) and LP rewards (1%)"
     }
   }
   ```

**Securities Law Considerations:**

Consult legal counsel regarding:
- Transfer fees as profit distribution mechanism
- LP rewards as potential "dividends"
- Token classification (utility vs. security)
- Regulatory compliance in target jurisdictions

---

## 8. Integration Checklist

### Phase 1: Development Environment Setup

- [ ] **Set up Solana development environment**
  - [ ] Install Solana CLI (v1.18+)
  - [ ] Install Anchor CLI (v0.30.0+)
  - [ ] Configure devnet wallet with SOL
  - [ ] Verify `spl-token` CLI with Token-2022 support

- [ ] **Configure Python environment**
  - [ ] Update `requirements.txt` with `solana>=0.34.0`
  - [ ] Install `solders` package
  - [ ] Test `AsyncClient` with devnet RPC
  - [ ] Verify `jsonParsed` encoding support

- [ ] **Set up testing infrastructure**
  - [ ] Create devnet test wallets
  - [ ] Fund wallets with devnet SOL
  - [ ] Set up local validator for unit tests
  - [ ] Configure pytest for async tests

### Phase 2: Token Creation

- [ ] **Generate $KAMIYO mint keypair**
  - [ ] Use secure key generation (hardware wallet recommended)
  - [ ] Back up keypair securely (encrypted, offline storage)
  - [ ] Document public key for team reference

- [ ] **Create Token-2022 mint on devnet**
  - [ ] Deploy mint with TransferFeeConfig extension
  - [ ] Set fee to 200 basis points (2%)
  - [ ] Set maximum fee to 1,000,000,000 (1,000 KAMIYO)
  - [ ] Configure transfer fee config authority (multisig)
  - [ ] Configure withdraw withheld authority (multisig)
  - [ ] Verify mint creation on Solana Explorer

- [ ] **Test token functionality**
  - [ ] Create test token accounts
  - [ ] Mint initial test tokens
  - [ ] Execute test transfers with fee deduction
  - [ ] Verify fee accumulation in recipient accounts
  - [ ] Test harvesting fees to mint
  - [ ] Test withdrawing fees from mint

### Phase 3: Fee Splitter Program Development

- [ ] **Develop Anchor program**
  - [ ] Initialize Anchor project
  - [ ] Implement `distribute_fees` instruction
  - [ ] Add access control checks
  - [ ] Implement 50/50 split logic
  - [ ] Add event logging
  - [ ] Write unit tests

- [ ] **Deploy and test on devnet**
  - [ ] Deploy program to devnet
  - [ ] Create program-derived accounts
  - [ ] Test fee distribution with small amounts
  - [ ] Verify treasury receives 50%
  - [ ] Verify LP wallet receives 50%
  - [ ] Test edge cases (odd amounts, zero fees, etc.)

- [ ] **Security audit preparation**
  - [ ] Document program architecture
  - [ ] Prepare test suite
  - [ ] Engage security auditor (OtterSec, Neodyme, etc.)
  - [ ] Address audit findings
  - [ ] Re-test after fixes

### Phase 4: Python Backend Integration

- [ ] **Update payment_verifier.py**
  - [ ] Add `is_token_2022_mint()` function
  - [ ] Add `get_transfer_fee_config()` function
  - [ ] Add `calculate_net_amount_after_fees()` function
  - [ ] Update `_verify_solana_payment()` with Token-2022 support
  - [ ] Add `solana-kamiyo` chain configuration

- [ ] **Update config.py**
  - [ ] Add `kamiyo_token_address` field
  - [ ] Add `kamiyo_decimals` field
  - [ ] Add `kamiyo_payment_enabled` flag
  - [ ] Add fee collection config fields
  - [ ] Add treasury/LP wallet addresses

- [ ] **Write integration tests**
  - [ ] Test Token-2022 mint detection
  - [ ] Test transfer fee parsing
  - [ ] Test net amount calculation
  - [ ] Test payment verification with fees
  - [ ] Test $KAMIYO payment flow end-to-end
  - [ ] Test error handling

### Phase 5: Fee Collection Automation

- [ ] **Implement harvesting automation**
  - [ ] Create harvesting cron job script
  - [ ] Set up monitoring for accounts with withheld fees
  - [ ] Configure harvesting frequency (every N blocks)
  - [ ] Add error handling and retries
  - [ ] Set up logging and alerts

- [ ] **Implement withdrawal automation**
  - [ ] Create withdrawal script with multisig support
  - [ ] Configure withdrawal schedule (weekly/monthly)
  - [ ] Integrate with fee splitter program
  - [ ] Add transaction monitoring
  - [ ] Set up success/failure notifications

- [ ] **Deploy automation infrastructure**
  - [ ] Set up dedicated server/VM
  - [ ] Configure cron jobs or systemd timers
  - [ ] Set up monitoring dashboard
  - [ ] Configure alerting (email, Slack, PagerDuty)
  - [ ] Document runbooks for operations team

### Phase 6: Wallet and Frontend Integration

- [ ] **Update wallet configuration**
  - [ ] Add $KAMIYO token to wallet UIs (Phantom, Solflare)
  - [ ] Configure token metadata (logo, description)
  - [ ] Test token display with transfer fee indicator
  - [ ] Verify correct fee calculation in wallet UIs

- [ ] **Update frontend components**
  - [ ] Add $KAMIYO payment option to payment modal
  - [ ] Display transfer fee warning (2%)
  - [ ] Show net amount calculation
  - [ ] Add "Pay with $KAMIYO" button
  - [ ] Test payment flow in browser
  - [ ] Handle wallet connection errors

- [ ] **Create user documentation**
  - [ ] Write "How to Pay with $KAMIYO" guide
  - [ ] Explain transfer fee mechanism
  - [ ] Document fee destinations (treasury, LP)
  - [ ] Create FAQ for common questions
  - [ ] Add troubleshooting section

### Phase 7: Mainnet Deployment Preparation

- [ ] **Security checklist**
  - [ ] Complete smart contract audit
  - [ ] Review all authority configurations
  - [ ] Verify multisig wallet setup
  - [ ] Test authority key backup procedures
  - [ ] Document incident response procedures

- [ ] **Performance testing**
  - [ ] Load test payment verification
  - [ ] Stress test fee collection automation
  - [ ] Test RPC failover mechanisms
  - [ ] Measure transaction confirmation times
  - [ ] Optimize database queries

- [ ] **Compliance review**
  - [ ] Legal review of tokenomics
  - [ ] Ensure transfer fee disclosure
  - [ ] Verify KYC/AML requirements (if applicable)
  - [ ] Document terms of service updates
  - [ ] Prepare regulatory filings (if required)

### Phase 8: Mainnet Deployment

- [ ] **Deploy Token-2022 mint on mainnet**
  - [ ] Generate production keypair securely
  - [ ] Create mint with production configuration
  - [ ] Set up production multisig authorities
  - [ ] Verify mint on Solana Explorer
  - [ ] Announce mint address to community

- [ ] **Deploy fee splitter program**
  - [ ] Deploy audited program to mainnet
  - [ ] Initialize program accounts
  - [ ] Configure treasury/LP wallets
  - [ ] Test with small fee amounts
  - [ ] Verify fee splits are correct

- [ ] **Update production backend**
  - [ ] Deploy updated payment_verifier.py
  - [ ] Update environment variables
  - [ ] Enable $KAMIYO payments in production
  - [ ] Monitor error logs for issues
  - [ ] Set up production monitoring dashboards

- [ ] **Launch automation**
  - [ ] Deploy harvesting automation to production
  - [ ] Deploy withdrawal automation with multisig
  - [ ] Verify cron jobs are running
  - [ ] Test end-to-end fee collection flow
  - [ ] Set up production alerts

### Phase 9: Post-Launch Monitoring

- [ ] **Monitor first 24 hours**
  - [ ] Track all $KAMIYO transactions
  - [ ] Verify fee accumulation
  - [ ] Monitor harvesting automation
  - [ ] Check for errors in payment verification
  - [ ] Respond to user support requests

- [ ] **Week 1 review**
  - [ ] Analyze transaction volume
  - [ ] Review fee collection metrics
  - [ ] Assess user feedback
  - [ ] Identify optimization opportunities
  - [ ] Document lessons learned

- [ ] **Monthly maintenance**
  - [ ] Review authority access
  - [ ] Audit fee distribution accuracy
  - [ ] Update documentation
  - [ ] Plan feature enhancements
  - [ ] Conduct security reviews

### Phase 10: Future Enhancements

- [ ] **Governance integration**
  - [ ] Implement DAO for fee adjustments
  - [ ] Create proposal system
  - [ ] Enable community voting
  - [ ] Document governance procedures

- [ ] **Advanced features**
  - [ ] Explore transfer hook extension
  - [ ] Consider confidential transfers
  - [ ] Investigate interest-bearing capabilities
  - [ ] Research cross-program integrations

- [ ] **Ecosystem expansion**
  - [ ] List on DEXs (Jupiter, Raydium, Orca)
  - [ ] Create liquidity pools
  - [ ] Partner with wallets for featured display
  - [ ] Integrate with Solana ecosystem projects

---

## 9. FAQ

### Q1: Can I change the transfer fee percentage after mint creation?

**A:** Yes, but with important constraints:
- Only the `transfer_fee_config_authority` can change fees
- Changes take effect **after 2 epoch boundaries** (~48-96 hours)
- This delay prevents rug pulls and gives users time to react
- Use `set_transfer_fee` instruction to update configuration

Example timeline:
```
Monday 10:00 AM: Authority calls set_transfer_fee(300) [3%]
Monday 11:30 AM: Epoch boundary 1 (still 2%)
Tuesday 1:00 AM: Epoch boundary 2 (still 2%)
Tuesday 2:30 PM: Epoch boundary 3 → NEW FEE ACTIVE (3%)
```

### Q2: How do I split fees between multiple wallets?

**A:** Token-2022's Transfer Fee extension only supports a **single withdraw authority**. To split fees:

1. **Withdraw to intermediate account** controlled by your custom program
2. **Use custom program logic** to distribute fees to multiple destinations
3. **Or use manual distribution**: Withdraw to one wallet, then transfer portions to other wallets

Recommended approach: Deploy the custom fee splitter program (provided in code examples) that automatically distributes 50% to treasury and 50% to LP.

### Q3: Are Token-2022 tokens compatible with existing wallets?

**A:** Yes, with caveats:
- **Modern wallets** (Phantom, Solflare, Backpack) fully support Token-2022 as of 2024-2025
- **Hardware wallets** (Ledger) require firmware v2.1.0+ for Token-2022 support
- **DEXs** (Jupiter, Raydium, Orca) handle Token-2022 and adjust for transfer fees
- **Legacy integrations** may need updates to properly display transfer fees

Token-2022 uses the **same Associated Token Account (ATA) program**, so account creation is identical.

### Q4: What happens to fees during a token transfer?

**A:** When a user transfers 1,000 KAMIYO:

```
Sender's token account: -1,000 KAMIYO (total deducted)

Recipient's token account:
├─ Available balance: +980 KAMIYO (recipient can spend)
└─ Withheld amount: +20 KAMIYO (locked, only withdraw authority can access)

Blockchain state:
└─ Total supply: unchanged (no tokens burned)
```

The withheld amount is stored in an extension field of the recipient's token account and is **inaccessible to the recipient**. Only the `withdraw_withheld_authority` can extract these fees.

### Q5: Can users close token accounts with withheld fees?

**A:** No, accounts with non-zero withheld fees **cannot be closed**. Users must first:

1. Call `harvest_withheld_tokens_to_mint` (permissionless)
2. This moves withheld fees to the mint account
3. Then the user can close their token account and recover rent

**Solution:** Provide a "Harvest & Close" button in your UI that does both operations in one transaction.

### Q6: How much does it cost to create a Token-2022 mint?

**A:** Costs on Solana mainnet (as of 2025):

| Item | Cost | Notes |
|------|------|-------|
| Mint account rent | ~0.00215 SOL | ~$0.20 (at $100/SOL) |
| Transaction fee | ~0.000005 SOL | ~$0.0005 |
| **Total** | **~0.00216 SOL** | **~$0.20** |

This is slightly higher than legacy SPL Token (~0.00203 SOL) due to extension data, but still extremely affordable.

### Q7: What's the difference between `transfer` and `transferChecked`?

**A:** For Token-2022, you should **always use `transferChecked`**:

| Feature | `transfer` | `transferChecked` |
|---------|------------|-------------------|
| Token-2022 Support | Limited | Full |
| Decimals Verification | No | Yes (prevents errors) |
| Mint Verification | No | Yes (prevents wrong token) |
| Fee Handling | May fail | Automatic |
| Recommended | No | **Yes** |

The `transferChecked` instruction requires you to specify the token's decimals and mint address, providing extra validation that prevents common errors.

### Q8: How do I monitor fee collection in real-time?

**A:** Use Solana RPC to track withheld amounts:

```python
async def get_total_withheld_fees(client: AsyncClient, mint: str) -> Decimal:
    """Get total fees withheld across all accounts"""
    # Get mint account
    mint_pubkey = Pubkey.from_string(mint)
    mint_account = await client.get_account_info(mint_pubkey)

    # Parse withheld amount in mint
    mint_withheld = parse_mint_withheld_amount(mint_account.value.data)

    # Get all token accounts for this mint
    token_accounts = await client.get_token_accounts_by_mint(mint_pubkey)

    # Sum withheld amounts from all accounts
    total_withheld = mint_withheld
    for account in token_accounts.value:
        account_withheld = parse_account_withheld_amount(account.account.data)
        total_withheld += account_withheld

    return Decimal(total_withheld) / Decimal(1_000_000)  # Convert to KAMIYO
```

Set up a dashboard that polls this function every minute to display real-time fee accumulation.

### Q9: Can I disable transfer fees after launch?

**A:** Yes, but you can only **reduce fees to 0**, not completely remove the extension:

```rust
// Set fees to 0 (effectively disabling)
set_transfer_fee(
    &TOKEN_2022_PROGRAM_ID,
    &mint_pubkey,
    &config_authority,
    &[],
    0,      // 0 basis points = 0% fee
    0,      // 0 maximum fee
)?;
```

The Transfer Fee extension remains part of the mint account structure, but with 0% fees, it has no effect on transfers. The extension cannot be removed after mint creation.

### Q10: How do fees affect liquidity pools and DEXs?

**A:** DEXs handle Token-2022 transfer fees by:

1. **Adjusting swap calculations** to account for fee deductions
2. **Displaying fee-adjusted prices** (e.g., "you receive 980 KAMIYO after 2% fee")
3. **Routing through optimal paths** that minimize total fees

**Impact on liquidity pools:**
- Liquidity providers receive fees on every swap (standard AMM mechanism)
- Transfer fees are **additional** to swap fees
- Example: 0.3% swap fee + 2% transfer fee = 2.3% total cost
- May reduce arbitrage activity (higher threshold for profitable trades)

**Recommendation:** Ensure your token is listed on DEXs that properly support Token-2022 (Jupiter, Raydium, Orca all support it as of 2024-2025).

### Q11: What happens if I lose access to the withdraw authority?

**A:** If the `withdraw_withheld_authority` keypair is lost:

- **Accumulated fees become locked** forever
- No one can withdraw fees from token accounts or mint
- Fees continue to accumulate but cannot be extracted
- Users can still transfer tokens normally

**Critical:** Use a multisig wallet (Squads Protocol) for withdraw authority to prevent single-point-of-failure. With a 2-of-3 or 3-of-5 multisig, losing one key doesn't lock fees permanently.

### Q12: Can I use Token-2022 for NFTs?

**A:** Yes, Token-2022 supports NFTs with extensions:
- Set `decimals = 0` and `supply = 1` for NFTs
- Use `non_transferable` extension for Soulbound Tokens (SBTs)
- Combine with `metadata` extension for on-chain NFT data
- Transfer fees work with NFTs (2% fee on NFT sales)

However, most NFT marketplaces (Magic Eden, Tensor) are still optimizing for Token-2022 NFTs. Check compatibility before launching.

### Q13: How do I test Token-2022 on devnet?

**A:** Step-by-step testing guide:

```bash
# 1. Switch to devnet
solana config set --url devnet

# 2. Create devnet wallet and fund it
solana-keygen new --outfile ~/kamiyo-devnet.json
solana airdrop 2

# 3. Create Token-2022 mint with transfer fee
spl-token create-token \
  --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
  --decimals 6 \
  --enable-transfer-fee \
  --transfer-fee-basis-points 200 \
  --transfer-fee-max 1000000000

# 4. Create token account
spl-token create-account <MINT_ADDRESS>

# 5. Mint test tokens
spl-token mint <MINT_ADDRESS> 1000000

# 6. Transfer with fee deduction
spl-token transfer <MINT_ADDRESS> 1000 <RECIPIENT_ADDRESS>

# 7. Check withheld fees
spl-token display <TOKEN_ACCOUNT_ADDRESS>
```

### Q14: What's the maximum transfer fee I can set?

**A:** Technical maximum: **10,000 basis points (100%)**

However, practical considerations:
- **100% fee = token becomes non-transferable**
- Most projects use 0.1% - 5% (10-500 basis points)
- Higher fees reduce liquidity and user adoption
- Consider regulatory implications of high fees

**Recommendation for $KAMIYO:** 2% (200 basis points) is reasonable for a utility token with clear value proposition. Fees fund development and liquidity, which benefits the ecosystem.

### Q15: Can I use Token-2022 with Metaplex for NFT metadata?

**A:** Token-2022 has **native metadata extension**, which is preferred over Metaplex:

```rust
// Create Token-2022 mint with native metadata
#[account(
    init,
    payer = payer,
    mint::token_program = token_program,
    mint::decimals = 6,
    mint::authority = authority,
    extensions::metadata_pointer::authority = authority,
    extensions::metadata_pointer::metadata_address = mint,
    extensions::transfer_fee::transfer_fee_basis_points = 200,
    extensions::transfer_fee::maximum_fee = 1_000_000_000,
)]
pub mint: InterfaceAccount<'info, Mint>,
```

Benefits of native metadata:
- Stored directly on mint account (no external lookup)
- No additional rent costs
- Simpler architecture
- Fully compatible with Token-2022 extensions

Metaplex is working on Token-2022 compatibility but native metadata is the recommended approach for new projects.

---

## 10. References

### Official Solana Documentation

1. **Token-2022 Program Documentation**
   - Solana Program Library: https://www.solana-program.com/docs/token-2022
   - SPL Token-2022 Docs: https://spl.solana.com/token-2022
   - Transfer Fee Extension: https://solana.com/developers/guides/token-extensions/transfer-fee

2. **Solana Developer Resources**
   - Solana Cookbook: https://solanacookbook.com
   - Anchor Framework: https://book.anchor-lang.com
   - Solana Web3.js: https://solana-labs.github.io/solana-web3.js

### Code Repositories

3. **Official Token-2022 Implementation**
   - GitHub: https://github.com/solana-labs/solana-program-library/tree/master/token/program-2022
   - Rust Tests: https://github.com/solana-program-library/token-2022/blob/master/clients/rust-legacy/tests/transfer_fee.rs

4. **Example Projects**
   - Transfer Hook Anchor: https://github.com/rust-trust/spl2022-transfer-hook-anchor
   - Token-2022 Launcher: https://github.com/topics/spl-token-2022

### Python Integration

5. **solana-py Library**
   - GitHub: https://github.com/michaelhly/solana-py
   - Documentation: https://michaelhly.com/solana-py
   - solders (types): https://github.com/kevinheavey/solders

6. **RPC API Reference**
   - Solana JSON RPC: https://docs.solana.com/api/http
   - getParsedTransaction: https://www.quicknode.com/docs/solana/getParsedTransaction

### Security and Audits

7. **Security Resources**
   - Token-2022 Audit Report (Neodyme): https://neodyme.io/en/blog/token-2022
   - Solana Security Best Practices: https://github.com/coral-xyz/sealevel-attacks
   - Squads Multisig Protocol: https://squads.so

8. **Audit Firms**
   - OtterSec: https://osec.io
   - Neodyme: https://neodyme.io
   - Sec3: https://sec3.dev

### Ecosystem Tools

9. **Development Tools**
   - Solana Explorer: https://explorer.solana.com
   - Solscan: https://solscan.io
   - Anchor Version Manager (avm): https://www.anchor-lang.com/docs/avm

10. **Wallet and Infrastructure**
    - Phantom Wallet: https://phantom.app
    - Solflare Wallet: https://solflare.com
    - Helius RPC: https://helius.xyz
    - QuickNode: https://www.quicknode.com/chains/sol

### Community Resources

11. **Solana Stack Exchange**
    - Token-2022 Questions: https://solana.stackexchange.com/questions/tagged/spl-token-2022
    - Transfer Fee Discussion: https://solana.stackexchange.com/search?q=transfer+fee

12. **Educational Content**
    - Solana Bootcamp: https://www.soldev.app
    - QuickNode Guides: https://www.quicknode.com/guides/solana-development
    - RareSkills Solana Course: https://rareskills.io/solana-tutorial

### Related KAMIYO Documentation

13. **Internal Documentation**
    - `/Users/dennisgoslar/Projekter/kamiyo/api/x402/payment_verifier.py` - Current payment verification
    - `/Users/dennisgoslar/Projekter/kamiyo/api/x402/config.py` - x402 configuration
    - `/Users/dennisgoslar/Projekter/kamiyo/requirements.txt` - Python dependencies

### Research Papers and Articles

14. **Token Economics**
    - "Transfer Fees and Token Velocity" - CryptoDatabytes
    - "SPL Token-2022 Security Analysis" - Neodyme Blog
    - "Token Extensions Design Rationale" - Solana Foundation

### Support and Community

15. **Developer Support**
    - Solana Discord: https://discord.gg/solana
    - Anchor Discord: https://discord.gg/anchor
    - KAMIYO Discord: [Your project Discord]

16. **Technical Support**
    - Solana StackExchange: https://solana.stackexchange.com
    - GitHub Issues: https://github.com/solana-labs/solana/issues

---

## Document Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-10-28 | Initial comprehensive research document | Technical Research Team |

---

## Appendix A: Quick Reference Commands

### Token-2022 CLI Commands

```bash
# Create Token-2022 mint with transfer fee
spl-token create-token \
  --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
  --decimals 6 \
  --enable-transfer-fee \
  --transfer-fee-basis-points 200 \
  --transfer-fee-max 1000000000

# Create token account
spl-token create-account <MINT_ADDRESS>

# Transfer with automatic fee deduction
spl-token transfer <MINT_ADDRESS> <AMOUNT> <RECIPIENT>

# Harvest fees to mint (permissionless)
spl-token harvest-withheld-tokens-to-mint <MINT_ADDRESS> <TOKEN_ACCOUNT_1> <TOKEN_ACCOUNT_2>

# Withdraw fees from mint (requires authority)
spl-token withdraw-withheld-tokens-from-mint <MINT_ADDRESS> <DESTINATION_ACCOUNT>

# Display token account with withheld amount
spl-token display <TOKEN_ACCOUNT>

# Update transfer fee configuration
spl-token set-transfer-fee <MINT_ADDRESS> <NEW_BASIS_POINTS> <NEW_MAX_FEE>
```

### Python Quick Reference

```python
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey

# Token-2022 Program ID
TOKEN_2022_PROGRAM_ID = Pubkey.from_string("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")

# Check if mint is Token-2022
async def is_token_2022(client, mint_address):
    account = await client.get_account_info(Pubkey.from_string(mint_address))
    return account.value.owner == TOKEN_2022_PROGRAM_ID

# Get transaction with parsed Token-2022 instructions
response = await client.get_transaction(
    signature,
    encoding="jsonParsed",
    max_supported_transaction_version=0
)
```

---

**End of Document**

*This research document provides foundational knowledge for implementing the $KAMIYO token using SPL Token-2022. For implementation support, consult the KAMIYO development team or Solana community resources.*
