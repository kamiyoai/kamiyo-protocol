use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([124u8, 186u8, 211u8, 195u8, 85u8, 165u8, 129u8, 166u8])]
pub struct InitializeTreasuryInstruction {
    pub accounts: InitializeTreasuryInstructionAccounts,
    pub data: InitializeTreasuryInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(InitializeTreasuryInstructionData)]
#[storage(FuzzAccounts)]
pub struct InitializeTreasuryInstructionAccounts {
    #[account(mut)]
    pub treasury: TridentAccount,

    #[account(mut, signer)]
    pub admin: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct InitializeTreasuryInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for InitializeTreasuryInstruction {
    type IxAccounts = FuzzAccounts;
}
