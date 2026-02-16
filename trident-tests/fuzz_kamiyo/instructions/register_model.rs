use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([111u8, 236u8, 93u8, 31u8, 195u8, 210u8, 142u8, 125u8])]
pub struct RegisterModelInstruction {
    pub accounts: RegisterModelInstructionAccounts,
    pub data: RegisterModelInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(RegisterModelInstructionData)]
#[storage(FuzzAccounts)]
pub struct RegisterModelInstructionAccounts {
    #[account(mut)]
    pub model: TridentAccount,

    #[account(mut, signer)]
    pub owner: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct RegisterModelInstructionData {
    pub model_id: [u8; 32],
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for RegisterModelInstruction {
    type IxAccounts = FuzzAccounts;
}
