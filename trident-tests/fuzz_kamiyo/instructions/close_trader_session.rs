use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([51u8, 80u8, 230u8, 21u8, 61u8, 68u8, 251u8, 62u8])]
pub struct CloseTraderSessionInstruction {
    pub accounts: CloseTraderSessionInstructionAccounts,
    pub data: CloseTraderSessionInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(CloseTraderSessionInstructionData)]
#[storage(FuzzAccounts)]
pub struct CloseTraderSessionInstructionAccounts {
    #[account(mut)]
    pub trader_session: TridentAccount,

    #[account(mut)]
    pub agent_identity: TridentAccount,

    #[account(mut, signer)]
    pub owner: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct CloseTraderSessionInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for CloseTraderSessionInstruction {
    type IxAccounts = FuzzAccounts;
}
