use crate::fuzz_accounts::FuzzAccounts;
use crate::types::*;
use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

#[derive(TridentInstruction, Default)]
#[program_id("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr")]
#[discriminator([125u8, 132u8, 155u8, 54u8, 52u8, 252u8, 242u8, 150u8])]
pub struct CreateTrustedLaunchInstruction {
    pub accounts: CreateTrustedLaunchInstructionAccounts,
    pub data: CreateTrustedLaunchInstructionData,
}

/// Instruction Accounts
#[derive(Debug, Clone, TridentAccounts, Default)]
#[instruction_data(CreateTrustedLaunchInstructionData)]
#[storage(FuzzAccounts)]
pub struct CreateTrustedLaunchInstructionAccounts {
    pub protocol_config: TridentAccount,

    #[account(mut)]
    pub treasury: TridentAccount,

    pub agent_identity: TridentAccount,

    #[account(mut)]
    pub launch_record: TridentAccount,

    #[account(mut)]
    pub launch_rate_limit: TridentAccount,

    pub mint: TridentAccount,

    #[account(mut, signer)]
    pub owner: TridentAccount,

    #[account(address = "11111111111111111111111111111111")]
    pub system_program: TridentAccount,
}

/// Instruction Data
#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct CreateTrustedLaunchInstructionData {
    pub fundry_coin_id: String,

    pub config_type: String,

    pub escrow_amount: u64,

    pub migration_target_sol: u64,

    pub creator_allocation_bps: u16,
}

/// Implementation of instruction setters for fuzzing
///
/// Provides methods to:
/// - Set instruction data during fuzzing
/// - Configure instruction accounts during fuzzing
/// - (Optional) Set remaining accounts during fuzzing
///
/// Docs: https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/
impl InstructionHooks for CreateTrustedLaunchInstruction {
    type IxAccounts = FuzzAccounts;
}
