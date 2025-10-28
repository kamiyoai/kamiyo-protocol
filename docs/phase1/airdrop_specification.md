# $KAMIYO Token Airdrop Specification

**Version:** 1.0
**Last Updated:** October 28, 2025
**Status:** Design Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Distribution Mechanism](#distribution-mechanism)
3. [Points System Design](#points-system-design)
4. [Sybil Resistance Strategy](#sybil-resistance-strategy)
5. [Merkle Tree Claim System](#merkle-tree-claim-system)
6. [Implementation Architecture](#implementation-architecture)
7. [Database Schema](#database-schema)
8. [Security & Fraud Prevention](#security--fraud-prevention)
9. [Claim Process & User Experience](#claim-process--user-experience)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

The $KAMIYO airdrop will distribute **100 million tokens (10% of total supply)** to community members based on a points-based merit system. The airdrop rewards early adopters, active users, and genuine community contributors while implementing robust sybil resistance.

### Key Parameters

- **Total Allocation:** 100,000,000 KAMIYO (10% of 1B supply)
- **Distribution Method:** Merkle tree claim system (gas-efficient)
- **Claim Window:** 90 days from launch
- **Cap Per Wallet:** 10,000 KAMIYO maximum
- **Minimum Claim:** 100 KAMIYO minimum
- **Sybil Prevention:** Multi-layered verification

### Design Philosophy

Following 2025 best practices, we implement:

1. **RNS-Optimized Merkle Tree:** Ultra-lean contract (~1.7 SOL rent for 1M claims)
2. **Off-Chain Points Tracking:** Flexible, fraud-resistant point accrual
3. **User-Initiated Claims:** Gas-efficient, prevents wasted distributions
4. **Batch Reclaim:** Unclaimed tokens return to treasury after window
5. **Transparent Verification:** Public merkle tree, verifiable allocations

---

## Distribution Mechanism

### Option Analysis

| Method | Gas Cost (1M wallets) | Flexibility | User Experience | Recommendation |
|--------|----------------------|-------------|-----------------|----------------|
| Direct Batch Transfer | ~100 SOL | Low | Best (passive) | ❌ Not suitable |
| Standard Merkle Tree | ~42 SOL | Medium | Good (1 claim) | ⚠️ Acceptable |
| RNS-Optimized Merkle | ~1.7 SOL | High | Good (1 claim) | ✅ **Recommended** |
| Compressed NFT Claim | ~50 SOL | Medium | Fair (complex) | ❌ Overkill |

### Selected Method: RNS-Optimized Merkle Tree

**Advantages:**
- 96% cost reduction vs. standard merkle (1.7 SOL vs. 42 SOL)
- Scales to 10M wallets by adding a 4th modulus
- One PDA per claim prevents double-dips
- On-chain admin controls for emergencies
- Event emission for tracking

**How It Works:**

1. **Off-Chain:** Build merkle tree of {wallet, amount} pairs
2. **On-Chain:** Store only merkle root + RNS state (237 bytes)
3. **Claim:** User submits proof, contract verifies, marks claimed via PDA
4. **Reclaim:** Admin can recover unclaimed tokens after window expires

**RNS Optimization:**
Uses Residue Number System with 3 small byte-arrays to track 1M+ unique indexes efficiently. Instead of storing a large bitmap, it uses modular arithmetic to verify claims.

---

## Points System Design

### Point Accrual Categories

Points are earned through genuine platform engagement and community participation:

#### 1. Platform Usage Points (40% weight)

| Action | Points | Max Per Day | Notes |
|--------|--------|-------------|-------|
| First x402 payment | 100 | Once | Onboarding bonus |
| x402 API call (paid) | 1 | 50 | Real usage only |
| Subscribe to paid tier | 500 | Once | Premium users |
| Refer new paying user | 200 | 10 | Commission-based |
| Report valid exploit | 50-500 | Unlimited | Quality-based |
| Dashboard interaction | 0.5 | 20 | Prevents farming |

#### 2. Community Engagement (30% weight)

| Action | Points | Max Per Day | Notes |
|--------|--------|-------------|-------|
| Twitter follow @kamiyo_ai | 50 | Once | Verification required |
| Retweet announcement | 10 | 3 | Must be public |
| Quote tweet with content | 25 | 2 | >50 chars required |
| Join Discord | 50 | Once | Verify wallet |
| Discord message (quality) | 2 | 10 | Anti-spam filters |
| Create tutorial/guide | 500 | 5 | Team approval needed |

#### 3. Early Adoption (20% weight)

| Milestone | Points | Notes |
|-----------|--------|-------|
| Join in first week | 200 | Timestamp-based |
| First 1000 users | 300 | Sequential bonus |
| Beta tester | 150 | Invite-only |
| Testnet participant | 100 | Verified on-chain |

#### 4. Wallet Quality Signals (10% weight)

| Signal | Points | Notes |
|--------|--------|-------|
| Wallet age >6 months | 100 | On-chain verification |
| >10 transactions | 50 | Activity filter |
| Hold >0.1 SOL | 25 | Prevents dust wallets |
| NFT holder (verified) | 75 | Specific collections |

### Point Calculation Formula

```
Final_Allocation = min(
    (User_Points / Total_Points) * 100M,
    10_000 KAMIYO
)

where User_Points >= 100 (minimum threshold)
```

### Example Scenarios

**Scenario 1: Power User**
- First x402 payment: 100 pts
- 30 days of API usage: 30 × 10 = 300 pts
- Subscription: 500 pts
- 5 referrals: 5 × 200 = 1000 pts
- Twitter engagement: 150 pts
- Discord active: 100 pts
- Early adopter: 200 pts
- Wallet quality: 175 pts
- **Total: 2,525 points**
- **Allocation: ~2,500 KAMIYO** (if 10M total points distributed)

**Scenario 2: Casual User**
- First payment: 100 pts
- 10 API calls: 10 pts
- Twitter follow: 50 pts
- Wallet quality: 100 pts
- **Total: 260 points**
- **Allocation: ~260 KAMIYO**

**Scenario 3: Community Contributor**
- Tutorial creation: 500 pts
- Twitter engagement: 200 pts
- Discord moderator: 500 pts (special grant)
- Referrals: 600 pts
- Early adopter: 500 pts (first 100 users)
- **Total: 2,300 points**
- **Allocation: ~2,300 KAMIYO**

---

## Sybil Resistance Strategy

### Multi-Layer Verification

```
User Claim Request
│
├─ Layer 1: Wallet Verification ───▶ Check signature, ownership
│                                    ├─ Valid ─────▶ Continue
│                                    └─ Invalid ───▶ Reject
│
├─ Layer 2: Identity Checks ───────▶ Twitter account, Discord, IP
│                                    ├─ Pass ──────▶ Continue
│                                    └─ Fail ──────▶ Flag for review
│
├─ Layer 3: Behavioral Analysis ───▶ Points pattern, timing, activity
│                                    ├─ Natural ───▶ Continue
│                                    └─ Suspicious ▶ Reduce allocation
│
├─ Layer 4: Risk Scoring ──────────▶ Aggregate fraud signals
│                                    ├─ Low risk ──▶ Full allocation
│                                    ├─ Medium ────▶ 50% allocation
│                                    └─ High ──────▶ Block claim
│
└─ Final Allocation Calculation
```

### 1. Wallet Signature Verification

**Purpose:** Prove wallet ownership

```rust
pub fn verify_wallet_signature(
    wallet: Pubkey,
    message: &[u8],
    signature: &[u8; 64],
) -> Result<bool> {
    // Verify user signed message with their private key
    // Message format: "Claim KAMIYO airdrop for {wallet} at {timestamp}"

    let signature = Signature::new(signature);
    let result = signature.verify(wallet.as_ref(), message);

    Ok(result)
}
```

**Implementation:**
- User signs message with wallet
- Frontend submits signature with claim
- Backend verifies before adding to merkle tree

### 2. IP Rate Limiting

**Purpose:** Prevent mass wallet creation from single source

```python
# api/airdrop/rate_limiter.py

from redis import Redis
from datetime import datetime, timedelta

class IPRateLimiter:
    def __init__(self, redis_client: Redis):
        self.redis = redis_client

    async def check_rate_limit(self, ip_address: str) -> dict:
        """
        Limits:
        - 1 wallet claim per IP per day
        - 5 point actions per IP per hour
        - 20 point actions per IP per day
        """
        key_claim = f"airdrop:claim:{ip_address}"
        key_hourly = f"airdrop:actions:hour:{ip_address}"
        key_daily = f"airdrop:actions:day:{ip_address}"

        # Check daily claim limit
        if self.redis.exists(key_claim):
            return {
                'allowed': False,
                'reason': 'Already claimed from this IP today',
                'retry_after': self.redis.ttl(key_claim)
            }

        # Check hourly action limit
        hourly_count = self.redis.get(key_hourly) or 0
        if int(hourly_count) >= 5:
            return {
                'allowed': False,
                'reason': 'Too many actions from this IP',
                'retry_after': self.redis.ttl(key_hourly)
            }

        # Check daily action limit
        daily_count = self.redis.get(key_daily) or 0
        if int(daily_count) >= 20:
            return {
                'allowed': False,
                'reason': 'Daily limit exceeded',
                'retry_after': self.redis.ttl(key_daily)
            }

        return {'allowed': True}

    async def record_action(self, ip_address: str, action_type: str):
        """Record action and set TTLs"""
        if action_type == 'claim':
            self.redis.setex(f"airdrop:claim:{ip_address}", 86400, 1)

        # Increment counters
        hourly_key = f"airdrop:actions:hour:{ip_address}"
        daily_key = f"airdrop:actions:day:{ip_address}"

        self.redis.incr(hourly_key)
        self.redis.expire(hourly_key, 3600)  # 1 hour

        self.redis.incr(daily_key)
        self.redis.expire(daily_key, 86400)  # 24 hours
```

### 3. Twitter Account Verification

**Purpose:** Link wallet to real social identity

```python
# api/airdrop/twitter_verifier.py

import tweepy
from datetime import datetime, timedelta

class TwitterVerifier:
    def __init__(self, api_key: str, api_secret: str):
        auth = tweepy.OAuth2BearerHandler(api_key)
        self.api = tweepy.API(auth)

    async def verify_account(self, twitter_handle: str) -> dict:
        """
        Verification checks:
        1. Account exists and is public
        2. Account age > 1 month
        3. Has profile picture
        4. Has >10 followers (not brand new)
        5. Not suspended or restricted
        """
        try:
            user = self.api.get_user(screen_name=twitter_handle)

            # Check account age
            created_at = user.created_at
            age_days = (datetime.utcnow() - created_at).days

            if age_days < 30:
                return {
                    'valid': False,
                    'reason': 'Account too new',
                    'risk_score': 0.8
                }

            # Check followers
            if user.followers_count < 10:
                return {
                    'valid': True,  # Allow but flag
                    'reason': 'Low follower count',
                    'risk_score': 0.5
                }

            # Check profile completeness
            if not user.profile_image_url or user.default_profile:
                return {
                    'valid': True,
                    'reason': 'Incomplete profile',
                    'risk_score': 0.4
                }

            # All checks passed
            return {
                'valid': True,
                'account_age_days': age_days,
                'followers': user.followers_count,
                'verified': user.verified,
                'risk_score': 0.1
            }

        except tweepy.TweepyException as e:
            return {
                'valid': False,
                'reason': f'Twitter API error: {str(e)}',
                'risk_score': 1.0
            }

    async def verify_tweet_engagement(
        self,
        twitter_handle: str,
        tweet_id: str
    ) -> bool:
        """Verify user actually retweeted/liked announcement"""
        try:
            # Check if user retweeted
            retweets = self.api.get_retweeters(id=tweet_id)
            user = self.api.get_user(screen_name=twitter_handle)

            return user.id in retweets

        except Exception:
            return False
```

### 4. Behavioral Pattern Analysis

**Purpose:** Detect bot-like behavior

```python
# api/airdrop/fraud_detector.py

class FraudDetector:
    def analyze_user_behavior(self, user_actions: list) -> dict:
        """
        Detect suspicious patterns:
        - Actions clustered in short time windows
        - Identical timing patterns across wallets
        - Unnatural point distribution
        - Sudden bursts of activity
        """
        risk_score = 0.0
        flags = []

        # Check action timing
        timestamps = [a['timestamp'] for a in user_actions]
        time_deltas = [timestamps[i+1] - timestamps[i]
                       for i in range(len(timestamps)-1)]

        # Flag if all actions within 1 hour
        if timestamps[-1] - timestamps[0] < 3600:
            risk_score += 0.3
            flags.append('actions_too_clustered')

        # Flag if all time deltas are suspiciously similar (bot pattern)
        if len(set(time_deltas)) < len(time_deltas) / 2:
            risk_score += 0.4
            flags.append('robotic_timing_pattern')

        # Check action diversity
        action_types = [a['type'] for a in user_actions]
        unique_types = len(set(action_types))

        if unique_types < 3:  # Only doing 1-2 types of actions
            risk_score += 0.2
            flags.append('low_action_diversity')

        # Check for sudden activity bursts
        daily_actions = self._group_by_day(user_actions)
        max_daily = max(daily_actions.values())
        avg_daily = sum(daily_actions.values()) / len(daily_actions)

        if max_daily > avg_daily * 5:  # One day with 5x normal activity
            risk_score += 0.3
            flags.append('sudden_activity_burst')

        return {
            'risk_score': min(risk_score, 1.0),
            'flags': flags,
            'verdict': self._get_verdict(risk_score)
        }

    def _get_verdict(self, risk_score: float) -> str:
        if risk_score < 0.3:
            return 'genuine'
        elif risk_score < 0.6:
            return 'suspicious'
        else:
            return 'likely_fraud'
```

### 5. Aggregate Risk Scoring

```python
# Final allocation decision

def calculate_final_allocation(
    base_points: int,
    wallet_verification: dict,
    twitter_verification: dict,
    behavioral_analysis: dict,
    ip_check: dict
) -> dict:
    """
    Combine all signals to determine final allocation
    """
    # Start with base allocation
    base_allocation = (base_points / total_points) * 100_000_000

    # Apply risk-based multiplier
    risk_multiplier = 1.0

    # Wallet signature invalid = 0 allocation
    if not wallet_verification.get('valid'):
        return {'allocation': 0, 'reason': 'Invalid wallet signature'}

    # Twitter signals
    twitter_risk = twitter_verification.get('risk_score', 0.5)
    if twitter_risk > 0.7:
        risk_multiplier *= 0.5  # 50% penalty

    # Behavioral signals
    behavioral_risk = behavioral_analysis.get('risk_score', 0)
    if behavioral_risk > 0.6:
        risk_multiplier *= 0.3  # 70% penalty
    elif behavioral_risk > 0.3:
        risk_multiplier *= 0.7  # 30% penalty

    # IP violations
    if not ip_check.get('allowed'):
        risk_multiplier *= 0.5

    final_allocation = int(base_allocation * risk_multiplier)

    # Apply caps
    final_allocation = max(100, min(final_allocation, 10_000))

    return {
        'allocation': final_allocation,
        'base_points': base_points,
        'risk_multiplier': risk_multiplier,
        'risk_factors': {
            'twitter': twitter_risk,
            'behavioral': behavioral_risk,
            'ip': ip_check
        }
    }
```

---

## Merkle Tree Claim System

### Merkle Tree Generation

```python
# scripts/generate_merkle_tree.py

import hashlib
from typing import List, Tuple
from solders.pubkey import Pubkey

class MerkleTreeGenerator:
    def __init__(self, allocations: List[Tuple[str, int]]):
        """
        allocations: List of (wallet_address, amount) tuples
        """
        self.allocations = allocations
        self.leaves = []
        self.tree = []

    def generate(self) -> str:
        """Generate merkle tree and return root hash"""
        # Create leaf nodes
        for wallet, amount in self.allocations:
            leaf = self._hash_leaf(wallet, amount)
            self.leaves.append({
                'wallet': wallet,
                'amount': amount,
                'hash': leaf
            })

        # Build tree bottom-up
        current_level = [leaf['hash'] for leaf in self.leaves]
        self.tree.append(current_level)

        while len(current_level) > 1:
            next_level = []

            # Pair and hash
            for i in range(0, len(current_level), 2):
                left = current_level[i]
                right = current_level[i+1] if i+1 < len(current_level) else left

                parent = self._hash_pair(left, right)
                next_level.append(parent)

            self.tree.append(next_level)
            current_level = next_level

        # Root is the last level's only element
        merkle_root = current_level[0]

        return merkle_root

    def get_proof(self, wallet: str) -> List[str]:
        """Get merkle proof for a specific wallet"""
        # Find leaf index
        leaf_index = None
        for i, leaf in enumerate(self.leaves):
            if leaf['wallet'] == wallet:
                leaf_index = i
                break

        if leaf_index is None:
            raise ValueError(f"Wallet {wallet} not found in tree")

        proof = []
        current_index = leaf_index

        # Traverse up the tree
        for level in range(len(self.tree) - 1):
            level_nodes = self.tree[level]
            is_right_node = current_index % 2 == 1

            if is_right_node:
                sibling_index = current_index - 1
            else:
                sibling_index = current_index + 1

            if sibling_index < len(level_nodes):
                proof.append({
                    'hash': level_nodes[sibling_index],
                    'position': 'right' if is_right_node else 'left'
                })

            current_index = current_index // 2

        return proof

    def _hash_leaf(self, wallet: str, amount: int) -> str:
        """Hash individual leaf (wallet + amount)"""
        data = wallet + str(amount)
        return hashlib.sha256(data.encode()).hexdigest()

    def _hash_pair(self, left: str, right: str) -> str:
        """Hash pair of nodes"""
        combined = left + right
        return hashlib.sha256(combined.encode()).hexdigest()

    def export_tree(self, filename: str):
        """Export merkle tree to JSON for verification"""
        import json

        tree_data = {
            'merkle_root': self.tree[-1][0],
            'total_allocations': len(self.allocations),
            'total_tokens': sum(a[1] for a in self.allocations),
            'leaves': self.leaves,
            'tree_height': len(self.tree)
        }

        with open(filename, 'w') as f:
            json.dump(tree_data, f, indent=2)
```

### On-Chain Claim Program (Anchor/Rust)

```rust
// programs/kamiyo-airdrop/src/lib.rs

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod kamiyo_airdrop {
    use super::*;

    /// Initialize airdrop with merkle root
    pub fn initialize_airdrop(
        ctx: Context<InitializeAirdrop>,
        merkle_root: [u8; 32],
        claim_window_days: i64,
    ) -> Result<()> {
        let airdrop = &mut ctx.accounts.airdrop;
        let clock = Clock::get()?;

        airdrop.authority = ctx.accounts.authority.key();
        airdrop.token_mint = ctx.accounts.token_mint.key();
        airdrop.token_vault = ctx.accounts.token_vault.key();
        airdrop.merkle_root = merkle_root;
        airdrop.total_claimed = 0;
        airdrop.claim_window_start = clock.unix_timestamp;
        airdrop.claim_window_end = clock.unix_timestamp + (claim_window_days * 86400);
        airdrop.is_active = true;
        airdrop.bump = *ctx.bumps.get("airdrop").unwrap();

        msg!("Airdrop initialized with merkle root: {:?}", merkle_root);

        Ok(())
    }

    /// User claims their airdrop allocation
    pub fn claim(
        ctx: Context<Claim>,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        let airdrop = &mut ctx.accounts.airdrop;
        let claim_status = &mut ctx.accounts.claim_status;
        let clock = Clock::get()?;

        // Check claim window
        require!(clock.unix_timestamp >= airdrop.claim_window_start, ErrorCode::ClaimWindowNotStarted);
        require!(clock.unix_timestamp <= airdrop.claim_window_end, ErrorCode::ClaimWindowExpired);
        require!(airdrop.is_active, ErrorCode::AirdropInactive);

        // Check if already claimed
        require!(!claim_status.is_claimed, ErrorCode::AlreadyClaimed);

        // Verify merkle proof
        let leaf = hash_leaf(ctx.accounts.user.key(), amount);
        require!(
            verify_proof(&proof, airdrop.merkle_root, leaf),
            ErrorCode::InvalidProof
        );

        // Mark as claimed
        claim_status.is_claimed = true;
        claim_status.user = ctx.accounts.user.key();
        claim_status.amount = amount;
        claim_status.claimed_at = clock.unix_timestamp;
        claim_status.bump = *ctx.bumps.get("claim_status").unwrap();

        // Transfer tokens from vault to user
        let seeds = &[
            b"airdrop",
            airdrop.token_mint.as_ref(),
            &[airdrop.bump],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: airdrop.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        // Update total claimed
        airdrop.total_claimed = airdrop.total_claimed.checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        emit!(ClaimEvent {
            user: ctx.accounts.user.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Admin reclaims unclaimed tokens after window expires
    pub fn reclaim_unclaimed(ctx: Context<ReclaimUnclaimed>) -> Result<()> {
        let airdrop = &mut ctx.accounts.airdrop;
        let clock = Clock::get()?;

        // Only authority can reclaim
        require!(ctx.accounts.authority.key() == airdrop.authority, ErrorCode::Unauthorized);

        // Window must be expired
        require!(clock.unix_timestamp > airdrop.claim_window_end, ErrorCode::ClaimWindowStillActive);

        // Get vault balance
        let vault_balance = ctx.accounts.token_vault.amount;

        // Transfer all remaining tokens to authority
        let seeds = &[
            b"airdrop",
            airdrop.token_mint.as_ref(),
            &[airdrop.bump],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.authority_token_account.to_account_info(),
                    authority: airdrop.to_account_info(),
                },
                signer,
            ),
            vault_balance,
        )?;

        // Mark airdrop as inactive
        airdrop.is_active = false;

        emit!(ReclaimEvent {
            authority: ctx.accounts.authority.key(),
            amount: vault_balance,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// Helper functions
fn hash_leaf(user: Pubkey, amount: u64) -> [u8; 32] {
    use anchor_lang::solana_program::keccak;

    let mut data = Vec::new();
    data.extend_from_slice(&user.to_bytes());
    data.extend_from_slice(&amount.to_le_bytes());

    keccak::hash(&data).to_bytes()
}

fn verify_proof(proof: &[[u8; 32]], root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;

    for proof_element in proof.iter() {
        computed_hash = if computed_hash <= *proof_element {
            hash_pair(computed_hash, *proof_element)
        } else {
            hash_pair(*proof_element, computed_hash)
        };
    }

    computed_hash == root
}

fn hash_pair(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
    use anchor_lang::solana_program::keccak;

    let mut data = Vec::new();
    data.extend_from_slice(&a);
    data.extend_from_slice(&b);

    keccak::hash(&data).to_bytes()
}

// Account structs
#[account]
pub struct Airdrop {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub token_vault: Pubkey,
    pub merkle_root: [u8; 32],
    pub total_claimed: u64,
    pub claim_window_start: i64,
    pub claim_window_end: i64,
    pub is_active: bool,
    pub bump: u8,
}

#[account]
pub struct ClaimStatus {
    pub user: Pubkey,
    pub amount: u64,
    pub is_claimed: bool,
    pub claimed_at: i64,
    pub bump: u8,
}

// Context structs
#[derive(Accounts)]
pub struct InitializeAirdrop<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Airdrop>(),
        seeds = [b"airdrop", token_mint.key().as_ref()],
        bump,
    )]
    pub airdrop: Account<'info, Airdrop>,

    pub token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"airdrop", token_mint.key().as_ref()],
        bump = airdrop.bump,
    )]
    pub airdrop: Account<'info, Airdrop>,

    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<ClaimStatus>(),
        seeds = [b"claim", airdrop.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReclaimUnclaimed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"airdrop", token_mint.key().as_ref()],
        bump = airdrop.bump,
    )]
    pub airdrop: Account<'info, Airdrop>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

// Events
#[event]
pub struct ClaimEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ReclaimEvent {
    pub authority: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Claim window has not started yet")]
    ClaimWindowNotStarted,

    #[msg("Claim window has expired")]
    ClaimWindowExpired,

    #[msg("Airdrop is not active")]
    AirdropInactive,

    #[msg("Tokens already claimed")]
    AlreadyClaimed,

    #[msg("Invalid merkle proof")]
    InvalidProof,

    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Claim window still active")]
    ClaimWindowStillActive,
}
```

---

## Database Schema

```sql
-- database/migrations/003_airdrop_system.sql

-- User points tracking
CREATE TABLE IF NOT EXISTS airdrop_points (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,  -- FK to users table (if authenticated)
    wallet_address VARCHAR(44) UNIQUE NOT NULL,  -- Solana wallet

    -- Point breakdown
    platform_usage_points INTEGER DEFAULT 0,
    community_points INTEGER DEFAULT 0,
    early_adopter_points INTEGER DEFAULT 0,
    wallet_quality_points INTEGER DEFAULT 0,
    bonus_points INTEGER DEFAULT 0,
    penalty_points INTEGER DEFAULT 0,

    -- Total
    total_points INTEGER DEFAULT 0,

    -- Verification status
    twitter_verified BOOLEAN DEFAULT false,
    twitter_handle VARCHAR(255),
    twitter_verification_date TIMESTAMP,
    discord_verified BOOLEAN DEFAULT false,
    discord_id VARCHAR(255),

    -- Risk assessment
    risk_score DECIMAL(3, 2) DEFAULT 0.0,  -- 0.0 (safe) to 1.0 (fraud)
    risk_flags TEXT[],  -- Array of flag reasons

    -- Allocation
    preliminary_allocation INTEGER DEFAULT 0,  -- Before risk adjustment
    final_allocation INTEGER DEFAULT 0,  -- After risk adjustment
    allocation_tier VARCHAR(50),  -- 'micro', 'small', 'medium', 'large', 'whale'

    -- Claim status
    merkle_proof JSONB,  -- Store proof for easy retrieval
    claim_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'claimable', 'claimed', 'expired'
    claimed_at TIMESTAMP,
    claim_tx_hash VARCHAR(88),  -- Solana transaction signature

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Point action log (audit trail)
CREATE TABLE IF NOT EXISTS airdrop_actions (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) NOT NULL,
    action_type VARCHAR(100) NOT NULL,  -- 'x402_payment', 'twitter_retweet', etc.
    points_earned INTEGER NOT NULL,
    metadata JSONB,  -- Additional context (tx hash, tweet id, etc.)
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (wallet_address) REFERENCES airdrop_points(wallet_address) ON DELETE CASCADE
);

-- Twitter verification cache
CREATE TABLE IF NOT EXISTS airdrop_twitter_cache (
    id SERIAL PRIMARY KEY,
    twitter_handle VARCHAR(255) UNIQUE NOT NULL,
    account_created_at TIMESTAMP,
    followers_count INTEGER,
    verified BOOLEAN DEFAULT false,
    risk_score DECIMAL(3, 2),
    last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cached_data JSONB
);

-- IP tracking for rate limiting
CREATE TABLE IF NOT EXISTS airdrop_ip_tracking (
    id SERIAL PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    wallet_address VARCHAR(44) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_ip_timestamp (ip_address, timestamp),
    INDEX idx_wallet_timestamp (wallet_address, timestamp)
);

-- Fraud detection rules (configurable)
CREATE TABLE IF NOT EXISTS airdrop_fraud_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) NOT NULL,  -- 'ip_limit', 'timing_pattern', 'behavior', etc.
    rule_config JSONB NOT NULL,  -- Flexible rule parameters
    risk_weight DECIMAL(3, 2) NOT NULL,  -- How much this rule affects risk score
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Allocation snapshots (for transparency)
CREATE TABLE IF NOT EXISTS airdrop_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_participants INTEGER,
    total_points INTEGER,
    total_allocation INTEGER,
    merkle_root VARCHAR(64),
    snapshot_data JSONB,  -- Full allocation list
    is_final BOOLEAN DEFAULT false
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_airdrop_points_wallet ON airdrop_points(wallet_address);
CREATE INDEX IF NOT EXISTS idx_airdrop_points_total ON airdrop_points(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_airdrop_points_claim_status ON airdrop_points(claim_status);
CREATE INDEX IF NOT EXISTS idx_airdrop_actions_wallet ON airdrop_actions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_airdrop_actions_type ON airdrop_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_airdrop_actions_created ON airdrop_actions(created_at DESC);

-- Views
CREATE OR REPLACE VIEW v_airdrop_leaderboard AS
SELECT
    wallet_address,
    twitter_handle,
    total_points,
    final_allocation,
    allocation_tier,
    risk_score,
    claim_status
FROM airdrop_points
WHERE total_points >= 100  -- Minimum threshold
ORDER BY total_points DESC
LIMIT 1000;

CREATE OR REPLACE VIEW v_airdrop_stats AS
SELECT
    COUNT(*) as total_participants,
    SUM(total_points) as total_points,
    SUM(final_allocation) as total_allocated_tokens,
    AVG(final_allocation) as avg_allocation,
    COUNT(CASE WHEN claim_status = 'claimed' THEN 1 END) as total_claimed,
    COUNT(CASE WHEN risk_score > 0.6 THEN 1 END) as high_risk_users,
    SUM(CASE WHEN claim_status = 'claimed' THEN final_allocation ELSE 0 END) as tokens_claimed
FROM airdrop_points;
```

---

## Security & Fraud Prevention

### Admin Controls

```python
# api/airdrop/admin.py

class AirdropAdmin:
    """Admin tools for managing airdrop"""

    async def freeze_wallet(self, wallet_address: str, reason: str):
        """Prevent wallet from claiming"""
        await db.execute("""
            UPDATE airdrop_points
            SET claim_status = 'frozen',
                risk_flags = array_append(risk_flags, $2)
            WHERE wallet_address = $1
        """, wallet_address, f"admin_freeze: {reason}")

    async def manual_review_queue(self) -> list:
        """Get wallets flagged for manual review"""
        return await db.fetch("""
            SELECT wallet_address, total_points, risk_score, risk_flags
            FROM airdrop_points
            WHERE risk_score BETWEEN 0.5 AND 0.8
            AND claim_status = 'pending'
            ORDER BY total_points DESC
        """)

    async def adjust_allocation(
        self,
        wallet_address: str,
        new_allocation: int,
        reason: str
    ):
        """Manually adjust allocation (with audit log)"""
        await db.execute("""
            UPDATE airdrop_points
            SET final_allocation = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE wallet_address = $1
        """, wallet_address, new_allocation)

        # Log adjustment
        await db.execute("""
            INSERT INTO airdrop_actions
            (wallet_address, action_type, points_earned, metadata)
            VALUES ($1, 'admin_adjustment', 0, $2::jsonb)
        """, wallet_address, json.dumps({'reason': reason, 'new_allocation': new_allocation}))
```

### Emergency Pause

```rust
// In airdrop program

pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
    let airdrop = &mut ctx.accounts.airdrop;

    require!(ctx.accounts.authority.key() == airdrop.authority, ErrorCode::Unauthorized);

    airdrop.is_active = false;

    emit!(EmergencyPauseEvent {
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
```

---

## Claim Process & User Experience

### Frontend Flow

```
1. User connects wallet ───▶ 2. Check eligibility
                             │
                             ▼
                        3. Display allocation
                             │
                             ▼
                        4. User clicks "Claim"
                             │
                             ▼
                        5. Sign transaction
                             │
                             ▼
                        6. Submit to Solana
                             │
                             ▼
                        7. Wait for confirmation
                             │
                             ▼
                        8. Update database
                             │
                             ▼
                        9. Show success + tx link
```

### API Endpoints

```python
# api/airdrop/routes.py

from fastapi import APIRouter, HTTPException
from solders.pubkey import Pubkey

router = APIRouter(prefix="/airdrop", tags=["airdrop"])

@router.get("/eligibility/{wallet_address}")
async def check_eligibility(wallet_address: str):
    """Check if wallet is eligible and get allocation"""
    try:
        Pubkey.from_string(wallet_address)  # Validate address
    except:
        raise HTTPException(400, "Invalid wallet address")

    result = await db.fetchrow("""
        SELECT
            total_points,
            final_allocation,
            claim_status,
            risk_score,
            merkle_proof
        FROM airdrop_points
        WHERE wallet_address = $1
    """, wallet_address)

    if not result:
        return {
            'eligible': False,
            'reason': 'No points earned'
        }

    if result['final_allocation'] < 100:
        return {
            'eligible': False,
            'reason': 'Below minimum threshold'
        }

    if result['claim_status'] == 'claimed':
        return {
            'eligible': False,
            'reason': 'Already claimed',
            'claimed_at': result['claimed_at']
        }

    return {
        'eligible': True,
        'allocation': result['final_allocation'],
        'total_points': result['total_points'],
        'claim_status': result['claim_status'],
        'merkle_proof': result['merkle_proof']
    }

@router.post("/record-claim")
async def record_claim(wallet_address: str, tx_signature: str):
    """Record successful claim in database"""
    await db.execute("""
        UPDATE airdrop_points
        SET claim_status = 'claimed',
            claimed_at = CURRENT_TIMESTAMP,
            claim_tx_hash = $2
        WHERE wallet_address = $1
    """, wallet_address, tx_signature)

    return {'success': True}

@router.get("/leaderboard")
async def get_leaderboard(limit: int = 100):
    """Get top point earners"""
    results = await db.fetch("""
        SELECT
            wallet_address,
            twitter_handle,
            total_points,
            final_allocation,
            allocation_tier
        FROM v_airdrop_leaderboard
        LIMIT $1
    """, limit)

    return {'leaderboard': results}
```

---

## Implementation Roadmap

### Phase 1: Infrastructure (Weeks 1-2)
- [ ] Set up database schema
- [ ] Implement points tracking system
- [ ] Build Twitter/Discord verification
- [ ] Create fraud detection system
- [ ] Deploy rate limiting (Redis)

### Phase 2: Smart Contract (Weeks 3-4)
- [ ] Develop Anchor airdrop program
- [ ] Implement merkle verification
- [ ] Add claim functionality
- [ ] Write comprehensive tests
- [ ] Deploy to devnet

### Phase 3: Points Collection (Weeks 5-8)
- [ ] Launch points program
- [ ] Monitor for fraud patterns
- [ ] Adjust rules as needed
- [ ] Build leaderboard UI
- [ ] Community engagement campaign

### Phase 4: Snapshot & Merkle Generation (Week 9)
- [ ] Finalize point calculations
- [ ] Run fraud detection on all users
- [ ] Manual review of high-risk accounts
- [ ] Generate merkle tree
- [ ] Publish allocation list

### Phase 5: Claim Launch (Week 10)
- [ ] Deploy to mainnet
- [ ] Initialize airdrop with merkle root
- [ ] Fund token vault
- [ ] Open claims
- [ ] Monitor claim activity

### Phase 6: Post-Launch (Weeks 11-22)
- [ ] Support user questions
- [ ] Handle disputes
- [ ] Monitor fraud attempts
- [ ] Weekly analytics reports
- [ ] Reclaim unclaimed after 90 days

---

**End of Airdrop Specification**
