use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([205u8, 171u8, 239u8, 225u8, 82u8, 126u8, 96u8, 166u8])]
pub struct DeactivateAgentInstruction {
    pub accounts: DeactivateAgentInstructionAccounts,
    pub data: DeactivateAgentInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(DeactivateAgentInstructionData)]
#[storage(FuzzAccounts)]
pub struct DeactivateAgentInstructionAccounts {
    #[account(mut)]
    pub agent: TridentAccount,

    #[account(mut, signer)]
    pub owner: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct DeactivateAgentInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for DeactivateAgentInstruction {
    type IxAccounts = FuzzAccounts;
}
