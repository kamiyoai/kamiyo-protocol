use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([188u8, 233u8, 252u8, 106u8, 134u8, 146u8, 202u8, 91u8])]
pub struct InitializeProtocolInstruction {
    pub accounts: InitializeProtocolInstructionAccounts,
    pub data: InitializeProtocolInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(InitializeProtocolInstructionData)]
#[storage(FuzzAccounts)]
pub struct InitializeProtocolInstructionAccounts {
    #[account(mut)]
    pub protocol_config: TridentAccount,

    #[account(mut, signer)]
    pub authority: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct InitializeProtocolInstructionData {
    pub secondary_signer: TridentPubkey,

    pub tertiary_signer: TridentPubkey,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for InitializeProtocolInstruction {
    type IxAccounts = FuzzAccounts;
}
