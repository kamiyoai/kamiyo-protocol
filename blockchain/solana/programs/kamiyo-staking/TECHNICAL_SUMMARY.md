# KAMIYO Staking Program - Technical Summary

**Program ID:** `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS`
**Version:** 0.1.0
**Network:** Solana (Devnet/Mainnet)
**Framework:** Anchor 0.30.1
**Token Standard:** SPL Token-2022

---

## Executive Summary

The KAMIYO staking program is a Solana-native smart contract that provides tiered APY rewards for KAMIYO token holders. Built with Anchor framework and compatible with Token-2022, the program implements a revenue-backed staking model where rewards are funded from x402 platform fees (30% allocation).

**Key Features:**
- 4 standardized tiers (Free/Pro/Team/Enterprise) with 10-25% APY
- 14-day unstaking cooldown period (industry standard)
- Minimum stake: 100 KAMIYO (spam prevention)
- No maximum stake (whale-friendly)
- Dynamic tier calculation (instant upgrades/downgrades)
- Revenue-backed sustainability (no inflationary emissions)

---

## Table of Contents

1. [Staking Mechanics](#staking-mechanics)
2. [Tier Structure](#tier-structure)
3. [Reward Calculation](#reward-calculation)
4. [Program Architecture](#program-architecture)
5. [Instruction Overview](#instruction-overview)
6. [Security Considerations](#security-considerations)
7. [x402 Integration](#x402-integration)
8. [Economic Model](#economic-model)
9. [Deployment Guide](#deployment-guide)
10. [Testing Strategy](#testing-strategy)

---

## Staking Mechanics

### How Staking Works

1. **Initialize Pool (One-time)**
   - Admin calls `initialize_pool` to create global staking pool
   - Sets up stake vault and reward vault (PDAs)
   - Configures initial APY rates (10%, 15%, 25%)

2. **User Stakes Tokens**
   - User calls `stake` with KAMIYO amount
   - Tokens transferred from user to stake vault
   - UserStake PDA created/updated with staked amount
   - Tier automatically calculated based on total stake
   - User immediately receives tier benefits (x402 discounts, governance votes)

3. **Rewards Accrue Over Time**
   - Rewards calculated continuously based on:
     - Staked amount
     - Tier APY (10-25%)
     - Time elapsed since last claim
   - Formula: `(staked_amount * apy * time) / (10000 * SECONDS_PER_YEAR)`

4. **User Claims Rewards**
   - User calls `claim_rewards` anytime
   - Pending rewards calculated and transferred from reward vault
   - No lockup on rewards (claim anytime)
   - Rewards can be restaked to increase tier

5. **User Unstakes Tokens**
   - User calls `unstake` to initiate cooldown
   - 14-day cooldown period begins
   - User immediately loses tier benefits
   - Cannot stake more during cooldown

6. **User Withdraws After Cooldown**
   - After 14 days, user calls `withdraw`
   - Staked tokens transferred back to user
   - UserStake account updated (or closed if fully withdrawn)

### Cooldown Period Rationale

**Why 14 days?**
- **Prevents Gaming:** Users can't rapidly stake/unstake to game APY calculations
- **Platform Stability:** Ensures predictable liquidity for reward funding
- **Industry Standard:** Matches major DeFi protocols (Ethereum 2.0, Lido, etc.)
- **Economic Security:** Gives time for governance to detect malicious behavior

**During Cooldown:**
- User loses all tier benefits (fee discounts, governance votes)
- Cannot stake additional tokens
- Cannot claim new rewards (existing rewards still claimable)
- Tier downgraded immediately to reflect active stake only

---

## Tier Structure

Aligned with Phase 1 standardized tiers (Free/Pro/Team/Enterprise):

| Tier | Stake Required | APY | x402 Fee Discount | Governance Weight | Benefits |
|------|---------------|-----|-------------------|-------------------|----------|
| **Free** | 0 KAMIYO | 0% | 0% | 0x (no voting) | Public API access only |
| **Pro** | 1,000 - 9,999 KAMIYO | 10% | 10% | 1x | Basic analytics, email support |
| **Team** | 10,000 - 99,999 KAMIYO | 15% | 20% | 2x | Advanced analytics, priority support, 7-day early access |
| **Enterprise** | 100,000+ KAMIYO | 25% | 30% | 5x | Full suite, dedicated support, beta access, free bridges |

### Tier Calculation Logic

```rust
pub fn calculate_tier(staked_amount: u64) -> Tier {
    const DECIMALS_MULTIPLIER: u64 = 1_000_000_000; // 10^9

    if staked_amount >= 100_000 * DECIMALS_MULTIPLIER {
        Tier::Enterprise // 25% APY
    } else if staked_amount >= 10_000 * DECIMALS_MULTIPLIER {
        Tier::Team       // 15% APY
    } else if staked_amount >= 1_000 * DECIMALS_MULTIPLIER {
        Tier::Pro        // 10% APY
    } else {
        Tier::Free       // 0% APY
    }
}
```

**Key Properties:**
- **Dynamic:** Tier recalculated on every stake/unstake
- **Instant Upgrades:** Stake more to immediately upgrade tier
- **Instant Downgrades:** Unstake/initiate cooldown to immediately downgrade
- **No Hysteresis:** No separate thresholds for upgrading vs downgrading

### Tier Upgrade Examples

**Example 1: Pro → Team**
- User stakes 1,000 KAMIYO → Pro tier (10% APY)
- User stakes additional 9,000 KAMIYO → Team tier (15% APY)
- Total: 10,000 KAMIYO staked
- APY immediately increases from 10% to 15%

**Example 2: Team → Enterprise**
- User stakes 50,000 KAMIYO → Team tier (15% APY)
- User stakes additional 50,000 KAMIYO → Enterprise tier (25% APY)
- Total: 100,000 KAMIYO staked
- APY jumps to 25%, x402 fee discount increases to 30%

---

## Reward Calculation

### Formula

```
rewards = (staked_amount * apy_basis_points * time_elapsed_seconds) / (10000 * SECONDS_PER_YEAR)

where:
- staked_amount: tokens staked (base units, 9 decimals)
- apy_basis_points: 1000 = 10%, 1500 = 15%, 2500 = 25%
- time_elapsed_seconds: seconds since last claim
- SECONDS_PER_YEAR: 31,536,000 (365 days)
```

### Example Calculations

**Example 1: Pro Tier - 1 Year**
- Staked: 5,000 KAMIYO
- Tier: Pro (10% APY = 1000 basis points)
- Time: 1 year (31,536,000 seconds)
- Calculation:
  ```
  rewards = (5,000 * 1e9 * 1000 * 31,536,000) / (10000 * 31,536,000)
          = (5,000 * 1e9 * 1000) / 10000
          = 500 * 1e9
          = 500 KAMIYO
  ```
- **Result:** 500 KAMIYO (10% of 5,000)

**Example 2: Team Tier - 6 Months**
- Staked: 50,000 KAMIYO
- Tier: Team (15% APY = 1500 basis points)
- Time: 6 months (15,768,000 seconds)
- Calculation:
  ```
  rewards = (50,000 * 1e9 * 1500 * 15,768,000) / (10000 * 31,536,000)
          = (50,000 * 1500 * 15,768,000) / (10000 * 31,536,000)
          = 3,750 KAMIYO
  ```
- **Result:** 3,750 KAMIYO (7.5% for half year)

**Example 3: Enterprise Tier - 30 Days**
- Staked: 200,000 KAMIYO
- Tier: Enterprise (25% APY = 2500 basis points)
- Time: 30 days (2,592,000 seconds)
- Calculation:
  ```
  rewards = (200,000 * 1e9 * 2500 * 2,592,000) / (10000 * 31,536,000)
          ≈ 4,109.6 KAMIYO
  ```
- **Result:** ~4,110 KAMIYO (~2.05% for one month)

### Compounding Strategy

Users can **compound rewards** by:
1. Claiming rewards periodically
2. Re-staking claimed rewards
3. Increasing total stake (potential tier upgrade)

**Compounding Example:**
- Initial stake: 9,500 KAMIYO (Pro tier, 10% APY)
- After 1 year: Claim 950 KAMIYO rewards
- Restake 950 KAMIYO → Total: 10,450 KAMIYO
- **Tier upgrade:** Pro → Team (15% APY)
- Year 2 APY now higher due to compounding + tier upgrade

---

## Program Architecture

### Account Structure

#### StakePool (Global PDA)

**Seeds:** `["stake_pool", mint.key()]`

**Fields:**
```rust
pub struct StakePool {
    pub admin: Pubkey,               // Pool authority (governance)
    pub mint: Pubkey,                // KAMIYO mint
    pub stake_vault: Pubkey,         // Vault for staked tokens
    pub reward_vault: Pubkey,        // Vault for reward tokens
    pub total_staked: u64,           // Total KAMIYO staked
    pub total_stakers: u64,          // Number of active stakers
    pub apy_free: u16,               // 0 (basis points)
    pub apy_pro: u16,                // 1000 (10%)
    pub apy_team: u16,               // 1500 (15%)
    pub apy_enterprise: u16,         // 2500 (25%)
    pub cooldown_period: i64,        // 1,209,600 seconds (14 days)
    pub min_stake_amount: u64,       // 100 KAMIYO minimum
    pub created_at: i64,
    pub last_update_timestamp: i64,
    pub reward_per_token_stored: u128,
    pub is_active: bool,
    pub bump: u8,
    pub stake_vault_bump: u8,
    pub reward_vault_bump: u8,
}
```

**Size:** 8 + 32 + 32 + 32 + 32 + 8 + 8 + 2*4 + 8 + 8 + 8 + 8 + 16 + 1*4 = 227 bytes

#### UserStake (Per-user PDA)

**Seeds:** `["user_stake", pool.key(), user.key()]`

**Fields:**
```rust
pub struct UserStake {
    pub owner: Pubkey,                // User wallet
    pub pool: Pubkey,                 // StakePool
    pub staked_amount: u64,           // KAMIYO staked
    pub total_rewards_earned: u64,    // Lifetime rewards
    pub rewards_claimed: u64,         // Claimed rewards
    pub stake_timestamp: i64,         // Initial stake time
    pub last_claim_timestamp: i64,    // Last claim time
    pub tier: Tier,                   // Current tier
    pub reward_debt: u128,            // For calculation
    pub cooldown_end: Option<i64>,    // Cooldown end time
    pub cooldown_amount: u64,         // Amount unstaking
    pub bump: u8,
}
```

**Size:** 8 + 32 + 32 + 8*6 + 1 + 16 + 9 + 8 + 1 = 179 bytes

### PDA Derivations

```rust
// Stake Pool
seeds = ["stake_pool", mint.key()]

// User Stake
seeds = ["user_stake", pool.key(), user.key()]

// Stake Vault (holds staked tokens)
seeds = ["stake_vault", pool.key()]

// Reward Vault (holds reward tokens)
seeds = ["reward_vault", pool.key()]
```

**Why PDAs?**
- **Deterministic:** Same address for same user/pool
- **Secure:** Program owns authority
- **Rent-efficient:** Can be closed for refunds
- **CPI-friendly:** Easy cross-program calls

---

## Instruction Overview

### 1. `initialize_pool`

**Purpose:** Create global staking pool (one-time setup)

**Accounts:**
- Admin (signer, payer)
- KAMIYO mint
- StakePool (PDA, init)
- Stake vault (PDA, init)
- Reward vault (PDA, init)

**Parameters:** None

**Effects:**
- Creates StakePool account
- Initializes vaults
- Sets default APY rates (10%, 15%, 25%)
- Sets cooldown to 14 days
- Sets minimum stake to 100 KAMIYO

**Use Case:** Deploy by treasury admin during Phase 2 launch

---

### 2. `stake`

**Purpose:** Stake KAMIYO tokens to earn rewards

**Accounts:**
- User (signer, payer)
- StakePool
- UserStake (PDA, init_if_needed)
- User token account
- Stake vault

**Parameters:**
- `amount: u64` - Amount to stake (base units)

**Validations:**
- Pool must be active
- Amount ≥ minimum stake (100 KAMIYO)
- User has sufficient balance
- Not in cooldown period

**Effects:**
- Transfers tokens to stake vault
- Creates/updates UserStake
- Calculates new tier
- Updates pool total_staked

**Events:** `StakeEvent`

---

### 3. `claim_rewards`

**Purpose:** Claim accrued staking rewards

**Accounts:**
- User (signer)
- StakePool
- UserStake
- User token account
- Reward vault

**Parameters:** None

**Validations:**
- Pool must be active
- User has staked tokens
- Rewards available to claim
- Reward vault has sufficient balance

**Effects:**
- Calculates pending rewards
- Transfers rewards from vault to user
- Updates last_claim_timestamp
- Increments rewards_claimed

**Events:** `ClaimRewardsEvent`

---

### 4. `unstake`

**Purpose:** Initiate unstaking cooldown period

**Accounts:**
- User (signer)
- StakePool
- UserStake

**Parameters:**
- `amount: u64` - Amount to unstake

**Validations:**
- User has sufficient staked amount
- Not already in cooldown
- Amount > 0

**Effects:**
- Sets cooldown_end timestamp (now + 14 days)
- Immediately downgrades tier
- User loses tier benefits
- Blocks additional staking

**Events:** `UnstakeEvent`

**Important:** Tier benefits lost immediately, not after cooldown

---

### 5. `withdraw`

**Purpose:** Complete withdrawal after cooldown

**Accounts:**
- User (signer)
- StakePool
- UserStake
- User token account
- Stake vault

**Parameters:** None

**Validations:**
- Cooldown period active
- Cooldown period complete (14 days elapsed)
- Stake vault has sufficient balance

**Effects:**
- Transfers tokens from vault to user
- Decrements staked_amount
- Clears cooldown state
- Updates pool total_staked
- Decrements total_stakers if fully withdrawn

**Events:** `WithdrawEvent`

---

### 6. `update_pool` (Admin-only)

**Purpose:** Update pool configuration (governance)

**Accounts:**
- Admin (signer, must match pool.admin)
- StakePool

**Parameters:**
- `new_apy_free: Option<u16>`
- `new_apy_pro: Option<u16>`
- `new_apy_team: Option<u16>`
- `new_apy_enterprise: Option<u16>`
- `new_cooldown_period: Option<i64>`
- `new_min_stake_amount: Option<u64>`
- `new_is_active: Option<bool>`

**Validations:**
- Caller is pool admin
- APY ≤ 100% (10,000 basis points)
- Cooldown > 0
- Min stake > 0

**Effects:**
- Updates specified parameters
- All parameters optional (only update what's provided)

**Events:** `PoolUpdateEvent`

**Use Case:** Governance adjusts APY based on revenue

---

### 7. `fund_pool` (Admin-only)

**Purpose:** Add KAMIYO to reward vault

**Accounts:**
- Admin (signer, must match pool.admin)
- StakePool
- Admin token account
- Reward vault

**Parameters:**
- `amount: u64` - Amount of KAMIYO to add

**Validations:**
- Caller is pool admin
- Amount > 0
- Admin has sufficient balance

**Effects:**
- Transfers KAMIYO from admin to reward vault
- Increases pool's reward capacity

**Events:** `FundPoolEvent`

**Use Case:** Automated script runs daily to fund pool with 30% of x402 revenue

---

## Security Considerations

### 1. Authority Checks

**Admin Actions Protected:**
- `update_pool` requires `admin == pool.admin`
- `fund_pool` requires `admin == pool.admin`
- User actions require `user == user_stake.owner`

**Implementation:**
```rust
#[account(
    constraint = stake_pool.admin == admin.key() @ StakingError::Unauthorized
)]
```

### 2. Overflow Protection

**All arithmetic uses checked operations:**
```rust
user_stake.staked_amount
    .checked_add(amount)
    .ok_or(StakingError::MathOverflow)?
```

**Why?** Prevents integer overflow attacks that could mint free tokens

### 3. Reentrancy Guards

**Anchor provides built-in protection:**
- State changes before external calls (checks-effects-interactions)
- Account validation in derive macros
- No recursive CPI calls

### 4. PDA Validation

**All PDAs verified with seeds:**
```rust
#[account(
    seeds = [STAKE_VAULT_SEED, stake_pool.key().as_ref()],
    bump = stake_pool.stake_vault_bump,
)]
```

**Why?** Prevents fake accounts from being passed

### 5. Reward Vault Solvency

**Check before claims:**
```rust
require!(
    reward_vault.amount >= claimable,
    StakingError::InsufficientRewardFunds
);
```

**Why?** Prevents claiming more than available (graceful degradation)

### 6. Cooldown Enforcement

**Strict timestamp checks:**
```rust
require!(
    clock.unix_timestamp >= cooldown_end,
    StakingError::CooldownNotComplete
);
```

**Why?** Users cannot bypass 14-day wait period

### 7. Mint Validation

**All token accounts must match KAMIYO mint:**
```rust
constraint = user_token_account.mint == mint.key()
```

**Why?** Prevents swapping with fake tokens

---

## x402 Integration

### Backend Integration Flow

1. **User makes x402 API request**
   - Includes `x-wallet-address` header with Solana wallet

2. **x402 middleware checks staking**
   ```python
   stake_info = await staking_service.get_user_stake_info(wallet_address)
   discount_percent = stake_info.discount_percent  # 0, 10, 20, or 30
   ```

3. **Apply fee discount**
   ```python
   original_price = 0.10  # $0.10 base price
   discounted_price = original_price * (1 - discount_percent / 100)
   # Pro tier: $0.09, Team: $0.08, Enterprise: $0.07
   ```

4. **Return 402 response with discount info**
   ```json
   {
     "payment_required": true,
     "amount_usdc": 0.08,
     "discount": {
       "tier": "Team",
       "percent": 20,
       "original_price": 0.10,
       "savings": 0.02
     }
   }
   ```

### Query User Stake (Python)

```python
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
import struct

async def get_user_stake(
    rpc_url: str,
    program_id: str,
    pool_address: str,
    user_wallet: str
) -> dict:
    """Query user stake from Solana"""
    client = AsyncClient(rpc_url)

    # Derive UserStake PDA
    user_key = Pubkey.from_string(user_wallet)
    pool_key = Pubkey.from_string(pool_address)
    program = Pubkey.from_string(program_id)

    seeds = [
        b"user_stake",
        bytes(pool_key),
        bytes(user_key)
    ]

    stake_pda, bump = Pubkey.find_program_address(seeds, program)

    # Fetch account
    account_info = await client.get_account_info(stake_pda)

    if not account_info.value:
        return {"staked_amount": 0, "tier": "Free", "discount": 0}

    # Parse account data
    data = account_info.value.data
    staked_amount = struct.unpack('<Q', data[72:80])[0]  # u64 at offset 72

    # Calculate tier
    if staked_amount >= 100_000 * 1e9:
        tier = "Enterprise"
        discount = 30
    elif staked_amount >= 10_000 * 1e9:
        tier = "Team"
        discount = 20
    elif staked_amount >= 1_000 * 1e9:
        tier = "Pro"
        discount = 10
    else:
        tier = "Free"
        discount = 0

    await client.close()

    return {
        "staked_amount": staked_amount / 1e9,
        "tier": tier,
        "discount_percent": discount
    }
```

### Caching Strategy

**Use Redis to cache stake info:**
- TTL: 5 minutes (balance freshness vs RPC cost)
- Invalidate on stake/unstake events (webhook)
- Cache key: `stake_info:{wallet_address}`

**Why?** Reduces Solana RPC calls from hundreds per second to dozens

---

## Economic Model

### Revenue-Backed Rewards

**x402 Fee Allocation (Phase 1 spec):**
```
100% Platform Revenue (USDC)
│
├─ 30% → Staking Rewards (converted to KAMIYO)
├─ 20% → Development & Operations
├─ 15% → Marketing & Growth
├─ 15% → Treasury Reserve
├─ 10% → Token Buyback (for reward conversion)
└─ 10% → Team & Contributors
```

### Daily Funding Process

**Automated Script (Cron Job):**
1. Calculate yesterday's x402 revenue (USDC)
2. Allocate 30% to staking rewards
3. Buy KAMIYO on DEX (Jupiter aggregator)
4. Call `fund_pool` to add KAMIYO to reward vault
5. Log transaction for transparency

**Example:**
- Daily revenue: $1,000 USDC
- Staking allocation: $300 USDC (30%)
- KAMIYO price: $0.01
- Tokens purchased: 30,000 KAMIYO
- Fund reward vault with 30,000 KAMIYO

### APY Sustainability

**Target APY: 10-25%**

**Sustainable if:**
```
Annual_Reward_Pool / Total_Staked_Value ≈ 0.10 to 0.25

Example:
- Annual x402 revenue: $120,000 ($10k/month)
- Staking allocation: $36,000 (30%)
- KAMIYO price: $0.01
- Tokens purchased: 3,600,000 KAMIYO/year
- Total staked: 250M KAMIYO (25% of 1B supply)
- Staked value: $2,500,000
- APY: $36,000 / $2,500,000 = 14.4% ✓
```

**If revenue too low → Admin can adjust APY via `update_pool`**

---

## Deployment Guide

### Prerequisites

1. **Solana CLI installed** (v1.18+)
2. **Anchor CLI installed** (v0.30.1)
3. **Keypairs:**
   - Admin wallet (pool authority)
   - Payer wallet (for deployment)
4. **KAMIYO mint address** (Token-2022)

### Step 1: Build Program

```bash
cd /Users/dennisgoslar/Projekter/kamiyo/solana-programs
anchor build
```

### Step 2: Deploy to Devnet

```bash
# Set network
solana config set --url https://api.devnet.solana.com

# Airdrop SOL for deployment (devnet only)
solana airdrop 2 <PAYER_PUBKEY>

# Deploy program
anchor deploy

# Note the Program ID
```

### Step 3: Initialize Pool

```bash
anchor run initialize-pool --provider.cluster devnet
```

**Or via TypeScript:**

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { KAMIYOStaking } from "../target/types/kamiyo_staking";

async function initializePool() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.KAMIYOStaking as Program<KAMIYOStaking>;
  const kamiyoMint = new PublicKey("YOUR_KAMIYO_MINT");

  // Derive PDAs
  const [stakePool] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake_pool"), kamiyoMint.toBuffer()],
    program.programId
  );

  const [stakeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake_vault"), stakePool.toBuffer()],
    program.programId
  );

  const [rewardVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_vault"), stakePool.toBuffer()],
    program.programId
  );

  // Initialize
  const tx = await program.methods
    .initializePool()
    .accounts({
      admin: provider.wallet.publicKey,
      mint: kamiyoMint,
      stakePool,
      stakeVault,
      rewardVault,
    })
    .rpc();

  console.log("Pool initialized:", tx);
}
```

### Step 4: Fund Reward Vault

```bash
# Transfer KAMIYO to reward vault for initial rewards
spl-token transfer <KAMIYO_MINT> 1000000 <REWARD_VAULT> --fund-recipient
```

**Or use `fund_pool` instruction:**

```typescript
await program.methods
  .fundPool(new anchor.BN(1_000_000 * 1e9)) // 1M KAMIYO
  .accounts({
    admin: provider.wallet.publicKey,
    stakePool,
    adminTokenAccount,
    rewardVault,
    mint: kamiyoMint,
  })
  .rpc();
```

### Step 5: Verify Deployment

```bash
# Check pool account
solana account <STAKE_POOL_PUBKEY>

# Check vault balances
spl-token account-info <STAKE_VAULT>
spl-token account-info <REWARD_VAULT>
```

---

## Testing Strategy

### Unit Tests (Rust)

**Test tier calculation:**
```rust
#[test]
fn test_tier_calculation() {
    assert_eq!(calculate_tier(0), Tier::Free);
    assert_eq!(calculate_tier(1_000 * 1_000_000_000), Tier::Pro);
    assert_eq!(calculate_tier(10_000 * 1_000_000_000), Tier::Team);
    assert_eq!(calculate_tier(100_000 * 1_000_000_000), Tier::Enterprise);
}
```

**Test reward calculation:**
```rust
#[test]
fn test_rewards_after_one_year() {
    let staked = 10_000 * 1_000_000_000; // 10k KAMIYO
    let apy = 1500; // 15%
    let time = 31_536_000; // 1 year

    let rewards = calculate_rewards(staked, apy, time);
    assert_eq!(rewards, 1_500 * 1_000_000_000); // 1.5k KAMIYO
}
```

### Integration Tests (TypeScript)

**Test full stake/claim/unstake flow:**

```typescript
describe("Staking Flow", () => {
  it("should stake, earn rewards, and withdraw", async () => {
    // 1. Stake 10,000 KAMIYO
    await program.methods
      .stake(new BN(10_000 * 1e9))
      .accounts({ user, stakePool, userStake, ... })
      .rpc();

    // 2. Wait 30 days (simulated)
    await sleep(30 * 86400 * 1000);

    // 3. Claim rewards
    const claimTx = await program.methods
      .claimRewards()
      .accounts({ user, userStake, rewardVault, ... })
      .rpc();

    // 4. Check rewards received (~2% of 10k = 200 KAMIYO)
    const userBalance = await getTokenBalance(userTokenAccount);
    expect(userBalance).toBeGreaterThan(200 * 1e9);

    // 5. Unstake
    await program.methods
      .unstake(new BN(10_000 * 1e9))
      .accounts({ user, userStake, ... })
      .rpc();

    // 6. Wait 14 days
    await sleep(14 * 86400 * 1000);

    // 7. Withdraw
    await program.methods
      .withdraw()
      .accounts({ user, userStake, stakeVault, ... })
      .rpc();

    // 8. Verify balance restored
    const finalBalance = await getTokenBalance(userTokenAccount);
    expect(finalBalance).toBeGreaterThan(10_000 * 1e9);
  });
});
```

### Load Testing

**Simulate 1000 concurrent stakers:**
```bash
# Use Solana test validator with realistic conditions
solana-test-validator --reset

# Run load test script
ts-node tests/load_test.ts
```

---

## Design Decisions & Rationale

### 1. Why 14-Day Cooldown?

**Prevents Gaming:**
- Users can't stake for 1 day, claim rewards, unstake immediately
- Ensures long-term commitment

**Economic Stability:**
- Predictable liquidity for treasury to fund rewards
- Time for governance to detect malicious behavior

**Industry Standard:**
- Ethereum 2.0: 27 days
- Lido: 1-3 days
- Rocket Pool: 14 days
- **KAMIYO: 14 days (balanced)**

### 2. Why Immediate Tier Downgrade on Unstake?

**Prevents Abuse:**
- User can't unstake 99% but keep tier benefits for 14 days
- Fee discounts reflect actual stake commitment

**Fairness:**
- Users not staking don't get benefits
- Users exiting shouldn't get prolonged benefits

**Implementation:**
```rust
// On unstake, tier calculated from active stake only
let active_stake = user_stake.staked_amount - cooldown_amount;
user_stake.tier = calculate_tier(active_stake);
```

### 3. Why Per-Second Reward Calculation?

**Precision:**
- More accurate than per-epoch or daily snapshots
- Fair for users staking/unstaking mid-period

**Simplicity:**
- Linear calculation: `time_elapsed * apy_rate`
- No complex checkpointing

**Gas Efficiency:**
- Calculated on-demand (no storage of historical rates)

### 4. Why No Maximum Stake?

**Whale-Friendly:**
- Large holders can participate fully
- No artificial caps on participation

**Governance:**
- High stakers get 5x voting weight (Enterprise tier)
- Aligns incentives (more stake = more invested in success)

**Economic Model:**
- If whales stake too much → APY naturally decreases
- Self-balancing mechanism

### 5. Why Separate Stake and Reward Vaults?

**Accounting Clarity:**
- Staked tokens: user's principal
- Reward tokens: platform-funded incentives
- Easy to audit and verify solvency

**Security:**
- Prevents commingling of user funds and rewards
- Reward exhaustion doesn't affect staked tokens

---

## Integration Notes for x402 Backend

### 1. Check User Stake for Fee Discount

**Endpoint:** `GET /x402/staking/info/{wallet_address}`

**Response:**
```json
{
  "wallet_address": "ABC123...",
  "staked_amount": 50000,
  "tier": "Team",
  "discount_percent": 20,
  "apy_percent": 15,
  "governance_weight": 2,
  "priority_level": "priority"
}
```

### 2. Apply Discount in Middleware

```python
# Before payment verification
stake_info = await staking_service.get_user_stake_info(wallet)
if stake_info.discount_percent > 0:
    discounted_price = base_price * (1 - stake_info.discount_percent / 100)
```

### 3. Log Discount Usage

```python
# Track discount metrics
await db.record_discount_usage(
    wallet=wallet,
    tier=stake_info.tier,
    original_price=base_price,
    discounted_price=final_price,
    savings=base_price - final_price
)
```

### 4. Daily Reward Funding

**Automated Script (runs daily at 2 AM UTC):**

```python
# 1. Calculate yesterday's revenue
revenue = await get_daily_revenue(yesterday)

# 2. Allocate 30% to staking
allocation = revenue * 0.30

# 3. Buy KAMIYO on Jupiter
kamiyo_purchased = await buy_kamiyo_on_dex(allocation)

# 4. Fund reward vault
await fund_staking_pool(kamiyo_purchased)

# 5. Log for transparency
await log_staking_funding(date, revenue, allocation, kamiyo_purchased)
```

---

## Glossary

**APY:** Annual Percentage Yield - interest rate earned per year
**Basis Points:** 1/100th of a percent (1000 basis points = 10%)
**PDA:** Program Derived Address - deterministic address owned by program
**CPI:** Cross-Program Invocation - calling another program from your program
**Token-2022:** New Solana token standard with advanced features (transfer fees, etc.)
**Cooldown:** Waiting period before tokens can be withdrawn
**Tier:** Classification of staker based on stake amount
**Vault:** Token account owned by program for holding funds

---

## Support & Resources

**Documentation:**
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Token-2022 Guide](https://spl.solana.com/token-2022)

**Phase 1 Specifications:**
- `docs/phase1/staking_specification.md` - Complete staking spec
- `docs/phase1/STANDARDIZED_STAKING_TIERS.md` - Tier structure
- `docs/phase1/x402_staking_integration.md` - Backend integration

**Deployment:**
- Devnet Program ID: `TBD`
- Mainnet Program ID: `TBD`
- Admin Wallet: `TBD`

**Contact:**
- Discord: [KAMIYO Community](https://discord.gg/kamiyo)
- Email: dev@kamiyo.ai

---

**End of Technical Summary**
