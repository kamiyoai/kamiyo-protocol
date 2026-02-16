use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([42u8, 207u8, 57u8, 56u8, 127u8, 217u8, 73u8, 194u8])]
pub struct ResetOracleRegistryInstruction {
    pub accounts: ResetOracleRegistryInstructionAccounts,
    pub data: ResetOracleRegistryInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(ResetOracleRegistryInstructionData)]
#[storage(FuzzAccounts)]
pub struct ResetOracleRegistryInstructionAccounts {
    #[account(
        mut,
        storage::name = oracle_registry,
        storage::account_id = 0,
        seeds = [b"oracle_registry"],
        lamports = 0
    )]
    pub oracle_registry: TridentAccount,

    #[account(mut, signer, storage::name = admin, storage::account_id = 0)]
    pub admin: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ResetOracleRegistryInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for ResetOracleRegistryInstruction {
    type IxAccounts = FuzzAccounts;
}
