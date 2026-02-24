use anchor_lang::prelude::*;

/// Maximum number of approved oracles in the registry
pub const MAX_ORACLES: usize = 32;

/// Oracle information with weight and status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct OracleInfo {
    /// Oracle public key
    pub pubkey: Pubkey,

    /// Oracle weight for consensus (default 100)
    pub weight: Option<u16>,

    /// Whether the oracle is active
    pub is_active: bool,

    /// Total resolutions by this oracle
    pub resolution_count: u32,

    /// Disputes against this oracle
    pub dispute_count: u32,
}

/// Oracle Registry - stores list of approved oracles for market resolution
#[account]
#[derive(InitSpace)]
pub struct OracleRegistry {
    /// Registry authority (can add/remove oracles)
    pub authority: Pubkey,

    /// List of approved oracles with metadata
    #[max_len(32)]
    pub oracles: Vec<OracleInfo>,

    /// Whether to enforce oracle validation (can be disabled for testing)
    pub enforce_validation: bool,

    /// Bump seed for PDA
    pub bump: u8,
}

impl OracleRegistry {
    pub const SEED_PREFIX: &'static [u8] = b"oracle_registry";

    /// Check if an oracle is approved and active
    pub fn is_approved(&self, oracle: &Pubkey) -> bool {
        if !self.enforce_validation {
            return true;
        }
        self.oracles
            .iter()
            .any(|o| o.pubkey == *oracle && o.is_active)
    }

    /// Add an oracle to the registry
    pub fn add_oracle(&mut self, oracle: Pubkey) -> Result<()> {
        require!(
            self.oracles.len() < MAX_ORACLES,
            OracleRegistryError::RegistryFull
        );
        require!(
            !self.oracles.iter().any(|o| o.pubkey == oracle),
            OracleRegistryError::OracleAlreadyRegistered
        );
        self.oracles.push(OracleInfo {
            pubkey: oracle,
            weight: None,
            is_active: true,
            resolution_count: 0,
            dispute_count: 0,
        });
        Ok(())
    }

    /// Remove an oracle from the registry
    pub fn remove_oracle(&mut self, oracle: &Pubkey) -> Result<()> {
        let idx = self
            .oracles
            .iter()
            .position(|o| o.pubkey == *oracle)
            .ok_or(OracleRegistryError::OracleNotFound)?;
        self.oracles.remove(idx);
        Ok(())
    }

    /// Deactivate an oracle (keeps history)
    pub fn deactivate_oracle(&mut self, oracle: &Pubkey) -> Result<()> {
        let info = self
            .oracles
            .iter_mut()
            .find(|o| o.pubkey == *oracle)
            .ok_or(OracleRegistryError::OracleNotFound)?;
        info.is_active = false;
        Ok(())
    }

    /// Set oracle weight
    pub fn set_oracle_weight(&mut self, oracle: &Pubkey, weight: u16) -> Result<()> {
        let info = self
            .oracles
            .iter_mut()
            .find(|o| o.pubkey == *oracle)
            .ok_or(OracleRegistryError::OracleNotFound)?;
        info.weight = Some(weight);
        Ok(())
    }

    /// Increment resolution count
    pub fn record_resolution(&mut self, oracle: &Pubkey) -> Result<()> {
        if let Some(info) = self.oracles.iter_mut().find(|o| o.pubkey == *oracle) {
            info.resolution_count = info.resolution_count.saturating_add(1);
        }
        Ok(())
    }

    /// Increment dispute count
    pub fn record_dispute(&mut self, oracle: &Pubkey) -> Result<()> {
        if let Some(info) = self.oracles.iter_mut().find(|o| o.pubkey == *oracle) {
            info.dispute_count = info.dispute_count.saturating_add(1);
        }
        Ok(())
    }
}

#[error_code]
pub enum OracleRegistryError {
    #[msg("Oracle registry is full")]
    RegistryFull,

    #[msg("Oracle is already registered")]
    OracleAlreadyRegistered,

    #[msg("Oracle not found in registry")]
    OracleNotFound,

    #[msg("Unauthorized: only registry authority")]
    UnauthorizedAuthority,

    #[msg("Oracle not approved for market resolution")]
    OracleNotApproved,
}
