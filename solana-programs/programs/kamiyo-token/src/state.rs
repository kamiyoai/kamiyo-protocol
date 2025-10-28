use anchor_lang::prelude::*;

/// Fee Vault Account
///
/// This PDA stores accumulated fees before distribution to treasury and LP.
/// The fee splitter program will transfer fees from this vault to the
/// final destinations (50% treasury, 50% LP).
#[account]
pub struct FeeVault {
    /// Authority that can withdraw from this vault (fee splitter program)
    pub authority: Pubkey,

    /// The KAMIYO mint address
    pub mint: Pubkey,

    /// Total fees accumulated (for tracking/analytics)
    pub total_accumulated: u64,

    /// Total fees distributed to treasury
    pub total_to_treasury: u64,

    /// Total fees distributed to LP
    pub total_to_lp: u64,

    /// Last distribution timestamp
    pub last_distribution: i64,

    /// Bump seed for PDA derivation
    pub bump: u8,
}

impl FeeVault {
    /// Size of FeeVault account in bytes
    /// 8 (discriminator) + 32 (authority) + 32 (mint) + 8 (total_accumulated)
    /// + 8 (total_to_treasury) + 8 (total_to_lp) + 8 (last_distribution) + 1 (bump)
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1;

    /// PDA seed prefix
    pub const SEED_PREFIX: &'static [u8] = b"fee_vault";
}

/// Fee Distribution Configuration
///
/// Stores the configuration for splitting fees between treasury and LP.
/// This can be updated via governance if needed.
#[account]
pub struct FeeConfig {
    /// Authority that can update fee distribution (typically DAO/multisig)
    pub authority: Pubkey,

    /// Treasury wallet that receives 50% of fees
    pub treasury: Pubkey,

    /// LP rewards wallet that receives 50% of fees
    pub lp_rewards: Pubkey,

    /// Treasury allocation (basis points, default 5000 = 50%)
    pub treasury_bps: u16,

    /// LP rewards allocation (basis points, default 5000 = 50%)
    pub lp_bps: u16,

    /// Whether automatic distribution is enabled
    pub auto_distribute: bool,

    /// Minimum fee balance before distribution (prevents dust)
    pub min_distribution_amount: u64,

    /// Bump seed for PDA derivation
    pub bump: u8,
}

impl FeeConfig {
    /// Size of FeeConfig account in bytes
    /// 8 (discriminator) + 32 (authority) + 32 (treasury) + 32 (lp_rewards)
    /// + 2 (treasury_bps) + 2 (lp_bps) + 1 (auto_distribute)
    /// + 8 (min_distribution_amount) + 1 (bump)
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 2 + 2 + 1 + 8 + 1;

    /// PDA seed prefix
    pub const SEED_PREFIX: &'static [u8] = b"fee_config";

    /// Default treasury allocation (50% = 5000 basis points)
    pub const DEFAULT_TREASURY_BPS: u16 = 5000;

    /// Default LP allocation (50% = 5000 basis points)
    pub const DEFAULT_LP_BPS: u16 = 5000;

    /// Basis points denominator (10000 = 100%)
    pub const BPS_DENOMINATOR: u16 = 10000;
}

/// Token Metadata (for tracking)
///
/// Stores metadata about the KAMIYO token for on-chain queries.
/// This is separate from Token-2022's metadata extension and is
/// used for program-specific tracking.
#[account]
pub struct TokenMetadata {
    /// The token mint address
    pub mint: Pubkey,

    /// Token name
    pub name: String,

    /// Token symbol
    pub symbol: String,

    /// Total supply (fixed at 1 billion)
    pub total_supply: u64,

    /// Decimals
    pub decimals: u8,

    /// Transfer fee basis points (200 = 2%)
    pub transfer_fee_bps: u16,

    /// Maximum fee cap
    pub max_fee: u64,

    /// Creation timestamp
    pub created_at: i64,

    /// Bump seed for PDA derivation
    pub bump: u8,
}

impl TokenMetadata {
    /// Size of TokenMetadata account in bytes
    /// 8 (discriminator) + 32 (mint) + 4 + 32 (name) + 4 + 32 (symbol)
    /// + 8 (total_supply) + 1 (decimals) + 2 (transfer_fee_bps)
    /// + 8 (max_fee) + 8 (created_at) + 1 (bump)
    pub const SIZE: usize = 8 + 32 + 4 + 32 + 4 + 32 + 8 + 1 + 2 + 8 + 8 + 1;

    /// PDA seed prefix
    pub const SEED_PREFIX: &'static [u8] = b"token_metadata";

    /// KAMIYO token specifications
    pub const TOKEN_NAME: &'static str = "KAMIYO";
    pub const TOKEN_SYMBOL: &'static str = "KAMIYO";
    pub const TOKEN_DECIMALS: u8 = 9;
    pub const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000_000; // 1 billion with 9 decimals
    pub const TRANSFER_FEE_BPS: u16 = 200; // 2%
}

/// Authority Type Enum
///
/// Defines the different types of authorities that can be updated.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AuthorityType {
    /// Mint authority (can mint new tokens)
    MintAuthority = 0,

    /// Freeze authority (can freeze accounts)
    FreezeAuthority = 1,

    /// Transfer fee config authority (can update fee settings)
    TransferFeeConfigAuthority = 2,

    /// Withdraw withheld authority (can withdraw fees)
    WithdrawWithheldAuthority = 3,
}

impl AuthorityType {
    /// Convert from u8 to AuthorityType
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(AuthorityType::MintAuthority),
            1 => Some(AuthorityType::FreezeAuthority),
            2 => Some(AuthorityType::TransferFeeConfigAuthority),
            3 => Some(AuthorityType::WithdrawWithheldAuthority),
            _ => None,
        }
    }
}

/// Events emitted by the program

#[event]
pub struct MintInitializedEvent {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub decimals: u8,
    pub transfer_fee_bps: u16,
    pub max_fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct TransferFeeUpdatedEvent {
    pub mint: Pubkey,
    pub old_fee_bps: u16,
    pub new_fee_bps: u16,
    pub old_max_fee: u64,
    pub new_max_fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityUpdatedEvent {
    pub mint: Pubkey,
    pub authority_type: u8,
    pub old_authority: Option<Pubkey>,
    pub new_authority: Option<Pubkey>,
    pub timestamp: i64,
}

#[event]
pub struct FeesHarvestedEvent {
    pub mint: Pubkey,
    pub num_accounts: u8,
    pub total_harvested: u64,
    pub timestamp: i64,
}

#[event]
pub struct FeesWithdrawnEvent {
    pub mint: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct FeesDistributedEvent {
    pub mint: Pubkey,
    pub treasury_amount: u64,
    pub lp_amount: u64,
    pub total_amount: u64,
    pub timestamp: i64,
}
