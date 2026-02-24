use anchor_lang::prelude::*;

/// Maximum number of signers in a multisig
pub const MAX_SIGNERS: usize = 10;

/// Multisig configuration for admin operations
#[account]
#[derive(InitSpace)]
pub struct Multisig {
    /// List of authorized signers
    #[max_len(10)]
    pub signers: Vec<Pubkey>,

    /// Number of signatures required to execute
    pub threshold: u8,

    /// Nonce for transaction uniqueness
    pub nonce: u64,

    /// Bump seed
    pub bump: u8,
}

impl Multisig {
    pub const SEED_PREFIX: &'static [u8] = b"multisig";

    /// Check if a pubkey is a valid signer
    pub fn is_signer(&self, pubkey: &Pubkey) -> bool {
        self.signers.contains(pubkey)
    }

    /// Validate threshold is met
    pub fn is_valid_config(&self) -> bool {
        self.threshold > 0
            && (self.threshold as usize) <= self.signers.len()
            && self.signers.len() <= MAX_SIGNERS
    }
}

/// Pending multisig transaction
#[account]
#[derive(InitSpace)]
pub struct MultisigTransaction {
    /// Associated multisig account
    pub multisig: Pubkey,

    /// Transaction nonce (prevents replay)
    pub nonce: u64,

    /// Instruction discriminator (identifies the action)
    #[max_len(8)]
    pub instruction_data: Vec<u8>,

    /// Target account for the operation
    pub target: Pubkey,

    /// Signers who have approved
    #[max_len(10)]
    pub approvers: Vec<Pubkey>,

    /// Whether transaction has been executed
    pub executed: bool,

    /// Creation timestamp
    pub created_at: i64,

    /// Expiration timestamp (transactions expire after 7 days)
    pub expires_at: i64,

    /// Bump seed
    pub bump: u8,
}

impl MultisigTransaction {
    pub const SEED_PREFIX: &'static [u8] = b"multisig_tx";
    pub const EXPIRATION_SECS: i64 = 7 * 24 * 3600; // 7 days

    /// Check if transaction has enough approvals
    pub fn has_threshold(&self, threshold: u8) -> bool {
        self.approvers.len() >= threshold as usize
    }

    /// Check if signer has already approved
    pub fn has_approved(&self, signer: &Pubkey) -> bool {
        self.approvers.contains(signer)
    }

    /// Check if transaction is expired
    pub fn is_expired(&self, current_time: i64) -> bool {
        current_time > self.expires_at
    }
}

#[error_code]
pub enum MultisigError {
    #[msg("Invalid threshold configuration")]
    InvalidThreshold,

    #[msg("Signer is not authorized")]
    UnauthorizedSigner,

    #[msg("Signer has already approved")]
    AlreadyApproved,

    #[msg("Threshold not met")]
    ThresholdNotMet,

    #[msg("Transaction already executed")]
    AlreadyExecuted,

    #[msg("Transaction expired")]
    TransactionExpired,

    #[msg("Too many signers (max 10)")]
    TooManySigners,

    #[msg("Duplicate signer")]
    DuplicateSigner,

    #[msg("Nonce overflow")]
    NonceOverflow,
}
