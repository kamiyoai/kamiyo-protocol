use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([249u8, 93u8, 128u8, 229u8, 7u8, 27u8, 93u8, 224u8])]
pub struct ClaimExpiredEscrowInstruction {
    pub accounts: ClaimExpiredEscrowInstructionAccounts,
    pub data: ClaimExpiredEscrowInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(ClaimExpiredEscrowInstructionData)]
#[storage(FuzzAccounts)]
pub struct ClaimExpiredEscrowInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub escrow: TridentAccount,

    #[account(mut)]
    pub agent: TridentAccount,

    #[account(mut)]
    pub api: TridentAccount,

    #[account(signer)]
    pub caller: TridentAccount,

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
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ClaimExpiredEscrowInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for ClaimExpiredEscrowInstruction {
    type IxAccounts = FuzzAccounts;
}
