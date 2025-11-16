/// Constants for the KAMIYO Token-2022 program
///
/// This module defines all token specifications, fee configurations,
/// and program constants used throughout the KAMIYO token implementation.

// ============================================================================
// Token Specifications
// ============================================================================

/// Token name
pub const TOKEN_NAME: &str = "KAMIYO";

/// Token symbol
pub const TOKEN_SYMBOL: &str = "KAMIYO";

/// Token decimals (Solana standard)
pub const TOKEN_DECIMALS: u8 = 9;

/// Total supply: 1 billion KAMIYO with 9 decimals
/// 1,000,000,000 * 10^9 = 1,000,000,000,000,000,000
pub const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000_000;

/// Total supply in human-readable format (1 billion)
pub const TOTAL_SUPPLY_HUMAN: u64 = 1_000_000_000;

// ============================================================================
// Transfer Fee Configuration
// ============================================================================

/// Transfer fee in basis points (2% = 200 basis points)
/// 1 basis point = 0.01% = 1/10,000
/// 200 basis points = 2.00%
pub const TRANSFER_FEE_BASIS_POINTS: u16 = 200;

/// Maximum transfer fee cap (in smallest units with 9 decimals)
/// Set to 1,000 KAMIYO = 1,000,000,000,000 (1e12) smallest units
/// This prevents excessive fees on large transfers
pub const MAXIMUM_FEE: u64 = 1_000_000_000_000;

/// Maximum transfer fee in human-readable format (1,000 KAMIYO)
pub const MAXIMUM_FEE_HUMAN: u64 = 1_000;

/// Basis points denominator (10,000 = 100%)
pub const BASIS_POINTS_DENOMINATOR: u16 = 10_000;

// ============================================================================
// Fee Distribution
// ============================================================================

/// Treasury allocation in basis points (50% = 5000 basis points)
/// This represents the portion of transfer fees that go to the treasury
pub const TREASURY_FEE_BPS: u16 = 5_000;

/// Liquidity pool allocation in basis points (50% = 5000 basis points)
/// This represents the portion of transfer fees that go to the LP
pub const LP_FEE_BPS: u16 = 5_000;

/// Validate that fee distribution adds up to 100%
pub const _ASSERT_FEE_DISTRIBUTION: () = assert!(
    TREASURY_FEE_BPS + LP_FEE_BPS == BASIS_POINTS_DENOMINATOR,
    "Fee distribution must equal 100% (10,000 basis points)"
);

// ============================================================================
// Account Size Limits
// ============================================================================

/// Maximum number of accounts that can be harvested in a single transaction
/// Limited by Solana transaction size (~1232 bytes)
/// Each account reference is 32 bytes, plus overhead
pub const MAX_HARVEST_ACCOUNTS: u8 = 26;

/// Minimum fee balance before distribution (prevents dust)
/// Set to 1 KAMIYO = 1,000,000,000 (1e9) smallest units
pub const MIN_DISTRIBUTION_AMOUNT: u64 = 1_000_000_000;

/// Minimum fee balance in human-readable format (1 KAMIYO)
pub const MIN_DISTRIBUTION_AMOUNT_HUMAN: u64 = 1;

// ============================================================================
// Program Derived Address (PDA) Seeds
// ============================================================================

/// PDA seed for fee vault account
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";

/// PDA seed for fee configuration account
pub const FEE_CONFIG_SEED: &[u8] = b"fee_config";

/// PDA seed for token metadata account
pub const TOKEN_METADATA_SEED: &[u8] = b"token_metadata";

// ============================================================================
// Authority Configuration
// ============================================================================

/// Number of authority types supported
pub const NUM_AUTHORITY_TYPES: u8 = 4;

/// Authority type: Mint authority (can mint new tokens)
pub const AUTHORITY_TYPE_MINT: u8 = 0;

/// Authority type: Freeze authority (can freeze accounts)
pub const AUTHORITY_TYPE_FREEZE: u8 = 1;

/// Authority type: Transfer fee config authority (can update fee settings)
pub const AUTHORITY_TYPE_TRANSFER_FEE_CONFIG: u8 = 2;

/// Authority type: Withdraw withheld authority (can withdraw fees)
pub const AUTHORITY_TYPE_WITHDRAW_WITHHELD: u8 = 3;

// ============================================================================
// Epoch Configuration
// ============================================================================

/// Number of epochs delay for transfer fee updates
/// This protects users from sudden fee changes (rug pulls)
/// Fee updates take effect after 2 epoch boundaries
pub const TRANSFER_FEE_UPDATE_DELAY_EPOCHS: u64 = 2;

// ============================================================================
// Token-2022 Extension Types
// ============================================================================

/// Transfer Fee extension type identifier
/// Used for extension size calculations
pub const EXTENSION_TYPE_TRANSFER_FEE: u16 = 1;

/// Extension size for TransferFeeConfig (83 bytes)
/// 32 (transfer_fee_config_authority) + 32 (withdraw_withheld_authority)
/// + 2 (transfer_fee_basis_points) + 8 (maximum_fee)
/// + 2 (transfer_fee_basis_points_newer) + 8 (maximum_fee_newer) + 1 (padding)
pub const TRANSFER_FEE_EXTENSION_SIZE: usize = 83;

/// Base mint account size (82 bytes)
pub const BASE_MINT_SIZE: usize = 82;

/// Total mint size with TransferFee extension
pub const MINT_SIZE_WITH_TRANSFER_FEE: usize = BASE_MINT_SIZE + TRANSFER_FEE_EXTENSION_SIZE;

// ============================================================================
// Validation Limits
// ============================================================================

/// Maximum allowed transfer fee basis points (100% = 10,000 basis points)
/// Prevents setting fee higher than 100%
pub const MAX_TRANSFER_FEE_BPS: u16 = 10_000;

/// Minimum allowed maximum fee (must be > 0)
pub const MIN_MAXIMUM_FEE: u64 = 1;

/// Maximum token name length (32 characters)
pub const MAX_NAME_LENGTH: usize = 32;

/// Maximum token symbol length (10 characters)
pub const MAX_SYMBOL_LENGTH: usize = 10;

// ============================================================================
// Utility Functions
// ============================================================================

/// Calculate transfer fee for a given amount
///
/// # Arguments
/// * `amount` - Transfer amount in smallest units
///
/// # Returns
/// Fee amount in smallest units (capped at MAXIMUM_FEE)
///
/// # Example
/// ```
/// let amount = 100_000_000_000; // 100 KAMIYO
/// let fee = calculate_transfer_fee(amount);
/// // fee = 2_000_000_000 (2 KAMIYO = 2% of 100 KAMIYO)
/// ```
pub const fn calculate_transfer_fee(amount: u64) -> u64 {
    let fee = (amount as u128 * TRANSFER_FEE_BASIS_POINTS as u128) / BASIS_POINTS_DENOMINATOR as u128;
    let fee = if fee > MAXIMUM_FEE as u128 {
        MAXIMUM_FEE
    } else {
        fee as u64
    };
    fee
}

/// Calculate net amount received after transfer fee
///
/// # Arguments
/// * `amount` - Transfer amount in smallest units
///
/// # Returns
/// Net amount received after fee deduction
///
/// # Example
/// ```
/// let amount = 100_000_000_000; // 100 KAMIYO
/// let net = calculate_net_amount(amount);
/// // net = 98_000_000_000 (98 KAMIYO after 2% fee)
/// ```
pub const fn calculate_net_amount(amount: u64) -> u64 {
    amount - calculate_transfer_fee(amount)
}

/// Calculate treasury allocation from total fee
///
/// # Arguments
/// * `total_fee` - Total fee amount in smallest units
///
/// # Returns
/// Treasury allocation (50% of total fee)
pub const fn calculate_treasury_fee(total_fee: u64) -> u64 {
    (total_fee as u128 * TREASURY_FEE_BPS as u128 / BASIS_POINTS_DENOMINATOR as u128) as u64
}

/// Calculate LP allocation from total fee
///
/// # Arguments
/// * `total_fee` - Total fee amount in smallest units
///
/// # Returns
/// LP allocation (50% of total fee, handles rounding)
pub const fn calculate_lp_fee(total_fee: u64) -> u64 {
    // LP gets remainder to handle odd amounts
    total_fee - calculate_treasury_fee(total_fee)
}

// ============================================================================
// Compile-Time Assertions
// ============================================================================

/// Ensure total supply doesn't overflow u64
const _ASSERT_SUPPLY_FITS: () = assert!(
    TOTAL_SUPPLY <= u64::MAX,
    "Total supply must fit in u64"
);

/// Ensure transfer fee basis points is valid
const _ASSERT_FEE_BPS_VALID: () = assert!(
    TRANSFER_FEE_BASIS_POINTS <= MAX_TRANSFER_FEE_BPS,
    "Transfer fee basis points must be <= 10,000"
);

/// Ensure maximum fee is valid
const _ASSERT_MAX_FEE_VALID: () = assert!(
    MAXIMUM_FEE > 0,
    "Maximum fee must be greater than 0"
);

/// Ensure name and symbol lengths are within limits
const _ASSERT_NAME_LENGTH: () = assert!(
    TOKEN_NAME.len() <= MAX_NAME_LENGTH,
    "Token name exceeds maximum length"
);

const _ASSERT_SYMBOL_LENGTH: () = assert!(
    TOKEN_SYMBOL.len() <= MAX_SYMBOL_LENGTH,
    "Token symbol exceeds maximum length"
);

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_transfer_fee() {
        // Test 2% fee on 100 KAMIYO
        let amount = 100_000_000_000; // 100 KAMIYO
        let fee = calculate_transfer_fee(amount);
        assert_eq!(fee, 2_000_000_000); // 2 KAMIYO (2%)

        // Test 2% fee on 1,000 KAMIYO
        let amount = 1_000_000_000_000; // 1,000 KAMIYO
        let fee = calculate_transfer_fee(amount);
        assert_eq!(fee, 20_000_000_000); // 20 KAMIYO (2%)

        // Test maximum fee cap
        let amount = 100_000_000_000_000; // 100,000 KAMIYO
        let fee = calculate_transfer_fee(amount);
        assert_eq!(fee, MAXIMUM_FEE); // Capped at 1,000 KAMIYO
    }

    #[test]
    fn test_calculate_net_amount() {
        // Test net amount on 100 KAMIYO
        let amount = 100_000_000_000;
        let net = calculate_net_amount(amount);
        assert_eq!(net, 98_000_000_000); // 98 KAMIYO after 2% fee
    }

    #[test]
    fn test_fee_distribution() {
        // Test 50/50 split on even amount
        let total_fee = 100_000_000_000; // 100 KAMIYO
        let treasury = calculate_treasury_fee(total_fee);
        let lp = calculate_lp_fee(total_fee);
        assert_eq!(treasury, 50_000_000_000); // 50 KAMIYO
        assert_eq!(lp, 50_000_000_000); // 50 KAMIYO
        assert_eq!(treasury + lp, total_fee);

        // Test 50/50 split on odd amount (LP gets remainder)
        let total_fee = 101; // Odd number
        let treasury = calculate_treasury_fee(total_fee);
        let lp = calculate_lp_fee(total_fee);
        assert_eq!(treasury, 50);
        assert_eq!(lp, 51); // LP gets +1 from rounding
        assert_eq!(treasury + lp, total_fee);
    }

    #[test]
    fn test_constants_validity() {
        // Verify total supply is correct
        assert_eq!(TOTAL_SUPPLY, TOTAL_SUPPLY_HUMAN * 10_u64.pow(TOKEN_DECIMALS as u32));

        // Verify fee distribution adds to 100%
        assert_eq!(TREASURY_FEE_BPS + LP_FEE_BPS, BASIS_POINTS_DENOMINATOR);

        // Verify transfer fee is valid
        assert!(TRANSFER_FEE_BASIS_POINTS <= MAX_TRANSFER_FEE_BPS);

        // Verify maximum fee is valid
        assert!(MAXIMUM_FEE > 0);
    }
}
