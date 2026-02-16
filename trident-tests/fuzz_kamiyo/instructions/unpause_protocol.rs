use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([183u8, 154u8, 5u8, 183u8, 105u8, 76u8, 87u8, 18u8])]
pub struct UnpauseProtocolInstruction {
    pub accounts: UnpauseProtocolInstructionAccounts,
    pub data: UnpauseProtocolInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(UnpauseProtocolInstructionData)]
#[storage(FuzzAccounts)]
pub struct UnpauseProtocolInstructionAccounts {
    #[account(mut)]
    pub protocol_config: TridentAccount,

    #[account(signer)]
    pub signer_one: TridentAccount,

    #[account(signer)]
    pub signer_two: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct UnpauseProtocolInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for UnpauseProtocolInstruction {
    type IxAccounts = FuzzAccounts;
}
