use borsh::{BorshDeserialize, BorshSerialize};
use trident_fuzz::fuzzing::*;

/// File containing all custom types which can be used
/// in transactions and instructions or invariant checks.
///
/// You can define your own custom types here.

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AdminTransferred {
    pub registry: TridentPubkey,

    pub old_admin: TridentPubkey,

    pub new_admin: TridentPubkey,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AgentBlacklisted {
    pub registry: TridentPubkey,

    pub agent: TridentPubkey,

    pub reason: String,

    pub root: [u8; 32],
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AgentCreated {
    pub agent_pda: TridentPubkey,

    pub owner: TridentPubkey,

    pub name: String,

    pub agent_type: u8,

    pub stake_amount: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AgentDeactivated {
    pub agent_pda: TridentPubkey,

    pub owner: TridentPubkey,

    pub refunded_stake: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AgentIdentity {
    pub owner: TridentPubkey,

    pub name: String,

    pub agent_type: AgentType,

    pub reputation: u64,

    pub stake_amount: u64,

    pub is_active: bool,

    pub created_at: i64,

    pub last_active: i64,

    pub total_escrows: u64,

    pub successful_escrows: u64,

    pub disputed_escrows: u64,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AgentReputationUpdated {
    pub agent_pda: TridentPubkey,

    pub old_reputation: u64,

    pub new_reputation: u64,

    pub delta: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AgentReputationVerified {
    pub user: TridentPubkey,

    pub agents_root: [u8; 32],

    pub min_reputation: u8,

    pub min_transactions: u32,

    pub nullifier: [u8; 32],

    pub timestamp: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AgentSlashed {
    pub agent: TridentPubkey,

    pub slash_amount: u64,

    pub reason: String,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub enum AgentType {
    #[default]
    Trading,

    Service,

    Oracle,

    Custom,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct AgentUnblacklisted {
    pub registry: TridentPubkey,

    pub agent: TridentPubkey,

    pub root: [u8; 32],
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct BlacklistRegistry {
    pub authority: TridentPubkey,

    pub root: [u8; 32],

    pub leaf_count: u64,

    pub last_updated: i64,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct BlacklistRegistryInitialized {
    pub registry: TridentPubkey,

    pub authority: TridentPubkey,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct DisputeMarked {
    pub escrow: TridentPubkey,

    pub agent: TridentPubkey,

    pub transaction_id: String,

    pub timestamp: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct DisputeResolved {
    pub escrow: TridentPubkey,

    pub transaction_id: String,

    pub quality_score: u8,

    pub refund_percentage: u8,

    pub refund_amount: u64,

    pub payment_amount: u64,

    pub verifier: TridentPubkey,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct EntityReputation {
    pub entity: TridentPubkey,

    pub entity_type: EntityType,

    pub total_transactions: u64,

    pub disputes_filed: u64,

    pub disputes_won: u64,

    pub disputes_partial: u64,

    pub disputes_lost: u64,

    pub average_quality_received: u8,

    pub reputation_score: u16,

    pub created_at: i64,

    pub last_updated: i64,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub enum EntityType {
    #[default]
    Agent,

    Provider,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct Escrow {
    pub agent: TridentPubkey,

    pub api: TridentPubkey,

    pub amount: u64,

    pub status: EscrowStatus,

    pub created_at: i64,

    pub expires_at: i64,

    pub transaction_id: String,

    pub bump: u8,

    pub quality_score: Option<u8>,

    pub refund_percentage: Option<u8>,

    pub oracle_submissions: Vec<OracleSubmission>,

    pub oracle_commitments: Vec<OracleCommitment>,

    pub token_mint: Option<TridentPubkey>,

    pub escrow_token_account: Option<TridentPubkey>,

    pub token_decimals: u8,

    pub disputed_at: Option<i64>,

    pub commit_phase_ends_at: Option<i64>,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct EscrowInitialized {
    pub escrow: TridentPubkey,

    pub agent: TridentPubkey,

    pub api: TridentPubkey,

    pub amount: u64,

    pub expires_at: i64,

    pub transaction_id: String,

    pub is_token: bool,

    pub token_mint: Option<TridentPubkey>,

    pub creation_fee: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub enum EscrowStatus {
    #[default]
    Active,

    Released,

    Disputed,

    Resolved,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ExpiredEscrowClaimed {
    pub escrow: TridentPubkey,

    pub claimer: TridentPubkey,

    pub amount: u64,

    pub claim_type: String,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct FundsReleased {
    pub escrow: TridentPubkey,

    pub transaction_id: String,

    pub amount: u64,

    pub api: TridentPubkey,

    pub timestamp: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct InferenceEscrow {
    pub user: TridentPubkey,

    pub model_owner: TridentPubkey,

    pub model_id: [u8; 32],

    pub amount: u64,

    pub quality_threshold: u8,

    pub status: InferenceStatus,

    pub quality_score: Option<u8>,

    pub created_at: i64,

    pub expires_at: i64,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct InferenceEscrowCreated {
    pub escrow: TridentPubkey,

    pub user: TridentPubkey,

    pub model_id: [u8; 32],

    pub amount: u64,

    pub quality_threshold: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct InferenceRefunded {
    pub escrow: TridentPubkey,

    pub user: TridentPubkey,

    pub amount: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct InferenceSettled {
    pub escrow: TridentPubkey,

    pub quality_score: u8,

    pub user_refund: u64,

    pub provider_payment: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub enum InferenceStatus {
    #[default]
    Pending,

    Settled,

    Refunded,

    Expired,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct LaunchDisputeResolved {
    pub launch_record: TridentPubkey,

    pub agent: TridentPubkey,

    pub reporter: TridentPubkey,

    pub quality_score: u8,

    pub refund_percentage: u8,

    pub refund_amount: u64,

    pub owner_amount: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct LaunchDisputed {
    pub launch_record: TridentPubkey,

    pub agent: TridentPubkey,

    pub reporter: TridentPubkey,

    pub evidence_hash: String,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct LaunchEscrowReleased {
    pub launch_record: TridentPubkey,

    pub agent: TridentPubkey,

    pub escrow_amount: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct LaunchGraduated {
    pub launch_record: TridentPubkey,

    pub agent: TridentPubkey,

    pub mint: TridentPubkey,

    pub graduation_pool: TridentPubkey,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct LaunchRateLimit {
    pub agent: TridentPubkey,

    pub launches_today: u8,

    pub launches_this_week: u8,

    pub last_day_reset: i64,

    pub last_week_reset: i64,

    pub total_launches: u64,

    pub total_graduated: u64,

    pub total_disputed: u64,

    pub total_abandoned: u64,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct LaunchRecord {
    pub agent: TridentPubkey,

    pub owner: TridentPubkey,

    pub mint: TridentPubkey,

    pub fundry_coin_id: String,

    pub config_type: String,

    pub escrow_amount: u64,

    pub status: LaunchStatus,

    pub migration_target_sol: u64,

    pub creator_allocation_bps: u16,

    pub quality_score: Option<u8>,

    pub refund_percentage: Option<u8>,

    pub reputation_updated: bool,

    pub graduation_pool: Option<TridentPubkey>,

    pub dispute_reporter: Option<TridentPubkey>,

    pub dispute_evidence_hash: String,

    pub oracle_commitments: Vec<[u8; 32]>,

    pub oracle_submissions: Vec<OracleSubmission>,

    pub commit_phase_ends_at: Option<i64>,

    pub created_at: i64,

    pub updated_at: i64,

    pub disputed_at: Option<i64>,

    pub resolved_at: Option<i64>,

    pub released_at: Option<i64>,

    pub graduated_at: Option<i64>,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub enum LaunchStatus {
    #[default]
    Active,

    Released,

    Disputed,

    Resolved,

    Graduated,

    Abandoned,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ModelRegistered {
    pub model: TridentPubkey,

    pub model_id: [u8; 32],

    pub owner: TridentPubkey,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ModelReputation {
    pub model_id: [u8; 32],

    pub owner: TridentPubkey,

    pub total_inferences: u64,

    pub successful_inferences: u64,

    pub total_quality_sum: u64,

    pub disputes: u64,

    pub created_at: i64,

    pub last_updated: i64,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ModelReputationUpdated {
    pub model: TridentPubkey,

    pub total_inferences: u64,

    pub successful_inferences: u64,

    pub avg_quality: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct MultiOracleDisputeResolved {
    pub escrow: TridentPubkey,

    pub transaction_id: String,

    pub oracle_count: u8,

    pub individual_scores: Vec<u8>,

    pub oracles: Vec<TridentPubkey>,

    pub consensus_score: u8,

    pub refund_percentage: u8,

    pub refund_amount: u64,

    pub payment_amount: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleAdded {
    pub registry: TridentPubkey,

    pub oracle: TridentPubkey,

    pub oracle_type_index: u8,

    pub weight: u16,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleCommitment {
    pub oracle: TridentPubkey,

    pub commitment_hash: [u8; 32],

    pub committed_at: i64,

    pub revealed: bool,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleConfig {
    pub pubkey: TridentPubkey,

    pub oracle_type: OracleType,

    pub weight: u16,

    pub stake_amount: u64,

    pub violation_count: u8,

    pub total_rewards: u64,

    pub disputes_participated: u32,

    pub consensus_votes: u32,

    pub registered_at: i64,

    pub withdrawal_requested_at: i64,

    pub status: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleRegistered {
    pub registry: TridentPubkey,

    pub oracle: TridentPubkey,

    pub stake_amount: u64,

    pub weight: u16,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleRegistry {
    pub admin: TridentPubkey,

    pub oracles: Vec<OracleConfig>,

    pub min_consensus: u8,

    pub max_score_deviation: u8,

    pub created_at: i64,

    pub updated_at: i64,

    pub bump: u8,

    pub public_registration: bool,

    pub total_stake: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleRegistryInitialized {
    pub registry: TridentPubkey,

    pub admin: TridentPubkey,

    pub min_consensus: u8,

    pub max_score_deviation: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleRemoved {
    pub registry: TridentPubkey,

    pub oracle: TridentPubkey,

    pub reason: String,

    pub violation_count: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleRewarded {
    pub oracle: TridentPubkey,

    pub reward_amount: u64,

    pub escrow: TridentPubkey,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleRewardsClaimed {
    pub oracle: TridentPubkey,

    pub amount: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleScoreCommitted {
    pub escrow: TridentPubkey,

    pub oracle: TridentPubkey,

    pub commitment_hash: [u8; 32],

    pub commit_phase_ends_at: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleScoreRevealed {
    pub escrow: TridentPubkey,

    pub oracle: TridentPubkey,

    pub quality_score: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleSlashed {
    pub oracle: TridentPubkey,

    pub slash_amount: u64,

    pub violation_count: u8,

    pub reason: String,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleStakeIncreased {
    pub registry: TridentPubkey,

    pub oracle: TridentPubkey,

    pub additional_stake: u64,

    pub new_total_stake: u64,

    pub new_weight: u16,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleSubmission {
    pub oracle: TridentPubkey,

    pub quality_score: u8,

    pub submitted_at: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub enum OracleType {
    #[default]
    Ed25519,

    Switchboard,

    Custom,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleWithdrawalCancelled {
    pub registry: TridentPubkey,

    pub oracle: TridentPubkey,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleWithdrawalCompleted {
    pub registry: TridentPubkey,

    pub oracle: TridentPubkey,

    pub stake_returned: u64,

    pub rewards_claimed: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct OracleWithdrawalRequested {
    pub registry: TridentPubkey,

    pub oracle: TridentPubkey,

    pub available_at: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ProtocolConfig {
    pub authority: TridentPubkey,

    pub secondary_signer: TridentPubkey,

    pub tertiary_signer: TridentPubkey,

    pub required_signatures: u8,

    pub paused: bool,

    pub version: u8,

    pub total_escrows_created: u64,

    pub total_volume_locked: u64,

    pub created_at: i64,

    pub updated_at: i64,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ProtocolConfigInitialized {
    pub config: TridentPubkey,

    pub authority: TridentPubkey,

    pub version: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ProtocolPaused {
    pub config: TridentPubkey,

    pub authority: TridentPubkey,

    pub timestamp: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ProtocolUnpaused {
    pub config: TridentPubkey,

    pub authority: TridentPubkey,

    pub timestamp: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ReputationNullifier {
    pub nullifier: [u8; 32],

    pub user: TridentPubkey,

    pub verified_at: i64,

    pub min_reputation: u8,

    pub min_transactions: u32,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct ReputationTierVerified {
    pub user: TridentPubkey,

    pub threshold: u8,

    pub commitment: [u8; 32],

    pub timestamp: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct TradeEscrow {
    pub session: TridentPubkey,

    pub agent: TridentPubkey,

    pub trader: TridentPubkey,

    pub trade_id: String,

    pub collateral_usdc: u64,

    pub status: TradeEscrowStatus,

    pub created_at: i64,

    pub expires_at: i64,

    pub settled_at: Option<i64>,

    pub pnl_reported: Option<i64>,

    pub quality_score: Option<u8>,

    pub slashed_amount: u64,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct TradeEscrowCreated {
    pub escrow: TridentPubkey,

    pub session: TridentPubkey,

    pub agent: TridentPubkey,

    pub trade_id: String,

    pub collateral_usdc: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub enum TradeEscrowStatus {
    #[default]
    Active,

    Settled,

    Disputed,

    Released,

    Slashed,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct TraderSession {
    pub agent: TridentPubkey,

    pub owner: TridentPubkey,

    pub elfa_session_id: String,

    pub status: TraderSessionStatus,

    pub created_at: i64,

    pub closed_at: Option<i64>,

    pub total_trades: u64,

    pub total_volume_usdc: u64,

    pub pnl_net: i64,

    pub last_trade_at: Option<i64>,

    pub trade_escrow_count: u32,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct TraderSessionClosed {
    pub session: TridentPubkey,

    pub agent: TridentPubkey,

    pub total_trades: u64,

    pub total_volume_usdc: u64,

    pub pnl_net: i64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct TraderSessionCreated {
    pub session: TridentPubkey,

    pub agent: TridentPubkey,

    pub owner: TridentPubkey,

    pub elfa_session_id: String,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub enum TraderSessionStatus {
    #[default]
    Active,

    Closed,

    Suspended,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct Treasury {
    pub admin: TridentPubkey,

    pub total_fees_collected: u64,

    pub total_slashed_collected: u64,

    pub total_withdrawn: u64,

    pub created_at: i64,

    pub updated_at: i64,

    pub bump: u8,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct TreasuryDeposit {
    pub amount: u64,

    pub source: String,

    pub escrow: TridentPubkey,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct TreasuryWithdrawal {
    pub treasury: TridentPubkey,

    pub admin: TridentPubkey,

    pub amount: u64,

    pub remaining_balance: u64,
}

#[derive(Debug, BorshDeserialize, BorshSerialize, Clone, Default)]
pub struct TrustedLaunchCreated {
    pub launch_record: TridentPubkey,

    pub agent: TridentPubkey,

    pub mint: TridentPubkey,

    pub fundry_coin_id: String,

    pub config_type: String,

    pub escrow_amount: u64,
}
