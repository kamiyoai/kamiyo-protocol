use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([231u8, 208u8, 47u8, 145u8, 59u8, 41u8, 65u8, 27u8])]
pub struct SubmitOracleScoreInstruction {
    pub accounts: SubmitOracleScoreInstructionAccounts,
    pub data: SubmitOracleScoreInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(SubmitOracleScoreInstructionData)]
#[storage(FuzzAccounts)]
pub struct SubmitOracleScoreInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub escrow: TridentAccount,

    pub oracle_registry: TridentAccount,

    #[account(signer)]
    pub oracle: TridentAccount,

    #[account(address = "Sysvar1nstructions1111111111111111111111111")]
    pub instructions_sysvar: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone)]
pub struct SubmitOracleScoreInstructionData {
    pub quality_score: u8,

    pub salt: [u8; 32],

    pub signature: [u8; 64],
}

impl Default for SubmitOracleScoreInstructionData {
    fn default() -> Self {
        Self {
            quality_score: 0,
            salt: [0u8; 32],
            signature: [0u8; 64],
        }
    }
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for SubmitOracleScoreInstruction {
    type IxAccounts = FuzzAccounts;
}
