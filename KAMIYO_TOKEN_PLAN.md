# $KAMIYO Token - Advanced Solana SPL Token (2026-Ready)

**Development Location:** GitHub Codespace (isolated from main codebase)
**Target Deployment:** Meteora DLMM (Dynamic Liquidity Market Maker)
**Launch Timeline:** Month 4-6 (after SaaS validation)
**Security Standard:** MEV-bot protected, institutional-grade

---

## Token Overview

### Purpose
$KAMIYO is the utility token for x402 Infrastructure SaaS, providing:
- Payment discounts (pay with $KAMIYO instead of USDC)
- Staking rewards for platform users
- Governance over protocol parameters
- Revenue sharing from platform fees

### Technical Specifications

**Token Standard:** SPL Token-2022 (Solana Token Extensions Program)
**Framework:** Anchor 0.29+ (Rust-based Solana development)
**Extensions:**
- Transfer Fee Extension (MEV protection via dynamic fees)
- Transfer Hook Extension (custom anti-MEV logic, rate limiting, on-chain validation)
- Confidential Transfer Extension (privacy-preserving transfers)
- Permanent Delegate (emergency pause capability)
- Interest-Bearing (optional for staking rewards)

**Supply:**
- Total Supply: 1,000,000,000 $KAMIYO (1 billion)
- Decimals: 9
- Non-mintable after initial mint
- Non-burnable (deflationary through fees)

**Development Stack:**
- Language: Rust (1.70+)
- Framework: Anchor 0.29+
- Testing: Anchor test suite + Bankrun for fast integration tests
- Security: Anchor constraints + custom validation + audit coverage

---

## MEV Protection Architecture

### 1. Transfer Fee Extension

**Purpose:** Make MEV extraction unprofitable through dynamic fees

**Implementation:**
```rust
// Token-2022 Transfer Fee configuration
TransferFeeConfig {
    // Base fee charged on every transfer
    transfer_fee_basis_points: 25,  // 0.25% base fee

    // Maximum fee per transfer (prevents excessive fees on large txs)
    maximum_fee: 1_000_000_000,  // 1 $KAMIYO max

    // Fee authority (can update fees based on MEV activity)
    transfer_fee_config_authority: FEE_AUTHORITY_PUBKEY,

    // Withdraw authority (collects accumulated fees)
    withdraw_withheld_authority: TREASURY_PUBKEY,
}
```

**Dynamic Fee Adjustment:**
- Monitor swap pool activity
- Detect sandwich attacks, frontrunning
- Temporarily increase fees during high MEV periods
- Auto-adjust back to baseline when safe

### 2. Transfer Hook Extension

**Purpose:** Custom on-chain logic executed on every transfer

**Hook Program Logic:**
```rust
// programs/kamiyo-transfer-hook/src/lib.rs
use anchor_lang::prelude::*;

#[program]
pub mod kamiyo_transfer_hook {
    use super::*;

    pub fn execute(
        ctx: Context<Execute>,
        amount: u64,
    ) -> Result<()> {
        // 1. MEV Protection Checks
        detect_sandwich_attack(&ctx)?;
        detect_jit_liquidity(&ctx)?;

        // 2. Rate Limiting
        enforce_transfer_cooldown(&ctx)?;

        // 3. Whitelist for Verified Platforms
        check_platform_whitelist(&ctx)?;

        // 4. Emit Transfer Event for Monitoring
        emit!(TransferEvent {
            from: ctx.accounts.source.key(),
            to: ctx.accounts.destination.key(),
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// MEV Detection: Sandwich Attack
fn detect_sandwich_attack(ctx: &Context<Execute>) -> Result<()> {
    let recent_transfers = get_recent_transfers(
        &ctx.accounts.source.key(),
        SANDWICH_DETECTION_WINDOW
    )?;

    // Check for rapid buy-sell pattern (sandwich attack signature)
    if recent_transfers.len() > 2 {
        let time_delta = recent_transfers[0].timestamp - recent_transfers[2].timestamp;

        // If buy-sell-buy or sell-buy-sell within 5 seconds: likely MEV
        if time_delta < 5 {  // 5 second window
            msg!("Suspected sandwich attack detected");
            return err!(ErrorCode::SuspectedSandwichAttack);
        }
    }

    Ok(())
}

// Additional MEV Protection: Rate Limiting (Anti-Sniper)
fn enforce_rate_limit(ctx: &Context<Execute>, amount: u64) -> Result<()> {
    let rate_limiter = &mut ctx.accounts.rate_limiter;
    let clock = Clock::get()?;

    // Reset rate limit window if expired
    if clock.unix_timestamp - rate_limiter.window_start > RATE_LIMIT_WINDOW {
        rate_limiter.window_start = clock.unix_timestamp;
        rate_limiter.transfers_in_window = 0;
        rate_limiter.volume_in_window = 0;
    }

    // Check transaction count limit
    require!(
        rate_limiter.transfers_in_window < MAX_TRANSFERS_PER_WINDOW,
        ErrorCode::RateLimitExceeded
    );

    // Check volume limit (prevents large bot trades)
    require!(
        rate_limiter.volume_in_window + amount < MAX_VOLUME_PER_WINDOW,
        ErrorCode::VolumeLimitExceeded
    );

    // Update rate limiter
    rate_limiter.transfers_in_window += 1;
    rate_limiter.volume_in_window += amount;

    Ok(())
}

// MEV Detection: JIT Liquidity
fn detect_jit_liquidity(ctx: &Context<Execute>) -> Result<()> {
    // Check if large liquidity was added in same slot
    let slot = Clock::get()?.slot;
    let pool_state = get_pool_state(ctx)?;

    if pool_state.last_liquidity_add_slot == slot &&
       pool_state.last_liquidity_add_amount > LARGE_LIQ_THRESHOLD {
        return err!(ErrorCode::SuspectedJITLiquidity);
    }

    Ok(())
}

// Rate Limiting: Transfer Cooldown
fn enforce_transfer_cooldown(ctx: &Context<Execute>) -> Result<()> {
    let transfer_state = get_transfer_state(&ctx.accounts.source.key())?;
    let current_time = Clock::get()?.unix_timestamp;

    // Enforce 1 second cooldown between transfers
    if current_time - transfer_state.last_transfer < 1 {
        return err!(ErrorCode::TransferCooldown);
    }

    Ok(())
}
```

**Whitelist System:**
- Verified platforms (x402 SaaS, Meteora, etc.) bypass some restrictions
- Reduces friction for legitimate users
- Maintains protection against MEV bots

### 3. Confidential Transfer Extension

**Purpose:** Privacy-preserving transfers for whale protection

**Configuration:**
```rust
// Enable confidential transfers for accounts that want privacy
ConfidentialTransferConfig {
    authority: CONFIDENTIAL_AUTHORITY,
    auto_approve_new_accounts: false,  // Manual approval required
    auditor_encryption_pubkey: AUDITOR_PUBKEY,  // For compliance
}
```

**Use Case:**
- Large holders can transfer without revealing amounts
- Prevents copy-trading and frontrunning of whale moves
- Maintains transparency via auditor key (regulatory compliance)

---

## Meteora DLMM Integration

### Why Meteora?

**Technical Advantages:**
1. **Dynamic Liquidity:** Concentrated liquidity adjusts to price
2. **Low Slippage:** Better execution than constant product AMMs
3. **Capital Efficiency:** Less TVL needed for deep liquidity
4. **Fee Tiers:** Customizable fees for different market conditions
5. **MEV Resistance:** Built-in JIT liquidity protection

**2026-Ready Features:**
- Integration with Solana Token-2022 extensions
- Support for advanced SPL tokens
- On-chain orderbook hybrid (MEV-resistant)

### Pool Configuration

**Meteora DLMM Pool Parameters:**
```typescript
// Meteora pool initialization
const poolParams = {
    tokenX: USDC_MINT,  // Quote token
    tokenY: KAMIYO_MINT,  // Base token

    // Bin step: Price granularity
    binStep: 25,  // 0.25% price bins (tight spreads)

    // Initial price: $0.01 per $KAMIYO
    activeId: calculateBinId(0.01),

    // Fee tier: 0.3% (competitive with Orca, Raydium)
    feeBps: 30,

    // Activation type: Public slot (prevents MEV on launch)
    activationType: ActivationType.Slot,
    activationSlot: LAUNCH_SLOT + 100,  // 100 slots delay

    // Lock duration: 30 days for initial liquidity
    lockDuration: 30 * 24 * 60 * 60,
}
```

**Liquidity Strategy:**
```typescript
// Concentrated liquidity distribution
const liquidityPositions = [
    {
        // Tight range for active trading
        binRange: [-20, 20],  // ±5% from current price
        liquidityPct: 60,     // 60% of liquidity
    },
    {
        // Medium range for depth
        binRange: [-50, 50],  // ±12.5% from current price
        liquidityPct: 30,     // 30% of liquidity
    },
    {
        // Wide range for tail protection
        binRange: [-100, 100], // ±25% from current price
        liquidityPct: 10,      // 10% of liquidity
    }
]
```

### Launch Protection

**Anti-Snipe Mechanisms:**

1. **Delayed Activation:**
```rust
// Pool activates 100 slots after creation (prevent immediate trading)
if clock.slot < pool.activation_slot {
    return err!(ErrorCode::PoolNotActive);
}
```

2. **Max Buy on Launch:**
```rust
// First 1000 slots (5 min): Max 0.1% of supply per tx
if clock.slot < pool.activation_slot + 1000 {
    let max_buy = TOTAL_SUPPLY / 1000;
    require!(amount <= max_buy, ErrorCode::ExceedsLaunchLimit);
}
```

3. **Gradual Price Discovery:**
```rust
// Distribute initial liquidity across bins to prevent price manipulation
for bin_id in active_id - 50..active_id + 50 {
    add_liquidity_to_bin(bin_id, base_liquidity / 100);
}
```

### Meteora Anti-MEV Features (Built-In)

**Decaying Fees:**
```typescript
// Meteora automatically increases fees during high volatility
const dynamicFeeConfig = {
    baseFee: 30,           // 0.3% base fee
    volatilityMultiplier: 2.0,  // 2x fees during high volatility
    decayRate: 0.95,       // Fee decays 5% per minute back to base
}
```

**Size-Based Surcharges:**
```typescript
// Meteora charges extra for large trades (anti-whale MEV)
const sizeSurcharges = {
    tier1: { threshold: 100_000_000, surcharge: 10 },  // 0.1% extra on 100K+ USDC
    tier2: { threshold: 500_000_000, surcharge: 25 },  // 0.25% extra on 500K+ USDC
    tier3: { threshold: 1_000_000_000, surcharge: 50 }, // 0.5% extra on 1M+ USDC
}
```

**Gated Deposits:**
```typescript
// Meteora can restrict who can add liquidity initially
const gatedConfig = {
    whitelist: [TEAM_WALLET, TREASURY_WALLET],
    gatedUntilSlot: LAUNCH_SLOT + 10_000,  // ~1 hour after launch
    minLockDuration: 7 * 24 * 60 * 60,     // 7 day minimum lock
}
```

---

## Atomic Launch Sequence (Jito Bundles)

### Why Jito Bundles?

**Problem with Normal Launch:**
1. Mint transaction lands on-chain (public mempool)
2. Bots detect new token mint
3. Pool creation transaction visible before execution
4. MEV bots frontrun initial liquidity provision
5. Sniper bots buy before legitimate users

**Solution: Atomic Bundle Execution**
- All transactions execute in same slot, atomically
- No intermediate state visible to MEV bots
- Entire launch sequence is private until confirmed
- Impossible to frontrun bundle transactions

### Jito Bundle Construction

**Launch Sequence (Atomic):**
```typescript
import { Bundle } from '@jito-labs/jito-ts';
import { Connection, Keypair, Transaction } from '@solana/web3.js';

async function createAtomicLaunch() {
    const bundle = new Bundle([], 5); // Max 5 transactions

    // Transaction 1: Initialize Token Mint (SPL Token-2022)
    const mintTx = await createMintTransaction({
        mintAuthority: deployerKeypair.publicKey,
        decimals: 9,
        supply: 1_000_000_000_000_000_000, // 1B tokens
        extensions: [
            'TransferFee',
            'TransferHook',
            'ConfidentialTransfer',
            'PermanentDelegate'
        ]
    });
    bundle.addTransaction(mintTx);

    // Transaction 2: Create Meteora DLMM Pool
    const poolTx = await createMeteoraPool({
        tokenX: USDC_MINT,
        tokenY: KAMIYO_MINT,
        binStep: 25,
        initialPrice: 0.01,
        activationSlot: currentSlot + 100,
        feeBps: 30,
    });
    bundle.addTransaction(poolTx);

    // Transaction 3: Add Initial Liquidity (Concentrated)
    const liquidityTx = await addLiquidity({
        pool: poolPubkey,
        usdcAmount: 100_000_000_000, // 100K USDC
        kamiyoAmount: 10_000_000_000_000_000, // 10M KAMIYO
        binRange: [-50, 50],
        lockDuration: 30 * 24 * 60 * 60, // 30 days
    });
    bundle.addTransaction(liquidityTx);

    // Transaction 4: Execute Initial Buy (Team)
    const initialBuyTx = await createSwapTransaction({
        pool: poolPubkey,
        inputMint: USDC_MINT,
        outputMint: KAMIYO_MINT,
        amount: 1_000_000_000, // 1K USDC
        minOutput: calculateMinOutput(1000, 0.01, 0.05), // 5% slippage
    });
    bundle.addTransaction(initialBuyTx);

    // Transaction 5: Revoke Mint Authority (Immutable Supply)
    const revokeTx = await revokeMintAuthority({
        mint: KAMIYO_MINT,
        authority: deployerKeypair.publicKey,
    });
    bundle.addTransaction(revokeTx);

    // Send bundle to Jito block engine
    const jitoUrl = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
    const bundleId = await bundle.sendBundle(jitoUrl);

    console.log(`Bundle submitted: ${bundleId}`);

    // Wait for confirmation
    const result = await bundle.confirm();
    console.log(`Launch confirmed in slot ${result.slot}`);

    return {
        mint: KAMIYO_MINT,
        pool: poolPubkey,
        bundleId,
        slot: result.slot
    };
}
```

### Alternative: Smithii Integration

**Smithii is a Jito-like bundler with additional features:**

```typescript
import { SmithiiClient } from 'smithii-sdk';

async function launchWithSmithii() {
    const smithii = new SmithiiClient({
        endpoint: 'https://api.smithii.io',
        apiKey: process.env.SMITHII_API_KEY
    });

    // Smithii auto-bundles related transactions
    const launchSequence = await smithii.createLaunchSequence({
        token: {
            mint: KAMIYO_MINT,
            supply: 1_000_000_000,
            extensions: ['TransferFee', 'TransferHook']
        },
        dex: 'meteora',
        liquidity: {
            usdcAmount: 100_000,
            binRange: [-50, 50],
            lockDays: 30
        },
        antiMev: {
            delayedActivation: 100, // slots
            maxBuyOnLaunch: 0.001,  // 0.1% of supply
            rateLimiting: true
        }
    });

    const result = await smithii.executeLaunch(launchSequence);

    console.log(`Token launched: ${result.mint}`);
    console.log(`Pool created: ${result.pool}`);
    console.log(`Bundle confirmed: ${result.bundleId}`);

    return result;
}
```

### Post-Launch Decentralization

**Revoke Authorities (Trustless):**

```typescript
async function finalizeDecentralization() {
    const transactions = [];

    // 1. Revoke mint authority (no more tokens can be minted)
    transactions.push(
        await Token.createSetAuthorityInstruction(
            TOKEN_2022_PROGRAM_ID,
            KAMIYO_MINT,
            null, // Set to null = irrevocable
            'MintTokens',
            deployerKeypair.publicKey,
            []
        )
    );

    // 2. Burn LP tokens (liquidity locked permanently)
    const lpTokenAccount = await getAssociatedTokenAddress(
        METEORA_LP_MINT,
        deployerKeypair.publicKey,
        false,
        TOKEN_PROGRAM_ID
    );

    transactions.push(
        await Token.createBurnInstruction(
            TOKEN_PROGRAM_ID,
            lpTokenAccount,
            METEORA_LP_MINT,
            deployerKeypair.publicKey,
            [],
            lpBalance // Burn all LP tokens
        )
    );

    // 3. Transfer fee authority to DAO (community-governed)
    transactions.push(
        await Token.createSetAuthorityInstruction(
            TOKEN_2022_PROGRAM_ID,
            KAMIYO_MINT,
            DAO_PROGRAM_ID, // Governance program
            'TransferFeeConfig',
            deployerKeypair.publicKey,
            []
        )
    );

    // Execute all in atomic bundle
    const bundle = new Bundle(transactions, transactions.length);
    const result = await bundle.sendBundle(JITO_URL);

    console.log('Token fully decentralized');
    console.log(`Mint authority: ${null}`);
    console.log(`LP tokens: BURNED`);
    console.log(`Fee authority: DAO`);

    return result;
}
```

---

## Security Audit Framework

### Solana-Specific Vulnerabilities (Beyond EVM)

**1. Account Validation Vulnerabilities:**
```rust
// VULNERABLE: Missing account ownership check
pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
    // ❌ No check if source account actually belongs to signer
    token::transfer(ctx.accounts.into(), amount)?;
    Ok(())
}

// SECURE: Proper account validation
pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
    // ✅ Anchor constraint ensures ownership
    require!(
        ctx.accounts.source.owner == ctx.accounts.authority.key(),
        ErrorCode::Unauthorized
    );
    token::transfer(ctx.accounts.into(), amount)?;
    Ok(())
}
```

**2. Signer Authorization Issues:**
```rust
// Use Anchor constraints to enforce authorization
#[account(
    mut,
    has_one = authority @ ErrorCode::Unauthorized,
    constraint = source.mint == KAMIYO_MINT @ ErrorCode::InvalidMint
)]
pub source: Account<'info, TokenAccount>,
pub authority: Signer<'info>,
```

**3. Arithmetic Overflow Protection:**
```rust
// Rust prevents overflow in debug mode, but explicit checks in release
use checked_math::CheckedMath;

let new_balance = balance
    .checked_add(amount)
    .ok_or(ErrorCode::MathOverflow)?;
```

**4. Reentrancy Protection (CPI-based):**
```rust
// Solana doesn't have traditional reentrancy, but CPI reentrancy exists
// Use instruction introspection to detect recursive calls
let ixs = ctx.accounts.instructions.as_ref();
require!(
    !ixs.iter().any(|ix| ix.program_id == crate::id()),
    ErrorCode::ReentrancyDetected
);
```

**5. PDA Seed Collision:**
```rust
// Ensure PDA seeds are unique and include all necessary components
#[account(
    init,
    payer = payer,
    space = 8 + RateLimiter::LEN,
    seeds = [
        b"rate_limiter",
        user.key().as_ref(),
        &[clock.slot.to_le_bytes()][..] // Include slot to prevent replay
    ],
    bump
)]
pub rate_limiter: Account<'info, RateLimiter>,
```

**6. Missing Rent Exemption Checks:**
```rust
// Ensure accounts have rent exemption
#[account(
    init,
    payer = payer,
    space = 8 + TransferState::LEN,
    rent_exempt = enforce // Anchor built-in
)]
pub transfer_state: Account<'info, TransferState>,
```

### Front-Running Protection (Solana-Specific)

**1. Slot-Based Ordering (No Mempool):**
- Solana doesn't have a public mempool like Ethereum
- Transactions are sent directly to leaders
- Front-running still possible via:
  - Leader spam (multiple txs to same leader)
  - Jito MEV bundles (controlled ordering)
  - RPC node analysis (detect pending txs)

**2. Anti-Front-Running Measures:**
```rust
// Commit-reveal pattern for sensitive operations
pub fn commit_trade(ctx: Context<CommitTrade>, hash: [u8; 32]) -> Result<()> {
    let commitment = &mut ctx.accounts.commitment;
    commitment.hash = hash;
    commitment.slot = Clock::get()?.slot;
    Ok(())
}

pub fn reveal_trade(
    ctx: Context<RevealTrade>,
    amount: u64,
    nonce: [u8; 32]
) -> Result<()> {
    let commitment = &ctx.accounts.commitment;

    // Verify commitment
    let expected_hash = hash(&[&amount.to_le_bytes(), &nonce].concat());
    require!(commitment.hash == expected_hash, ErrorCode::InvalidReveal);

    // Enforce delay (minimum 1 slot)
    require!(
        Clock::get()?.slot > commitment.slot,
        ErrorCode::RevealTooEarly
    );

    // Execute trade
    execute_trade(ctx, amount)?;
    Ok(())
}
```

**3. Slot-Based Rate Limiting:**
```rust
// Prevent spam attacks across multiple slots
#[account]
pub struct SlotRateLimiter {
    pub last_slot: u64,
    pub transactions_in_slot: u8,
    pub max_per_slot: u8,
}

pub fn enforce_slot_limit(limiter: &mut SlotRateLimiter) -> Result<()> {
    let current_slot = Clock::get()?.slot;

    if limiter.last_slot != current_slot {
        limiter.last_slot = current_slot;
        limiter.transactions_in_slot = 0;
    }

    require!(
        limiter.transactions_in_slot < limiter.max_per_slot,
        ErrorCode::SlotRateLimitExceeded
    );

    limiter.transactions_in_slot += 1;
    Ok(())
}
```

### Comprehensive Audit Checklist

**Pre-Deployment Security Audit:**

1. **Static Analysis:**
   - [ ] Run Anchor verify on all programs
   - [ ] Scan with Soteria (Solana security scanner)
   - [ ] Check for common vulnerabilities with cargo-audit
   - [ ] Verify no unsafe Rust code blocks

2. **Access Control:**
   - [ ] All privileged functions require proper authorization
   - [ ] Multisig required for critical operations
   - [ ] PDAs use correct seeds and bumps
   - [ ] Account ownership validated on all operations

3. **Economic Security:**
   - [ ] No integer overflow/underflow in calculations
   - [ ] Fee calculations cannot be manipulated
   - [ ] Rate limits prevent economic attacks
   - [ ] Supply is correctly capped and immutable

4. **MEV Resistance:**
   - [ ] Transfer hooks implement sandwich detection
   - [ ] Rate limiting prevents sniper bots
   - [ ] Jito bundle used for atomic launch
   - [ ] Pool activation delayed after creation

5. **Front-Running Protection:**
   - [ ] Sensitive operations use commit-reveal
   - [ ] Slot-based rate limiting active
   - [ ] No reliance on transaction ordering
   - [ ] Price oracles resistant to manipulation

6. **Code Quality:**
   - [ ] 100% test coverage for critical paths
   - [ ] Integration tests cover all edge cases
   - [ ] Fuzz testing completed
   - [ ] Third-party audit completed

**Audit Providers (Recommended):**

1. **OtterSec** (Solana specialists)
   - Cost: $15K-$30K
   - Timeline: 2-3 weeks
   - Focus: Solana-specific vulnerabilities

2. **Neodyme** (Anchor experts)
   - Cost: $20K-$40K
   - Timeline: 3-4 weeks
   - Focus: Anchor framework security

3. **Zellic** (Comprehensive)
   - Cost: $25K-$50K
   - Timeline: 4-6 weeks
   - Focus: Full protocol audit

### Testing Strategy

**Unit Tests (Anchor):**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;

    #[test]
    fn test_sandwich_detection() {
        // Setup test environment
        let program = program_test();

        // Create rapid buy-sell-buy pattern
        transfer(&user, &pool, 1000);
        sleep(1); // 1 second
        transfer(&pool, &user, 1000);
        sleep(1);
        transfer(&user, &pool, 1000);

        // Should trigger sandwich detection
        assert_eq!(
            result.unwrap_err(),
            ErrorCode::SuspectedSandwichAttack
        );
    }
}
```

**Integration Tests (Bankrun):**
```typescript
import { BankrunProvider } from 'anchor-bankrun';

describe('KAMIYO Token Launch', () => {
    it('prevents frontrunning via Jito bundle', async () => {
        const bundle = await createLaunchBundle();

        // Simulate MEV bot attempting to frontrun
        const mevTx = await createBuyTransaction({
            amount: 10_000,
            slippage: 0.5
        });

        // MEV tx should fail (pool not active yet)
        await expect(mevTx).rejects.toThrow('PoolNotActive');

        // Bundle executes atomically
        await bundle.execute();

        // Pool now active
        const poolState = await getPoolState();
        expect(poolState.active).toBe(true);
    });
});
```

**Mainnet Fork Testing:**
```bash
# Test on mainnet fork before actual deployment
solana-test-validator \
    --clone-upgradeable-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
    --clone-upgradeable-program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
    --url https://api.mainnet-beta.solana.com
```

---

## Advanced Security Features

### 1. Emergency Pause via Permanent Delegate

**Implementation:**
```rust
// Token mint with permanent delegate
Mint {
    mint_authority: None,  // Non-mintable
    supply: 1_000_000_000_000_000_000,  // 1B tokens (9 decimals)
    decimals: 9,
    is_initialized: true,
    freeze_authority: Some(FREEZE_AUTHORITY),  // Can freeze if needed

    // Permanent delegate for emergency interventions
    permanent_delegate: Some(EMERGENCY_DELEGATE),
}
```

**Emergency Procedures:**
```rust
// Emergency pause (requires multisig)
pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
    require_multisig(&ctx.accounts.signers, 3, 5)?;  // 3 of 5 multisig

    msg!("EMERGENCY PAUSE ACTIVATED");

    // Freeze all transfers
    ctx.accounts.mint.freeze_authority = Some(FREEZE_AUTHORITY);

    // Emit emergency event
    emit!(EmergencyEvent {
        event_type: "PAUSE",
        reason: "Security incident detected",
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// Resume (requires full multisig + 24h timelock)
pub fn emergency_resume(ctx: Context<EmergencyResume>) -> Result<()> {
    require_multisig(&ctx.accounts.signers, 5, 5)?;  // All 5 signers

    let timelock = get_timelock(&ctx.accounts.proposal)?;
    require!(timelock.ready(), ErrorCode::TimelockNotReady);

    ctx.accounts.mint.freeze_authority = None;

    Ok(())
}
```

### 2. Upgradeable Transfer Hook

**Future-Proof Architecture:**
```rust
// Transfer hook can be upgraded without migrating token
pub struct TransferHookConfig {
    pub hook_program_id: Pubkey,
    pub upgrade_authority: Pubkey,
}

pub fn update_transfer_hook(
    ctx: Context<UpdateHook>,
    new_program_id: Pubkey,
) -> Result<()> {
    require_multisig(&ctx.accounts.signers, 3, 5)?;

    // Update hook program (enables future MEV protection improvements)
    ctx.accounts.config.hook_program_id = new_program_id;

    Ok(())
}
```

### 3. Oracle-Based Circuit Breaker

**Price Manipulation Protection:**
```rust
// Integrate with Pyth/Switchboard oracle
pub fn validate_price_impact(
    ctx: Context<Transfer>,
    amount: u64,
) -> Result<()> {
    let oracle_price = get_oracle_price(&ctx.accounts.price_feed)?;
    let pool_price = get_pool_price(&ctx.accounts.pool)?;

    // Calculate price deviation
    let deviation_bps = calculate_deviation(oracle_price, pool_price);

    // If deviation > 5%, reject large trades
    if deviation_bps > 500 && amount > LARGE_TRADE_THRESHOLD {
        return err!(ErrorCode::ExcessivePriceDeviation);
    }

    Ok(())
}
```

---

## Tokenomics & Distribution

### Allocation (1B Total Supply)

```
Team & Advisors:        15%  (150M) - 2 year linear vest, 6 month cliff
Treasury/Development:   20%  (200M) - Controlled by DAO
Initial Liquidity:      10%  (100M) - Locked in Meteora DLMM
Ecosystem Incentives:   25%  (250M) - Staking rewards, grants
Community Airdrop:      10%  (100M) - Early SaaS users, testnet participants
Strategic Partners:      5%   (50M) - PayAI, Meteora, etc.
Public Sale:            15%  (150M) - Fair launch via Meteora
```

### Vesting Schedule

**Team & Advisors (150M):**
```rust
// 6 month cliff, then 18 months linear unlock
VestingSchedule {
    cliff_duration: 6 * 30 * 24 * 60 * 60,  // 6 months
    vesting_duration: 18 * 30 * 24 * 60 * 60,  // 18 months
    total_amount: 150_000_000_000_000_000,
    start_timestamp: TGE_TIMESTAMP,
}
```

**Ecosystem Incentives (250M):**
```
Month 1-3:   5M/month  (Platform launch rewards)
Month 4-12:  10M/month (Growth phase)
Year 2:      80M total (Mature platform rewards)
Year 3+:     60M total (Long-term sustainability)
```

### Utility & Demand Drivers

**1. Payment Discounts (Immediate Utility)**
```python
# x402 SaaS pricing with $KAMIYO
USDC_PRICE = {
    'starter': 99,   # $99/month in USDC
    'pro': 299,      # $299/month in USDC
    'enterprise': 999
}

KAMIYO_DISCOUNT = 0.20  # 20% discount when paying with $KAMIYO

KAMIYO_PRICE = {
    'starter': 99 * 0.80 / KAMIYO_USD_PRICE,   # 20% discount
    'pro': 299 * 0.80 / KAMIYO_USD_PRICE,
    'enterprise': 999 * 0.80 / KAMIYO_USD_PRICE
}

# Example: If $KAMIYO = $0.01
# Starter tier: 99 * 0.80 / 0.01 = 7,920 $KAMIYO/month
# Pro tier: 299 * 0.80 / 0.01 = 23,920 $KAMIYO/month
```

**Monthly Buy Pressure (Conservative):**
```
Month 6 (10 Starter, 5 Pro customers):
  Starter: 10 * 7,920 = 79,200 $KAMIYO
  Pro: 5 * 23,920 = 119,600 $KAMIYO
  Total: 198,800 $KAMIYO/month buy pressure

  At $0.01: $1,988 monthly revenue in $KAMIYO
  Market buy pressure drives price up over time
```

**2. Staking Rewards (Hold Incentive)**
```rust
// Single-sided $KAMIYO staking
StakingPool {
    apy: 12_00,  // 12% APY (from platform revenue)
    min_stake: 1_000_000_000_000,  // 1,000 $KAMIYO minimum
    lock_duration: 0,  // Flexible (can unstake anytime)
    rewards_source: PlatformRevenue,  // 10% of platform fees
}

// Boosted rewards for long-term stakers
StakingMultiplier {
    "0-30 days": 1.0,   // Base APY
    "30-90 days": 1.2,  // 20% boost
    "90-180 days": 1.5, // 50% boost
    "180+ days": 2.0,   // 100% boost (24% effective APY)
}
```

**3. Governance (DAO Control)**
```rust
// Token holders vote on:
// - Platform fee structure
// - New chain integrations
// - Treasury spending
// - Partnership approvals
// - Protocol upgrades

VotingPower {
    base: token_balance,
    multiplier: staking_duration_multiplier,
    // Example: 10,000 $KAMIYO staked 180+ days = 20,000 voting power
}

ProposalThreshold {
    create_proposal: 100_000_000_000_000,  // 100K $KAMIYO
    quorum: 5_000_000_000_000_000,  // 5M $KAMIYO (0.5% of supply)
    approval_threshold: 66,  // 66% yes votes
}
```

**4. Revenue Share (Passive Income)**
```python
# 10% of platform revenue distributed to $KAMIYO stakers
monthly_platform_revenue = 10_000  # $10K (Month 6 projection)
revenue_share_pool = monthly_platform_revenue * 0.10  # $1,000

# Total staked: 50M $KAMIYO (5% of supply)
# Your stake: 100K $KAMIYO
# Your share: (100K / 50M) * $1,000 = $2/month

# At scale (Month 12, $25K revenue, 200M staked):
revenue_share_pool = 25_000 * 0.10  # $2,500/month
# Your stake: 1M $KAMIYO
# Your share: (1M / 200M) * $2,500 = $12.50/month
# Annualized: $150/year on $10K investment = 1.5% cash yield
# Plus: APY from staking rewards = 12-24%
# Total yield: 13.5-25.5% (attractive vs DeFi alternatives)
```

---

## Token Launch Strategy

### Pre-Launch (Month 1-3)

**1. Codespace Development:**
```bash
# GitHub Codespace configuration
.devcontainer/
├── devcontainer.json
├── Dockerfile
└── setup.sh

# Isolated from main KAMIYO repo
# Prevents contamination of production SaaS code
# Enables focused token development
```

**2. Smart Contract Development:**
```
Week 1-2: SPL Token-2022 with extensions
Week 3-4: Transfer hook program (MEV protection)
Week 5-6: Staking contract
Week 7-8: Governance contract
Week 9-10: Security audit (OtterSec, Neodyme)
Week 11-12: Testnet deployment and testing
```

**3. Community Building:**
```
- Announce $KAMIYO token on Twitter/Discord
- Whitelist for airdrop (early SaaS users)
- Educational content (tokenomics, utility)
- Partnership announcements (PayAI, Meteora)
```

### Launch (Month 4)

**Phase 1: Airdrop (Week 1)**
```python
# Airdrop to early supporters (100M tokens)
airdrop_allocation = {
    'saas_users': 40_000_000_000_000_000,  # 40M - Early adopters
    'testnet_participants': 20_000_000_000_000_000,  # 20M
    'community_contributors': 20_000_000_000_000_000,  # 20M
    'strategic_partners': 20_000_000_000_000_000,  # 20M
}

# Eligibility:
# - SaaS account created before Month 3
# - Minimum 1 month subscription OR 100 verification API calls
# - Allocation: 1,000-10,000 $KAMIYO per user (based on usage)
```

**Phase 2: Liquidity Provision (Week 2)**
```typescript
// Initialize Meteora DLMM pool
const initialLiquidity = {
    usdc: 100_000 * 1e6,  // $100K USDC
    kamiyo: 100_000_000 * 1e9,  // 100M $KAMIYO
    // Implied price: $0.01 per $KAMIYO
}

// Lock liquidity for 90 days minimum
const liquidityLock = {
    duration: 90 * 24 * 60 * 60,
    authority: MULTISIG_PUBKEY,  // Requires 3/5 to unlock early
}
```

**Phase 3: Public Sale (Week 3)**
```rust
// Fair launch: No presale, no VCs
PublicSale {
    allocation: 150_000_000_000_000_000,  // 150M tokens
    sale_mechanism: "Dutch Auction",  // Price decreases until cleared

    starting_price: 0.015,  // $0.015 (50% premium to pool price)
    ending_price: 0.008,    // $0.008 (20% discount to pool price)
    duration: 24 * 60 * 60, // 24 hours

    max_buy_per_wallet: 1_000_000_000_000_000,  // 1M $KAMIYO
    min_buy: 100_000_000_000,  // 100 $KAMIYO
}
```

**Phase 4: Open Trading (Week 4)**
```
- Meteora DLMM pool goes live
- CEX listings (if demand warrants): Gate.io, MEXC
- Aggregator integration: Jupiter, DexScreener
- Market making: Optional MM for deep liquidity
```

### Post-Launch (Month 5-6)

**1. Utility Activation:**
```python
# Enable $KAMIYO payments in x402 SaaS
# Month 5: 20% discount goes live
# Month 6: Staking rewards begin distributing

# Marketing push:
# "Save 20% on x402 Infrastructure with $KAMIYO"
# "Stake $KAMIYO, earn from platform revenue"
```

**2. Liquidity Mining:**
```rust
// Incentivize Meteora LP providers
LiquidityMiningProgram {
    pool: KAMIYO_USDC_METEORA,
    rewards_per_day: 500_000_000_000_000,  // 500K $KAMIYO/day
    duration: 90 * 24 * 60 * 60,  // 90 days
    total_rewards: 45_000_000_000_000_000,  // 45M $KAMIYO
}

// APR calculation:
// Pool TVL: $200K
// Daily rewards: 500K $KAMIYO * $0.01 = $5,000
// Daily APR: $5,000 / $200,000 = 2.5%
// Annual APR: 2.5% * 365 = 912.5% (early LP incentive)
```

**3. Exchange Listings:**
```
Tier 3 CEX: Gate.io, MEXC (if volume > $100K/day)
Tier 2 CEX: KuCoin, Bybit (if volume > $1M/day)
Tier 1 CEX: Binance, Coinbase (if TVL > $10M + regulatory compliance)
```

---

## Technical Implementation (Codespace)

### Repository Structure
```
kamiyo-token/  (NEW GitHub repo in Codespace)
├── programs/
│   ├── kamiyo-token/          # SPL Token-2022 initialization
│   ├── kamiyo-transfer-hook/  # MEV protection logic
│   ├── kamiyo-staking/        # Staking contract
│   └── kamiyo-governance/     # DAO governance
├── tests/
│   ├── token.test.ts
│   ├── transfer-hook.test.ts
│   ├── mev-protection.test.ts
│   ├── staking.test.ts
│   └── governance.test.ts
├── scripts/
│   ├── deploy-token.ts
│   ├── init-meteora-pool.ts
│   ├── airdrop.ts
│   └── enable-extensions.ts
├── sdk/
│   └── typescript/
│       └── kamiyo-sdk/  # Client SDK for integration
├── Anchor.toml
├── package.json
└── README.md
```

### Development Workflow

**1. Codespace Setup:**
```json
// .devcontainer/devcontainer.json
{
  "name": "KAMIYO Token Development",
  "image": "mcr.microsoft.com/devcontainers/rust:latest",
  "features": {
    "ghcr.io/devcontainers/features/node:1": {
      "version": "18"
    }
  },
  "postCreateCommand": "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && cargo install --git https://github.com/coral-xyz/anchor anchor-cli && npm install -g yarn",
  "customizations": {
    "vscode": {
      "extensions": [
        "rust-lang.rust-analyzer",
        "esbenp.prettier-vscode"
      ]
    }
  }
}
```

**2. Token Initialization Script:**
```typescript
// scripts/deploy-token.ts
import { Connection, Keypair } from '@solana/web3.js'
import { createMint, createEnableTransferFeeInstruction } from '@solana/spl-token'

async function deployKamiyoToken() {
  const connection = new Connection('https://api.mainnet-beta.solana.com')
  const mintAuthority = Keypair.fromSecretKey(/* load from secure vault */)

  // Create mint with Token-2022 extensions
  const mint = await createMint(
    connection,
    mintAuthority,
    null,  // No mint authority after initial mint
    FREEZE_AUTHORITY,
    9,  // Decimals
    Keypair.generate(),  // Mint keypair
    { commitment: 'confirmed' },
    TOKEN_2022_PROGRAM_ID
  )

  // Enable transfer fee extension
  await enableTransferFee(
    connection,
    mintAuthority,
    mint,
    FEE_CONFIG_AUTHORITY,
    WITHDRAW_WITHHELD_AUTHORITY,
    25,  // 0.25% fee
    BigInt(1_000_000_000)  // 1 $KAMIYO max fee
  )

  // Enable transfer hook
  await enableTransferHook(
    connection,
    mintAuthority,
    mint,
    TRANSFER_HOOK_PROGRAM_ID
  )

  // Enable confidential transfers
  await enableConfidentialTransfers(
    connection,
    mintAuthority,
    mint,
    CONFIDENTIAL_AUTHORITY,
    false,  // Manual approval
    AUDITOR_PUBKEY
  )

  console.log(`✅ $KAMIYO token deployed: ${mint.toBase58()}`)
}
```

**3. MEV Protection Test:**
```typescript
// tests/mev-protection.test.ts
import { expect } from 'chai'
import { transfer, getAccount } from '@solana/spl-token'

describe('MEV Protection', () => {
  it('should reject sandwich attack pattern', async () => {
    // Simulate rapid buy-sell within 5 seconds
    await transfer(connection, attacker, source, destination, attacker, 1000)

    // Wait 2 seconds
    await sleep(2000)

    // Attempt reverse transfer (should fail)
    try {
      await transfer(connection, attacker, destination, source, attacker, 1000)
      expect.fail('Should have rejected sandwich attack')
    } catch (err) {
      expect(err.message).to.include('SuspectedSandwichAttack')
    }
  })

  it('should enforce transfer cooldown', async () => {
    await transfer(connection, user, source, destination, user, 100)

    // Immediate second transfer (should fail)
    try {
      await transfer(connection, user, source, destination, user, 100)
      expect.fail('Should have enforced cooldown')
    } catch (err) {
      expect(err.message).to.include('TransferCooldown')
    }

    // Wait 1.5 seconds
    await sleep(1500)

    // Now should succeed
    await transfer(connection, user, source, destination, user, 100)
  })

  it('should allow whitelisted platforms to bypass restrictions', async () => {
    // Register x402 SaaS as whitelisted platform
    await registerPlatform(connection, admin, X402_PLATFORM_PUBKEY)

    // Platform can transfer without cooldown
    await transfer(connection, platform, source, destination, platform, 100)
    await transfer(connection, platform, source, destination, platform, 100)
    // Both succeed
  })
})
```

**4. Meteora Integration:**
```typescript
// scripts/init-meteora-pool.ts
import { DLMM } from '@meteora-ag/dlmm'

async function initializeMeteoraDLMM() {
  const dlmm = await DLMM.create(connection, {
    tokenX: USDC_MINT,
    tokenY: KAMIYO_MINT,
    binStep: 25,  // 0.25% bins
    initialPrice: 0.01,
    feeBps: 30,  // 0.3% fee
    activationType: 'slot',
    activationSlot: (await connection.getSlot()) + 100,
  })

  // Add liquidity across multiple bins
  await dlmm.addLiquidityByStrategy({
    positionRangeType: 'CURVE',  // Bell curve distribution
    maxBinId: activeId + 50,
    minBinId: activeId - 50,
    totalAmount: {
      tokenX: BigInt(100_000 * 1e6),  // 100K USDC
      tokenY: BigInt(100_000_000 * 1e9),  // 100M $KAMIYO
    }
  })

  console.log(`✅ Meteora DLMM pool initialized: ${dlmm.pubkey.toBase58()}`)
}
```

---

## Integration with x402 SaaS

### Payment Flow with $KAMIYO

**File:** `api/x402_saas/kamiyo_payment.py` (NEW in main repo)

```python
"""
$KAMIYO token payment integration for x402 SaaS

Allows customers to pay with $KAMIYO instead of USDC for 20% discount
"""

from solders.pubkey import Pubkey
from solana.rpc.async_api import AsyncClient
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)

KAMIYO_MINT = Pubkey.from_string("KAMIYO_MINT_ADDRESS")
USDC_MINT = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")

KAMIYO_DISCOUNT = Decimal("0.20")  # 20% discount

class KamiyoPaymentProcessor:
    """
    Process $KAMIYO token payments for x402 SaaS subscriptions

    Flow:
    1. Customer initiates subscription with $KAMIYO
    2. Calculate discounted price in $KAMIYO
    3. Verify SPL token transfer
    4. Activate subscription
    """

    def __init__(self, solana_client: AsyncClient):
        self.client = solana_client

    async def calculate_kamiyo_price(
        self,
        usdc_price: Decimal
    ) -> Decimal:
        """
        Calculate $KAMIYO price with 20% discount

        Args:
            usdc_price: Price in USDC

        Returns:
            Price in $KAMIYO tokens
        """
        # Get current $KAMIYO price from Meteora pool
        kamiyo_usd_price = await self._get_kamiyo_price()

        # Apply discount
        discounted_usd = usdc_price * (Decimal("1") - KAMIYO_DISCOUNT)

        # Convert to $KAMIYO amount
        kamiyo_amount = discounted_usd / kamiyo_usd_price

        return kamiyo_amount

    async def verify_kamiyo_payment(
        self,
        tx_hash: str,
        expected_amount: Decimal,
        customer_address: str
    ) -> bool:
        """
        Verify $KAMIYO payment transaction

        Similar to verify_payment in payment_verifier.py but for $KAMIYO
        """
        from solders.signature import Signature

        signature = Signature.from_string(tx_hash)

        # Get transaction
        response = await self.client.get_transaction(
            signature,
            encoding="jsonParsed",
            commitment="confirmed"
        )

        if not response.value:
            logger.error(f"Transaction not found: {tx_hash}")
            return False

        tx_data = response.value

        # Parse SPL token transfer
        for instruction in tx_data.transaction.transaction.message.instructions:
            if hasattr(instruction, 'parsed') and instruction.parsed:
                parsed = instruction.parsed

                if isinstance(parsed, dict):
                    info = parsed.get('info', {})
                    instruction_type = parsed.get('type', '')

                    # Check for $KAMIYO transfer
                    if instruction_type == 'transferChecked':
                        mint = info.get('mint', '')
                        destination = info.get('destination', '')
                        token_amount = info.get('tokenAmount', {})

                        # Verify it's $KAMIYO token
                        if mint != str(KAMIYO_MINT):
                            continue

                        # Verify destination is our treasury
                        if destination != KAMIYO_TREASURY_ADDRESS:
                            continue

                        # Verify amount
                        amount = Decimal(token_amount.get('amount', '0')) / Decimal(10 ** 9)

                        if amount >= expected_amount:
                            logger.info(f"✅ Verified $KAMIYO payment: {amount} from {customer_address}")
                            return True

        return False

    async def _get_kamiyo_price(self) -> Decimal:
        """
        Get current $KAMIYO price from Meteora DLMM pool

        Returns:
            Price in USD (e.g., 0.01 = $0.01 per $KAMIYO)
        """
        # TODO: Integrate with Meteora SDK
        # For now, fetch from Jupiter Price API
        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://price.jup.ag/v4/price?ids={KAMIYO_MINT}"
            )
            data = response.json()

            price = Decimal(str(data['data'][str(KAMIYO_MINT)]['price']))
            return price
```

### Updated Billing Routes

**File:** `api/x402_saas/routes.py` (UPDATE existing)

```python
# Add new endpoint for $KAMIYO payments

@router.post("/subscribe/kamiyo")
async def subscribe_with_kamiyo(
    request: SubscribeRequest,
    authorization: str = Header(...)
):
    """
    Subscribe to x402 SaaS using $KAMIYO tokens

    **20% discount** when paying with $KAMIYO!

    Example:
    - Starter tier: $99 USDC OR 7,920 $KAMIYO (at $0.01)
    - Pro tier: $299 USDC OR 23,920 $KAMIYO (at $0.01)
    """
    api_key = authorization.replace("Bearer ", "")
    key_info = await api_key_manager.validate_api_key(api_key)

    if not key_info:
        raise HTTPException(401, "Invalid API key")

    tenant = await tenant_manager._get_tenant(key_info['tenant_id'])

    # Calculate $KAMIYO price with discount
    from api.x402_saas.kamiyo_payment import kamiyo_processor

    usdc_price = TIER_PRICES[request.tier]
    kamiyo_amount = await kamiyo_processor.calculate_kamiyo_price(
        Decimal(str(usdc_price))
    )

    # Verify $KAMIYO payment
    payment_verified = await kamiyo_processor.verify_kamiyo_payment(
        tx_hash=request.tx_hash,
        expected_amount=kamiyo_amount,
        customer_address=request.customer_address
    )

    if not payment_verified:
        raise HTTPException(402, "Payment verification failed")

    # Activate subscription
    await billing_manager.activate_subscription(
        tenant_id=tenant.id,
        tier=request.tier,
        payment_method='kamiyo_token'
    )

    return {
        "success": True,
        "subscription_activated": True,
        "tier": request.tier,
        "amount_paid_kamiyo": float(kamiyo_amount),
        "discount_applied": "20%"
    }


@router.get("/pricing/kamiyo")
async def get_kamiyo_pricing():
    """
    Get current pricing in $KAMIYO tokens

    Returns pricing for all tiers with 20% discount
    """
    from api.x402_saas.kamiyo_payment import kamiyo_processor

    kamiyo_prices = {}

    for tier, usdc_price in TIER_PRICES.items():
        kamiyo_amount = await kamiyo_processor.calculate_kamiyo_price(
            Decimal(str(usdc_price))
        )
        kamiyo_prices[tier] = {
            'usdc_price': usdc_price,
            'kamiyo_price': float(kamiyo_amount),
            'discount': '20%'
        }

    return {
        'pricing': kamiyo_prices,
        'current_kamiyo_usd_price': float(await kamiyo_processor._get_kamiyo_price()),
        'note': 'Prices update dynamically based on $KAMIYO market price'
    }
```

---

## Revenue Model Update (With Token)

### Dual Revenue Streams

**1. Subscription Revenue (USDC):**
```
Month 6: $9,947 MRR (from original plan)
Month 12: $15-25K MRR
```

**2. Token Appreciation (Treasury Holdings):**
```
Treasury holds: 200M $KAMIYO (20% of supply)

Price trajectory:
- Month 4 (Launch): $0.01 → Treasury value: $2M
- Month 6 (Utility active): $0.02 → Treasury value: $4M
- Month 12 (Adoption): $0.05 → Treasury value: $10M
- Year 2 (Mature): $0.10 → Treasury value: $20M
```

**3. Revenue from Token Payments:**
```
Month 6:
- 10% of customers choose $KAMIYO payment
- $994 MRR equivalent in $KAMIYO
- Tokens received: ~99,400 $KAMIYO/month (at $0.01)
- Hold or sell for operations

Month 12:
- 30% adoption of $KAMIYO payments
- $5,250 MRR equivalent in $KAMIYO
- Tokens received: ~262,500 $KAMIYO/month (at $0.02)
```

**4. Staking Revenue Distribution:**
```
Platform keeps 90% of fees, distributes 10% to stakers

Month 12 example:
- Platform revenue: $25K
- Distributed to stakers: $2,500
- Treasury holds 200M $KAMIYO (20% of total staked 400M)
- Treasury receives: $2,500 * (200M / 400M) = $1,250/month
- Annualized: $15K additional revenue
```

### Total Value Creation

**Year 1:**
```
Subscription MRR (Month 12): $20K
Treasury token value: $10M (at $0.05/token)
Total enterprise value: ~$15M
  - SaaS: $20K * 30 multiple = $6M
  - Token treasury: $10M
  - Less: Token vesting commitments
```

**Year 2:**
```
Subscription MRR: $50K
Treasury token value: $20M (at $0.10/token)
Total enterprise value: ~$35M
  - SaaS: $50K * 25 multiple = $15M
  - Token treasury: $20M
```

---

## Risk Mitigation (Token-Specific)

### Technical Risks

**1. MEV exploitation despite protections**
- Mitigation: Continuous monitoring, upgradeable transfer hook
- Bounty program for finding MEV vulnerabilities

**2. Smart contract bugs**
- Mitigation: Multi-audit (OtterSec + Neodyme + internal)
- Bug bounty: $100K for critical vulnerabilities
- Gradual rollout: Testnet → Devnet → Mainnet beta → Full launch

**3. Oracle manipulation**
- Mitigation: Multi-oracle setup (Pyth + Switchboard)
- Circuit breaker halts trading if price deviation > 10%

### Market Risks

**1. Token price crashes**
- Mitigation: Treasury diversification (sell 20% of received tokens)
- Subscription revenue provides floor value
- Buy-and-burn with platform revenue (stabilizes price)

**2. Low liquidity**
- Mitigation: Meteora DLMM provides capital-efficient liquidity
- Liquidity mining incentives for 90 days
- Market maker if needed

**3. Regulatory scrutiny**
- Mitigation: Utility-first token (not security)
- No promises of profits
- Revenue share from actual platform usage (not speculation)
- Legal review before launch

### Execution Risks

**1. Token development delays SaaS launch**
- Mitigation: SEPARATE repositories and timelines
- SaaS launches Month 1-3 (no token dependency)
- Token launches Month 4-6 (after SaaS validation)

**2. Complexity overwhelms team**
- Mitigation: Phase approach
  - Phase 1: SaaS only (prove business model)
  - Phase 2: Token (enhance economics)
- Hire Solana specialist if needed

---

## Success Metrics (Updated with Token)

### Technical Milestones

**Token Development (Parallel to SaaS):**
- [ ] Month 1: Smart contracts complete
- [ ] Month 2: Security audits
- [ ] Month 3: Testnet deployment
- [ ] Month 4: Mainnet deployment + airdrop
- [ ] Month 5: Meteora pool live
- [ ] Month 6: SaaS integration active

### Business Milestones

**Month 6:**
- [ ] SaaS: $9,947 MRR (from subscriptions)
- [ ] Token: $0.015-0.025 price (50-150% above launch)
- [ ] Staking TVL: $500K-1M in $KAMIYO
- [ ] 10-20% of customers paying with $KAMIYO

**Month 12:**
- [ ] SaaS: $20K MRR
- [ ] Token: $0.04-0.08 price (4-8x launch)
- [ ] Staking TVL: $5-10M
- [ ] 30-40% of customers paying with $KAMIYO
- [ ] DEX liquidity: $2-5M TVL
- [ ] Daily volume: $100K-500K

### Token-Specific Metrics

**Health Indicators:**
- [ ] Holder distribution (no whale >5%)
- [ ] Transfer fee revenue > $1K/month
- [ ] MEV attack attempts: 0 successful
- [ ] Contract uptime: 100%
- [ ] Staking participation: >20% of circulating supply

---

## Updated Timeline

### Parallel Development Tracks

**Track 1: x402 SaaS (Main Repo)**
- Days 1-25: Execute original plan (no changes)
- Focus: Get to $5-10K MRR first

**Track 2: $KAMIYO Token (Codespace)**
- Month 1-2: Smart contract development
- Month 3: Audits and testing
- Month 4: Token launch
- Month 5-6: SaaS integration

**Integration Point: Month 5**
- SaaS proven ($5-10K MRR)
- Token launched and trading
- Enable $KAMIYO payments in dashboard

---

## Conclusion

### The Strategy

**SaaS First, Token Second:**
1. Validate x402 Infrastructure SaaS ($10K MRR)
2. Launch $KAMIYO token with real utility
3. Token enhances economics (20% discount = demand)
4. Treasury appreciation provides equity value
5. Staking/governance creates community

### Why This Works

**Token Has Real Utility:**
- 20% subscription discount (immediate value)
- Staking rewards from platform revenue (yield)
- Governance over protocol (ownership)
- Revenue sharing (passive income)

**Not Speculation:**
- SaaS revenue provides fundamental value
- Token tied to actual business metrics
- Deflationary (fees burned)
- MEV-protected (sustainable trading)

### The Upside

**Conservative (Token at $0.02):**
- SaaS: $20K MRR = $6M valuation
- Token treasury: $4M
- Total: $10M enterprise value

**Realistic (Token at $0.05):**
- SaaS: $20K MRR = $6M valuation
- Token treasury: $10M
- Total: $16M enterprise value

**Optimistic (Token at $0.10):**
- SaaS: $50K MRR = $15M valuation
- Token treasury: $20M
- Total: $35M enterprise value

### Next Steps

1. ✅ Review this plan
2. Execute SaaS plan (Days 1-25)
3. Spin up Codespace for token development (Month 1)
4. Parallel development (SaaS + Token)
5. Integrate at Month 5
6. Launch token at Month 4
7. Enable $KAMIYO payments at Month 5

**Ready to build?** 🚀
