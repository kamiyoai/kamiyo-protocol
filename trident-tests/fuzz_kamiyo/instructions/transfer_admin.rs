use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([42u8, 242u8, 66u8, 106u8, 228u8, 10u8, 111u8, 156u8])]
pub struct TransferAdminInstruction {
    pub accounts: TransferAdminInstructionAccounts,
    pub data: TransferAdminInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(TransferAdminInstructionData)]
#[storage(FuzzAccounts)]
pub struct TransferAdminInstructionAccounts {
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
pub struct TransferAdminInstructionData {
    pub new_admin: TridentPubkey,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for TransferAdminInstruction {
    type IxAccounts = FuzzAccounts;

    fn set_data(&mut self, trident: &mut Trident, _fuzz_accounts: &mut Self::IxAccounts) {
        let new_admin = trident.gen_pubkey();
        self.data.new_admin.set_pubkey(new_admin);
    }
}
