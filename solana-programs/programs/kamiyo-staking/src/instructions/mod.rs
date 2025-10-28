/// Instruction modules for KAMIYO staking program

pub mod initialize_pool;
pub mod stake;
pub mod claim_rewards;
pub mod unstake;
pub mod withdraw;
pub mod update_pool;
pub mod fund_pool;

// Re-export instruction structs
pub use initialize_pool::*;
pub use stake::*;
pub use claim_rewards::*;
pub use unstake::*;
pub use withdraw::*;
pub use update_pool::*;
pub use fund_pool::*;
