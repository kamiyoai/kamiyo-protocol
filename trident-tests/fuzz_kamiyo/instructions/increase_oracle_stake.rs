use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([158u8, 251u8, 25u8, 86u8, 31u8, 253u8, 8u8, 7u8])]
pub struct IncreaseOracleStakeInstruction {
    pub accounts: IncreaseOracleStakeInstructionAccounts,
    pub data: IncreaseOracleStakeInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(IncreaseOracleStakeInstructionData)]
#[storage(FuzzAccounts)]
pub struct IncreaseOracleStakeInstructionAccounts {
    #[account(mut)]
    pub oracle_registry: TridentAccount,

    #[account(mut, signer)]
    pub oracle: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct IncreaseOracleStakeInstructionData {
    pub additional_stake: u64,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for IncreaseOracleStakeInstruction {
    type IxAccounts = FuzzAccounts;
}
