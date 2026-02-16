use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([236u8, 239u8, 233u8, 112u8, 220u8, 149u8, 26u8, 175u8])]
pub struct InitReputationInstruction {
    pub accounts: InitReputationInstructionAccounts,
    pub data: InitReputationInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(InitReputationInstructionData)]
#[storage(FuzzAccounts)]
pub struct InitReputationInstructionAccounts {
    #[account(mut)]
    pub reputation: TridentAccount,

    pub entity: TridentAccount,

    #[account(mut, signer)]
    pub payer: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct InitReputationInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for InitReputationInstruction {
    type IxAccounts = FuzzAccounts;
}
