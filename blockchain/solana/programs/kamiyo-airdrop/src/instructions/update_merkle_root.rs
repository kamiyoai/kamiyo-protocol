use anchor_lang::prelude::*;

use crate::constants::AIRDROP_SEED;
use crate::errors::AirdropError;
use crate::state::{AirdropConfig, UpdateMerkleRootEvent};

/// Update the merkle root for multi-phase airdrops
///
/// This allows the admin to update the merkle root to add new eligible users
/// for subsequent airdrop phases. This is useful for:
/// - Phase 1: Early supporters (Week 14)
/// - Phase 2: Beta testers (Week 16)
/// - Phase 3: Community contributors (Week 18)
///
/// # Arguments
/// * `new_merkle_root` - New 32-byte merkle root hash
///
/// # Security
/// - Only admin can call this
/// - Airdrop must still be active
/// - Emits event for transparency
///
/// # Note
/// Users who already claimed (have ClaimStatus) cannot claim again even with new root
pub fn update_merkle_root(
    ctx: Context<UpdateMerkleRoot>,
    new_merkle_root: [u8; 32],
) -> Result<()> {
    let config = &mut ctx.accounts.airdrop_config;
    let clock = Clock::get()?;

    // Check authorization
    require!(
        ctx.accounts.admin.key() == config.admin,
        AirdropError::Unauthorized
    );

    // Check airdrop is still active
    require!(config.is_active, AirdropError::AirdropInactive);

    // Store old root for event
    let old_root = config.merkle_root;

    // Update to new root
    config.merkle_root = new_merkle_root;

    // Emit update event
    emit!(UpdateMerkleRootEvent {
        old_root,
        new_root: new_merkle_root,
        timestamp: clock.unix_timestamp,
    });

    msg!("Merkle root updated");
    msg!("Old root: {:?}", old_root);
    msg!("New root: {:?}", new_merkle_root);

    Ok(())
}

/// Accounts required for update_merkle_root instruction
#[derive(Accounts)]
pub struct UpdateMerkleRoot<'info> {
    /// Admin authority who controls the airdrop
    #[account(
        constraint = admin.key() == airdrop_config.admin @ AirdropError::Unauthorized
    )]
    pub admin: Signer<'info>,

    /// Airdrop configuration account (PDA)
    #[account(
        mut,
        seeds = [AIRDROP_SEED, airdrop_config.mint.as_ref()],
        bump = airdrop_config.bump,
    )]
    pub airdrop_config: Account<'info, AirdropConfig>,
}
