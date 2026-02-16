use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([234u8, 213u8, 168u8, 230u8, 177u8, 46u8, 220u8, 222u8])]
pub struct CreateTraderSessionInstruction {
    pub accounts: CreateTraderSessionInstructionAccounts,
    pub data: CreateTraderSessionInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(CreateTraderSessionInstructionData)]
#[storage(FuzzAccounts)]
pub struct CreateTraderSessionInstructionAccounts {
    pub protocol_config: TridentAccount,

    pub agent_identity: TridentAccount,

    #[account(mut)]
    pub trader_session: TridentAccount,

    #[account(mut, signer)]
    pub owner: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct CreateTraderSessionInstructionData {
    pub elfa_session_id: String,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for CreateTraderSessionInstruction {
    type IxAccounts = FuzzAccounts;
}
