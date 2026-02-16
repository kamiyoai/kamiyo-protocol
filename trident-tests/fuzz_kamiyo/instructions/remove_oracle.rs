use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([60u8, 93u8, 51u8, 197u8, 182u8, 42u8, 170u8, 26u8])]
pub struct RemoveOracleInstruction {
    pub accounts: RemoveOracleInstructionAccounts,
    pub data: RemoveOracleInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(RemoveOracleInstructionData)]
#[storage(FuzzAccounts)]
pub struct RemoveOracleInstructionAccounts {
    #[account(mut)]
    pub oracle_registry: TridentAccount,

    #[account(signer)]
    pub admin: TridentAccount,

    #[account(mut)]
    pub oracle_wallet: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct RemoveOracleInstructionData {
    pub oracle_pubkey: TridentPubkey,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for RemoveOracleInstruction {
    type IxAccounts = FuzzAccounts;
}
