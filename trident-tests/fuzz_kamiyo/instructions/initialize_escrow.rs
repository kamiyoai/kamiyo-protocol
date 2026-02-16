use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([243u8, 160u8, 77u8, 153u8, 11u8, 92u8, 48u8, 209u8])]
pub struct InitializeEscrowInstruction {
    pub accounts: InitializeEscrowInstructionAccounts,
    pub data: InitializeEscrowInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(InitializeEscrowInstructionData)]
#[storage(FuzzAccounts)]
pub struct InitializeEscrowInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub treasury: TridentAccount,

    #[account(mut)]
    pub escrow: TridentAccount,

    #[account(mut, signer)]
    pub agent: TridentAccount,

    pub api: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,

    pub token_mint: TridentAccount,

    #[account(mut)]
    pub escrow_token_account: TridentAccount,

    #[account(mut)]
    pub agent_token_account: TridentAccount,

    #[account(address = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")]
    pub token_program: TridentAccount,

    #[account(address = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")]
    pub associated_token_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct InitializeEscrowInstructionData {
    pub amount: u64,

    pub time_lock: i64,

    pub transaction_id: String,

    pub use_spl_token: bool,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for InitializeEscrowInstruction {
    type IxAccounts = FuzzAccounts;
}
