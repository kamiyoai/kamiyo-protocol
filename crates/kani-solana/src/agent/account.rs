//! Symbolic Solana account generation for agent program verification.

/// Lightweight symbolic account — not the real `AccountInfo`, just enough
/// fields to verify safety properties under arbitrary inputs.
#[derive(Clone, Debug)]
pub struct AgentAccount {
    pub key: [u8; 32],
    pub owner: [u8; 32],
    pub lamports: u64,
    pub data_len: u64,
    pub is_signer: bool,
    pub is_writable: bool,
    pub is_program: bool,
    pub executable: bool,
    pub rent_epoch: u64,
    pub pda_bump: Option<u8>,
    /// Snapshot at creation for lamport conservation checks.
    pub initial_lamports: u64,
    pub reentry_depth: u8,
}

/// Builder collecting constraints before symbolic generation.
pub struct AgentConfig {
    force_signer: bool,
    force_payer: bool,
    force_writable: bool,
    owner_key: Option<[u8; 32]>,
    program_id: Option<[u8; 32]>,
    min_lamports: Option<u64>,
    max_lamports: Option<u64>,
    is_program: bool,
    pda_seeds: Option<Vec<Vec<u8>>>,
    pda_program: Option<[u8; 32]>,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            force_signer: false,
            force_payer: false,
            force_writable: false,
            owner_key: None,
            program_id: None,
            min_lamports: None,
            max_lamports: None,
            is_program: false,
            pda_seeds: None,
            pda_program: None,
        }
    }
}

impl AgentConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn signer(mut self) -> Self {
        self.force_signer = true;
        self
    }

    /// Payer implies signer, writable, and minimum rent-exempt balance.
    pub fn payer(mut self) -> Self {
        self.force_signer = true;
        self.force_payer = true;
        self.force_writable = true;
        self
    }

    pub fn writable(mut self) -> Self {
        self.force_writable = true;
        self
    }

    /// Pin the account owner to a known program.
    pub fn owner(mut self, key: [u8; 32]) -> Self {
        self.owner_key = Some(key);
        self
    }

    /// Mark as an executable program account.
    pub fn program(mut self, id: [u8; 32]) -> Self {
        self.program_id = Some(id);
        self.is_program = true;
        self
    }

    pub fn lamports_range(mut self, min: u64, max: u64) -> Self {
        self.min_lamports = Some(min);
        self.max_lamports = Some(max);
        self
    }

    /// Mark as a PDA derived from the given seeds and program.
    pub fn pda(mut self, seeds: &[&[u8]], program: [u8; 32]) -> Self {
        self.pda_seeds = Some(seeds.iter().map(|s| s.to_vec()).collect());
        self.pda_program = Some(program);
        self
    }
}

/// Generate a fully symbolic `AgentAccount` constrained by `config`.
#[must_use]
pub fn any_agent_account(config: AgentConfig) -> AgentAccount {
    let key: [u8; 32] = kani::any();
    let owner: [u8; 32] = if let Some(k) = config.owner_key {
        k
    } else {
        kani::any()
    };

    let lamports: u64 = kani::any();
    if let Some(min) = config.min_lamports {
        kani::assume(lamports >= min);
    }
    if let Some(max) = config.max_lamports {
        kani::assume(lamports <= max);
    }
    if config.force_payer {
        kani::assume(lamports >= 890_880);
    }

    let is_signer: bool = if config.force_signer { true } else { kani::any() };
    let is_writable: bool = if config.force_writable { true } else { kani::any() };

    let data_len: u64 = kani::any();
    kani::assume(data_len % 8 == 0);

    let (is_program, executable) = if config.is_program {
        (true, true)
    } else {
        (false, kani::any())
    };

    let pda_bump: Option<u8> = if config.pda_seeds.is_some() {
        Some(kani::any())
    } else {
        None
    };

    let rent_epoch: u64 = kani::any();

    AgentAccount {
        key,
        owner,
        lamports,
        data_len,
        is_signer,
        is_writable,
        is_program,
        executable,
        rent_epoch,
        pda_bump,
        initial_lamports: lamports,
        reentry_depth: 0,
    }
}
