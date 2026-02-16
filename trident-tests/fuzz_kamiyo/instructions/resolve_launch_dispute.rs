use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([131u8, 234u8, 180u8, 195u8, 105u8, 184u8, 44u8, 234u8])]
pub struct ResolveLaunchDisputeInstruction {
    pub accounts: ResolveLaunchDisputeInstructionAccounts,
    pub data: ResolveLaunchDisputeInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(ResolveLaunchDisputeInstructionData)]
#[storage(FuzzAccounts)]
pub struct ResolveLaunchDisputeInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub launch_record: TridentAccount,

    #[account(mut)]
    pub owner: TridentAccount,

    #[account(mut)]
    pub reporter: TridentAccount,

    #[account(signer)]
    pub signer_one: TridentAccount,

    #[account(signer)]
    pub signer_two: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ResolveLaunchDisputeInstructionData {
    pub quality_score: u8,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for ResolveLaunchDisputeInstruction {
    type IxAccounts = FuzzAccounts;
}
