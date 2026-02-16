use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([127u8, 248u8, 219u8, 208u8, 153u8, 89u8, 154u8, 206u8])]
pub struct UpdateAgentRepInstruction {
    pub accounts: UpdateAgentRepInstructionAccounts,
    pub data: UpdateAgentRepInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(UpdateAgentRepInstructionData)]
#[storage(FuzzAccounts)]
pub struct UpdateAgentRepInstructionAccounts {
    #[account(mut)]
    pub agent: TridentAccount,

    pub oracle_registry: TridentAccount,

    #[account(signer)]
    pub authority: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct UpdateAgentRepInstructionData {
    pub delta: i64,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for UpdateAgentRepInstruction {
    type IxAccounts = FuzzAccounts;
}
