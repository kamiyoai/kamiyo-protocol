use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([231u8, 138u8, 9u8, 141u8, 248u8, 198u8, 41u8, 142u8])]
pub struct DisputeLaunchInstruction {
    pub accounts: DisputeLaunchInstructionAccounts,
    pub data: DisputeLaunchInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(DisputeLaunchInstructionData)]
#[storage(FuzzAccounts)]
pub struct DisputeLaunchInstructionAccounts {
    #[account(mut)]
    pub launch_record: TridentAccount,

    #[account(mut)]
    pub launch_rate_limit: TridentAccount,

    #[account(mut, signer)]
    pub reporter: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct DisputeLaunchInstructionData {
    pub evidence_hash: String,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for DisputeLaunchInstruction {
    type IxAccounts = FuzzAccounts;
}
