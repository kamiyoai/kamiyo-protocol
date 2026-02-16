use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([232u8, 11u8, 35u8, 82u8, 100u8, 216u8, 142u8, 108u8])]
pub struct CommitOracleScoreInstruction {
    pub accounts: CommitOracleScoreInstructionAccounts,
    pub data: CommitOracleScoreInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(CommitOracleScoreInstructionData)]
#[storage(FuzzAccounts)]
pub struct CommitOracleScoreInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub escrow: TridentAccount,

    pub oracle_registry: TridentAccount,

    #[account(signer)]
    pub oracle: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct CommitOracleScoreInstructionData {
    pub commitment_hash: [u8; 32],
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for CommitOracleScoreInstruction {
    type IxAccounts = FuzzAccounts;
}
