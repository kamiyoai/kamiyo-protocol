use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([196u8, 73u8, 50u8, 12u8, 13u8, 32u8, 14u8, 75u8])]
pub struct SetPublicRegistrationInstruction {
    pub accounts: SetPublicRegistrationInstructionAccounts,
    pub data: SetPublicRegistrationInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(SetPublicRegistrationInstructionData)]
#[storage(FuzzAccounts)]
pub struct SetPublicRegistrationInstructionAccounts {
    #[account(
        mut,
        storage::name = oracle_registry,
        storage::account_id = 0,
        seeds = [b"oracle_registry"],
        lamports = 0
    )]
    pub oracle_registry: TridentAccount,

    #[account(signer, storage::name = admin, storage::account_id = 0)]
    pub admin: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct SetPublicRegistrationInstructionData {
    pub enabled: bool,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for SetPublicRegistrationInstruction {
    type IxAccounts = FuzzAccounts;

    fn set_data(&mut self, trident: &mut Trident, _fuzz_accounts: &mut Self::IxAccounts) {
        self.data.enabled = trident.gen_range(0..2) == 1;
    }
}
