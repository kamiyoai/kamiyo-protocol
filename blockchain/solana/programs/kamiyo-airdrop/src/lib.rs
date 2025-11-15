use anchor_lang::prelude::*;

// Module declarations
pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

// Re-export for convenience
use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// KAMIYO Airdrop Program
///
/// This program implements a merkle-tree-based airdrop distribution system for the KAMIYO token.
///
/// # Overview
/// The airdrop distributes 100,000,000 KAMIYO tokens (10% of total supply) to community members
/// based on a points system that rewards:
/// - Social engagement (Twitter/Discord)
/// - Platform usage (x402 transactions)
/// - Early adoption
/// - Community contributions
///
/// # Key Features
/// - **Merkle Tree Verification**: Efficient on-chain verification without storing full eligibility list
/// - **Double-Claim Prevention**: Each wallet can only claim once (enforced by ClaimStatus PDA)
/// - **Time-Limited Claims**: 90-day claim window, unclaimed tokens return to treasury
/// - **Multi-Phase Support**: Admin can update merkle root for multiple airdrop phases
/// - **Secure**: Authority checks, merkle proof verification, anti-sybil measures
///
/// # Instructions
/// 1. `initialize` - Set up airdrop with merkle root and claim period
/// 2. `claim` - Users claim their allocation with merkle proof
/// 3. `update_merkle_root` - Admin updates root for new phases
/// 4. `reclaim_unclaimed` - Admin reclaims unclaimed tokens after 90 days
/// 5. `close_airdrop` - Close and cleanup after completion
///
/// # Allocation Formula
/// ```
/// user_allocation = (user_points / total_points) * 100M KAMIYO
/// ```
///
/// # Example
/// - User earns 5,000 points from platform usage and social engagement
/// - Total points across all users: 10,000,000 points
/// - User allocation = (5,000 / 10,000,000) * 100M = 50,000 KAMIYO
/// - User claims with merkle proof generated off-chain
///
/// # Security
/// - Merkle proof verification prevents unauthorized claims
/// - ClaimStatus PDA prevents double-claims
/// - Time-based checks enforce 90-day window
/// - Authority checks protect admin functions
/// - Allocation caps prevent excessive claims (100 KAMIYO min, 10,000 KAMIYO max)
#[program]
pub mod kamiyo_airdrop {
    use super::*;

    /// Initialize the airdrop program
    ///
    /// Sets up the AirdropConfig account with the merkle root and claim period.
    /// The admin must have already created and funded a token vault with 100M KAMIYO.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context
    /// * `merkle_root` - 32-byte merkle root from off-chain eligibility tree
    ///
    /// # Access
    /// Admin only (one-time initialization)
    pub fn initialize(ctx: Context<Initialize>, merkle_root: [u8; 32]) -> Result<()> {
        instructions::initialize(ctx, merkle_root)
    }

    /// Claim airdrop allocation
    ///
    /// Users call this to claim their KAMIYO allocation. Requires a valid merkle proof
    /// showing eligibility. Creates a ClaimStatus account to prevent double-claims.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context
    /// * `amount` - Allocation amount in lamports (from points calculation)
    /// * `proof` - Array of merkle proof hashes
    ///
    /// # Access
    /// Any eligible user (once per wallet)
    pub fn claim(ctx: Context<Claim>, amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        instructions::claim(ctx, amount, proof)
    }

    /// Update merkle root for multi-phase airdrops
    ///
    /// Allows admin to update the merkle root to add new eligible users.
    /// Useful for phased rollouts (early supporters → beta testers → community).
    ///
    /// # Arguments
    /// * `ctx` - Accounts context
    /// * `new_merkle_root` - New 32-byte merkle root
    ///
    /// # Access
    /// Admin only
    pub fn update_merkle_root(
        ctx: Context<UpdateMerkleRoot>,
        new_merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::update_merkle_root(ctx, new_merkle_root)
    }

    /// Reclaim unclaimed tokens after claim period
    ///
    /// After 90 days, admin can reclaim all unclaimed tokens and return them
    /// to the treasury. Marks airdrop as inactive.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context
    ///
    /// # Access
    /// Admin only (after claim period expires)
    pub fn reclaim_unclaimed(ctx: Context<ReclaimUnclaimed>) -> Result<()> {
        instructions::reclaim_unclaimed(ctx)
    }

    /// Close airdrop and cleanup
    ///
    /// Closes the AirdropConfig account after completion, returning rent to admin.
    /// Should be called after tokens are reclaimed and airdrop is complete.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context
    ///
    /// # Access
    /// Admin only (after reclaim_unclaimed)
    pub fn close_airdrop(ctx: Context<CloseAirdrop>) -> Result<()> {
        instructions::close_airdrop(ctx)
    }
}
