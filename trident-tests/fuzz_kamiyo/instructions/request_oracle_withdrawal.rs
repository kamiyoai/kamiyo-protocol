use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([129u8, 245u8, 65u8, 237u8, 71u8, 70u8, 109u8, 225u8])]
pub struct RequestOracleWithdrawalInstruction {
    pub accounts: RequestOracleWithdrawalInstructionAccounts,
    pub data: RequestOracleWithdrawalInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(RequestOracleWithdrawalInstructionData)]
#[storage(FuzzAccounts)]
pub struct RequestOracleWithdrawalInstructionAccounts {
    #[account(mut)]
    pub oracle_registry: TridentAccount,

    #[account(mut, signer)]
    pub oracle: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct RequestOracleWithdrawalInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for RequestOracleWithdrawalInstruction {
    type IxAccounts = FuzzAccounts;
}
