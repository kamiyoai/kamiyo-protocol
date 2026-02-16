use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([255u8, 17u8, 48u8, 48u8, 254u8, 88u8, 214u8, 151u8])]
pub struct VerifyReputationTierInstruction {
    pub accounts: VerifyReputationTierInstructionAccounts,
    pub data: VerifyReputationTierInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(VerifyReputationTierInstructionData)]
#[storage(FuzzAccounts)]
pub struct VerifyReputationTierInstructionAccounts {
    #[account(signer)]
    pub user: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone)]
pub struct VerifyReputationTierInstructionData {
    pub proof_a: [u8; 64],

    pub proof_b: [u8; 128],

    pub proof_c: [u8; 64],

    pub threshold: u8,

    pub commitment: [u8; 32],
}

impl Default for VerifyReputationTierInstructionData {
    fn default() -> Self {
        Self {
            proof_a: [0u8; 64],
            proof_b: [0u8; 128],
            proof_c: [0u8; 64],
            threshold: 0,
            commitment: [0u8; 32],
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
impl InstructionHooks for VerifyReputationTierInstruction {
    type IxAccounts = FuzzAccounts;
}
