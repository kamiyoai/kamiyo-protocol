use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([76u8, 241u8, 67u8, 243u8, 69u8, 225u8, 57u8, 129u8])]
pub struct SettleInferenceInstruction {
    pub accounts: SettleInferenceInstructionAccounts,
    pub data: SettleInferenceInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(SettleInferenceInstructionData)]
#[storage(FuzzAccounts)]
pub struct SettleInferenceInstructionAccounts {
    #[account(mut)]
    pub escrow: TridentAccount,

    #[account(mut)]
    pub model: TridentAccount,

    #[account(mut)]
    pub user: TridentAccount,

    #[account(mut)]
    pub model_owner: TridentAccount,

    #[account(signer)]
    pub caller: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct SettleInferenceInstructionData {
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
impl InstructionHooks for SettleInferenceInstruction {
    type IxAccounts = FuzzAccounts;
}
