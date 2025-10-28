# KAMIYO Airdrop Program - Technical Summary

## Overview

The KAMIYO Airdrop Program is a Solana smart contract built with Anchor that distributes 100 million KAMIYO tokens (10% of total supply) to community members based on their participation in the Align-to-Earn points system.

**Key Innovation:** Uses merkle tree verification for gas-efficient, scalable token distribution without storing the full eligibility list on-chain.

## Table of Contents

1. [Architecture](#architecture)
2. [How Merkle Trees Work](#how-merkle-trees-work)
3. [Program Instructions](#program-instructions)
4. [Account Structures](#account-structures)
5. [Claim Process Flow](#claim-process-flow)
6. [Points System Integration](#points-system-integration)
7. [Security Features](#security-features)
8. [Multi-Phase Airdrop Support](#multi-phase-airdrop-support)
9. [Deployment Guide](#deployment-guide)
10. [Frontend Integration](#frontend-integration)
11. [Testing Strategy](#testing-strategy)
12. [Cost Analysis](#cost-analysis)

---

## Architecture

### Program Structure

```
programs/kamiyo-airdrop/
├── src/
│   ├── lib.rs                    # Program entry point
│   ├── state.rs                  # Account structures & events
│   ├── errors.rs                 # Custom error types
│   ├── constants.rs              # Constants (claim period, caps)
│   ├── utils.rs                  # Merkle proof verification
│   └── instructions/
│       ├── mod.rs                # Instruction exports
│       ├── initialize.rs         # Setup airdrop config
│       ├── claim.rs              # User claims allocation
│       ├── update_merkle_root.rs # Update for new phases
│       ├── reclaim_unclaimed.rs  # Admin reclaims after 90 days
│       └── close_airdrop.rs      # Cleanup after completion
├── Cargo.toml                    # Dependencies
└── TECHNICAL_SUMMARY.md          # This file
```

### Key Components

**On-Chain Storage:**
- `AirdropConfig` (PDA): Global config with merkle root
- `ClaimStatus` (PDA per user): Records completed claims

**Off-Chain Data:**
- Merkle tree with all allocations
- Individual proofs for each eligible wallet

**Dependencies:**
- `anchor-lang 0.30.1`: Framework for Solana programs
- `anchor-spl 0.30.1`: SPL token integrations
- `solana-program 1.18`: Keccak256 hashing

---

## How Merkle Trees Work

### What is a Merkle Tree?

A merkle tree is a binary tree where:
- **Leaves**: Hash of (wallet address + allocation amount)
- **Branches**: Hash of two child nodes
- **Root**: Single 32-byte hash representing the entire tree

### Why Use Merkle Trees for Airdrops?

**Traditional Approach (Inefficient):**
```
Store each wallet on-chain:
- 20,000 wallets × 72 bytes per account = 1.44 MB
- Cost: ~14.4 SOL rent (~$2,160 at $150/SOL)
- Requires complex account management
```

**Merkle Tree Approach (Efficient):**
```
Store only merkle root:
- 1 merkle root × 32 bytes = 32 bytes
- Cost: ~0.002 SOL (~$0.30)
- 96%+ cost savings
- Users provide proofs when claiming (zero on-chain storage)
```

### Merkle Tree Example

```
Tree with 4 users:

                    ROOT (0a1b2c3d...)
                   /                  \
           H12 (4f5e6d...)      H34 (9a8b7c...)
           /          \          /          \
    H1 (abc...)  H2 (def...)  H3 (ghi...)  H4 (jkl...)
        |           |           |           |
    User A      User B      User C      User D
   1000 KMY    500 KMY    2000 KMY    750 KMY
```

**User A's Merkle Proof:**
- Proof: `[H2, H34]`
- Verification:
  1. Compute H1 = keccak256(UserA_wallet || 1000_lamports)
  2. Compute H12 = keccak256(sort(H1, H2))
  3. Compute ROOT = keccak256(sort(H12, H34))
  4. Check if computed ROOT == stored ROOT ✓

### Hashing Algorithm

**Leaf Node:**
```rust
fn create_leaf(wallet: Pubkey, amount: u64) -> [u8; 32] {
    let mut data = Vec::new();
    data.extend_from_slice(wallet.as_ref());      // 32 bytes
    data.extend_from_slice(&amount.to_le_bytes()); // 8 bytes (LE u64)
    keccak::hash(&data).to_bytes()                 // 32-byte hash
}
```

**Branch Node:**
```rust
fn hash_pair(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    // Sort for deterministic ordering
    let (first, second) = if left <= right {
        (left, right)
    } else {
        (right, left)
    };

    let mut data = Vec::new();
    data.extend_from_slice(&first);
    data.extend_from_slice(&second);
    keccak::hash(&data).to_bytes()
}
```

### Why Keccak256?

- **Solana Native**: `solana_program::keccak` is a builtin function
- **Gas Efficient**: Optimized for on-chain verification
- **Collision Resistant**: 256-bit hash space (2^256 possibilities)
- **Deterministic**: Same inputs always produce same hash

---

## Program Instructions

### 1. Initialize

**Purpose:** Set up the airdrop with merkle root and claim period

**Authority:** Admin only (one-time)

**Parameters:**
- `merkle_root: [u8; 32]` - Root hash from off-chain tree generation

**Accounts:**
```rust
#[account(mut)] admin: Signer
#[account(init)] airdrop_config: PDA
mint: KAMIYO Token-2022 mint
vault: Token account with 100M KAMIYO
```

**Logic:**
1. Create AirdropConfig PDA
2. Store merkle root
3. Set claim period (now → now + 90 days)
4. Set total allocation (100M KAMIYO)
5. Mark as active

**Example CLI:**
```bash
anchor run initialize \
  --merkle-root 0xa1b2c3d4... \
  --vault <VAULT_PUBKEY>
```

---

### 2. Claim

**Purpose:** User claims their airdrop allocation

**Authority:** Any eligible user (once per wallet)

**Parameters:**
- `amount: u64` - Allocation in lamports (from points calculation)
- `proof: Vec<[u8; 32]>` - Merkle proof (array of sibling hashes)

**Accounts:**
```rust
#[account(mut)] claimant: Signer
#[account(mut)] airdrop_config: PDA
#[account(init)] claim_status: PDA (prevents double-claim)
vault_authority: PDA signer
#[account(mut)] vault: Token account
#[account(mut)] claimant_token_account: User's token account
```

**Logic:**
1. Check airdrop is active
2. Check claim period (start ≤ now ≤ end)
3. Validate amount (100 ≤ amount ≤ 10,000 KAMIYO)
4. **Verify merkle proof** (critical security check)
5. Transfer tokens from vault to claimant
6. Create ClaimStatus PDA (prevents future double-claims)
7. Update statistics (total_claimed, total_claimants)
8. Emit ClaimEvent

**Merkle Verification:**
```rust
let leaf = create_leaf(claimant.key(), amount);
require!(
    verify_merkle_proof(leaf, proof, config.merkle_root),
    AirdropError::InvalidProof
);
```

**Example Transaction:**
```typescript
await program.methods
  .claim(new BN(amount), proof)
  .accounts({
    claimant: wallet.publicKey,
    airdropConfig,
    claimStatus,
    vault,
    claimantTokenAccount,
    // ...
  })
  .rpc();
```

---

### 3. Update Merkle Root

**Purpose:** Update merkle root for multi-phase airdrops

**Authority:** Admin only

**Parameters:**
- `new_merkle_root: [u8; 32]` - New root for Phase 2/3

**Use Cases:**
- **Phase 1** (Week 14): Early supporters
- **Phase 2** (Week 16): Add beta testers
- **Phase 3** (Week 18): Add community contributors

**Logic:**
1. Check admin authorization
2. Check airdrop still active
3. Update merkle root
4. Emit UpdateMerkleRootEvent (transparency)

**Note:** Users who already claimed (have ClaimStatus) cannot claim again even with new root.

---

### 4. Reclaim Unclaimed

**Purpose:** Admin reclaims unclaimed tokens after 90 days

**Authority:** Admin only (after claim period expires)

**Logic:**
1. Check admin authorization
2. Check claim period expired (now > claim_end)
3. Transfer all remaining vault balance to admin
4. Mark airdrop as inactive
5. Emit ReclaimEvent with statistics

**Expected Unclaimed Rate:** 10-15% (typical for airdrops)

**Example:**
- 100M allocated
- 85M claimed by users
- 15M reclaimed by admin → returned to treasury

---

### 5. Close Airdrop

**Purpose:** Close and cleanup after completion

**Authority:** Admin only (after reclaim)

**Logic:**
1. Check admin authorization
2. Check airdrop inactive (tokens already reclaimed)
3. Emit CloseAirdropEvent with final stats
4. Close AirdropConfig account (return rent to admin)

**Note:** Individual ClaimStatus accounts remain for historical record.

---

## Account Structures

### AirdropConfig (Global PDA)

**PDA Seeds:** `[b"airdrop", mint.key().as_ref()]`

**Size:** 162 bytes

```rust
pub struct AirdropConfig {
    pub admin: Pubkey,           // Admin authority
    pub mint: Pubkey,            // KAMIYO mint
    pub vault: Pubkey,           // Token vault
    pub merkle_root: [u8; 32],   // Eligibility tree root
    pub claim_start: i64,        // Unix timestamp
    pub claim_end: i64,          // Unix timestamp (start + 90 days)
    pub total_allocation: u64,   // 100M KAMIYO (lamports)
    pub total_claimed: u64,      // Amount claimed so far
    pub total_claimants: u64,    // Number of claimers
    pub is_active: bool,         // Active status
    pub bump: u8,                // PDA bump
}
```

**Purpose:**
- Stores merkle root for verification
- Tracks claim period timing
- Accumulates distribution statistics
- Controls active/inactive state

---

### ClaimStatus (Per-User PDA)

**PDA Seeds:** `[b"claim", airdrop_config.key().as_ref(), claimant.key().as_ref()]`

**Size:** 57 bytes

```rust
pub struct ClaimStatus {
    pub claimant: Pubkey,    // User who claimed
    pub amount: u64,         // Amount claimed
    pub claimed_at: i64,     // Unix timestamp
    pub bump: u8,            // PDA bump
}
```

**Purpose:**
- **Double-Claim Prevention:** Account existence = already claimed
- **Historical Record:** Permanent proof of claim
- **Audit Trail:** Track who claimed when

**Key Property:** Created via `init` constraint, ensuring it doesn't exist before first claim.

---

## Claim Process Flow

### Step-by-Step User Journey

```
1. User Action: Visit claim.kamiyo.ai
   └─> Connects wallet (Phantom/Solflare)

2. Frontend: Check eligibility
   ├─> Fetch merkle proof from API/JSON
   └─> Show: "You're eligible for 5,000 KAMIYO"

3. User Action: Click "Claim Airdrop"
   └─> Signs transaction

4. On-Chain: Claim instruction execution
   ├─> Verify merkle proof ✓
   ├─> Check claim period ✓
   ├─> Check not already claimed ✓
   └─> Transfer tokens from vault to user

5. State Update:
   ├─> Create ClaimStatus PDA
   ├─> Increment total_claimed
   └─> Emit ClaimEvent

6. Frontend: Show success
   └─> "Successfully claimed 5,000 KAMIYO!"
   └─> Link to transaction on Solscan
```

### Detailed Transaction Flow

```typescript
// 1. Get user's proof
const proofData = await fetch(`/api/airdrop/proof/${wallet.publicKey}`)
  .then(r => r.json());

if (!proofData.eligible) {
  alert("You're not eligible for the airdrop");
  return;
}

// 2. Derive PDAs
const [airdropConfig] = PublicKey.findProgramAddressSync(
  [Buffer.from("airdrop"), mint.toBuffer()],
  program.programId
);

const [claimStatus] = PublicKey.findProgramAddressSync(
  [Buffer.from("claim"), airdropConfig.toBuffer(), wallet.publicKey.toBuffer()],
  program.programId
);

const [vaultAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault_authority"), airdropConfig.toBuffer()],
  program.programId
);

// 3. Get user's token account (or create if doesn't exist)
const claimantTokenAccount = await getAssociatedTokenAddress(
  mint,
  wallet.publicKey,
  false,
  TOKEN_2022_PROGRAM_ID
);

// 4. Build and send transaction
const tx = await program.methods
  .claim(
    new BN(proofData.amount),  // Amount in lamports
    proofData.proof.map(h => Buffer.from(h, 'hex'))  // Proof array
  )
  .accounts({
    claimant: wallet.publicKey,
    airdropConfig,
    claimStatus,
    vaultAuthority,
    vault,
    claimantTokenAccount,
    mint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("Claim successful! TX:", tx);
```

### Error Handling

**Common Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| `ClaimNotStarted` | Claim period hasn't begun | Wait until claim_start |
| `ClaimExpired` | 90 days elapsed | Airdrop ended, tokens reclaimed |
| `InvalidProof` | Wrong proof or amount | Verify proof matches wallet |
| `AlreadyClaimed` | ClaimStatus exists | User already claimed |
| `AllocationExceedsMaximum` | Amount > 10,000 KAMIYO | Cap enforced, check allocation |
| `AllocationBelowMinimum` | Amount < 100 KAMIYO | Below minimum threshold |

---

## Points System Integration

### Align-to-Earn Mechanics

The airdrop allocation is determined by the points system (Phase 4: Align-to-Earn).

**Point Sources:**

| Activity | Points | Frequency | Verification |
|----------|--------|-----------|--------------|
| Twitter follow @KamiyoHQ | 50 | 1x | OAuth API |
| Discord join | 50 | 1x | Bot verification |
| Retweet announcement | 25 | 1x | API check |
| Quality reply | 10 | 5/day max | Manual review |
| First x402 payment | 100 | 1x | On-chain tx |
| Each x402 payment | 5 | Unlimited | On-chain tx |
| Testnet staking | 200 | 1x | On-chain check |
| Referral (completed) | 100 | Unlimited | Both users active |
| Early adopter (Week 14) | 500 | 1x | Signup timestamp |

**Total Potential:** 5,000+ points for power users

### Allocation Formula

```python
def calculate_allocation(user_points, total_points):
    """
    Calculate user's KAMIYO allocation based on points

    Args:
        user_points: Points earned by user
        total_points: Points across all eligible users

    Returns:
        Allocation in KAMIYO tokens (not lamports)
    """
    # Base allocation (proportional share)
    base_allocation = (user_points / total_points) * 100_000_000

    # Apply caps
    allocation = max(100, min(base_allocation, 10_000))

    return allocation
```

**Example Calculations:**

| User Points | Total Points | Base Allocation | Final Allocation |
|-------------|-------------|----------------|------------------|
| 5,000 | 10,000,000 | 50,000 | 10,000 (capped) |
| 2,500 | 10,000,000 | 25,000 | 10,000 (capped) |
| 1,000 | 10,000,000 | 10,000 | 10,000 |
| 500 | 10,000,000 | 5,000 | 5,000 |
| 50 | 10,000,000 | 500 | 500 |
| 10 | 10,000,000 | 100 | 100 (minimum) |

### Off-Chain Data Pipeline

```
1. Points Accumulation (Weeks 14-18)
   ├─> Database tracks user actions
   ├─> Points calculated in real-time
   └─> Anti-sybil filters applied

2. Allocation Calculation (Week 19)
   ├─> Query all eligible users (points >= 100)
   ├─> Apply risk scoring (fraud detection)
   ├─> Calculate proportional allocations
   └─> Apply min/max caps

3. Merkle Tree Generation
   ├─> Export allocations to CSV
   ├─> Run generate-merkle-tree script
   ├─> Generate proofs for each user
   └─> Store merkle root + proofs

4. On-Chain Initialization
   ├─> Call initialize with merkle root
   ├─> Fund vault with 100M KAMIYO
   └─> Open claims (Week 19)

5. Claims Distribution
   ├─> Users fetch proofs from API
   ├─> Submit claims on-chain
   └─> Statistics tracked in AirdropConfig
```

### Anti-Sybil Filters

Before generating the merkle tree, filter eligible users:

```python
def filter_eligible_users(user_points):
    eligible = []

    for user in user_points:
        # Minimum points threshold
        if user.total_points < 100:
            continue

        # Twitter verification
        if not user.twitter_verified:
            continue
        if user.twitter_account_age < 30:  # days
            continue

        # Discord verification
        if not user.discord_verified:
            continue

        # Risk score (fraud detection)
        if user.risk_score > 0.7:
            continue

        # IP clustering
        if user.same_ip_count > 5:
            continue

        eligible.append(user)

    return eligible
```

**Expected Sybil Rate:** 5-10% (acceptable loss vs viral growth)

---

## Security Features

### 1. Merkle Proof Verification

**Protection:** Prevents unauthorized claims

**Implementation:**
```rust
let leaf = create_leaf(claimant.key(), amount);
require!(
    verify_merkle_proof(leaf, proof, config.merkle_root),
    AirdropError::InvalidProof
);
```

**Attack Scenarios:**
- ❌ User A tries to claim User B's allocation
  - Fails: User A's wallet doesn't match leaf hash
- ❌ User claims 10x their actual allocation
  - Fails: Amount doesn't match leaf hash
- ❌ User provides fake proof
  - Fails: Computed root != stored root

### 2. Double-Claim Prevention

**Protection:** One claim per wallet

**Implementation:**
```rust
#[account(
    init,  // Fails if account already exists
    payer = claimant,
    space = ClaimStatus::LEN,
    seeds = [CLAIM_SEED, airdrop_config.key().as_ref(), claimant.key().as_ref()],
    bump
)]
pub claim_status: Account<'info, ClaimStatus>
```

**Attack Scenarios:**
- ❌ User claims twice
  - Fails: ClaimStatus PDA already exists
- ❌ User creates ClaimStatus before claiming
  - Fails: Anchor `init` constraint prevents pre-creation

### 3. Time-Based Access Control

**Protection:** Claims only within 90-day window

**Implementation:**
```rust
let clock = Clock::get()?;
require!(
    clock.unix_timestamp >= config.claim_start,
    AirdropError::ClaimNotStarted
);
require!(
    clock.unix_timestamp <= config.claim_end,
    AirdropError::ClaimExpired
);
```

**Attack Scenarios:**
- ❌ User claims before airdrop opens
  - Fails: Clock timestamp < claim_start
- ❌ User claims after 90 days
  - Fails: Clock timestamp > claim_end

### 4. Authority Management

**Protection:** Only admin can update root or reclaim

**Implementation:**
```rust
require!(
    ctx.accounts.admin.key() == config.admin,
    AirdropError::Unauthorized
);
```

**Attack Scenarios:**
- ❌ Random user tries to update merkle root
  - Fails: Not admin authority
- ❌ Random user tries to reclaim tokens
  - Fails: Not admin authority

### 5. Allocation Limits

**Protection:** Min/max caps prevent abuse

**Implementation:**
```rust
require!(
    amount >= MIN_ALLOCATION_TO_CLAIM,  // 100 KAMIYO
    AirdropError::AllocationBelowMinimum
);
require!(
    amount <= MAX_ALLOCATION_PER_WALLET,  // 10,000 KAMIYO
    AirdropError::AllocationExceedsMaximum
);
```

**Attack Scenarios:**
- ❌ User claims 0.01 KAMIYO (dust attack)
  - Fails: Below minimum
- ❌ User claims 1M KAMIYO (whale concentration)
  - Fails: Exceeds maximum

### 6. Reentrancy Protection

**Protection:** Anchor CPI guards prevent reentrancy

**Built-in:** Anchor framework handles this automatically

### 7. Arithmetic Safety

**Protection:** Checked math prevents overflows

**Implementation:**
```rust
config.total_claimed = config.total_claimed
    .checked_add(amount)
    .ok_or(AirdropError::MathOverflow)?;
```

---

## Multi-Phase Airdrop Support

### Use Case

Distribute tokens in multiple phases:

**Phase 1 (Week 14):** Early supporters - 40M KAMIYO
**Phase 2 (Week 16):** Beta testers - 30M KAMIYO
**Phase 3 (Week 18):** Community contributors - 30M KAMIYO

### Implementation

#### Phase 1 Launch

```bash
# Generate Phase 1 merkle tree
python generate_merkle_tree.py phase1-allocations.csv phase1-tree.json

# Initialize with Phase 1 root
anchor run initialize \
  --merkle-root $(cat phase1-tree.json | jq -r '.merkleRoot')

# Users claim during Week 14-15
```

#### Phase 2 Update

```bash
# Combine Phase 1 + new Phase 2 users
cat phase1-allocations.csv phase2-new-users.csv > phase2-combined.csv

# Generate new merkle tree
python generate_merkle_tree.py phase2-combined.csv phase2-tree.json

# Update merkle root on-chain
anchor run update-merkle-root \
  --merkle-root $(cat phase2-tree.json | jq -r '.merkleRoot')

# Phase 2 users can now claim
```

#### Phase 3 Update

Same process as Phase 2, combining all previous users + new Phase 3 users.

### Important Notes

1. **No Double Claims:** Users who claimed in Phase 1 cannot claim again in Phase 2 (ClaimStatus prevents it)

2. **Proof Updates:** Each phase generates new proofs. Users who didn't claim in Phase 1 need Phase 2 proof (not Phase 1 proof) if root was updated.

3. **Vault Management:** Ensure vault always has enough tokens for remaining allocations

### Multi-Phase Strategy

**Option A: Additive Phases**
- Phase 1: 1,000 users, 40M KAMIYO
- Phase 2: +500 new users, 30M KAMIYO (total 1,500 users)
- Phase 3: +500 new users, 30M KAMIYO (total 2,000 users)
- Total: 100M KAMIYO across 2,000 users

**Option B: Bonus Phases**
- Phase 1: All eligible users (2,000), 70M KAMIYO
- Phase 2: Bonus for active users (500), 15M KAMIYO
- Phase 3: Bonus for super users (100), 15M KAMIYO
- Total: 100M KAMIYO, but some users get multiple bonuses

With Option B, use separate airdrop programs per phase to allow multiple claims.

---

## Deployment Guide

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
```

### Step 1: Build Program

```bash
cd solana-programs
anchor build

# Program ID will be in target/deploy/kamiyo_airdrop-keypair.json
```

### Step 2: Deploy to Devnet

```bash
# Configure Solana CLI for devnet
solana config set --url https://api.devnet.solana.com

# Airdrop SOL for deployment
solana airdrop 2

# Deploy program
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show <PROGRAM_ID>
```

### Step 3: Create Token Vault

```bash
# Create Token-2022 account for vault
spl-token create-account <KAMIYO_MINT> \
  --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb

# Derive vault authority PDA
# Seeds: [b"vault_authority", airdrop_config.key()]

# Transfer ownership to vault authority PDA
spl-token authorize <VAULT_ACCOUNT> owner <VAULT_AUTHORITY_PDA> \
  --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb

# Fund vault with 100M KAMIYO
spl-token transfer <KAMIYO_MINT> 100000000 <VAULT_ACCOUNT> \
  --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
  --fund-recipient
```

### Step 4: Generate Merkle Tree

```bash
# Export allocations from database
psql -d kamiyo -c "COPY (...) TO 'allocations.csv'"

# Generate merkle tree
cd scripts/airdrop
python generate_merkle_tree.py allocations.csv merkle-tree.json

# Extract merkle root
MERKLE_ROOT=$(cat merkle-tree.json | jq -r '.merkleRoot')
echo "Merkle Root: $MERKLE_ROOT"
```

### Step 5: Initialize Airdrop

```bash
# Initialize with merkle root
anchor run initialize \
  --provider.cluster devnet \
  --provider.wallet ~/.config/solana/id.json \
  --merkle-root $MERKLE_ROOT \
  --vault <VAULT_PUBKEY>

# Verify initialization
anchor run get-airdrop-config --provider.cluster devnet
```

### Step 6: Open Claims

```bash
# Announce to community
# Share claim portal: https://claim.kamiyo.ai
# Users can claim for 90 days
```

### Step 7: Monitor & Manage

```bash
# Check statistics
anchor run get-stats --provider.cluster devnet

# Update merkle root for Phase 2 (optional)
anchor run update-merkle-root \
  --merkle-root <NEW_ROOT> \
  --provider.cluster devnet

# After 90 days: Reclaim unclaimed
anchor run reclaim-unclaimed --provider.cluster devnet

# Close airdrop
anchor run close-airdrop --provider.cluster devnet
```

---

## Frontend Integration

### React Component Example

```typescript
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

function AirdropClaimButton() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const claimAirdrop = async () => {
    if (!wallet.publicKey) {
      alert("Connect wallet first");
      return;
    }

    try {
      // 1. Fetch user's proof
      const response = await fetch(
        `/api/airdrop/proof/${wallet.publicKey.toBase58()}`
      );
      const proofData = await response.json();

      if (!proofData.eligible) {
        alert("You're not eligible for the airdrop");
        return;
      }

      // 2. Setup program
      const provider = new AnchorProvider(connection, wallet, {});
      const program = new Program(IDL, PROGRAM_ID, provider);

      // 3. Derive PDAs
      const [airdropConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from("airdrop"), MINT.toBuffer()],
        program.programId
      );

      const [claimStatus] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("claim"),
          airdropConfig.toBuffer(),
          wallet.publicKey.toBuffer()
        ],
        program.programId
      );

      // 4. Send claim transaction
      const tx = await program.methods
        .claim(
          new BN(proofData.amount),
          proofData.proof.map(h => Buffer.from(h, 'hex'))
        )
        .accounts({
          claimant: wallet.publicKey,
          airdropConfig,
          claimStatus,
          // ... other accounts
        })
        .rpc();

      alert(`Claimed ${proofData.amountKamiyo} KAMIYO! TX: ${tx}`);
    } catch (err) {
      console.error("Claim failed:", err);
      alert(`Claim failed: ${err.message}`);
    }
  };

  return (
    <button onClick={claimAirdrop}>
      Claim Your KAMIYO Airdrop
    </button>
  );
}
```

### API Endpoint for Proofs

```typescript
// pages/api/airdrop/proof/[wallet].ts
import { NextApiRequest, NextApiResponse } from 'next';
import merkleData from '../../../data/merkle-tree.json';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { wallet } = req.query;

  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  // Find user's proof
  const userProof = merkleData.proofs.find(p => p.address === wallet);

  if (!userProof) {
    return res.json({
      eligible: false,
      reason: 'Wallet not found in airdrop eligibility list'
    });
  }

  return res.json({
    eligible: true,
    address: userProof.address,
    amount: userProof.amount,
    amountKamiyo: userProof.amountKamiyo,
    proof: userProof.proof
  });
}
```

---

## Testing Strategy

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merkle_proof_verification() {
        // Test valid proof
        let wallet = Pubkey::new_unique();
        let amount = 5_000_000_000; // 5 KAMIYO
        let leaf = create_leaf(wallet, amount);
        let proof = vec![];  // Single-element tree
        assert!(verify_merkle_proof(leaf, proof, leaf));
    }

    #[test]
    fn test_invalid_proof() {
        let wallet = Pubkey::new_unique();
        let amount = 5_000_000_000;
        let leaf = create_leaf(wallet, amount);
        let wrong_root = [0u8; 32];
        let proof = vec![];
        assert!(!verify_merkle_proof(leaf, proof, wrong_root));
    }

    #[test]
    fn test_create_leaf_deterministic() {
        let wallet = Pubkey::new_unique();
        let amount = 1_000_000_000;
        let leaf1 = create_leaf(wallet, amount);
        let leaf2 = create_leaf(wallet, amount);
        assert_eq!(leaf1, leaf2);
    }
}
```

### Integration Tests

```typescript
describe("Airdrop Program", () => {
  it("initializes airdrop", async () => {
    const merkleRoot = Buffer.alloc(32, 1);
    await program.methods
      .initialize(Array.from(merkleRoot))
      .accounts({ ... })
      .rpc();

    const config = await program.account.airdropConfig.fetch(configPDA);
    expect(config.isActive).to.be.true;
  });

  it("allows valid claim", async () => {
    const { proof, amount } = generateTestProof(user1.publicKey);

    await program.methods
      .claim(new BN(amount), proof)
      .accounts({ claimant: user1.publicKey, ... })
      .rpc();

    const userBalance = await getTokenBalance(user1TokenAccount);
    expect(userBalance).to.equal(amount);
  });

  it("prevents double claim", async () => {
    const { proof, amount } = generateTestProof(user1.publicKey);

    // First claim succeeds
    await program.methods.claim(new BN(amount), proof)
      .accounts({ claimant: user1.publicKey, ... })
      .rpc();

    // Second claim fails
    await expect(
      program.methods.claim(new BN(amount), proof)
        .accounts({ claimant: user1.publicKey, ... })
        .rpc()
    ).to.be.rejected;
  });
});
```

---

## Cost Analysis

### On-Chain Storage Costs

**With Merkle Tree:**
```
AirdropConfig: 162 bytes
ClaimStatus per user: 57 bytes × 20,000 users = 1.14 MB

Total rent:
- AirdropConfig: ~0.002 SOL
- ClaimStatus: 0.00001 SOL × 20,000 = 0.2 SOL
- Total: ~0.202 SOL (~$30 at $150/SOL)
```

**Without Merkle Tree (Naive):**
```
Store all allocations on-chain:
72 bytes × 20,000 users = 1.44 MB
Rent: ~14.4 SOL (~$2,160)

Savings: 98.6% cost reduction
```

### Transaction Costs

```
Claim transaction: ~0.000005 SOL per user
Total for 20,000 claims: 0.1 SOL (~$15)

(Paid by users, not protocol)
```

### Total Deployment Cost

```
Program deployment: ~2 SOL
Vault creation: ~0.002 SOL
Initialization: ~0.002 SOL
Token transfers: ~100M KAMIYO (protocol tokens)

Total: ~2.004 SOL + 100M KAMIYO
```

---

## Conclusion

The KAMIYO Airdrop Program provides a **secure, efficient, and scalable** solution for distributing 100M tokens to the community. By leveraging merkle trees, the program achieves:

- ✅ **96%+ cost savings** vs traditional approaches
- ✅ **Provably fair** distribution via cryptographic proofs
- ✅ **Sybil resistant** through multi-layer verification
- ✅ **Future-proof** with multi-phase support
- ✅ **Production-ready** with comprehensive security features

For questions or support, contact the KAMIYO team at community@kamiyo.ai.
