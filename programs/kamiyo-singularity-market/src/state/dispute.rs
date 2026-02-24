//! Dispute Resolution State
//!
//! Multi-oracle dispute resolution for market outcomes.
//! Based on quality-based arbitration with stake-backed accountability.

use anchor_lang::prelude::*;

/// Dispute bond required to file a dispute (0.1 SOL)
pub const DISPUTE_BOND: u64 = 100_000_000;

/// Minimum oracles required for consensus
pub const MIN_CONSENSUS_ORACLES: u8 = 3;

/// Maximum oracles that can vote on a dispute
pub const MAX_DISPUTE_ORACLES: usize = 7;

/// Reveal delay after first oracle submission (5 minutes)
pub const ORACLE_REVEAL_DELAY: i64 = 300;

/// Dispute window after resolution (7 days)
pub const DISPUTE_WINDOW: i64 = 7 * 24 * 60 * 60;

/// Maximum score deviation for consensus (15 points)
pub const MAX_SCORE_DEVIATION: u8 = 15;

/// Oracle reward percentage of dispute bond (split among oracles)
pub const ORACLE_REWARD_PERCENT: u8 = 50;

/// A dispute against a market resolution
#[account]
#[derive(InitSpace)]
pub struct Dispute {
    /// Market being disputed
    pub market: Pubkey,

    /// Who filed the dispute
    pub disputer: Pubkey,

    /// Original oracle that resolved the market
    pub original_oracle: Pubkey,

    /// Original resolved outcome (1 = Yes, 2 = No)
    pub original_outcome: u8,

    /// Dispute status
    pub status: DisputeStatus,

    /// Bond amount locked
    pub bond_amount: u64,

    /// Dispute reason/evidence hash
    #[max_len(64)]
    pub reason_hash: String,

    /// Oracle submissions for this dispute
    #[max_len(7)]
    pub oracle_submissions: Vec<DisputeOracleSubmission>,

    /// Final consensus outcome (if resolved)
    pub consensus_outcome: Option<u8>,

    /// Final consensus score
    pub consensus_score: Option<u8>,

    /// Created timestamp
    pub created_at: i64,

    /// First oracle submission timestamp (for reveal delay)
    pub first_submission_at: Option<i64>,

    /// Resolution timestamp
    pub resolved_at: Option<i64>,

    /// Bump seed
    pub bump: u8,
}

impl Dispute {
    pub const SEED_PREFIX: &'static [u8] = b"dispute";

    /// Check if enough oracles have submitted
    pub fn has_minimum_consensus(&self) -> bool {
        self.oracle_submissions.len() >= MIN_CONSENSUS_ORACLES as usize
    }

    /// Check if reveal delay has passed
    pub fn reveal_delay_passed(&self, current_time: i64) -> bool {
        match self.first_submission_at {
            Some(first) => current_time >= first + ORACLE_REVEAL_DELAY,
            None => false,
        }
    }
}

/// Oracle submission for a dispute
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct DisputeOracleSubmission {
    /// Oracle that submitted
    pub oracle: Pubkey,

    /// Outcome vote (1 = Yes, 2 = No, 3 = Invalid/Cancel)
    pub outcome_vote: u8,

    /// Confidence score (0-100)
    pub confidence_score: u8,

    /// Submission timestamp
    pub submitted_at: i64,
}

/// Status of a dispute
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum DisputeStatus {
    /// Dispute filed, awaiting oracle votes
    #[default]
    Pending,

    /// Oracle voting in progress
    Voting,

    /// Dispute upheld - original resolution overturned
    Upheld,

    /// Dispute rejected - original resolution stands
    Rejected,

    /// Dispute resulted in market cancellation
    Cancelled,

    /// Expired without resolution
    Expired,
}

/// Calculate weighted consensus from oracle submissions
pub fn calculate_dispute_consensus(
    submissions: &[DisputeOracleSubmission],
    oracle_weights: &[(Pubkey, u16)],
    max_deviation: u8,
) -> Result<(u8, u8)> {
    if submissions.is_empty() {
        return Err(error!(DisputeError::NoOracleSubmissions));
    }

    // Calculate weighted outcome votes
    let mut yes_weight: u64 = 0;
    let mut no_weight: u64 = 0;
    let mut cancel_weight: u64 = 0;
    let mut total_weight: u64 = 0;
    let mut confidence_sum: u64 = 0;

    for submission in submissions {
        let weight = oracle_weights
            .iter()
            .find(|(pk, _)| *pk == submission.oracle)
            .map(|(_, w)| *w as u64)
            .unwrap_or(100);

        match submission.outcome_vote {
            1 => yes_weight += weight,
            2 => no_weight += weight,
            3 => cancel_weight += weight,
            _ => {}
        }
        total_weight += weight;
        confidence_sum += submission.confidence_score as u64 * weight;
    }

    if total_weight == 0 {
        return Err(error!(DisputeError::NoConsensusReached));
    }

    // Determine winning outcome (needs > 50% of weighted votes)
    let threshold = total_weight / 2;
    let outcome = if yes_weight > threshold {
        1u8
    } else if no_weight > threshold {
        2u8
    } else if cancel_weight > threshold {
        3u8
    } else {
        return Err(error!(DisputeError::NoConsensusReached));
    };

    // Calculate average confidence (weighted)
    let avg_confidence = (confidence_sum / total_weight) as u8;

    // Check confidence deviation
    let mut max_diff = 0u8;
    for submission in submissions {
        let diff = if submission.confidence_score > avg_confidence {
            submission.confidence_score - avg_confidence
        } else {
            avg_confidence - submission.confidence_score
        };
        if diff > max_diff {
            max_diff = diff;
        }
    }

    if max_diff > max_deviation {
        return Err(error!(DisputeError::ExcessiveScoreDeviation));
    }

    Ok((outcome, avg_confidence))
}

#[error_code]
pub enum DisputeError {
    #[msg("No oracle submissions")]
    NoOracleSubmissions,

    #[msg("No consensus reached")]
    NoConsensusReached,

    #[msg("Excessive score deviation among oracles")]
    ExcessiveScoreDeviation,

    #[msg("Dispute window expired")]
    DisputeWindowExpired,

    #[msg("Dispute not in valid state")]
    InvalidDisputeStatus,

    #[msg("Reveal delay not met")]
    RevealDelayNotMet,

    #[msg("Insufficient dispute bond")]
    InsufficientBond,

    #[msg("Duplicate oracle submission")]
    DuplicateSubmission,

    #[msg("Maximum oracles reached")]
    MaxOraclesReached,

    #[msg("Oracle not registered")]
    OracleNotRegistered,

    #[msg("Market not in disputed state")]
    MarketNotDisputed,

    #[msg("Original outcome matches consensus")]
    OutcomeUnchanged,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_submission(oracle: [u8; 32], outcome: u8, score: u8) -> DisputeOracleSubmission {
        DisputeOracleSubmission {
            oracle: Pubkey::new_from_array(oracle),
            outcome_vote: outcome,
            confidence_score: score,
            submitted_at: 0,
        }
    }

    #[test]
    fn test_consensus_yes_majority() {
        let submissions = vec![
            make_submission([1; 32], 1, 80), // Yes
            make_submission([2; 32], 1, 85), // Yes
            make_submission([3; 32], 2, 70), // No
        ];
        let weights = vec![
            (Pubkey::new_from_array([1; 32]), 100),
            (Pubkey::new_from_array([2; 32]), 100),
            (Pubkey::new_from_array([3; 32]), 100),
        ];

        let result = calculate_dispute_consensus(&submissions, &weights, 20);
        assert!(result.is_ok());
        let (outcome, _score) = result.unwrap();
        assert_eq!(outcome, 1); // Yes wins
    }

    #[test]
    fn test_consensus_no_majority() {
        let submissions = vec![
            make_submission([1; 32], 2, 90), // No
            make_submission([2; 32], 2, 85), // No
            make_submission([3; 32], 1, 80), // Yes
        ];
        let weights = vec![];

        let result = calculate_dispute_consensus(&submissions, &weights, 20);
        assert!(result.is_ok());
        let (outcome, _score) = result.unwrap();
        assert_eq!(outcome, 2); // No wins
    }

    #[test]
    fn test_weighted_consensus() {
        // Two Yes oracles with weight 50 each (total 100)
        // One No oracle with weight 200
        let submissions = vec![
            make_submission([1; 32], 1, 80),
            make_submission([2; 32], 1, 80),
            make_submission([3; 32], 2, 80),
        ];
        let weights = vec![
            (Pubkey::new_from_array([1; 32]), 50),
            (Pubkey::new_from_array([2; 32]), 50),
            (Pubkey::new_from_array([3; 32]), 200),
        ];

        let result = calculate_dispute_consensus(&submissions, &weights, 20);
        assert!(result.is_ok());
        let (outcome, _score) = result.unwrap();
        assert_eq!(outcome, 2); // No wins due to weight
    }

    #[test]
    fn test_no_consensus_split() {
        // Equal split - no majority
        let submissions = vec![
            make_submission([1; 32], 1, 80),
            make_submission([2; 32], 2, 80),
        ];
        let weights = vec![
            (Pubkey::new_from_array([1; 32]), 100),
            (Pubkey::new_from_array([2; 32]), 100),
        ];

        let result = calculate_dispute_consensus(&submissions, &weights, 20);
        assert!(result.is_err());
    }

    #[test]
    fn test_excessive_deviation_fails() {
        let submissions = vec![
            make_submission([1; 32], 1, 100), // High confidence
            make_submission([2; 32], 1, 50),  // Low confidence
            make_submission([3; 32], 1, 75),
        ];
        let weights = vec![];

        // Max deviation of 15 should fail (actual deviation is 25)
        let result = calculate_dispute_consensus(&submissions, &weights, 15);
        assert!(result.is_err());
    }

    #[test]
    fn test_cancel_outcome() {
        let submissions = vec![
            make_submission([1; 32], 3, 90), // Cancel
            make_submission([2; 32], 3, 85), // Cancel
            make_submission([3; 32], 1, 80), // Yes
        ];
        let weights = vec![];

        let result = calculate_dispute_consensus(&submissions, &weights, 20);
        assert!(result.is_ok());
        let (outcome, _score) = result.unwrap();
        assert_eq!(outcome, 3); // Cancel wins
    }

    #[test]
    fn test_dispute_minimum_consensus() {
        let mut dispute = Dispute {
            market: Pubkey::default(),
            disputer: Pubkey::default(),
            original_oracle: Pubkey::default(),
            original_outcome: 1,
            status: DisputeStatus::Pending,
            bond_amount: DISPUTE_BOND,
            reason_hash: String::new(),
            oracle_submissions: vec![],
            consensus_outcome: None,
            consensus_score: None,
            created_at: 0,
            first_submission_at: None,
            resolved_at: None,
            bump: 0,
        };

        assert!(!dispute.has_minimum_consensus());

        dispute
            .oracle_submissions
            .push(make_submission([1; 32], 1, 80));
        assert!(!dispute.has_minimum_consensus());

        dispute
            .oracle_submissions
            .push(make_submission([2; 32], 1, 80));
        assert!(!dispute.has_minimum_consensus());

        dispute
            .oracle_submissions
            .push(make_submission([3; 32], 1, 80));
        assert!(dispute.has_minimum_consensus());
    }

    #[test]
    fn test_reveal_delay() {
        let dispute = Dispute {
            market: Pubkey::default(),
            disputer: Pubkey::default(),
            original_oracle: Pubkey::default(),
            original_outcome: 1,
            status: DisputeStatus::Voting,
            bond_amount: DISPUTE_BOND,
            reason_hash: String::new(),
            oracle_submissions: vec![],
            consensus_outcome: None,
            consensus_score: None,
            created_at: 1000,
            first_submission_at: Some(1000),
            resolved_at: None,
            bump: 0,
        };

        // Before delay
        assert!(!dispute.reveal_delay_passed(1000 + ORACLE_REVEAL_DELAY - 1));

        // After delay
        assert!(dispute.reveal_delay_passed(1000 + ORACLE_REVEAL_DELAY));
        assert!(dispute.reveal_delay_passed(1000 + ORACLE_REVEAL_DELAY + 100));
    }

    #[test]
    fn test_reveal_delay_not_started() {
        let dispute = Dispute {
            market: Pubkey::default(),
            disputer: Pubkey::default(),
            original_oracle: Pubkey::default(),
            original_outcome: 1,
            status: DisputeStatus::Pending,
            bond_amount: DISPUTE_BOND,
            reason_hash: String::new(),
            oracle_submissions: vec![],
            consensus_outcome: None,
            consensus_score: None,
            created_at: 1000,
            first_submission_at: None, // No submissions yet
            resolved_at: None,
            bump: 0,
        };

        // Should always return false if no submission
        assert!(!dispute.reveal_delay_passed(1000000));
    }

    #[test]
    fn test_empty_submissions() {
        let submissions: Vec<DisputeOracleSubmission> = vec![];
        let weights = vec![];

        let result = calculate_dispute_consensus(&submissions, &weights, 20);
        assert!(result.is_err());
    }

    #[test]
    fn test_single_oracle_majority() {
        // Single oracle should not reach consensus (need > 50%)
        let submissions = vec![make_submission([1; 32], 1, 90)];
        let weights = vec![];

        // A single vote of 100 weight vs threshold of 50 should actually pass
        let result = calculate_dispute_consensus(&submissions, &weights, 20);
        assert!(result.is_ok());
        let (outcome, _) = result.unwrap();
        assert_eq!(outcome, 1);
    }

    #[test]
    fn test_three_way_split_no_consensus() {
        let submissions = vec![
            make_submission([1; 32], 1, 80), // Yes
            make_submission([2; 32], 2, 80), // No
            make_submission([3; 32], 3, 80), // Cancel
        ];
        let weights = vec![
            (Pubkey::new_from_array([1; 32]), 100),
            (Pubkey::new_from_array([2; 32]), 100),
            (Pubkey::new_from_array([3; 32]), 100),
        ];

        // Equal three-way split should fail
        let result = calculate_dispute_consensus(&submissions, &weights, 20);
        assert!(result.is_err());
    }

    #[test]
    fn test_confidence_boundary() {
        let submissions = vec![
            make_submission([1; 32], 1, 75),
            make_submission([2; 32], 1, 90), // 15 above avg ~82
            make_submission([3; 32], 1, 82),
        ];
        let weights = vec![];

        // Max deviation of 15, should be exactly at boundary
        let result = calculate_dispute_consensus(&submissions, &weights, 15);
        // Avg confidence = (75 + 90 + 82) / 3 = 82.33
        // Max diff = 90 - 82 = 8, which is < 15, so should pass
        assert!(result.is_ok());
    }

    #[test]
    fn test_oracle_with_zero_confidence() {
        let submissions = vec![
            make_submission([1; 32], 1, 0),
            make_submission([2; 32], 1, 100),
            make_submission([3; 32], 1, 50),
        ];
        let weights = vec![];

        // Deviation is 50 (avg = 50, max diff = 50)
        let result = calculate_dispute_consensus(&submissions, &weights, 50);
        assert!(result.is_ok());

        // With strict deviation, should fail
        let result = calculate_dispute_consensus(&submissions, &weights, 40);
        assert!(result.is_err());
    }
}
