use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([231u8, 6u8, 202u8, 6u8, 96u8, 103u8, 12u8, 230u8])]
pub struct ResolveDisputeInstruction {
    pub accounts: ResolveDisputeInstructionAccounts,
    pub data: ResolveDisputeInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(ResolveDisputeInstructionData)]
#[storage(FuzzAccounts)]
pub struct ResolveDisputeInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub escrow: TridentAccount,

    #[account(mut)]
    pub agent: TridentAccount,

    #[account(mut)]
    pub api: TridentAccount,

    pub oracle_registry: TridentAccount,

    pub verifier: TridentAccount,

    #[account(address = "Sysvar1nstructions1111111111111111111111111")]
    pub instructions_sysvar: TridentAccount,

    #[account(mut)]
    pub agent_reputation: TridentAccount,

    #[account(mut)]
    pub api_reputation: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,

    #[account(mut)]
    pub escrow_token_account: TridentAccount,

    #[account(mut)]
    pub agent_token_account: TridentAccount,

    #[account(mut)]
    pub api_token_account: TridentAccount,

    #[account(address = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")]
    pub token_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone)]
pub struct ResolveDisputeInstructionData {
    pub quality_score: u8,

    pub refund_percentage: u8,

    pub signature: [u8; 64],
}

impl Default for ResolveDisputeInstructionData {
    fn default() -> Self {
        Self {
            quality_score: 0,
            refund_percentage: 0,
            signature: [0u8; 64],
        }
    }
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for ResolveDisputeInstruction {
    type IxAccounts = FuzzAccounts;
}
