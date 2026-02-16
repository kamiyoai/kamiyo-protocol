use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([149u8, 181u8, 111u8, 61u8, 122u8, 174u8, 71u8, 51u8])]
pub struct CreateTradeEscrowInstruction {
    pub accounts: CreateTradeEscrowInstructionAccounts,
    pub data: CreateTradeEscrowInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(CreateTradeEscrowInstructionData)]
#[storage(FuzzAccounts)]
pub struct CreateTradeEscrowInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub trader_session: TridentAccount,

    #[account(mut)]
    pub trade_escrow: TridentAccount,

    #[account(mut, signer)]
    pub trader: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct CreateTradeEscrowInstructionData {
    pub trade_id: String,

    pub collateral_usdc: u64,

    pub time_lock: i64,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for CreateTradeEscrowInstruction {
    type IxAccounts = FuzzAccounts;
}
