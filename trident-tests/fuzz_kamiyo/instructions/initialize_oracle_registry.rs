use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([190u8, 92u8, 228u8, 114u8, 56u8, 71u8, 101u8, 220u8])]
pub struct InitializeOracleRegistryInstruction {
    pub accounts: InitializeOracleRegistryInstructionAccounts,
    pub data: InitializeOracleRegistryInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(InitializeOracleRegistryInstructionData)]
#[storage(FuzzAccounts)]
pub struct InitializeOracleRegistryInstructionAccounts {
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
pub struct InitializeOracleRegistryInstructionData {
    pub min_consensus: u8,

    pub max_score_deviation: u8,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for InitializeOracleRegistryInstruction {
    type IxAccounts = FuzzAccounts;

    fn set_data(&mut self, trident: &mut Trident, _fuzz_accounts: &mut Self::IxAccounts) {
        // Satisfy program constraints:
        // - min_consensus >= 3
        // - max_score_deviation <= 50
        self.data.min_consensus = trident.gen_range(3..10);
        self.data.max_score_deviation = trident.gen_range(0..51);
    }
}
