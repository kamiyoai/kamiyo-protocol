use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([225u8, 88u8, 91u8, 108u8, 126u8, 52u8, 2u8, 26u8])]
pub struct ReleaseFundsInstruction {
    pub accounts: ReleaseFundsInstructionAccounts,
    pub data: ReleaseFundsInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(ReleaseFundsInstructionData)]
#[storage(FuzzAccounts)]
pub struct ReleaseFundsInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub escrow: TridentAccount,

    #[account(mut, signer)]
    pub caller: TridentAccount,

    #[account(mut)]
    pub api: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,

    #[account(mut)]
    pub escrow_token_account: TridentAccount,

    #[account(mut)]
    pub api_token_account: TridentAccount,

    #[account(address = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")]
    pub token_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ReleaseFundsInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for ReleaseFundsInstruction {
    type IxAccounts = FuzzAccounts;
}
