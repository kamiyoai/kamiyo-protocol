use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::OrderBookError;
use crate::state::{
    AgentError, AgentStatus, OpenOrdersAccount, OrderBookConfig, RiskParams, TradingAgent,
};

/// Initialize a new trading agent
#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + TradingAgent::INIT_SPACE,
        seeds = [TradingAgent::SEED_PREFIX, owner.key().as_ref(), name.as_bytes()],
        bump,
    )]
    pub agent: Account<'info, TradingAgent>,

    #[account(
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump,
    )]
    pub config: Account<'info, OrderBookConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateAgentParams {
    pub name: String,
    pub delegate: Pubkey,
    pub max_position_size: u64,
    pub max_total_exposure: u64,
    pub risk_params: RiskParams,
}

pub fn handler_create_agent(ctx: Context<CreateAgent>, params: CreateAgentParams) -> Result<()> {
    let agent = &mut ctx.accounts.agent;
    let clock = Clock::get()?;

    agent.owner = ctx.accounts.owner.key();
    agent.delegate = params.delegate;
    agent.name = params.name;
    agent.bump = ctx.bumps.agent;
    agent.status = AgentStatus::Active as u8;
    agent.version = 1;
    agent._padding = [0; 1];
    agent.max_position_size = params.max_position_size;
    agent.max_total_exposure = params.max_total_exposure;
    agent.risk_params = params.risk_params;
    agent.total_deposited = 0;
    agent.available_balance = 0;
    agent.locked_balance = 0;
    agent.total_pnl = 0;
    agent.high_water_mark = 0;
    agent.current_drawdown = 0;
    agent.daily_loss = 0;
    agent.last_day = 0;
    agent.active_positions = 0;
    agent.trades_count = 0;
    agent.win_count = 0;
    agent.volume_traded = 0;
    agent.created_at = clock.unix_timestamp;
    agent.last_trade_at = 0;
    agent.allowed_markets_count = 0;
    agent._reserved = [0; 7];
    agent.allowed_markets = vec![];

    emit!(AgentCreated {
        agent: agent.key(),
        owner: agent.owner,
        delegate: agent.delegate,
        name: agent.name.clone(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/// Deposit collateral to agent
#[derive(Accounts)]
pub struct DepositToAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = agent.owner == owner.key() @ AgentError::UnauthorizedDelegate,
    )]
    pub agent: Account<'info, TradingAgent>,

    #[account(
        mut,
        constraint = owner_token.owner == owner.key(),
    )]
    pub owner_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = agent_vault.owner == agent.key(),
    )]
    pub agent_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler_deposit_to_agent(ctx: Context<DepositToAgent>, amount: u64) -> Result<()> {
    let agent = &mut ctx.accounts.agent;

    // Transfer tokens
    let cpi_accounts = Transfer {
        from: ctx.accounts.owner_token.to_account_info(),
        to: ctx.accounts.agent_vault.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update agent balance
    agent.total_deposited = agent.total_deposited.saturating_add(amount);
    agent.available_balance = agent.available_balance.saturating_add(amount);

    // Update high water mark if this is first deposit
    if agent.high_water_mark == 0 {
        agent.high_water_mark = agent.total_deposited;
    }

    emit!(AgentDeposit {
        agent: agent.key(),
        amount,
        new_balance: agent.available_balance,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Withdraw collateral from agent
#[derive(Accounts)]
pub struct WithdrawFromAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = agent.owner == owner.key() @ AgentError::UnauthorizedDelegate,
    )]
    pub agent: Account<'info, TradingAgent>,

    #[account(
        mut,
        constraint = owner_token.owner == owner.key(),
    )]
    pub owner_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = agent_vault.owner == agent.key(),
    )]
    pub agent_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler_withdraw_from_agent(ctx: Context<WithdrawFromAgent>, amount: u64) -> Result<()> {
    let agent = &mut ctx.accounts.agent;

    require!(
        agent.available_balance >= amount,
        AgentError::InsufficientBalance
    );

    // Transfer tokens using PDA signer
    let owner_key = ctx.accounts.owner.key();
    let name_bytes = agent.name.as_bytes();
    let seeds = &[
        TradingAgent::SEED_PREFIX,
        owner_key.as_ref(),
        name_bytes,
        &[agent.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.agent_vault.to_account_info(),
        to: ctx.accounts.owner_token.to_account_info(),
        authority: agent.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer(cpi_ctx, amount)?;

    // Update agent balance
    agent.total_deposited = agent.total_deposited.saturating_sub(amount);
    agent.available_balance = agent.available_balance.saturating_sub(amount);

    emit!(AgentWithdraw {
        agent: agent.key(),
        amount,
        new_balance: agent.available_balance,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Update agent parameters
#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = agent.owner == owner.key() @ AgentError::UnauthorizedDelegate,
    )]
    pub agent: Account<'info, TradingAgent>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateAgentParams {
    pub delegate: Option<Pubkey>,
    pub max_position_size: Option<u64>,
    pub max_total_exposure: Option<u64>,
    pub risk_params: Option<RiskParams>,
    pub status: Option<u8>,
}

pub fn handler_update_agent(ctx: Context<UpdateAgent>, params: UpdateAgentParams) -> Result<()> {
    let agent = &mut ctx.accounts.agent;

    if let Some(delegate) = params.delegate {
        agent.delegate = delegate;
    }
    if let Some(max_position_size) = params.max_position_size {
        agent.max_position_size = max_position_size;
    }
    if let Some(max_total_exposure) = params.max_total_exposure {
        agent.max_total_exposure = max_total_exposure;
    }
    if let Some(risk_params) = params.risk_params {
        agent.risk_params = risk_params;
    }
    if let Some(status) = params.status {
        // Can only pause/unpause, not stop via update
        require!(
            status != AgentStatus::Stopped as u8,
            OrderBookError::InvalidInput
        );
        agent.status = status;
    }

    emit!(AgentUpdated {
        agent: agent.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Add markets to whitelist
#[derive(Accounts)]
pub struct UpdateAgentMarkets<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = agent.owner == owner.key() @ AgentError::UnauthorizedDelegate,
    )]
    pub agent: Account<'info, TradingAgent>,
}

pub fn handler_add_allowed_market(ctx: Context<UpdateAgentMarkets>, market: Pubkey) -> Result<()> {
    let agent = &mut ctx.accounts.agent;

    require!(
        agent.allowed_markets.len() < 16,
        OrderBookError::InvalidInput
    );

    if !agent.allowed_markets.contains(&market) {
        agent.allowed_markets.push(market);
        agent.allowed_markets_count = agent.allowed_markets.len() as u8;
    }

    Ok(())
}

pub fn handler_remove_allowed_market(
    ctx: Context<UpdateAgentMarkets>,
    market: Pubkey,
) -> Result<()> {
    let agent = &mut ctx.accounts.agent;

    agent.allowed_markets.retain(|m| m != &market);
    agent.allowed_markets_count = agent.allowed_markets.len() as u8;

    Ok(())
}

/// Agent executes a trade (delegate calls this)
#[derive(Accounts)]
pub struct AgentPlaceOrder<'info> {
    /// Delegate authorized to trade
    #[account(
        mut,
        constraint = delegate.key() == agent.delegate @ AgentError::UnauthorizedDelegate,
    )]
    pub delegate: Signer<'info>,

    #[account(
        mut,
        constraint = agent.is_active() @ AgentError::AgentNotActive,
    )]
    pub agent: Account<'info, TradingAgent>,

    /// Agent's open orders account for this market
    #[account(
        mut,
        constraint = open_orders.owner == agent.key(),
    )]
    pub open_orders: Account<'info, OpenOrdersAccount>,

    /// The market being traded
    /// CHECK: Validated in handler
    pub market: AccountInfo<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AgentOrderParams {
    pub side: u8,
    pub outcome: u8,
    pub price: u64,
    pub quantity: u64,
    pub order_type: u8,
    pub client_order_id: u64,
}

pub fn handler_agent_place_order(
    ctx: Context<AgentPlaceOrder>,
    params: AgentOrderParams,
) -> Result<()> {
    let agent = &mut ctx.accounts.agent;
    let market_key = ctx.accounts.market.key();

    // Check market is allowed
    require!(
        agent.is_market_allowed(&market_key),
        AgentError::MarketNotAllowed
    );

    // Run risk checks
    agent.check_risk(params.quantity, params.price)?;

    // Lock balance for this order
    let collateral_required = params
        .quantity
        .checked_mul(params.price)
        .and_then(|v| v.checked_div(10000))
        .ok_or(OrderBookError::Overflow)?;

    require!(
        agent.available_balance >= collateral_required,
        AgentError::InsufficientBalance
    );

    agent.available_balance = agent.available_balance.saturating_sub(collateral_required);
    agent.locked_balance = agent.locked_balance.saturating_add(collateral_required);
    agent.active_positions = agent.active_positions.saturating_add(1);

    emit!(AgentOrderPlaced {
        agent: agent.key(),
        market: market_key,
        side: params.side,
        outcome: params.outcome,
        price: params.price,
        quantity: params.quantity,
        client_order_id: params.client_order_id,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Record trade result for agent
#[derive(Accounts)]
pub struct RecordAgentTrade<'info> {
    /// Can be called by delegate or crank
    pub caller: Signer<'info>,

    #[account(mut)]
    pub agent: Account<'info, TradingAgent>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TradeResult {
    pub pnl: i64,
    pub volume: u64,
    pub released_collateral: u64,
}

pub fn handler_record_agent_trade(
    ctx: Context<RecordAgentTrade>,
    result: TradeResult,
) -> Result<()> {
    let agent = &mut ctx.accounts.agent;
    let clock = Clock::get()?;

    // Release locked collateral
    agent.locked_balance = agent
        .locked_balance
        .saturating_sub(result.released_collateral);

    // Add back to available (plus/minus PnL)
    if result.pnl >= 0 {
        agent.available_balance = agent
            .available_balance
            .saturating_add(result.released_collateral)
            .saturating_add(result.pnl as u64);
    } else {
        let loss = (-result.pnl) as u64;
        agent.available_balance = agent
            .available_balance
            .saturating_add(result.released_collateral)
            .saturating_sub(loss);
    }

    // Update active positions
    if agent.active_positions > 0 {
        agent.active_positions = agent.active_positions.saturating_sub(1);
    }

    // Record trade metrics
    agent.record_trade(result.pnl, result.volume, clock.unix_timestamp);

    emit!(AgentTradeRecorded {
        agent: agent.key(),
        pnl: result.pnl,
        volume: result.volume,
        total_pnl: agent.total_pnl,
        trades_count: agent.trades_count,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// Events

#[event]
pub struct AgentCreated {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub delegate: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct AgentDeposit {
    pub agent: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct AgentWithdraw {
    pub agent: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct AgentUpdated {
    pub agent: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AgentOrderPlaced {
    pub agent: Pubkey,
    pub market: Pubkey,
    pub side: u8,
    pub outcome: u8,
    pub price: u64,
    pub quantity: u64,
    pub client_order_id: u64,
    pub timestamp: i64,
}

#[event]
pub struct AgentTradeRecorded {
    pub agent: Pubkey,
    pub pnl: i64,
    pub volume: u64,
    pub total_pnl: i64,
    pub trades_count: u64,
    pub timestamp: i64,
}
