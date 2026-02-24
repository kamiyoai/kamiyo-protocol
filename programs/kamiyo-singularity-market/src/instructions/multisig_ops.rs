use crate::state::{Multisig, MultisigError, MultisigTransaction, MAX_SIGNERS};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateMultisig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Multisig::INIT_SPACE,
        seeds = [Multisig::SEED_PREFIX],
        bump
    )]
    pub multisig: Account<'info, Multisig>,

    pub system_program: Program<'info, System>,
}

pub fn create_multisig_handler(
    ctx: Context<CreateMultisig>,
    signers: Vec<Pubkey>,
    threshold: u8,
) -> Result<()> {
    require!(signers.len() <= MAX_SIGNERS, MultisigError::TooManySigners);
    require!(
        threshold > 0 && (threshold as usize) <= signers.len(),
        MultisigError::InvalidThreshold
    );

    // Check for duplicates
    let mut sorted = signers.clone();
    sorted.sort();
    for i in 1..sorted.len() {
        require!(sorted[i] != sorted[i - 1], MultisigError::DuplicateSigner);
    }

    let multisig = &mut ctx.accounts.multisig;
    multisig.signers = signers;
    multisig.threshold = threshold;
    multisig.nonce = 0;
    multisig.bump = ctx.bumps.multisig;

    emit!(MultisigCreated {
        multisig: multisig.key(),
        signers: multisig.signers.clone(),
        threshold,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ProposeTransaction<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,

    #[account(
        mut,
        seeds = [Multisig::SEED_PREFIX],
        bump = multisig.bump,
        constraint = multisig.is_signer(&proposer.key()) @ MultisigError::UnauthorizedSigner
    )]
    pub multisig: Account<'info, Multisig>,

    #[account(
        init,
        payer = proposer,
        space = 8 + MultisigTransaction::INIT_SPACE,
        seeds = [MultisigTransaction::SEED_PREFIX, &multisig.nonce.to_le_bytes()],
        bump
    )]
    pub transaction: Account<'info, MultisigTransaction>,

    pub system_program: Program<'info, System>,
}

pub fn propose_transaction_handler(
    ctx: Context<ProposeTransaction>,
    instruction_data: Vec<u8>,
    target: Pubkey,
) -> Result<()> {
    let clock = Clock::get()?;
    let multisig = &mut ctx.accounts.multisig;
    let transaction = &mut ctx.accounts.transaction;

    transaction.multisig = multisig.key();
    transaction.nonce = multisig.nonce;
    transaction.instruction_data = instruction_data;
    transaction.target = target;
    transaction.approvers = vec![ctx.accounts.proposer.key()]; // Proposer auto-approves
    transaction.executed = false;
    transaction.created_at = clock.unix_timestamp;
    transaction.expires_at = clock.unix_timestamp + MultisigTransaction::EXPIRATION_SECS;
    transaction.bump = ctx.bumps.transaction;

    // Increment nonce for next transaction
    multisig.nonce = multisig
        .nonce
        .checked_add(1)
        .ok_or(MultisigError::NonceOverflow)?;

    emit!(TransactionProposed {
        multisig: multisig.key(),
        transaction: transaction.key(),
        proposer: ctx.accounts.proposer.key(),
        target,
        nonce: transaction.nonce,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ApproveTransaction<'info> {
    pub approver: Signer<'info>,

    #[account(
        seeds = [Multisig::SEED_PREFIX],
        bump = multisig.bump,
        constraint = multisig.is_signer(&approver.key()) @ MultisigError::UnauthorizedSigner
    )]
    pub multisig: Account<'info, Multisig>,

    #[account(
        mut,
        seeds = [MultisigTransaction::SEED_PREFIX, &transaction.nonce.to_le_bytes()],
        bump = transaction.bump,
        constraint = transaction.multisig == multisig.key(),
        constraint = !transaction.executed @ MultisigError::AlreadyExecuted
    )]
    pub transaction: Account<'info, MultisigTransaction>,
}

pub fn approve_transaction_handler(ctx: Context<ApproveTransaction>) -> Result<()> {
    let clock = Clock::get()?;
    let transaction = &mut ctx.accounts.transaction;

    require!(
        !transaction.is_expired(clock.unix_timestamp),
        MultisigError::TransactionExpired
    );
    require!(
        !transaction.has_approved(&ctx.accounts.approver.key()),
        MultisigError::AlreadyApproved
    );

    transaction.approvers.push(ctx.accounts.approver.key());

    emit!(TransactionApproved {
        transaction: transaction.key(),
        approver: ctx.accounts.approver.key(),
        approvals: transaction.approvers.len() as u8,
        threshold: ctx.accounts.multisig.threshold,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteTransaction<'info> {
    pub executor: Signer<'info>,

    #[account(
        seeds = [Multisig::SEED_PREFIX],
        bump = multisig.bump
    )]
    pub multisig: Account<'info, Multisig>,

    #[account(
        mut,
        seeds = [MultisigTransaction::SEED_PREFIX, &transaction.nonce.to_le_bytes()],
        bump = transaction.bump,
        constraint = transaction.multisig == multisig.key(),
        constraint = !transaction.executed @ MultisigError::AlreadyExecuted
    )]
    pub transaction: Account<'info, MultisigTransaction>,
}

pub fn execute_transaction_handler(ctx: Context<ExecuteTransaction>) -> Result<()> {
    let clock = Clock::get()?;
    let multisig = &ctx.accounts.multisig;
    let transaction = &mut ctx.accounts.transaction;

    require!(
        !transaction.is_expired(clock.unix_timestamp),
        MultisigError::TransactionExpired
    );
    require!(
        transaction.has_threshold(multisig.threshold),
        MultisigError::ThresholdNotMet
    );

    transaction.executed = true;

    emit!(TransactionExecuted {
        transaction: transaction.key(),
        executor: ctx.accounts.executor.key(),
        target: transaction.target,
    });

    // Note: The actual execution of the target instruction would be handled
    // by a CPI call in a more complete implementation. This marks the transaction
    // as approved and executable.

    Ok(())
}

#[event]
pub struct MultisigCreated {
    pub multisig: Pubkey,
    pub signers: Vec<Pubkey>,
    pub threshold: u8,
}

#[event]
pub struct TransactionProposed {
    pub multisig: Pubkey,
    pub transaction: Pubkey,
    pub proposer: Pubkey,
    pub target: Pubkey,
    pub nonce: u64,
}

#[event]
pub struct TransactionApproved {
    pub transaction: Pubkey,
    pub approver: Pubkey,
    pub approvals: u8,
    pub threshold: u8,
}

#[event]
pub struct TransactionExecuted {
    pub transaction: Pubkey,
    pub executor: Pubkey,
    pub target: Pubkey,
}
