use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([173u8, 102u8, 250u8, 62u8, 43u8, 122u8, 11u8, 69u8])]
pub struct ClaimOracleRewardsInstruction {
    pub accounts: ClaimOracleRewardsInstructionAccounts,
    pub data: ClaimOracleRewardsInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(ClaimOracleRewardsInstructionData)]
#[storage(FuzzAccounts)]
pub struct ClaimOracleRewardsInstructionAccounts {
    #[account(mut)]
    pub oracle_registry: TridentAccount,

    #[account(mut)]
    pub treasury: TridentAccount,

    #[account(mut, signer)]
    pub oracle: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ClaimOracleRewardsInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for ClaimOracleRewardsInstruction {
    type IxAccounts = FuzzAccounts;
}
