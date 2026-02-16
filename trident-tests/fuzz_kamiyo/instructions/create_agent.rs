use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([143u8, 66u8, 198u8, 95u8, 110u8, 85u8, 83u8, 249u8])]
pub struct CreateAgentInstruction {
    pub accounts: CreateAgentInstructionAccounts,
    pub data: CreateAgentInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(CreateAgentInstructionData)]
#[storage(FuzzAccounts)]
pub struct CreateAgentInstructionAccounts {
    #[account(mut)]
    pub agent: TridentAccount,

    #[account(mut, signer)]
    pub owner: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct CreateAgentInstructionData {
    pub name: String,

    pub agent_type: AgentType,

    pub stake_amount: u64,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for CreateAgentInstruction {
    type IxAccounts = FuzzAccounts;
}
