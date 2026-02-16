use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([54u8, 151u8, 53u8, 34u8, 193u8, 133u8, 227u8, 161u8])]
pub struct InitializeBlacklistRegistryInstruction {
    pub accounts: InitializeBlacklistRegistryInstructionAccounts,
    pub data: InitializeBlacklistRegistryInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(InitializeBlacklistRegistryInstructionData)]
#[storage(FuzzAccounts)]
pub struct InitializeBlacklistRegistryInstructionAccounts {
    #[account(
        mut,
        storage::name = registry,
        storage::account_id = 0,
        seeds = [b"blacklist_registry"],
        lamports = 0
    )]
    pub registry: TridentAccount,

    #[account(mut, signer, storage::name = authority, storage::account_id = 0)]
    pub authority: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct InitializeBlacklistRegistryInstructionData {}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for InitializeBlacklistRegistryInstruction {
    type IxAccounts = FuzzAccounts;
}
