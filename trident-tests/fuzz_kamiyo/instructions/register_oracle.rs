use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([176u8, 200u8, 234u8, 37u8, 199u8, 129u8, 164u8, 111u8])]
pub struct RegisterOracleInstruction {
    pub accounts: RegisterOracleInstructionAccounts,
    pub data: RegisterOracleInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(RegisterOracleInstructionData)]
#[storage(FuzzAccounts)]
pub struct RegisterOracleInstructionAccounts {
    #[account(mut)]
    pub oracle_registry: TridentAccount,

    #[account(mut, signer)]
    pub oracle: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct RegisterOracleInstructionData {
    pub stake_amount: u64,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for RegisterOracleInstruction {
    type IxAccounts = FuzzAccounts;
}
