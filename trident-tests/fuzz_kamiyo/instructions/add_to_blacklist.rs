use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([90u8, 115u8, 98u8, 231u8, 173u8, 119u8, 117u8, 176u8])]
pub struct AddToBlacklistInstruction {
    pub accounts: AddToBlacklistInstructionAccounts,
    pub data: AddToBlacklistInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(AddToBlacklistInstructionData)]
#[storage(FuzzAccounts)]
pub struct AddToBlacklistInstructionAccounts {
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
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AddToBlacklistInstructionData {
    pub agent: TridentPubkey,

    pub new_root: [u8; 32],

    pub reason: String,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for AddToBlacklistInstruction {
    type IxAccounts = FuzzAccounts;

    fn set_data(&mut self, trident: &mut Trident, _fuzz_accounts: &mut Self::IxAccounts) {
        let agent = trident.gen_pubkey();
        self.data.agent.set_pubkey(agent);

        trident.fill_bytes(&mut self.data.new_root);

        let reason_len: usize = trident.gen_range(0..33);
        self.data.reason = trident.gen_string(reason_len);
    }
}
