use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([118u8, 153u8, 164u8, 244u8, 40u8, 128u8, 242u8, 250u8])]
pub struct RefundExpiredInstruction {
    pub accounts: RefundExpiredInstructionAccounts,
    pub data: RefundExpiredInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(RefundExpiredInstructionData)]
#[storage(FuzzAccounts)]
pub struct RefundExpiredInstructionAccounts {
    #[account(mut)]
    pub escrow: TridentAccount,

    #[account(mut)]
    pub user: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct RefundExpiredInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for RefundExpiredInstruction {
    type IxAccounts = FuzzAccounts;
}
