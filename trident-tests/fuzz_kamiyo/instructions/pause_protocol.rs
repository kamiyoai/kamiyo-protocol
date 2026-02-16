use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([144u8, 95u8, 0u8, 107u8, 119u8, 39u8, 248u8, 141u8])]
pub struct PauseProtocolInstruction {
    pub accounts: PauseProtocolInstructionAccounts,
    pub data: PauseProtocolInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(PauseProtocolInstructionData)]
#[storage(FuzzAccounts)]
pub struct PauseProtocolInstructionAccounts {
    #[account(mut)]
    pub protocol_config: TridentAccount,

    #[account(signer)]
    pub signer_one: TridentAccount,

    #[account(signer)]
    pub signer_two: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct PauseProtocolInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for PauseProtocolInstruction {
    type IxAccounts = FuzzAccounts;
}
