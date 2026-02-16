use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([229u8, 144u8, 251u8, 90u8, 130u8, 37u8, 184u8, 154u8])]
pub struct ReleaseLaunchInstruction {
    pub accounts: ReleaseLaunchInstructionAccounts,
    pub data: ReleaseLaunchInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(ReleaseLaunchInstructionData)]
#[storage(FuzzAccounts)]
pub struct ReleaseLaunchInstructionAccounts {
    #[account(mut)]
    pub launch_record: TridentAccount,

    #[account(mut, signer)]
    pub owner: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ReleaseLaunchInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for ReleaseLaunchInstruction {
    type IxAccounts = FuzzAccounts;
}
