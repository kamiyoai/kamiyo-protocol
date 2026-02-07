use anchor_lang::prelude::*;

declare_id!("6uejE3hDz3ZNHW7P4uHQEHS6fHAQ4vLJg7rx4VBYwpyK");

/*
Constants

Note: Some protocol-level constraints (e.g. minimum stake) are intentionally not enforced here yet.
They will be enforced via CPI once the staking program interface is finalized.
*/
// TODO(governance): enforce minimum KAMIYO token stake via CPI to staking program
// pub const MIN_PASSPORT_STAKE: u64 = 50_000_000;

/// Maximum compliance score (maps to 1000 on-chain)
pub const MAX_COMPLIANCE_SCORE: i16 = 1000;

/// Minimum compliance score (maps to -1000 on-chain)
pub const MIN_COMPLIANCE_SCORE: i16 = -1000;

/// Default compliance score for newly issued passports
pub const DEFAULT_COMPLIANCE_SCORE: i16 = 0;

/// Maximum mandate duration: 365 days in seconds
pub const MAX_MANDATE_DURATION: i64 = 365 * 24 * 60 * 60;

/// Minimum mandate duration: 1 hour in seconds
pub const MIN_MANDATE_DURATION: i64 = 3600;

/// Basis points denominator (100% = 10000 bps)
pub const BPS_DENOMINATOR: u16 = 10000;

/// Maximum spending limit in micro-USD ($10M)
pub const MAX_SPENDING_LIMIT: u64 = 10_000_000_000_000;

// TODO(#audit-ring): enforce ring buffer wrap at MAX_AUDIT_NONCE in record_audit
pub const MAX_AUDIT_NONCE: u32 = 10000;

/*
Helpers
*/

fn compute_kamon_hash(agent_identity: &Pubkey, issuer: &Pubkey, created_at: i64) -> [u8; 32] {
    let mut data = [0u8; 72]; // 32 + 32 + 8
    data[..32].copy_from_slice(agent_identity.as_ref());
    data[32..64].copy_from_slice(issuer.as_ref());
    data[64..72].copy_from_slice(&created_at.to_le_bytes());
    anchor_lang::solana_program::hash::hash(&data).to_bytes()
}

fn validate_liability_bps(consumer: u16, developer: u16, merchant: u16, platform: u16) -> bool {
    let total = consumer as u32 + developer as u32 + merchant as u32 + platform as u32;
    total == BPS_DENOMINATOR as u32
}

/*
Program
*/

#[program]
pub mod meishi {
    use super::*;

    /// Create a new Meishi passport for an agent.
    /// The caller must own an active Kamiyo AgentIdentity.
    pub fn create_meishi(ctx: Context<CreateMeishi>, jurisdiction: u8) -> Result<()> {
        require!(jurisdiction <= 4, MeishiError::InvalidJurisdiction);

        let clock = Clock::get()?;
        let passport = &mut ctx.accounts.passport;
        let issuer = ctx.accounts.owner.key();
        let agent_identity = ctx.accounts.agent_identity.key();

        passport.agent_identity = agent_identity;
        passport.issuer = issuer;
        passport.principal = issuer; // initial principal is the issuer
        passport.kamon_hash = compute_kamon_hash(&agent_identity, &issuer, clock.unix_timestamp);
        passport.compliance_class = ComplianceClass::Unclassified;
        passport.compliance_score = DEFAULT_COMPLIANCE_SCORE;
        passport.jurisdiction = Jurisdiction::from_u8(jurisdiction);
        passport.mandate_hash = [0u8; 32];
        passport.mandate_expires = 0;
        passport.total_transactions = 0;
        passport.total_volume_usd = 0;
        passport.disputes_filed = 0;
        passport.disputes_lost = 0;
        passport.last_audit = 0;
        passport.suspended = false;
        passport.suspension_reason = SuspensionReason::None;
        passport.audit_nonce = 0;
        passport.mandate_version = 0;
        passport.created_at = clock.unix_timestamp;
        passport.updated_at = clock.unix_timestamp;
        passport.bump = ctx.bumps.passport;

        emit!(MeishiCreated {
            passport: ctx.accounts.passport.key(),
            agent_identity,
            issuer,
            jurisdiction,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Set or update the authorization mandate for a Meishi passport.
    /// Only the principal (delegating human) can set mandates.
    pub fn update_mandate(
        ctx: Context<UpdateMandate>,
        spending_limit_usd: u64,
        daily_limit_usd: u64,
        monthly_limit_usd: u64,
        category_whitelist: [u8; 32],
        merchant_whitelist_hash: [u8; 32],
        requires_human_approval_above: u64,
        geo_restrictions: u8,
        valid_from: i64,
        valid_until: i64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let duration = valid_until - valid_from;

        require!(valid_from >= clock.unix_timestamp, MeishiError::MandateInPast);
        require!(valid_until > valid_from, MeishiError::InvalidMandateDuration);
        require!(
            duration >= MIN_MANDATE_DURATION && duration <= MAX_MANDATE_DURATION,
            MeishiError::InvalidMandateDuration
        );
        require!(spending_limit_usd <= MAX_SPENDING_LIMIT, MeishiError::SpendingLimitExceeded);
        require!(daily_limit_usd <= MAX_SPENDING_LIMIT, MeishiError::SpendingLimitExceeded);
        require!(monthly_limit_usd <= MAX_SPENDING_LIMIT, MeishiError::SpendingLimitExceeded);
        require!(
            spending_limit_usd <= daily_limit_usd,
            MeishiError::InvalidSpendingHierarchy
        );
        require!(
            daily_limit_usd <= monthly_limit_usd,
            MeishiError::InvalidSpendingHierarchy
        );

        let mandate = &mut ctx.accounts.mandate;
        let passport = &mut ctx.accounts.passport;

        let version = passport
            .mandate_version
            .checked_add(1)
            .ok_or(MeishiError::ArithmeticOverflow)?;

        mandate.meishi = passport.key();
        mandate.version = version;
        // Set off-chain after the principal signs the mandate payload.
        mandate.principal_signature = [0u8; 64];
        mandate.spending_limit_usd = spending_limit_usd;
        mandate.daily_limit_usd = daily_limit_usd;
        mandate.monthly_limit_usd = monthly_limit_usd;
        mandate.category_whitelist = category_whitelist;
        mandate.merchant_whitelist_hash = merchant_whitelist_hash;
        mandate.requires_human_approval_above = requires_human_approval_above;
        mandate.geo_restrictions = geo_restrictions;
        mandate.valid_from = valid_from;
        mandate.valid_until = valid_until;
        mandate.revoked = false;
        mandate.revoked_at = 0;
        mandate.bump = ctx.bumps.mandate;

        // Update passport with a hash of the current mandate parameters.
        let mandate_data = [
            spending_limit_usd.to_le_bytes().as_ref(),
            daily_limit_usd.to_le_bytes().as_ref(),
            monthly_limit_usd.to_le_bytes().as_ref(),
            &category_whitelist,
            &merchant_whitelist_hash,
        ]
        .concat();
        passport.mandate_hash = anchor_lang::solana_program::hash::hash(&mandate_data).to_bytes();
        passport.mandate_expires = valid_until;
        passport.mandate_version = version;
        passport.updated_at = clock.unix_timestamp;

        let passport_key = passport.key();
        let mandate_key = ctx.accounts.mandate.key();
        let principal_key = ctx.accounts.principal.key();

        emit!(MandateUpdated {
            passport: passport_key,
            mandate: mandate_key,
            version,
            principal: principal_key,
            valid_from,
            valid_until,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Revoke an active mandate. Only the principal can revoke.
    pub fn revoke_mandate(ctx: Context<RevokeMandate>) -> Result<()> {
        let clock = Clock::get()?;

        let passport_key = ctx.accounts.passport.key();
        let mandate_key = ctx.accounts.mandate.key();
        let principal_key = ctx.accounts.principal.key();

        let mandate = &mut ctx.accounts.mandate;
        let passport = &mut ctx.accounts.passport;

        require!(!mandate.revoked, MeishiError::MandateAlreadyRevoked);

        mandate.revoked = true;
        mandate.revoked_at = clock.unix_timestamp;

        passport.mandate_hash = [0u8; 32];
        passport.mandate_expires = 0;
        passport.updated_at = clock.unix_timestamp;

        let version = mandate.version;

        emit!(MandateRevoked {
            passport: passport_key,
            mandate: mandate_key,
            version,
            principal: principal_key,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Record a compliance audit result. Only registered oracles can submit.
    pub fn record_audit(
        ctx: Context<RecordAudit>,
        audit_type: u8,
        compliance_score_after: i16,
        findings_hash: [u8; 32],
        findings_ual: String,
        passed: bool,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let passport = &mut ctx.accounts.passport;

        require!(audit_type <= 3, MeishiError::InvalidAuditType);
        require!(
            compliance_score_after >= MIN_COMPLIANCE_SCORE
                && compliance_score_after <= MAX_COMPLIANCE_SCORE,
            MeishiError::InvalidComplianceScore
        );
        require!(findings_ual.len() <= 256, MeishiError::UalTooLong);

        let audit = &mut ctx.accounts.audit;

        audit.meishi = passport.key();
        audit.auditor = ctx.accounts.oracle.key();
        audit.audit_type = AuditType::from_u8(audit_type);
        audit.compliance_score_before = passport.compliance_score;
        audit.compliance_score_after = compliance_score_after;
        audit.findings_hash = findings_hash;
        audit.findings_ual = findings_ual;
        audit.passed = passed;
        audit.timestamp = clock.unix_timestamp;
        audit.bump = ctx.bumps.audit;

        passport.compliance_score = compliance_score_after;
        passport.last_audit = clock.unix_timestamp;
        passport.audit_nonce = passport
            .audit_nonce
            .checked_add(1)
            .ok_or(MeishiError::ArithmeticOverflow)?;
        passport.updated_at = clock.unix_timestamp;

        emit!(AuditRecorded {
            passport: passport.key(),
            auditor: ctx.accounts.oracle.key(),
            audit_type,
            score_before: audit.compliance_score_before,
            score_after: compliance_score_after,
            passed,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Update compliance score via oracle consensus (multi-sig).
    /// Separate from record_audit — this is for score-only updates without full audit.
    pub fn update_compliance_score(
        ctx: Context<UpdateComplianceScore>,
        new_score: i16,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let passport = &mut ctx.accounts.passport;

        require!(
            new_score >= MIN_COMPLIANCE_SCORE && new_score <= MAX_COMPLIANCE_SCORE,
            MeishiError::InvalidComplianceScore
        );

        let old_score = passport.compliance_score;
        passport.compliance_score = new_score;
        passport.updated_at = clock.unix_timestamp;

        // Auto-suspend on a critical score drop.
        if new_score < -500 && !passport.suspended {
            passport.suspended = true;
            passport.suspension_reason = SuspensionReason::ComplianceFailure;

            emit!(MeishiSuspended {
                passport: passport.key(),
                reason: SuspensionReason::ComplianceFailure as u8,
                suspended_by: ctx.accounts.oracle.key(),
                timestamp: clock.unix_timestamp,
            });
        }

        emit!(ComplianceScoreUpdated {
            passport: passport.key(),
            old_score,
            new_score,
            updated_by: ctx.accounts.oracle.key(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Suspend a Meishi passport. Oracle consensus or protocol multisig can suspend.
    pub fn suspend_meishi(ctx: Context<SuspendMeishi>, reason: u8) -> Result<()> {
        let clock = Clock::get()?;
        let passport = &mut ctx.accounts.passport;

        require!(!passport.suspended, MeishiError::AlreadySuspended);
        require!(reason >= 1 && reason <= 4, MeishiError::InvalidSuspensionReason);

        passport.suspended = true;
        passport.suspension_reason = SuspensionReason::from_u8(reason);
        passport.updated_at = clock.unix_timestamp;

        emit!(MeishiSuspended {
            passport: passport.key(),
            reason,
            suspended_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Lift suspension after remediation.
    pub fn unsuspend_meishi(ctx: Context<UnsuspendMeishi>) -> Result<()> {
        let clock = Clock::get()?;
        let passport = &mut ctx.accounts.passport;

        require!(passport.suspended, MeishiError::NotSuspended);

        passport.suspended = false;
        passport.suspension_reason = SuspensionReason::None;
        passport.updated_at = clock.unix_timestamp;

        emit!(MeishiUnsuspended {
            passport: passport.key(),
            unsuspended_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Set a pre-agreed liability allocation between the agent and a counterparty.
    /// Both parties must sign.
    pub fn set_liability_allocation(
        ctx: Context<SetLiabilityAllocation>,
        consumer_liability_bps: u16,
        developer_liability_bps: u16,
        merchant_liability_bps: u16,
        platform_liability_bps: u16,
        max_liability_usd: u64,
        expires_at: i64,
    ) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            validate_liability_bps(
                consumer_liability_bps,
                developer_liability_bps,
                merchant_liability_bps,
                platform_liability_bps
            ),
            MeishiError::LiabilityBpsMismatch
        );
        require!(expires_at > clock.unix_timestamp, MeishiError::LiabilityExpired);
        require!(max_liability_usd > 0, MeishiError::InvalidLiabilityCap);
        require!(max_liability_usd <= MAX_SPENDING_LIMIT, MeishiError::SpendingLimitExceeded);

        let liability = &mut ctx.accounts.liability;

        liability.meishi = ctx.accounts.passport.key();
        liability.counterparty = ctx.accounts.counterparty.key();
        liability.consumer_liability_bps = consumer_liability_bps;
        liability.developer_liability_bps = developer_liability_bps;
        liability.merchant_liability_bps = merchant_liability_bps;
        liability.platform_liability_bps = platform_liability_bps;
        liability.max_liability_usd = max_liability_usd;
        liability.arbitration_oracle = ctx.accounts.arbitration_oracle.key();
        liability.agreed_at = clock.unix_timestamp;
        liability.expires_at = expires_at;
        liability.bump = ctx.bumps.liability;

        emit!(LiabilityAllocated {
            passport: ctx.accounts.passport.key(),
            counterparty: ctx.accounts.counterparty.key(),
            consumer_bps: consumer_liability_bps,
            developer_bps: developer_liability_bps,
            merchant_bps: merchant_liability_bps,
            platform_bps: platform_liability_bps,
            max_liability_usd,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Record a completed transaction against this passport.
    /// Called by the escrow program via CPI or by an authorized service.
    pub fn record_transaction(
        ctx: Context<RecordTransaction>,
        volume_usd: u64,
        disputed: bool,
        dispute_lost: bool,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let passport = &mut ctx.accounts.passport;

        require!(!passport.suspended, MeishiError::PassportSuspended);
        require!(!dispute_lost || disputed, MeishiError::InvalidDisputeState);

        passport.total_transactions = passport
            .total_transactions
            .checked_add(1)
            .ok_or(MeishiError::ArithmeticOverflow)?;
        passport.total_volume_usd = passport
            .total_volume_usd
            .checked_add(volume_usd)
            .ok_or(MeishiError::ArithmeticOverflow)?;

        if disputed {
            passport.disputes_filed = passport
                .disputes_filed
                .checked_add(1)
                .ok_or(MeishiError::ArithmeticOverflow)?;
        }
        if dispute_lost {
            passport.disputes_lost = passport
                .disputes_lost
                .checked_add(1)
                .ok_or(MeishiError::ArithmeticOverflow)?;
        }

        passport.updated_at = clock.unix_timestamp;

        emit!(TransactionRecorded {
            passport: passport.key(),
            volume_usd,
            disputed,
            dispute_lost,
            total_transactions: passport.total_transactions,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Transfer principal authority to a new address.
    pub fn transfer_principal(ctx: Context<TransferPrincipal>) -> Result<()> {
        let clock = Clock::get()?;
        let passport = &mut ctx.accounts.passport;
        let old_principal = passport.principal;

        passport.principal = ctx.accounts.new_principal.key();
        passport.updated_at = clock.unix_timestamp;

        emit!(PrincipalTransferred {
            passport: passport.key(),
            old_principal,
            new_principal: ctx.accounts.new_principal.key(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// Account Contexts

#[derive(Accounts)]
pub struct CreateMeishi<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: TODO(cpi-verify) add CPI to the Kamiyo program to verify the agent is active.
    /// For now we only rely on PDA seed derivation.
    pub agent_identity: AccountInfo<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + MeishiPassport::INIT_SPACE,
        seeds = [b"meishi", agent_identity.key().as_ref()],
        bump
    )]
    pub passport: Account<'info, MeishiPassport>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(spending_limit_usd: u64, daily_limit_usd: u64, monthly_limit_usd: u64, category_whitelist: [u8; 32], merchant_whitelist_hash: [u8; 32], requires_human_approval_above: u64, geo_restrictions: u8, valid_from: i64, valid_until: i64)]
pub struct UpdateMandate<'info> {
    #[account(mut)]
    pub principal: Signer<'info>,

    #[account(
        mut,
        constraint = passport.principal == principal.key() @ MeishiError::Unauthorized,
        constraint = passport.mandate_version < u32::MAX @ MeishiError::ArithmeticOverflow
    )]
    pub passport: Account<'info, MeishiPassport>,

    #[account(
        init,
        payer = principal,
        space = 8 + MeishiMandate::INIT_SPACE,
        seeds = [
            b"mandate",
            passport.key().as_ref(),
            &(passport.mandate_version + 1).to_le_bytes()
        ],
        bump
    )]
    pub mandate: Account<'info, MeishiMandate>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeMandate<'info> {
    pub principal: Signer<'info>,

    #[account(
        mut,
        constraint = passport.principal == principal.key() @ MeishiError::Unauthorized
    )]
    pub passport: Account<'info, MeishiPassport>,

    #[account(
        mut,
        constraint = mandate.meishi == passport.key() @ MeishiError::MandateMismatch,
        constraint = !mandate.revoked @ MeishiError::MandateAlreadyRevoked
    )]
    pub mandate: Account<'info, MeishiMandate>,
}

#[derive(Accounts)]
pub struct RecordAudit<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(mut)]
    pub passport: Account<'info, MeishiPassport>,

    #[account(
        init,
        payer = oracle,
        space = 8 + MeishiAudit::INIT_SPACE,
        seeds = [b"audit", passport.key().as_ref(), &passport.audit_nonce.to_le_bytes()],
        bump
    )]
    pub audit: Account<'info, MeishiAudit>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateComplianceScore<'info> {
    pub oracle: Signer<'info>,

    #[account(mut)]
    pub passport: Account<'info, MeishiPassport>,
}

#[derive(Accounts)]
pub struct SuspendMeishi<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub passport: Account<'info, MeishiPassport>,
}

#[derive(Accounts)]
pub struct UnsuspendMeishi<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = passport.suspended @ MeishiError::NotSuspended
    )]
    pub passport: Account<'info, MeishiPassport>,
}

#[derive(Accounts)]
pub struct SetLiabilityAllocation<'info> {
    #[account(mut)]
    pub agent_owner: Signer<'info>,

    pub counterparty: Signer<'info>,

    #[account(
        constraint = passport.issuer == agent_owner.key() @ MeishiError::Unauthorized,
        constraint = !passport.suspended @ MeishiError::PassportSuspended
    )]
    pub passport: Account<'info, MeishiPassport>,

    /// CHECK: Oracle designated for arbitration. Validated by the caller.
    pub arbitration_oracle: AccountInfo<'info>,

    #[account(
        init,
        payer = agent_owner,
        space = 8 + LiabilityAllocation::INIT_SPACE,
        seeds = [b"liability", passport.key().as_ref(), counterparty.key().as_ref()],
        bump
    )]
    pub liability: Account<'info, LiabilityAllocation>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordTransaction<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = !passport.suspended @ MeishiError::PassportSuspended
    )]
    pub passport: Account<'info, MeishiPassport>,
}

#[derive(Accounts)]
pub struct TransferPrincipal<'info> {
    pub current_principal: Signer<'info>,

    #[account(
        mut,
        constraint = passport.principal == current_principal.key() @ MeishiError::Unauthorized
    )]
    pub passport: Account<'info, MeishiPassport>,

    /// CHECK: New principal address. Any pubkey is valid.
    pub new_principal: AccountInfo<'info>,
}

// Account Structures

#[account]
#[derive(InitSpace)]
pub struct MeishiPassport {
    /// Link to existing Kamiyo AgentIdentity PDA
    pub agent_identity: Pubkey,
    /// Who created/deployed this agent
    pub issuer: Pubkey,
    /// Human/entity who delegated authority
    pub principal: Pubkey,
    /// Deterministic hash for visual Kamon crest generation
    pub kamon_hash: [u8; 32],
    /// EU AI Act risk classification
    pub compliance_class: ComplianceClass,
    /// Compliance score: -1000 to 1000
    pub compliance_score: i16,
    /// Regulatory jurisdiction
    pub jurisdiction: Jurisdiction,
    /// Hash of current authorization mandate
    pub mandate_hash: [u8; 32],
    /// When current mandate expires
    pub mandate_expires: i64,
    /// Current mandate version counter
    pub mandate_version: u32,
    /// Lifetime transaction count
    pub total_transactions: u64,
    /// Lifetime volume in micro-USD
    pub total_volume_usd: u64,
    /// Disputes initiated against this agent
    pub disputes_filed: u32,
    /// Disputes this agent lost
    pub disputes_lost: u32,
    /// Timestamp of last compliance audit
    pub last_audit: i64,
    /// Audit nonce for PDA derivation
    pub audit_nonce: u32,
    /// Emergency suspension flag
    pub suspended: bool,
    /// Reason for suspension
    pub suspension_reason: SuspensionReason,
    /// Creation timestamp
    pub created_at: i64,
    /// Last update timestamp
    pub updated_at: i64,
    /// PDA bump
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MeishiMandate {
    /// Parent Meishi passport
    pub meishi: Pubkey,
    /// Mandate version (incremental)
    pub version: u32,
    /// Ed25519 signature from delegating human
    pub principal_signature: [u8; 64],
    /// Max per-transaction in micro-USD
    pub spending_limit_usd: u64,
    /// Max daily spend in micro-USD
    pub daily_limit_usd: u64,
    /// Max monthly spend in micro-USD
    pub monthly_limit_usd: u64,
    /// Bitmap of allowed product categories (up to 256)
    pub category_whitelist: [u8; 32],
    /// Merkle root of allowed merchants (off-chain list)
    pub merchant_whitelist_hash: [u8; 32],
    /// Threshold for human-in-the-loop (micro-USD)
    pub requires_human_approval_above: u64,
    /// Bitmap: EU, US, UK, APAC, etc.
    pub geo_restrictions: u8,
    /// Mandate validity start
    pub valid_from: i64,
    /// Mandate validity end
    pub valid_until: i64,
    /// Whether mandate has been revoked
    pub revoked: bool,
    /// Revocation timestamp
    pub revoked_at: i64,
    /// PDA bump
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MeishiAudit {
    /// Parent Meishi passport
    pub meishi: Pubkey,
    /// Oracle that performed audit
    pub auditor: Pubkey,
    /// Audit classification
    pub audit_type: AuditType,
    /// Score before this audit
    pub compliance_score_before: i16,
    /// Score after this audit
    pub compliance_score_after: i16,
    /// Hash of detailed findings (full report on DKG)
    pub findings_hash: [u8; 32],
    /// OriginTrail UAL for full audit report
    #[max_len(256)]
    pub findings_ual: String,
    /// Whether the agent passed this audit
    pub passed: bool,
    /// Audit timestamp
    pub timestamp: i64,
    /// PDA bump
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LiabilityAllocation {
    /// The agent's Meishi passport
    pub meishi: Pubkey,
    /// Merchant/platform being transacted with
    pub counterparty: Pubkey,
    /// Consumer's liability share (basis points)
    pub consumer_liability_bps: u16,
    /// Agent developer's liability share (basis points)
    pub developer_liability_bps: u16,
    /// Merchant's liability share (basis points)
    pub merchant_liability_bps: u16,
    /// Platform's liability share (basis points)
    pub platform_liability_bps: u16,
    /// Maximum liability cap in micro-USD
    pub max_liability_usd: u64,
    /// Designated dispute resolver
    pub arbitration_oracle: Pubkey,
    /// Agreement timestamp
    pub agreed_at: i64,
    /// Expiration timestamp
    pub expires_at: i64,
    /// PDA bump
    pub bump: u8,
}

// Enums

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ComplianceClass {
    Unclassified,
    Minimal,
    Limited,
    High,
    Unacceptable,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Jurisdiction {
    Global,
    EU,
    US,
    UK,
    APAC,
}

impl Jurisdiction {
    pub fn from_u8(val: u8) -> Self {
        match val {
            1 => Jurisdiction::EU,
            2 => Jurisdiction::US,
            3 => Jurisdiction::UK,
            4 => Jurisdiction::APAC,
            _ => Jurisdiction::Global,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum SuspensionReason {
    None,
    ComplianceFailure,
    FraudDetected,
    MandateExpired,
    OracleConsensus,
}

impl SuspensionReason {
    pub fn from_u8(val: u8) -> Self {
        match val {
            1 => SuspensionReason::ComplianceFailure,
            2 => SuspensionReason::FraudDetected,
            3 => SuspensionReason::MandateExpired,
            4 => SuspensionReason::OracleConsensus,
            _ => SuspensionReason::None,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AuditType {
    Initial,
    Periodic,
    Triggered,
    Dispute,
}

impl AuditType {
    pub fn from_u8(val: u8) -> Self {
        match val {
            1 => AuditType::Periodic,
            2 => AuditType::Triggered,
            3 => AuditType::Dispute,
            _ => AuditType::Initial,
        }
    }
}

// Events

#[event]
pub struct MeishiCreated {
    pub passport: Pubkey,
    pub agent_identity: Pubkey,
    pub issuer: Pubkey,
    pub jurisdiction: u8,
    pub timestamp: i64,
}

#[event]
pub struct MandateUpdated {
    pub passport: Pubkey,
    pub mandate: Pubkey,
    pub version: u32,
    pub principal: Pubkey,
    pub valid_from: i64,
    pub valid_until: i64,
    pub timestamp: i64,
}

#[event]
pub struct MandateRevoked {
    pub passport: Pubkey,
    pub mandate: Pubkey,
    pub version: u32,
    pub principal: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuditRecorded {
    pub passport: Pubkey,
    pub auditor: Pubkey,
    pub audit_type: u8,
    pub score_before: i16,
    pub score_after: i16,
    pub passed: bool,
    pub timestamp: i64,
}

#[event]
pub struct ComplianceScoreUpdated {
    pub passport: Pubkey,
    pub old_score: i16,
    pub new_score: i16,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MeishiSuspended {
    pub passport: Pubkey,
    pub reason: u8,
    pub suspended_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MeishiUnsuspended {
    pub passport: Pubkey,
    pub unsuspended_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct LiabilityAllocated {
    pub passport: Pubkey,
    pub counterparty: Pubkey,
    pub consumer_bps: u16,
    pub developer_bps: u16,
    pub merchant_bps: u16,
    pub platform_bps: u16,
    pub max_liability_usd: u64,
    pub timestamp: i64,
}

#[event]
pub struct TransactionRecorded {
    pub passport: Pubkey,
    pub volume_usd: u64,
    pub disputed: bool,
    pub dispute_lost: bool,
    pub total_transactions: u64,
    pub timestamp: i64,
}

#[event]
pub struct PrincipalTransferred {
    pub passport: Pubkey,
    pub old_principal: Pubkey,
    pub new_principal: Pubkey,
    pub timestamp: i64,
}

// Errors

#[error_code]
pub enum MeishiError {
    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Invalid jurisdiction value (must be 0-4)")]
    InvalidJurisdiction,

    #[msg("Invalid compliance score (must be -1000 to 1000)")]
    InvalidComplianceScore,

    #[msg("Mandate valid_from must be in the future")]
    MandateInPast,

    #[msg("Invalid mandate duration (1 hour to 365 days)")]
    InvalidMandateDuration,

    #[msg("Spending limit exceeds maximum")]
    SpendingLimitExceeded,

    #[msg("Per-tx limit must be <= daily, daily must be <= monthly")]
    InvalidSpendingHierarchy,

    #[msg("Mandate has already been revoked")]
    MandateAlreadyRevoked,

    #[msg("Mandate does not belong to this passport")]
    MandateMismatch,

    #[msg("Invalid audit type (must be 0-3)")]
    InvalidAuditType,

    #[msg("Findings UAL exceeds 256 characters")]
    UalTooLong,

    #[msg("Passport is already suspended")]
    AlreadySuspended,

    #[msg("Passport is not suspended")]
    NotSuspended,

    #[msg("Invalid suspension reason (must be 1-4)")]
    InvalidSuspensionReason,

    #[msg("Liability basis points must sum to 10000")]
    LiabilityBpsMismatch,

    #[msg("Liability allocation has expired")]
    LiabilityExpired,

    #[msg("Liability cap must be greater than zero")]
    InvalidLiabilityCap,

    #[msg("Passport is suspended — transaction not allowed")]
    PassportSuspended,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Agent identity not found or inactive")]
    AgentIdentityInvalid,

    #[msg("dispute_lost requires disputed to be true")]
    InvalidDisputeState,
}
