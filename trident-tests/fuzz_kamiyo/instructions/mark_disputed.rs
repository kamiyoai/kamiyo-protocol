use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([136u8, 86u8, 152u8, 120u8, 3u8, 21u8, 223u8, 251u8])]
pub struct MarkDisputedInstruction {
    pub accounts: MarkDisputedInstructionAccounts,
    pub data: MarkDisputedInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(MarkDisputedInstructionData)]
#[storage(FuzzAccounts)]
pub struct MarkDisputedInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub escrow: TridentAccount,

    #[account(mut)]
    pub reputation: TridentAccount,

    #[account(mut, signer)]
    pub agent: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct MarkDisputedInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for MarkDisputedInstruction {
    type IxAccounts = FuzzAccounts;
}
