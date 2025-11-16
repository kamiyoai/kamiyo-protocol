use anchor_lang::prelude::*;

/// Global airdrop configuration account (PDA)
///
/// This account stores the configuration for the entire airdrop program.
/// It's created during initialization and controls the airdrop parameters.
///
/// PDA derivation: [b"airdrop", mint.key().as_ref()]
#[account]
pub struct AirdropConfig {
    /// Admin authority who can update merkle root and reclaim tokens
    pub admin: Pubkey,

    /// KAMIYO token mint (Token-2022 with transfer fees)
    pub mint: Pubkey,

    /// Token vault that holds the 100M KAMIYO for distribution
    pub vault: Pubkey,

    /// Merkle root of the airdrop eligibility tree
    /// Generated off-chain from the points system allocation
    pub merkle_root: [u8; 32],

    /// Unix timestamp when claims open
    pub claim_start: i64,

    /// Unix timestamp when claims close (claim_start + 90 days)
    pub claim_end: i64,

    /// Total allocation available (100M KAMIYO in lamports)
    pub total_allocation: u64,

    /// Amount claimed so far (tracks distribution)
    pub total_claimed: u64,

    /// Number of unique claimants who have claimed
    pub total_claimants: u64,

    /// Whether the airdrop is currently active
    pub is_active: bool,

    /// PDA bump seed for signing
    pub bump: u8,
}

impl AirdropConfig {
    /// Calculate space needed for account rent
    pub const LEN: usize = 8 +  // discriminator
        32 +  // admin
        32 +  // mint
        32 +  // vault
        32 +  // merkle_root
        8 +   // claim_start
        8 +   // claim_end
        8 +   // total_allocation
        8 +   // total_claimed
        8 +   // total_claimants
        1 +   // is_active
        1;    // bump
}

/// Per-user claim status account (PDA)
///
/// This account is created when a user successfully claims their allocation.
/// It prevents double-claims by existing as proof of a completed claim.
///
/// PDA derivation: [b"claim", airdrop_config.key().as_ref(), claimant.key().as_ref()]
#[account]
pub struct ClaimStatus {
    /// Wallet that claimed the airdrop
    pub claimant: Pubkey,

    /// Amount claimed in lamports
    pub amount: u64,

    /// Unix timestamp when the claim occurred
    pub claimed_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl ClaimStatus {
    /// Calculate space needed for account rent
    pub const LEN: usize = 8 +   // discriminator
        32 +  // claimant
        8 +   // amount
        8 +   // claimed_at
        1;    // bump
}

/// Event emitted when a user successfully claims their airdrop
#[event]
pub struct ClaimEvent {
    /// Wallet that claimed
    pub claimant: Pubkey,

    /// Amount claimed in lamports
    pub amount: u64,

    /// Timestamp of the claim
    pub timestamp: i64,
}

/// Event emitted when admin updates the merkle root (for multi-phase airdrops)
#[event]
pub struct UpdateMerkleRootEvent {
    /// Previous merkle root
    pub old_root: [u8; 32],

    /// New merkle root
    pub new_root: [u8; 32],

    /// Timestamp of the update
    pub timestamp: i64,
}

/// Event emitted when admin reclaims unclaimed tokens after the claim period
#[event]
pub struct ReclaimEvent {
    /// Admin who initiated the reclaim
    pub admin: Pubkey,

    /// Amount reclaimed in lamports
    pub amount: u64,

    /// Timestamp of the reclaim
    pub timestamp: i64,
}

/// Event emitted when the airdrop is closed
#[event]
pub struct CloseAirdropEvent {
    /// Admin who closed the airdrop
    pub admin: Pubkey,

    /// Total amount that was claimed
    pub total_claimed: u64,

    /// Total number of claimants
    pub total_claimants: u64,

    /// Timestamp of closure
    pub timestamp: i64,
}
