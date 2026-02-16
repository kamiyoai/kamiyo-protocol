use trident_fuzz::fuzzing::*;

/// FuzzAccounts contains all available accounts
///
/// You can create your own accounts by adding new fields to the struct.
///
/// Docs: https://ackee.xyz/trident/docs/latest/trident-api-macro/trident-types/fuzz-accounts/
#[derive(Default)]
pub struct FuzzAccounts {
    pub agent_token_account: AccountsStorage,

    pub entity: AccountsStorage,

    pub agent: AccountsStorage,

    pub token_mint: AccountsStorage,

    pub recipient: AccountsStorage,

    pub treasury: AccountsStorage,

    pub nullifier_account: AccountsStorage,

    pub treasury_token_account: AccountsStorage,

    pub associated_token_program: AccountsStorage,

    pub caller: AccountsStorage,

    pub api: AccountsStorage,

    pub system_program: AccountsStorage,

    pub signer_one: AccountsStorage,

    pub model_owner: AccountsStorage,

    pub trader: AccountsStorage,

    pub mint: AccountsStorage,

    pub model: AccountsStorage,

    pub oracle_signer: AccountsStorage,

    pub owner: AccountsStorage,

    pub reputation: AccountsStorage,

    pub payer: AccountsStorage,

    pub api_token_account: AccountsStorage,

    pub agent_reputation: AccountsStorage,

    pub api_reputation: AccountsStorage,

    pub reporter: AccountsStorage,

    pub launch_rate_limit: AccountsStorage,

    pub registry: AccountsStorage,

    pub signer_two: AccountsStorage,

    pub oracle_wallet: AccountsStorage,

    pub authority: AccountsStorage,

    pub protocol_config: AccountsStorage,

    pub token_program: AccountsStorage,

    pub user: AccountsStorage,

    pub trader_session: AccountsStorage,

    pub launch_record: AccountsStorage,

    pub oracle_registry: AccountsStorage,

    pub escrow: AccountsStorage,

    pub agent_identity: AccountsStorage,

    pub verifier: AccountsStorage,

    pub instructions_sysvar: AccountsStorage,

    pub trade_escrow: AccountsStorage,

    pub escrow_token_account: AccountsStorage,

    pub admin: AccountsStorage,

    pub oracle: AccountsStorage,
}
