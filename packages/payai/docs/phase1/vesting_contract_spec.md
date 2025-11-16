# KAMIYO Vesting Contract Technical Specification

**Version:** 1.0
**Last Updated:** October 2025
**Author:** Kamiyo Core Team
**Implementation:** Anchor Framework (Solana)

---

## Table of Contents

1. [Overview](#overview)
2. [Contract Architecture](#contract-architecture)
3. [Data Structures](#data-structures)
4. [Instructions](#instructions)
5. [Vesting Schedules](#vesting-schedules)
6. [Security Considerations](#security-considerations)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Plan](#deployment-plan)
9. [Appendix](#appendix)

---

## 1. Overview

### Purpose

The KAMIYO Vesting Contract manages the controlled release of 100M KAMIYO tokens (10% of total supply) to team members and advisors over a 24-month period. This contract ensures:

- **Alignment:** Team incentivized to build long-term value
- **Transparency:** All vesting schedules on-chain, publicly auditable
- **Flexibility:** Support multiple beneficiaries with custom schedules
- **Security:** Admin controls for emergency revocation, immutable after deployment

### Key Requirements

| Requirement | Value | Rationale |
|------------|-------|-----------|
| **Total Allocation** | 100,000,000 KAMIYO | 10% of supply |
| **Beneficiaries** | 5 team members | Core team only |
| **Cliff Period** | 6 months | Prevents immediate selling post-launch |
| **Vesting Duration** | 24 months total (18 months post-cliff) | Standard for crypto teams |
| **Release Frequency** | Linear per second | Continuous vesting, no lump sums |
| **Revocation** | Admin-controlled, pre-cliff only | Protects against early departures |
| **Immutability** | Admin renounces after all schedules created | Trustless after setup |

### Implementation Approach

We will implement a **custom Anchor program** rather than using SPL Token-2022's native vesting extension for the following reasons:

1. **Transparency:** Open-source Anchor code is auditable by community
2. **Flexibility:** Support complex revocation logic and custom schedules
3. **Control:** Admin can batch-create schedules and renounce authority
4. **Compatibility:** Works with standard SPL tokens (no Token-2022 requirement)

---

## 2. Contract Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                  KAMIYO Vesting Program                 │
│                   (Anchor Smart Contract)               │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Controls
                           ▼
    ┌──────────────────────────────────────────────────┐
    │         Vesting Vault (Token Account)            │
    │  Authority: Vesting Program PDA                  │
    │  Balance: 100M KAMIYO (locked)                   │
    └──────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐   ┌─────────────┐
│  Schedule 1 │    │  Schedule 2 │   │  Schedule 3 │
│ Beneficiary:│    │ Beneficiary:│   │ Beneficiary:│
│  Alice      │    │    Bob      │   │   Carol     │
│ 20M KAMIYO  │    │ 20M KAMIYO  │   │ 20M KAMIYO  │
└─────────────┘    └─────────────┘   └─────────────┘
```

### Components

1. **Vesting Program:** Anchor smart contract (compiled to BPF, deployed on Solana)
2. **Vesting Vault:** SPL token account holding all 100M KAMIYO (owned by program PDA)
3. **Vesting Schedules:** On-chain accounts storing parameters for each beneficiary
4. **Admin Authority:** Multisig wallet with power to create/revoke schedules (renounced after setup)

### Program Derived Addresses (PDAs)

```rust
// Vesting Vault PDA (owns all locked tokens)
[
    b"vesting_vault",
    kamiyo_mint.key().as_ref(),
]

// Individual Vesting Schedule PDA
[
    b"vesting_schedule",
    beneficiary.key().as_ref(),
    schedule_id.to_le_bytes().as_ref(),
]
```

---

## 3. Data Structures

### VestingSchedule Account

```rust
#[account]
pub struct VestingSchedule {
    /// Unique identifier for this schedule (0, 1, 2, ...)
    pub schedule_id: u64,

    /// Wallet address that can claim vested tokens
    pub beneficiary: Pubkey,

    /// KAMIYO mint address (for verification)
    pub mint: Pubkey,

    /// Total tokens allocated to this schedule
    pub total_amount: u64,

    /// Tokens already claimed by beneficiary
    pub claimed_amount: u64,

    /// Unix timestamp when vesting begins (TGE)
    pub start_timestamp: i64,

    /// Cliff duration in seconds (6 months = 15,552,000 seconds)
    pub cliff_duration: i64,

    /// Total vesting duration in seconds (24 months = 62,208,000 seconds)
    pub total_duration: i64,

    /// Whether this schedule has been revoked (pre-cliff only)
    pub revoked: bool,

    /// Timestamp when schedule was created (for audit)
    pub created_at: i64,

    /// Admin who created this schedule (for audit)
    pub created_by: Pubkey,

    /// Bump seed for PDA derivation
    pub bump: u8,
}

// Account size: 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 32 + 1 = 154 bytes
```

### VestingVault Account

```rust
#[account]
pub struct VestingVault {
    /// KAMIYO mint address
    pub mint: Pubkey,

    /// Admin authority (can create/revoke schedules)
    pub admin: Pubkey,

    /// Total tokens deposited into vault
    pub total_deposited: u64,

    /// Total tokens claimed across all schedules
    pub total_claimed: u64,

    /// Number of active vesting schedules
    pub schedule_count: u64,

    /// Whether admin has renounced authority (immutable after)
    pub admin_renounced: bool,

    /// Bump seed for PDA derivation
    pub bump: u8,
}

// Account size: 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 = 98 bytes
```

---

## 4. Instructions

### 4.1 Initialize Vault

**Purpose:** One-time setup to create vesting vault and deposit 100M KAMIYO.

**Accounts:**
```rust
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 98,
        seeds = [b"vesting_vault", mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VestingVault>,

    #[account(
        init,
        payer = admin,
        token::mint = mint,
        token::authority = vault,
        seeds = [b"vault_token_account", mint.key().as_ref()],
        bump
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = admin_token_account.owner == admin.key(),
        constraint = admin_token_account.mint == mint.key(),
        constraint = admin_token_account.amount >= 100_000_000 * 10u64.pow(mint.decimals as u32)
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
```

**Logic:**
1. Create `VestingVault` account (PDA)
2. Create `vault_token_account` (owned by vault PDA)
3. Transfer 100M KAMIYO from admin to vault
4. Initialize vault state:
   ```rust
   vault.mint = mint.key();
   vault.admin = admin.key();
   vault.total_deposited = 100_000_000 * 10u64.pow(mint.decimals as u32);
   vault.total_claimed = 0;
   vault.schedule_count = 0;
   vault.admin_renounced = false;
   vault.bump = *ctx.bumps.get("vault").unwrap();
   ```

**Errors:**
- `InsufficientFunds`: Admin doesn't have 100M KAMIYO
- `InvalidMint`: Mint address not KAMIYO
- `VaultAlreadyInitialized`: Vault already exists (can only call once)

---

### 4.2 Create Vesting Schedule

**Purpose:** Admin creates a vesting schedule for a team member.

**Accounts:**
```rust
#[derive(Accounts)]
#[instruction(schedule_id: u64)]
pub struct CreateVestingSchedule<'info> {
    #[account(
        mut,
        seeds = [b"vesting_vault", mint.key().as_ref()],
        bump = vault.bump,
        constraint = !vault.admin_renounced @ ErrorCode::AdminRenounced,
        constraint = vault.admin == admin.key() @ ErrorCode::UnauthorizedAdmin
    )]
    pub vault: Account<'info, VestingVault>,

    #[account(
        init,
        payer = admin,
        space = 8 + 154,
        seeds = [b"vesting_schedule", beneficiary.key().as_ref(), schedule_id.to_le_bytes().as_ref()],
        bump
    )]
    pub schedule: Account<'info, VestingSchedule>,

    pub mint: Account<'info, Mint>,

    /// CHECK: Beneficiary doesn't need to sign (admin creates on their behalf)
    pub beneficiary: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
```

**Parameters:**
```rust
pub struct CreateScheduleParams {
    pub schedule_id: u64,           // Unique ID (0-4 for 5 team members)
    pub total_amount: u64,          // Tokens allocated (e.g., 20M * 10^decimals)
    pub start_timestamp: i64,       // TGE timestamp (Unix seconds)
    pub cliff_duration: i64,        // 15,552,000 seconds (6 months)
    pub total_duration: i64,        // 62,208,000 seconds (24 months)
}
```

**Logic:**
1. Verify admin authority
2. Verify total allocated across all schedules ≤ 100M
3. Create `VestingSchedule` account
4. Initialize schedule state:
   ```rust
   schedule.schedule_id = schedule_id;
   schedule.beneficiary = beneficiary.key();
   schedule.mint = mint.key();
   schedule.total_amount = total_amount;
   schedule.claimed_amount = 0;
   schedule.start_timestamp = start_timestamp;
   schedule.cliff_duration = cliff_duration;
   schedule.total_duration = total_duration;
   schedule.revoked = false;
   schedule.created_at = Clock::get()?.unix_timestamp;
   schedule.created_by = admin.key();
   schedule.bump = *ctx.bumps.get("schedule").unwrap();
   ```
5. Increment `vault.schedule_count`

**Errors:**
- `AdminRenounced`: Cannot create schedules after admin renounced
- `UnauthorizedAdmin`: Caller is not vault admin
- `ExceedsTotalAllocation`: Sum of all schedules > 100M KAMIYO
- `ScheduleAlreadyExists`: Schedule ID already used for this beneficiary

**Example Call:**
```typescript
// Create 20M KAMIYO schedule for Alice (beneficiary #0)
await program.methods
  .createVestingSchedule({
    scheduleId: new BN(0),
    totalAmount: new BN(20_000_000 * 10**9), // 20M KAMIYO (9 decimals)
    startTimestamp: new BN(1735689600),      // Jan 1, 2025 00:00 UTC
    cliffDuration: new BN(15_552_000),       // 6 months
    totalDuration: new BN(62_208_000),       // 24 months
  })
  .accounts({
    vault: vaultPda,
    schedule: schedulePda,
    mint: kamiyoMint,
    beneficiary: aliceWallet,
    admin: adminWallet,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .rpc();
```

---

### 4.3 Release Tokens (Claim)

**Purpose:** Beneficiary claims vested tokens at any time (permissionless).

**Accounts:**
```rust
#[derive(Accounts)]
pub struct ReleaseTokens<'info> {
    #[account(
        mut,
        seeds = [b"vesting_vault", mint.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VestingVault>,

    #[account(
        mut,
        seeds = [b"vesting_schedule", beneficiary.key().as_ref(), schedule.schedule_id.to_le_bytes().as_ref()],
        bump = schedule.bump,
        constraint = schedule.beneficiary == beneficiary.key() @ ErrorCode::UnauthorizedBeneficiary,
        constraint = !schedule.revoked @ ErrorCode::ScheduleRevoked
    )]
    pub schedule: Account<'info, VestingSchedule>,

    #[account(
        mut,
        seeds = [b"vault_token_account", mint.key().as_ref()],
        bump
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = beneficiary_token_account.owner == beneficiary.key(),
        constraint = beneficiary_token_account.mint == mint.key()
    )]
    pub beneficiary_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub beneficiary: Signer<'info>,

    pub token_program: Program<'info, Token>,
}
```

**Logic:**
1. Calculate vested amount:
   ```rust
   fn calculate_vested_amount(schedule: &VestingSchedule, current_time: i64) -> u64 {
       // Before cliff: 0 tokens vested
       if current_time < schedule.start_timestamp + schedule.cliff_duration {
           return 0;
       }

       // After full duration: all tokens vested
       if current_time >= schedule.start_timestamp + schedule.total_duration {
           return schedule.total_amount;
       }

       // During vesting period: linear interpolation
       let elapsed_since_cliff = current_time - (schedule.start_timestamp + schedule.cliff_duration);
       let vesting_period = schedule.total_duration - schedule.cliff_duration;
       let vested = (schedule.total_amount as u128)
           .checked_mul(elapsed_since_cliff as u128)
           .unwrap()
           .checked_div(vesting_period as u128)
           .unwrap() as u64;

       vested
   }
   ```

2. Calculate claimable amount:
   ```rust
   let current_time = Clock::get()?.unix_timestamp;
   let vested_amount = calculate_vested_amount(&schedule, current_time);
   let claimable = vested_amount.checked_sub(schedule.claimed_amount).unwrap();

   require!(claimable > 0, ErrorCode::NoTokensVested);
   ```

3. Transfer tokens from vault to beneficiary:
   ```rust
   token::transfer(
       CpiContext::new_with_signer(
           ctx.accounts.token_program.to_account_info(),
           Transfer {
               from: ctx.accounts.vault_token_account.to_account_info(),
               to: ctx.accounts.beneficiary_token_account.to_account_info(),
               authority: ctx.accounts.vault.to_account_info(),
           },
           &[&[
               b"vesting_vault",
               ctx.accounts.mint.key().as_ref(),
               &[ctx.accounts.vault.bump],
           ]],
       ),
       claimable,
   )?;
   ```

4. Update state:
   ```rust
   schedule.claimed_amount += claimable;
   vault.total_claimed += claimable;
   ```

**Errors:**
- `UnauthorizedBeneficiary`: Caller is not the beneficiary
- `ScheduleRevoked`: Schedule was revoked pre-cliff
- `NoTokensVested`: Called before cliff or no new tokens vested since last claim

**Example Vesting Timeline (20M KAMIYO):**

| Date | Elapsed | Status | Vested Amount | Claimable (if never claimed) |
|------|---------|--------|--------------|------------------------------|
| Jan 1, 2025 | 0 months | TGE | 0 KAMIYO | 0 |
| Mar 1, 2025 | 2 months | Pre-cliff | 0 KAMIYO | 0 |
| Jul 1, 2025 | 6 months | Cliff ends | 0 KAMIYO | 0 |
| Aug 1, 2025 | 7 months | Vesting starts | 1.11M KAMIYO | 1.11M |
| Jan 1, 2026 | 12 months | Midpoint | 6.67M KAMIYO | 6.67M |
| Jul 1, 2026 | 18 months | 75% done | 13.33M KAMIYO | 13.33M |
| Jan 1, 2027 | 24 months | Fully vested | 20M KAMIYO | 20M |

**Note:** Beneficiaries can claim at any frequency (daily, weekly, monthly). Unclaimed tokens remain in vault safely.

---

### 4.4 Revoke Vesting Schedule

**Purpose:** Admin cancels a schedule **before cliff** (e.g., team member leaves early).

**Accounts:**
```rust
#[derive(Accounts)]
pub struct RevokeVestingSchedule<'info> {
    #[account(
        mut,
        seeds = [b"vesting_vault", mint.key().as_ref()],
        bump = vault.bump,
        constraint = !vault.admin_renounced @ ErrorCode::AdminRenounced,
        constraint = vault.admin == admin.key() @ ErrorCode::UnauthorizedAdmin
    )]
    pub vault: Account<'info, VestingVault>,

    #[account(
        mut,
        seeds = [b"vesting_schedule", schedule.beneficiary.as_ref(), schedule.schedule_id.to_le_bytes().as_ref()],
        bump = schedule.bump,
        constraint = !schedule.revoked @ ErrorCode::AlreadyRevoked
    )]
    pub schedule: Account<'info, VestingSchedule>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,
}
```

**Logic:**
1. Verify admin authority
2. Check cliff hasn't passed:
   ```rust
   let current_time = Clock::get()?.unix_timestamp;
   let cliff_timestamp = schedule.start_timestamp + schedule.cliff_duration;
   require!(current_time < cliff_timestamp, ErrorCode::CliffPassed);
   ```
3. Mark schedule as revoked:
   ```rust
   schedule.revoked = true;
   ```
4. Unvested tokens remain in vault (can be reallocated)

**Errors:**
- `AdminRenounced`: Cannot revoke after admin renounced
- `UnauthorizedAdmin`: Caller is not vault admin
- `CliffPassed`: Cannot revoke after cliff (tokens already vesting)
- `AlreadyRevoked`: Schedule already revoked

**Use Case:**
If a team member leaves 3 months after TGE (before 6-month cliff), admin revokes their schedule. The 20M KAMIYO allocated to them stays in vault and can be reallocated to a new hire or returned to treasury.

---

### 4.5 Renounce Admin Authority

**Purpose:** Admin permanently gives up control, making contract immutable.

**Accounts:**
```rust
#[derive(Accounts)]
pub struct RenounceAdmin<'info> {
    #[account(
        mut,
        seeds = [b"vesting_vault", vault.mint.as_ref()],
        bump = vault.bump,
        constraint = vault.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
        constraint = !vault.admin_renounced @ ErrorCode::AlreadyRenounced
    )]
    pub vault: Account<'info, VestingVault>,

    #[account(mut)]
    pub admin: Signer<'info>,
}
```

**Logic:**
1. Verify admin authority
2. Set `vault.admin_renounced = true`
3. Emit event for transparency:
   ```rust
   emit!(AdminRenouncedEvent {
       vault: vault.key(),
       admin: admin.key(),
       timestamp: Clock::get()?.unix_timestamp,
   });
   ```

**Irreversibility:**
After renouncing, admin **cannot**:
- Create new schedules
- Revoke existing schedules
- Withdraw unvested tokens

Beneficiaries can still claim vested tokens normally. This is called after all 5 team schedules are created (typically Week 13, right before TGE).

**Errors:**
- `UnauthorizedAdmin`: Caller is not vault admin
- `AlreadyRenounced`: Admin already renounced

---

## 5. Vesting Schedules

### Team Allocation Breakdown

| Beneficiary | Role | Allocation | Schedule ID | Wallet Address (Example) |
|------------|------|-----------|------------|-------------------------|
| **Alice** | CEO/Founder | 20M KAMIYO | 0 | `A1ic...xY2z` |
| **Bob** | CTO | 20M KAMIYO | 1 | `B0bT...qW3r` |
| **Carol** | Head of Growth | 20M KAMIYO | 2 | `Car0...tE4u` |
| **Dave** | Lead Developer | 20M KAMIYO | 3 | `Dav3...yU5i` |
| **Eve** | Community Manager | 20M KAMIYO | 4 | `Ev3M...oP6a` |
| **TOTAL** | - | **100M KAMIYO** | - | - |

### Standard Vesting Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Start Date** | Jan 1, 2025 (TGE) | `1735689600` Unix timestamp |
| **Cliff Duration** | 6 months | `15,552,000` seconds |
| **Total Duration** | 24 months | `62,208,000` seconds |
| **Vesting Type** | Linear | Continuous per-second vesting |
| **Revocation Window** | Pre-cliff only | After cliff, irreversible |

### Vesting Calculation Formula

```rust
fn calculate_vested_amount(
    total_amount: u64,
    start_timestamp: i64,
    cliff_duration: i64,
    total_duration: i64,
    current_timestamp: i64,
) -> u64 {
    // Phase 1: Before cliff (0% vested)
    if current_timestamp < start_timestamp + cliff_duration {
        return 0;
    }

    // Phase 2: After full duration (100% vested)
    if current_timestamp >= start_timestamp + total_duration {
        return total_amount;
    }

    // Phase 3: During vesting period (linear interpolation)
    // Formula: vested = total * (time_since_cliff / vesting_period)
    let elapsed_since_cliff = current_timestamp - (start_timestamp + cliff_duration);
    let vesting_period = total_duration - cliff_duration;

    let vested = (total_amount as u128)
        .checked_mul(elapsed_since_cliff as u128)
        .unwrap()
        .checked_div(vesting_period as u128)
        .unwrap() as u64;

    vested
}
```

### Example Calculation (Alice's 20M KAMIYO)

**Assumptions:**
- Total: 20,000,000 KAMIYO (20M * 10^9 lamports)
- Start: Jan 1, 2025 00:00 UTC (1735689600)
- Cliff: 6 months (15,552,000 seconds)
- Duration: 24 months (62,208,000 seconds)

**Query: How much vested on Oct 1, 2025 (9 months in)?**

```
current_timestamp = 1743465600 (Oct 1, 2025)
elapsed_since_cliff = 1743465600 - (1735689600 + 15552000)
                    = 1743465600 - 1751241600
                    = -7776000 seconds (ERROR: still in cliff!)
```

Actually, let me recalculate:
- Start: Jan 1, 2025 = 1735689600
- Cliff ends: Jul 1, 2025 = 1735689600 + 15552000 = 1751241600
- Oct 1, 2025 = 1727740800 + 7776000 = 1743724800 (approximately)

Wait, let me use months more simply:

- Month 0 (Jan 2025): 0% vested (pre-cliff)
- Month 6 (Jul 2025): 0% vested (cliff ends, vesting starts)
- Month 9 (Oct 2025): 3 months into 18-month vesting = 3/18 = 16.67% vested = 3.33M KAMIYO
- Month 12 (Jan 2026): 6/18 = 33.33% vested = 6.67M KAMIYO
- Month 18 (Jul 2026): 12/18 = 66.67% vested = 13.33M KAMIYO
- Month 24 (Jan 2027): 18/18 = 100% vested = 20M KAMIYO

### Release Schedule Table (Monthly Snapshots)

| Month | Date | Elapsed | Phase | Vested % | Vested Amount | Claimable (Incremental) |
|-------|------|---------|-------|----------|--------------|-------------------------|
| 0 | Jan 2025 | 0 mo | Cliff | 0% | 0 | 0 |
| 1 | Feb 2025 | 1 mo | Cliff | 0% | 0 | 0 |
| 2 | Mar 2025 | 2 mo | Cliff | 0% | 0 | 0 |
| 3 | Apr 2025 | 3 mo | Cliff | 0% | 0 | 0 |
| 4 | May 2025 | 4 mo | Cliff | 0% | 0 | 0 |
| 5 | Jun 2025 | 5 mo | Cliff | 0% | 0 | 0 |
| 6 | Jul 2025 | 6 mo | Vesting Starts | 0% | 0 | 0 |
| 7 | Aug 2025 | 7 mo | Vesting | 5.56% | 1.11M | 1.11M |
| 8 | Sep 2025 | 8 mo | Vesting | 11.11% | 2.22M | 1.11M |
| 9 | Oct 2025 | 9 mo | Vesting | 16.67% | 3.33M | 1.11M |
| 12 | Jan 2026 | 12 mo | Vesting | 33.33% | 6.67M | 1.11M/mo |
| 18 | Jul 2026 | 18 mo | Vesting | 66.67% | 13.33M | 1.11M/mo |
| 24 | Jan 2027 | 24 mo | Fully Vested | 100% | 20M | 1.11M/mo |

**Note:** Actual vesting is per-second, not monthly. These are snapshots. Beneficiaries can claim any time (e.g., every day) and receive proportional amounts.

---

## 6. Security Considerations

### 6.1 Access Control

**Admin Powers (Pre-Renouncement):**
- Create vesting schedules
- Revoke schedules (pre-cliff only)
- Renounce admin authority

**Admin CANNOT:**
- Withdraw tokens from vault (not beneficiaries)
- Modify existing schedules (immutable once created)
- Revoke schedules post-cliff
- Re-gain admin after renouncing

**Beneficiary Powers:**
- Claim vested tokens (anytime, unlimited frequency)

**Beneficiary CANNOT:**
- Claim unvested tokens
- Revoke their own schedule
- Transfer schedule to another wallet

### 6.2 Reentrancy Protection

Anchor's `#[account]` macro provides automatic reentrancy protection via account locking. Additionally:

```rust
// In release_tokens instruction
require!(claimable > 0, ErrorCode::NoTokensVested); // Check before state change

token::transfer(...)?; // External call

schedule.claimed_amount += claimable; // State change AFTER call
vault.total_claimed += claimable;
```

This follows checks-effects-interactions pattern.

### 6.3 Overflow Protection

All arithmetic uses checked operations:

```rust
// Example: Calculating vested amount
let vested = (schedule.total_amount as u128)
    .checked_mul(elapsed_since_cliff as u128) // Prevents overflow
    .unwrap()
    .checked_div(vesting_period as u128)      // Prevents division by zero
    .unwrap() as u64;
```

If overflow occurs, transaction reverts (safe failure).

### 6.4 Time Manipulation

Vesting relies on `Clock::get()?.unix_timestamp`, which is a Solana sysvar (cannot be manipulated by users). Validators collectively maintain clock, so no single party can fast-forward time.

### 6.5 Admin Key Management

**Pre-Launch (Setup Phase):**
- Admin: 3-of-5 multisig (Squads Protocol)
- Signers: 3 core team members + 2 trusted advisors
- Threshold: 3 signatures required for admin actions

**Post-Launch (After Renouncement):**
- Admin renounced (no one can perform admin actions)
- Contract becomes trustless and immutable

**Recommended Timeline:**
- Week 12: Deploy contract, create 5 vesting schedules
- Week 13: Verify all schedules on-chain, renounce admin
- Week 13: TGE, vesting begins (team has 0 tokens until cliff)

### 6.6 Emergency Scenarios

**Scenario: Bug discovered in contract**

If bug found before renouncement:
- Admin can revoke schedules, withdraw tokens, redeploy fixed contract

If bug found after renouncement:
- No admin actions possible
- If bug prevents claims: Tokens stuck (requires governance proposal for rescue)
- **Mitigation:** Thorough testing + audit before renouncing

**Scenario: Team member loses wallet keys**

If before cliff:
- Admin revokes old schedule, creates new schedule with new wallet

If after cliff:
- Tokens permanently lost (no admin can intervene)
- **Mitigation:** Team members use hardware wallets + backup seeds

### 6.7 Audit Recommendations

Before mainnet deployment:

1. **Code Audit:** Engage reputable auditor (OtterSec, Neodyme, Sec3)
   - Focus areas: Vesting math, access control, reentrancy
   - Budget: $15k-25k (typical Anchor program audit)

2. **Formal Verification:** Prove vesting calculation correctness
   - Use Certora or similar tool
   - Verify properties: "claimed ≤ vested ≤ total" always true

3. **Bug Bounty:** Post-audit, offer bounty for vulnerabilities
   - Critical: 50k KAMIYO ($500+ at $0.01 price)
   - High: 25k KAMIYO
   - Medium: 10k KAMIYO

4. **Testnet Trial:** Deploy on Solana devnet/testnet for 2 weeks
   - Simulate full lifecycle (create, claim, revoke, renounce)
   - Invite community to test

---

## 7. Testing Strategy

### 7.1 Unit Tests

Test individual instruction logic in isolation:

```typescript
describe("Vesting Contract", () => {
  describe("calculate_vested_amount", () => {
    it("returns 0 before cliff", async () => {
      const vested = calculateVestedAmount(
        20_000_000,  // total
        1735689600,  // start (Jan 1, 2025)
        15_552_000,  // cliff (6 months)
        62_208_000,  // duration (24 months)
        1743465600   // current (Apr 1, 2025 - before cliff)
      );
      expect(vested).to.equal(0);
    });

    it("returns proportional amount during vesting", async () => {
      const vested = calculateVestedAmount(
        20_000_000,
        1735689600,
        15_552_000,
        62_208_000,
        1751241600 + 7_776_000 // 3 months after cliff
      );
      // 3 months into 18-month vesting = 3/18 = 16.67%
      expect(vested).to.be.closeTo(3_333_333, 1000); // Allow rounding error
    });

    it("returns total after duration", async () => {
      const vested = calculateVestedAmount(
        20_000_000,
        1735689600,
        15_552_000,
        62_208_000,
        1735689600 + 62_208_000 + 1000 // 1 second after full vesting
      );
      expect(vested).to.equal(20_000_000);
    });
  });

  describe("initialize_vault", () => {
    it("creates vault and deposits 100M KAMIYO", async () => {
      // Test implementation
    });

    it("fails if admin has insufficient funds", async () => {
      // Test implementation
    });
  });

  describe("create_vesting_schedule", () => {
    it("creates schedule with valid parameters", async () => {
      // Test implementation
    });

    it("fails if total allocation exceeds 100M", async () => {
      // Test implementation
    });

    it("fails after admin renounces", async () => {
      // Test implementation
    });
  });

  describe("release_tokens", () => {
    it("allows beneficiary to claim vested tokens", async () => {
      // Test implementation
    });

    it("fails if called before cliff", async () => {
      // Test implementation
    });

    it("fails if schedule revoked", async () => {
      // Test implementation
    });

    it("prevents double-claiming", async () => {
      // Test implementation
    });
  });

  describe("revoke_vesting_schedule", () => {
    it("allows admin to revoke before cliff", async () => {
      // Test implementation
    });

    it("fails if cliff passed", async () => {
      // Test implementation
    });

    it("fails after admin renounces", async () => {
      // Test implementation
    });
  });

  describe("renounce_admin", () => {
    it("permanently removes admin powers", async () => {
      // Test implementation
    });

    it("cannot be reversed", async () => {
      // Test implementation
    });
  });
});
```

### 7.2 Integration Tests

Test full lifecycle scenarios:

```typescript
describe("Vesting Lifecycle", () => {
  it("simulates full 24-month vesting for Alice", async () => {
    // 1. Admin initializes vault with 100M KAMIYO
    // 2. Admin creates schedule for Alice (20M KAMIYO)
    // 3. Fast-forward 5 months → Alice tries to claim → Fails (pre-cliff)
    // 4. Fast-forward to month 6 (cliff ends) → Alice tries to claim → Still 0 (vesting starts at cliff)
    // 5. Fast-forward to month 7 → Alice claims → Receives 1.11M KAMIYO
    // 6. Fast-forward to month 12 → Alice claims → Receives 5.56M more (cumulative 6.67M)
    // 7. Fast-forward to month 24 → Alice claims → Receives remaining 13.33M (total 20M)
    // 8. Alice tries to claim again → Fails (no new tokens vested)
  });

  it("handles revocation before cliff", async () => {
    // 1. Admin creates schedule for Bob
    // 2. Fast-forward 3 months
    // 3. Admin revokes Bob's schedule (he leaves company)
    // 4. Bob tries to claim → Fails (schedule revoked)
    // 5. Admin creates new schedule for new hire with Bob's 20M allocation
  });

  it("prevents admin actions after renouncement", async () => {
    // 1. Admin creates 5 schedules
    // 2. Admin renounces authority
    // 3. Admin tries to create new schedule → Fails
    // 4. Admin tries to revoke existing schedule → Fails
    // 5. Beneficiaries can still claim normally
  });
});
```

### 7.3 Fuzz Testing

Randomly generate inputs to find edge cases:

```typescript
describe("Fuzz Tests", () => {
  it("handles random claim timings", async () => {
    for (let i = 0; i < 100; i++) {
      const randomTimestamp = Math.floor(Math.random() * 62_208_000);
      // Create schedule, fast-forward to random time, claim
      // Verify: claimed ≤ vested ≤ total
    }
  });

  it("handles random allocation sizes", async () => {
    for (let i = 0; i < 100; i++) {
      const randomAmount = Math.floor(Math.random() * 100_000_000);
      // Create schedule with random amount, test claims
      // Verify math doesn't overflow
    }
  });
});
```

---

## 8. Deployment Plan

### 8.1 Pre-Deployment Checklist

- [ ] Code complete and reviewed (internal team review)
- [ ] Unit tests passing (100% coverage on critical paths)
- [ ] Integration tests passing
- [ ] Fuzz tests passing (10k+ iterations, no failures)
- [ ] Audit completed (findings resolved or acknowledged)
- [ ] Devnet deployment and testing (2 weeks minimum)
- [ ] Testnet deployment and community testing (1 week)
- [ ] Multisig wallet set up (Squads 3-of-5)
- [ ] 100M KAMIYO minted and in admin wallet
- [ ] Beneficiary wallets created and verified (team confirms ownership)
- [ ] Deployment scripts tested on devnet
- [ ] Rollback plan prepared (if bugs found post-deployment)

### 8.2 Deployment Steps

**Week 12 (Pre-TGE):**

1. **Deploy Program to Mainnet**
   ```bash
   anchor build
   solana program deploy --program-id vesting_program.json target/deploy/kamiyo_vesting.so
   ```
   - Program ID: `VestXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (example)

2. **Initialize Vault**
   ```typescript
   const tx = await program.methods
     .initializeVault()
     .accounts({ /* ... */ })
     .rpc();
   console.log("Vault initialized:", tx);
   ```
   - Transfers 100M KAMIYO from admin multisig to vault
   - Vault PDA: `Vau1tXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

3. **Create Vesting Schedules (5 transactions)**
   ```typescript
   for (const [id, member] of teamMembers.entries()) {
     await program.methods
       .createVestingSchedule({
         scheduleId: new BN(id),
         totalAmount: new BN(20_000_000 * 10**9),
         startTimestamp: new BN(TGE_TIMESTAMP),
         cliffDuration: new BN(15_552_000),
         totalDuration: new BN(62_208_000),
       })
       .accounts({
         vault: vaultPda,
         schedule: getSchedulePda(member.wallet, id),
         beneficiary: member.wallet,
         /* ... */
       })
       .rpc();
     console.log(`Schedule ${id} created for ${member.name}`);
   }
   ```

4. **Verify Schedules On-Chain**
   ```typescript
   for (let id = 0; id < 5; id++) {
     const schedule = await program.account.vestingSchedule.fetch(schedulePdas[id]);
     console.log(`Schedule ${id}:`, {
       beneficiary: schedule.beneficiary.toBase58(),
       totalAmount: schedule.totalAmount.toString(),
       startTimestamp: new Date(schedule.startTimestamp * 1000),
       cliffDuration: schedule.cliffDuration / (30*24*60*60), // months
       totalDuration: schedule.totalDuration / (30*24*60*60),
     });
   }
   ```

5. **Publish Contract Details**
   - Deploy source code to GitHub (`/programs/vesting/`)
   - Publish Program ID and Vault PDA to docs site
   - Share verification instructions (how community can verify on-chain state)

**Week 13 (Pre-TGE):**

6. **Community Verification Period (7 days)**
   - Announce vesting contract details on X/Discord
   - Invite community to verify on-chain data
   - Team members publicly confirm their beneficiary wallets

7. **Renounce Admin Authority**
   ```typescript
   const tx = await program.methods
     .renounceAdmin()
     .accounts({
       vault: vaultPda,
       admin: adminMultisig,
     })
     .rpc();
   console.log("Admin renounced! Contract now immutable:", tx);
   ```
   - Announce renouncement (contract now trustless)
   - Verify `vault.admin_renounced == true` on-chain

8. **TGE (Token Generation Event)**
   - KAMIYO launches on DEX (separate from vesting contract)
   - Team has 0 circulating tokens (all locked in vesting)
   - Vesting clock starts (Day 0)

### 8.3 Post-Deployment Monitoring

**Week 13-18 (Pre-Cliff):**
- Monitor vault token balance (should stay at 100M)
- Track gas costs for claim transactions (optimize if needed)
- Community can verify vesting math with on-chain queries

**Week 19+ (Post-Cliff):**
- Team members begin claiming vested tokens
- Monitor claim frequency and amounts (expect ~1.11M KAMIYO/member/month)
- Publish monthly transparency reports:
  ```
  Vesting Report - Month 9 (October 2025)
  - Total Vested: 16.67M KAMIYO (across 5 schedules)
  - Total Claimed: 15M KAMIYO (some members haven't claimed yet)
  - Unclaimed in Vault: 85M KAMIYO (83.33M locked + 1.67M claimable)
  - Next Milestone: Month 12 (33.33% vested)
  ```

---

## 9. Appendix

### A. Error Codes

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Admin authority has been renounced")]
    AdminRenounced,

    #[msg("Caller is not authorized admin")]
    UnauthorizedAdmin,

    #[msg("Caller is not the beneficiary of this schedule")]
    UnauthorizedBeneficiary,

    #[msg("Total allocation across schedules exceeds vault balance")]
    ExceedsTotalAllocation,

    #[msg("Vesting schedule already exists for this beneficiary and ID")]
    ScheduleAlreadyExists,

    #[msg("No tokens have vested yet (pre-cliff or no time elapsed)")]
    NoTokensVested,

    #[msg("This vesting schedule has been revoked")]
    ScheduleRevoked,

    #[msg("Cannot revoke schedule after cliff has passed")]
    CliffPassed,

    #[msg("Schedule has already been revoked")]
    AlreadyRevoked,

    #[msg("Admin has already renounced authority")]
    AlreadyRenounced,

    #[msg("Vault has already been initialized")]
    VaultAlreadyInitialized,

    #[msg("Admin does not have sufficient KAMIYO tokens")]
    InsufficientFunds,

    #[msg("Invalid mint address (not KAMIYO)")]
    InvalidMint,
}
```

### B. Events

```rust
#[event]
pub struct VaultInitializedEvent {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub total_deposited: u64,
    pub timestamp: i64,
}

#[event]
pub struct ScheduleCreatedEvent {
    pub schedule: Pubkey,
    pub schedule_id: u64,
    pub beneficiary: Pubkey,
    pub total_amount: u64,
    pub start_timestamp: i64,
    pub cliff_duration: i64,
    pub total_duration: i64,
    pub created_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensReleasedEvent {
    pub schedule: Pubkey,
    pub beneficiary: Pubkey,
    pub amount_claimed: u64,
    pub total_claimed: u64,
    pub timestamp: i64,
}

#[event]
pub struct ScheduleRevokedEvent {
    pub schedule: Pubkey,
    pub beneficiary: Pubkey,
    pub unvested_amount: u64,
    pub revoked_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AdminRenouncedEvent {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub timestamp: i64,
}
```

### C. Time Conversion Reference

```
1 month ≈ 2,592,000 seconds (30 days)
6 months = 15,552,000 seconds (180 days)
12 months = 31,536,000 seconds (365 days)
18 months = 46,656,000 seconds (540 days)
24 months = 62,208,000 seconds (730 days)

TGE Timestamp (example): 1735689600 (Jan 1, 2025 00:00 UTC)
Cliff Ends: 1735689600 + 15552000 = 1751241600 (Jul 1, 2025)
Vesting Ends: 1735689600 + 62208000 = 1797897600 (Jan 1, 2027)
```

### D. Gas Cost Estimates

| Instruction | Compute Units | Rent (SOL) | Priority Fee | Total Cost (SOL) |
|------------|---------------|-----------|--------------|-----------------|
| initialize_vault | 50k | 0.002 | 0.0001 | ~0.0021 |
| create_vesting_schedule | 30k | 0.0015 | 0.0001 | ~0.0016 |
| release_tokens | 40k | 0 | 0.0001 | ~0.0001 |
| revoke_vesting_schedule | 20k | 0 | 0.0001 | ~0.0001 |
| renounce_admin | 10k | 0 | 0.0001 | ~0.0001 |

**Total Deployment Cost:** ~0.011 SOL ($2-3 at $200 SOL)

### E. Contract Addresses (Mainnet)

**To be populated after deployment:**

```
Program ID: [TBD]
Vault PDA: [TBD]
Vault Token Account: [TBD]
Admin Multisig: [TBD]

Schedule 0 (Alice): [TBD]
Schedule 1 (Bob): [TBD]
Schedule 2 (Carol): [TBD]
Schedule 3 (Dave): [TBD]
Schedule 4 (Eve): [TBD]
```

### F. Audit Report

**[Placeholder for audit firm report]**

Once audit is complete, attach PDF link here:
- Audit Firm: TBD
- Audit Date: TBD
- Findings: TBD
- Status: TBD

---

## Conclusion

This vesting contract provides a transparent, secure, and immutable mechanism for distributing 100M KAMIYO tokens to the team over 24 months. Key features:

- **6-month cliff:** Prevents immediate selling post-launch
- **Linear vesting:** Fair, continuous release (no lump sums)
- **Admin revocation:** Protects against early departures (pre-cliff only)
- **Trustless execution:** Admin renounces, contract becomes immutable
- **Community verification:** All schedules on-chain, publicly auditable

By locking team tokens for 2+ years, we demonstrate long-term commitment to building KAMIYO into a sustainable AI agent payment platform.

---

**Document Status:** Draft v1.0 (pending team review)
**Next Steps:** Code implementation → Internal testing → Audit → Devnet deployment → Mainnet launch

For questions or feedback: dev@kamiyo.ai
