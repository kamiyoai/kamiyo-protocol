use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([185u8, 165u8, 165u8, 167u8, 208u8, 207u8, 55u8, 35u8])]
pub struct AddOracleInstruction {
    pub accounts: AddOracleInstructionAccounts,
    pub data: AddOracleInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(AddOracleInstructionData)]
#[storage(FuzzAccounts)]
pub struct AddOracleInstructionAccounts {
    #[account(mut)]
    pub oracle_registry: TridentAccount,

    #[account(signer)]
    pub admin: TridentAccount,

    #[account(mut, signer)]
    pub oracle_signer: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AddOracleInstructionData {
    pub oracle_pubkey: TridentPubkey,

    pub oracle_type: OracleType,

    pub weight: u16,

    pub stake_amount: u64,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for AddOracleInstruction {
    type IxAccounts = FuzzAccounts;
}
