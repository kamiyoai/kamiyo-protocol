// Constants for the KAMIYO Airdrop Program

/// Claim period duration in days
pub const CLAIM_PERIOD_DAYS: i64 = 90;

/// Seconds per day
pub const SECONDS_PER_DAY: i64 = 86_400;

/// Total claim period in seconds (90 days)
pub const CLAIM_PERIOD_SECONDS: i64 = CLAIM_PERIOD_DAYS * SECONDS_PER_DAY; // 7,776,000 seconds

/// Total airdrop allocation (100 million KAMIYO)
pub const TOTAL_AIRDROP_ALLOCATION: u64 = 100_000_000 * 1_000_000_000; // 100M KAMIYO in lamports

/// Maximum allocation per wallet (10,000 KAMIYO)
pub const MAX_ALLOCATION_PER_WALLET: u64 = 10_000 * 1_000_000_000; // 10k KAMIYO in lamports

/// Minimum allocation to claim (100 KAMIYO)
pub const MIN_ALLOCATION_TO_CLAIM: u64 = 100 * 1_000_000_000; // 100 KAMIYO in lamports

/// PDA seeds
pub const AIRDROP_SEED: &[u8] = b"airdrop";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";
pub const CLAIM_SEED: &[u8] = b"claim";
