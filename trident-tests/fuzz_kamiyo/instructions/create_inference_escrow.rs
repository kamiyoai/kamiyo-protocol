use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([201u8, 99u8, 104u8, 165u8, 226u8, 34u8, 240u8, 226u8])]
pub struct CreateInferenceEscrowInstruction {
    pub accounts: CreateInferenceEscrowInstructionAccounts,
    pub data: CreateInferenceEscrowInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(CreateInferenceEscrowInstructionData)]
#[storage(FuzzAccounts)]
pub struct CreateInferenceEscrowInstructionAccounts {
    #[account(mut)]
    pub escrow: TridentAccount,

    pub model: TridentAccount,

    #[account(mut, signer)]
    pub user: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct CreateInferenceEscrowInstructionData {
    pub model_id: [u8; 32],

    pub amount: u64,

    pub quality_threshold: u8,

    pub expires_in: i64,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for CreateInferenceEscrowInstruction {
    type IxAccounts = FuzzAccounts;
}
