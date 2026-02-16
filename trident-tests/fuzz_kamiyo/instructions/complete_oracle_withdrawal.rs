use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([14u8, 192u8, 156u8, 131u8, 82u8, 194u8, 123u8, 77u8])]
pub struct CompleteOracleWithdrawalInstruction {
    pub accounts: CompleteOracleWithdrawalInstructionAccounts,
    pub data: CompleteOracleWithdrawalInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(CompleteOracleWithdrawalInstructionData)]
#[storage(FuzzAccounts)]
pub struct CompleteOracleWithdrawalInstructionAccounts {
    #[account(mut)]
    pub oracle_registry: TridentAccount,

    #[account(mut, signer)]
    pub oracle: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct CompleteOracleWithdrawalInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for CompleteOracleWithdrawalInstruction {
    type IxAccounts = FuzzAccounts;
}
