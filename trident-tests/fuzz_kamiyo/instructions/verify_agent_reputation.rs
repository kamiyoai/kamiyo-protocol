use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([37u8, 172u8, 248u8, 3u8, 3u8, 163u8, 145u8, 85u8])]
pub struct VerifyAgentReputationInstruction {
    pub accounts: VerifyAgentReputationInstructionAccounts,
    pub data: VerifyAgentReputationInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(VerifyAgentReputationInstructionData)]
#[storage(FuzzAccounts)]
pub struct VerifyAgentReputationInstructionAccounts {
    #[account(mut, signer)]
    pub user: TridentAccount,

    #[account(mut)]
    pub nullifier_account: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone)]
pub struct VerifyAgentReputationInstructionData {
    pub proof_a: [u8; 64],

    pub proof_b: [u8; 128],

    pub proof_c: [u8; 64],

    pub agents_root: [u8; 32],

    pub min_reputation: u8,

    pub min_transactions: u32,

    pub nullifier: [u8; 32],
}

impl Default for VerifyAgentReputationInstructionData {
    fn default() -> Self {
        Self {
            proof_a: [0u8; 64],
            proof_b: [0u8; 128],
            proof_c: [0u8; 64],
            agents_root: [0u8; 32],
            min_reputation: 0,
            min_transactions: 0,
            nullifier: [0u8; 32],
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
impl InstructionHooks for VerifyAgentReputationInstruction {
    type IxAccounts = FuzzAccounts;
}
