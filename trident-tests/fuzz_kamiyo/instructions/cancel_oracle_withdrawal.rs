use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([15u8, 164u8, 8u8, 30u8, 220u8, 104u8, 76u8, 144u8])]
pub struct CancelOracleWithdrawalInstruction {
    pub accounts: CancelOracleWithdrawalInstructionAccounts,
    pub data: CancelOracleWithdrawalInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(CancelOracleWithdrawalInstructionData)]
#[storage(FuzzAccounts)]
pub struct CancelOracleWithdrawalInstructionAccounts {
    #[account(mut)]
    pub oracle_registry: TridentAccount,

    #[account(mut, signer)]
    pub oracle: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct CancelOracleWithdrawalInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for CancelOracleWithdrawalInstruction {
    type IxAccounts = FuzzAccounts;
}
