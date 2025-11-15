use anchor_lang::prelude::*;

// Program modules
pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

// Re-export instructions
use instructions::*;

declare_id!("KAMiYoToken111111111111111111111111111111111");

/// KAMIYO Token-2022 Program
///
/// This program manages the KAMIYO token using Solana's Token-2022 standard
/// with transfer fee extensions. It implements:
///
/// - Token-2022 mint creation with transfer fee extension (2%)
/// - Fee configuration and management
/// - Authority updates for multisig security
/// - Fee harvesting and distribution
///
/// Token Specifications:
/// - Name: KAMIYO
/// - Symbol: KAMIYO
/// - Total Supply: 1,000,000,000 (1 billion)
/// - Decimals: 9 (Solana standard)
/// - Transfer Fee: 2% (200 basis points)
/// - Fee Split: 1% treasury, 1% liquidity pool
#[program]
pub mod kamiyo_token {
    use super::*;

    /// Initialize the KAMIYO Token-2022 mint with transfer fee extension
    ///
    /// This instruction creates the Token-2022 mint account with:
    /// - Transfer fee extension enabled (2% = 200 basis points)
    /// - Configurable authorities for security
    /// - Immutable supply (no mint authority after initial mint)
    ///
    /// # Arguments
    /// * `ctx` - Context containing accounts
    /// * `decimals` - Token decimals (9 for KAMIYO)
    /// * `transfer_fee_basis_points` - Fee in basis points (200 = 2%)
    /// * `maximum_fee` - Maximum fee cap in smallest units
    ///
    /// # Security
    /// - Requires authority signature
    /// - Sets up separate fee authorities
    /// - Enables multisig compatibility
    pub fn initialize_mint(
        ctx: Context<InitializeMint>,
        decimals: u8,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> Result<()> {
        instructions::initialize_mint::handler(
            ctx,
            decimals,
            transfer_fee_basis_points,
            maximum_fee,
        )
    }

    /// Update transfer fee configuration
    ///
    /// Modifies the transfer fee percentage and maximum fee cap.
    /// Changes take effect after 2 epoch boundaries to prevent rug pulls.
    ///
    /// # Arguments
    /// * `ctx` - Context containing accounts
    /// * `new_transfer_fee_basis_points` - New fee in basis points
    /// * `new_maximum_fee` - New maximum fee cap
    ///
    /// # Security
    /// - Requires transfer_fee_config_authority signature
    /// - 2-epoch delay before changes take effect
    /// - Transparent fee update mechanism
    pub fn set_transfer_fee(
        ctx: Context<SetTransferFee>,
        new_transfer_fee_basis_points: u16,
        new_maximum_fee: u64,
    ) -> Result<()> {
        instructions::set_transfer_fee::handler(
            ctx,
            new_transfer_fee_basis_points,
            new_maximum_fee,
        )
    }

    /// Update mint or fee authorities
    ///
    /// Transfers authority to a new account (typically a multisig).
    /// Supports updating:
    /// - Mint authority
    /// - Freeze authority
    /// - Transfer fee config authority
    /// - Withdraw withheld authority
    ///
    /// # Arguments
    /// * `ctx` - Context containing accounts
    /// * `authority_type` - Type of authority to update (0-3)
    /// * `new_authority` - New authority pubkey (or None to disable)
    ///
    /// # Security
    /// - Requires current authority signature
    /// - Can disable authorities by passing None
    /// - Enables progressive decentralization
    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
        authority_type: u8,
        new_authority: Option<Pubkey>,
    ) -> Result<()> {
        instructions::update_authority::handler(ctx, authority_type, new_authority)
    }

    /// Harvest accumulated fees from token accounts
    ///
    /// Collects withheld transfer fees from token accounts and consolidates
    /// them in the mint account. This is a permissionless operation that
    /// can be called by anyone to clear fees from accounts.
    ///
    /// After harvesting to mint, the withdraw authority must call
    /// withdraw_fees to actually collect the fees.
    ///
    /// # Arguments
    /// * `ctx` - Context containing accounts
    /// * `num_accounts` - Number of accounts to harvest from (max ~26)
    ///
    /// # Security
    /// - Permissionless operation (anyone can call)
    /// - Enables automated fee collection
    /// - Allows users to clear their accounts before closing
    pub fn harvest_fees(
        ctx: Context<HarvestFees>,
        num_accounts: u8,
    ) -> Result<()> {
        instructions::harvest_fees::handler(ctx, num_accounts)
    }

    /// Withdraw accumulated fees from mint
    ///
    /// Transfers all fees accumulated in the mint account to the
    /// designated destination account. Only the withdraw_withheld_authority
    /// can call this instruction.
    ///
    /// # Arguments
    /// * `ctx` - Context containing accounts
    ///
    /// # Security
    /// - Requires withdraw_withheld_authority signature
    /// - Transfers to designated fee vault
    /// - Enables subsequent fee splitting
    pub fn withdraw_fees(
        ctx: Context<WithdrawFees>,
    ) -> Result<()> {
        instructions::harvest_fees::withdraw_handler(ctx)
    }
}
