use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([151u8, 138u8, 61u8, 32u8, 111u8, 163u8, 204u8, 32u8])]
pub struct FinalizeMultiOracleDisputeInstruction {
    pub accounts: FinalizeMultiOracleDisputeInstructionAccounts,
    pub data: FinalizeMultiOracleDisputeInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(FinalizeMultiOracleDisputeInstructionData)]
#[storage(FuzzAccounts)]
pub struct FinalizeMultiOracleDisputeInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub escrow: TridentAccount,

    #[account(mut)]
    pub oracle_registry: TridentAccount,

    #[account(mut)]
    pub agent: TridentAccount,

    #[account(mut)]
    pub api: TridentAccount,

    #[account(mut)]
    pub agent_identity: TridentAccount,

    #[account(signer)]
    pub caller: TridentAccount,

    #[account(mut)]
    pub treasury: TridentAccount,

    #[account(mut)]
    pub escrow_token_account: TridentAccount,

    #[account(mut)]
    pub agent_token_account: TridentAccount,

    #[account(mut)]
    pub api_token_account: TridentAccount,

    #[account(mut)]
    pub treasury_token_account: TridentAccount,

    #[account(address = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")]
    pub token_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct FinalizeMultiOracleDisputeInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for FinalizeMultiOracleDisputeInstruction {
    type IxAccounts = FuzzAccounts;
}
