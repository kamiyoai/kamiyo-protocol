use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([35u8, 76u8, 36u8, 77u8, 136u8, 112u8, 158u8, 222u8])]
pub struct TransferProtocolAuthorityInstruction {
    pub accounts: TransferProtocolAuthorityInstructionAccounts,
    pub data: TransferProtocolAuthorityInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(TransferProtocolAuthorityInstructionData)]
#[storage(FuzzAccounts)]
pub struct TransferProtocolAuthorityInstructionAccounts {
    #[account(mut)]
    pub protocol_config: TridentAccount,

    #[account(signer)]
    pub signer_one: TridentAccount,

    #[account(signer)]
    pub signer_two: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct TransferProtocolAuthorityInstructionData {
    pub signer_to_replace: TridentPubkey,

    pub new_signer: TridentPubkey,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for TransferProtocolAuthorityInstruction {
    type IxAccounts = FuzzAccounts;
}
