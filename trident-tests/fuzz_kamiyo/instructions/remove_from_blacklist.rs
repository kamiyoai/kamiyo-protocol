use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([47u8, 105u8, 20u8, 10u8, 165u8, 168u8, 203u8, 219u8])]
pub struct RemoveFromBlacklistInstruction {
    pub accounts: RemoveFromBlacklistInstructionAccounts,
    pub data: RemoveFromBlacklistInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(RemoveFromBlacklistInstructionData)]
#[storage(FuzzAccounts)]
pub struct RemoveFromBlacklistInstructionAccounts {
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
pub struct RemoveFromBlacklistInstructionData {
    pub agent: TridentPubkey,

    pub new_root: [u8; 32],
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for RemoveFromBlacklistInstruction {
    type IxAccounts = FuzzAccounts;

    fn set_data(&mut self, trident: &mut Trident, _fuzz_accounts: &mut Self::IxAccounts) {
        let agent = trident.gen_pubkey();
        self.data.agent.set_pubkey(agent);

        trident.fill_bytes(&mut self.data.new_root);
    }
}
