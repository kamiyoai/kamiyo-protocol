use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([40u8, 63u8, 122u8, 158u8, 144u8, 216u8, 83u8, 96u8])]
pub struct WithdrawTreasuryInstruction {
    pub accounts: WithdrawTreasuryInstructionAccounts,
    pub data: WithdrawTreasuryInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(WithdrawTreasuryInstructionData)]
#[storage(FuzzAccounts)]
pub struct WithdrawTreasuryInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub treasury: TridentAccount,

    #[account(signer)]
    pub signer_one: TridentAccount,

    #[account(signer)]
    pub signer_two: TridentAccount,

    #[account(mut)]
    pub recipient: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct WithdrawTreasuryInstructionData {
    pub amount: u64,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for WithdrawTreasuryInstruction {
    type IxAccounts = FuzzAccounts;
}
