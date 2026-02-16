use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([89u8, 93u8, 12u8, 76u8, 198u8, 56u8, 162u8, 242u8])]
pub struct RecordGraduationInstruction {
    pub accounts: RecordGraduationInstructionAccounts,
    pub data: RecordGraduationInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(RecordGraduationInstructionData)]
#[storage(FuzzAccounts)]
pub struct RecordGraduationInstructionAccounts {
    #[account(mut)]
    pub launch_record: TridentAccount,

    #[account(mut)]
    pub launch_rate_limit: TridentAccount,

    #[account(mut, signer)]
    pub owner: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct RecordGraduationInstructionData {
    pub graduation_pool: TridentPubkey,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for RecordGraduationInstruction {
    type IxAccounts = FuzzAccounts;
}
