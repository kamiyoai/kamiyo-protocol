# KAMIYO Points System Design ("Align-to-Earn")

**Version:** 1.0
**Target Launch:** Week 14 (Pre-TGE Marketing Campaign)
**Airdrop Allocation:** 70M KAMIYO (70% of 100M airdrop budget)

---

## Table of Contents

1. [Overview](#overview)
2. [Point Accrual Mechanics](#point-accrual-mechanics)
3. [Redemption System](#redemption-system)
4. [Sybil Resistance](#sybil-resistance)
5. [Technical Architecture](#technical-architecture)
6. [Campaign Timeline](#campaign-timeline)
7. [Risk Analysis](#risk-analysis)
8. [Success Metrics](#success-metrics)

---

## 1. Overview

### Vision

The KAMIYO Points System ("Align-to-Earn") gamifies community building by rewarding users for actions that grow the network and demonstrate genuine interest in AI alignment and decentralized payment infrastructure.

Unlike pure airdrop farming (which attracts Sybils and mercenaries), Align-to-Earn requires:
- **Social proof:** X account verification, engagement quality
- **Platform usage:** On-chain transactions (testnet/mainnet)
- **Time commitment:** Points accrue over 5 weeks (Week 14-18)
- **Community contribution:** Memes, referrals, feedback

### Goals

1. **Viral Growth:** Reach 50,000+ X followers by Week 19 (TGE)
2. **Quality Community:** Attract AI developers, crypto natives, alignment-focused users
3. **Fair Distribution:** Cap per wallet (10k KAMIYO max) prevents whale concentration
4. **Network Effects:** Referral system creates exponential growth

### Key Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Total Participants** | 20,000+ | Unique wallets with >100 points |
| **X Followers** | 50,000+ | @KamiyoHQ follower count |
| **On-Chain Activity** | 5,000+ testnet txns | Solana devnet transactions |
| **Referrals** | 10,000+ | Users invited via referral links |
| **Meme Submissions** | 500+ | Quality memes submitted |
| **Airdrop Distribution** | 70M KAMIYO | 70% of 100M airdrop pool |

---

## 2. Point Accrual Mechanics

### 2.1 Social Engagement (X/Twitter)

#### One-Time Actions

| Action | Points | Verification Method | Cap |
|--------|--------|---------------------|-----|
| Follow @KamiyoHQ | 50 | X API (OAuth) | 1x per account |
| Retweet launch announcement | 25 | X API (check RT of specific tweet) | 1x |
| Quote-retweet with thoughts | 50 | X API + manual review for quality | 1x |
| Join Discord server | 25 | Discord OAuth (verify membership) | 1x |
| Join Telegram group | 25 | Telegram bot verification | 1x |

#### Recurring Actions

| Action | Points | Cap | Verification |
|--------|--------|-----|-------------|
| Quality reply to KAMIYO thread | 10 | 50 pts/day (5 replies max) | Manual review + community reports |
| Daily check-in on Discord | 5 | 5 pts/day (max 175 pts over 35 days) | Discord bot (!checkin command) |
| Share KAMIYO content (original) | 20 | 3x/week (max 60 pts/week) | X API + uniqueness check |

#### Contest Actions

| Action | Points | Frequency | Verification |
|--------|--------|-----------|-------------|
| Submit meme to contest | 25 | Weekly contests (5 weeks) | Manual review (quality threshold) |
| Top 10 meme (community vote) | 200 | Weekly (10 winners/week) | Discord poll + DAO vote |
| Create KAMIYO explainer video | 100 | Unlimited (if approved) | YouTube link + manual review |

**Total Social Potential:** ~1,000 points (if maxing all categories)

### 2.2 Platform Usage (On-Chain)

#### Testnet/Devnet Actions (Before TGE)

| Action | Points | Cap | Verification |
|--------|--------|-----|-------------|
| Connect wallet to devnet app | 50 | 1x | Backend records wallet signature |
| Make first x402 payment (testnet) | 100 | 1x | On-chain transaction verification |
| Each additional x402 payment | 5 | No cap | On-chain verification |
| Create escrow contract (testnet) | 50 | 10x (max 500 pts) | On-chain program logs |
| Stake KAMIYO on devnet | 200 | 1x | On-chain staking contract |
| Provide testnet liquidity | 500 | 1x (must hold 7 days) | On-chain LP token balance |

#### Mainnet Actions (Post-TGE, Week 19+)

| Action | Points | Cap | Verification |
|--------|--------|-----|-------------|
| Buy KAMIYO on DEX | 100 | 1x | On-chain swap transaction |
| Stake KAMIYO (mainnet) | 300 | 1x | On-chain staking contract |
| Add liquidity to KAMIYO/USDC pool | 500 | 1x | On-chain LP position |
| Make first x402 payment (mainnet) | 150 | 1x | On-chain transaction |

**Total On-Chain Potential:** ~2,000+ points (power users)

### 2.3 Referral System

#### Referral Mechanics

| Metric | Points | Notes |
|--------|--------|-------|
| **Referrer Reward** | 100 pts | When referred user completes ≥3 actions (not just signup) |
| **Referee Reward** | 50 pts | Bonus for signing up via referral link |
| **Cap per Referrer** | Unlimited | Top referrer leaderboard (bonuses below) |

#### Top Referrer Bonuses (Separate from Points)

| Rank | Bonus | Criteria |
|------|-------|----------|
| 1st Place | 50,000 KAMIYO | Most verified referrals (minimum 100) |
| 2nd Place | 25,000 KAMIYO | Second-most referrals |
| 3rd Place | 10,000 KAMIYO | Third-most referrals |
| Top 10 | 5,000 KAMIYO each | Ranks 4-10 |

**Referral Multiplier Effect:**
- If 1 user refers 10 friends who each complete 5 actions:
  - Referrer earns: 10 referrals × 100 pts = 1,000 pts
  - Plus potential top-10 bonus: 5,000-50,000 KAMIYO

### 2.4 Early Adopter Bonuses

| Signup Week | Bonus Points | Rationale |
|-------------|-------------|-----------|
| Week 14 (Campaign Launch) | 500 | Reward earliest believers |
| Week 15 | 300 | Still early |
| Week 16 | 100 | Mid-campaign |
| Week 17-18 | 0 | Standard entry |
| Week 19+ | -100 (penalty) | Late to the party (claims open) |

**Example:**
- Alice signs up Week 14: Base 0 + Early bonus 500 = 500 pts head start
- Bob signs up Week 18: Base 0 + Early bonus 0 = 0 pts head start
- Alice has 5-week advantage (can accumulate more points)

### 2.5 Community Contribution

| Action | Points | Frequency | Verification |
|--------|--------|-----------|-------------|
| Submit bug report (accepted) | 200 | Unlimited | GitHub issue + dev confirmation |
| Write tutorial/guide (approved) | 300 | Unlimited | Medium/Dev.to link + review |
| Translate docs to other language | 500 | 1x per language | GitHub PR + review |
| Host community AMA/space | 1,000 | Unlimited | X Space link + attendance >50 |

**High-Value Contributors:**
Power users who write code, create content, or organize events can earn significant points (1,000-5,000+).

### 2.6 Total Earning Potential

**Casual User (Low Effort):**
- Follow X, RT, join Discord: 100 pts
- Make 1 testnet payment: 100 pts
- Daily check-ins (20 days): 100 pts
- **Total:** ~300 pts → ~30 KAMIYO (at 10:1 rate)

**Active User (Medium Effort):**
- All casual actions: 300 pts
- Quality replies (10 days × 5): 500 pts
- Submit 3 memes (1 wins contest): 75 + 200 = 275 pts
- Testnet actions (10 payments, 2 escrows): 50 + 100 = 150 pts
- Refer 5 friends: 500 pts
- **Total:** ~1,725 pts → ~200 KAMIYO (with bonuses)

**Power User (High Effort):**
- All active actions: 1,725 pts
- Write tutorial: 300 pts
- Stake on testnet + mainnet: 500 pts
- Provide liquidity: 500 pts
- Refer 20 friends: 2,000 pts
- Win top-10 referrer: +5,000 KAMIYO flat bonus
- **Total:** ~5,025 pts → ~7,500 KAMIYO + 5,000 bonus = 12,500 KAMIYO (capped at 10k)

**Maximum Possible:** 10,000 KAMIYO per wallet (hardcap to prevent centralization)

---

## 3. Redemption System

### 3.1 Conversion Tiers

Points convert to KAMIYO at variable rates to reward high engagement:

| Points Threshold | KAMIYO Received | Conversion Rate | Bonus Multiplier | Cumulative KAMIYO |
|-----------------|----------------|----------------|-----------------|-------------------|
| 100 | 10 | 10:1 | 1x (baseline) | 10 |
| 500 | 50 | 10:1 | 1x | 60 |
| 1,000 | 120 | 8.33:1 | 1.2x | 180 |
| 2,500 | 375 | 6.67:1 | 1.5x | 555 |
| 5,000 | 900 | 5.56:1 | 1.8x | 1,455 |
| 10,000 | 1,800 | 5:1 | 2x | 3,255 |
| 25,000 | 5,700 | 4.39:1 | 2.28x | 8,955 |
| 50,000 | 10,000 (cap) | - | - | 10,000 (max) |

**Note:** Conversion is progressive (each tier applies only to points in that range).

**Example Calculation (5,000 points):**
```
0-1000 pts: 1000 / 10 = 100 KAMIYO
1000-5000 pts: 4000 / 6.67 = 600 KAMIYO
Total: 700 KAMIYO (not 900 - corrected table above is aspirational, actual needs tuning)
```

**Refined Conversion Table (Budget-Aware):**

To distribute 70M KAMIYO across 20k users (avg 3,500 KAMIYO/user):

| Points | KAMIYO | Conversion Rate | Notes |
|--------|--------|----------------|-------|
| 100 | 10 | 10:1 | Entry tier |
| 1,000 | 100 | 10:1 | Casual users |
| 5,000 | 600 | 8.33:1 | +20% bonus |
| 10,000 | 1,500 | 6.67:1 | +50% bonus |
| 25,000 | 4,500 | 5.56:1 | +80% bonus |
| 50,000+ | 10,000 (cap) | - | Maximum per wallet |

### 3.2 Claiming Process

**Timeline:**
- **Week 14-18:** Point accrual phase (users earn points)
- **Week 19:** Claims open (KAMIYO distributed, transfers after TGE)
- **Week 19-31 (90 days):** Claim window
- **Week 32:** Unclaimed tokens return to treasury

**Claiming Steps:**

1. **User visits claim portal:** `claim.kamiyo.ai`
2. **Connect wallet:** Phantom/Solflare/Backpack
3. **Verify X account:** OAuth login (link X account to wallet)
4. **Review point breakdown:**
   ```
   Your Total Points: 5,230
   - Social Engagement: 1,200 pts
   - Platform Usage: 850 pts
   - Referrals: 2,500 pts
   - Early Adopter Bonus: 500 pts
   - Community Contribution: 180 pts

   Claimable KAMIYO: 650 KAMIYO
   (5,230 pts → 650 KAMIYO via tiered conversion)
   ```
5. **Sign transaction:** Approve KAMIYO transfer to your wallet
6. **Receive tokens:** Instant transfer (post-TGE)
7. **Optional:** Lock claimed KAMIYO for bonus (5% extra if lock 30 days)

**Claiming Fee:**
- Free (gas costs covered by protocol initially to reduce friction)
- After Week 20: Standard Solana transaction fee (~0.000005 SOL)

### 3.3 Unclaimed Token Policy

**Scenario:** User earns 10,000 points but never claims.

**Policy:**
- 90-day grace period (Week 19-31)
- Email reminders (if provided during signup)
- After 90 days: Tokens returned to treasury
- **Estimate:** 10-15% of airdrop will go unclaimed (~7-10M KAMIYO)

**Treasury Use of Unclaimed Tokens:**
- 50%: Redistribute to active stakers (bonus APY)
- 30%: Future airdrops (Season 2)
- 20%: Marketing/partnerships

---

## 4. Sybil Resistance

### 4.1 Multi-Layer Defense System

#### Layer 1: Identity Verification

| Verification | Requirement | Bypass Difficulty |
|-------------|------------|------------------|
| **Wallet Signature** | Must sign message with private key | Medium (requires SOL for rent) |
| **Wallet Age** | ≥0.01 SOL on-chain activity before Week 14 | Medium (can't create fresh wallets day-of) |
| **X Account Age** | ≥30 days old | Medium (can't use brand-new accounts) |
| **X Follower Count** | ≥10 followers | Easy (but filters obvious bots) |
| **X Bot Detection** | Not flagged by X for automation | Medium (X's internal algo) |

#### Layer 2: Behavioral Analysis

| Signal | Red Flag | Action |
|--------|----------|--------|
| **Identical Timing** | 10+ accounts RT same tweet within 1 second | Flag all for manual review |
| **Copy-Paste Comments** | Same text across multiple accounts | Ban all duplicate accounts |
| **IP Clustering** | 10+ accounts from same IP | Rate limit to 1 action per IP per 10 min |
| **Device Fingerprinting** | Same browser fingerprint across accounts | Flag for manual review |
| **Referral Loops** | Accounts refer each other circularly | Invalidate all referral points |

#### Layer 3: Rate Limiting

| Action | Rate Limit | Rationale |
|--------|-----------|-----------|
| **Wallet Registration** | 1 per IP per 24 hours | Prevents mass Sybil creation |
| **Point Claims** | 1 per wallet per hour | Prevents gaming via multiple claims |
| **X Actions (RT, reply)** | Max 10/day per wallet | Prevents spam |
| **Testnet Transactions** | Max 50/day per wallet | Prevents farming |

#### Layer 4: Community Moderation

**Reporting System:**
- Users can report suspected Sybils via Discord/form
- Each report reviewed by 3 moderators (vote to ban)
- False reporters penalized (lose points)

**Manual Review Queue:**
- Accounts with >10k points automatically reviewed
- Unusual patterns flagged (e.g., 100 pts in 1 hour)
- Quality check on "quality replies" (spam = disqualified)

**Penalties:**
- 1st offense: Warning + 50% point deduction
- 2nd offense: 90% point deduction + 30-day ban
- 3rd offense: Permanent ban + wallet blacklist

#### Layer 5: Economic Disincentives

**Cost-Benefit Analysis for Sybils:**

Creating 100 Sybil accounts requires:
- 100 X accounts (30 days old, 10 followers each): ~$50-100 (bought or farmed)
- 100 Solana wallets with 0.01 SOL each: ~$2-3
- VPN/proxies to mask IP: ~$10/month
- Time to farm points: ~10 hours
- **Total Cost:** ~$60-120 + 10 hours

Potential earnings per Sybil:
- If not detected: ~100 KAMIYO avg (most Sybils are casual farmers)
- If KAMIYO = $0.01 at TGE: $1/account
- **Total Earnings (100 accounts):** $100

**Expected Value:**
```
EV = (Probability of Not Getting Caught) × Earnings - Cost
EV = 0.50 × $100 - $120 = -$70 (negative EV, unprofitable)
```

Assuming 50% detection rate, Sybil farming is not economically rational.

**Plus:**
- 10k KAMIYO cap per wallet limits upside
- Manual review for high-point accounts
- Unclaimed tokens return to treasury (many Sybils forget to claim)

### 4.2 Detection Tooling

**Technology Stack:**

1. **X API Integration:**
   - Verify follower count, account age, engagement metrics
   - Check for bot flags (X's internal detection)

2. **On-Chain Analytics (Solana):**
   - Query wallet history (transaction count, age, balance)
   - Detect patterns (e.g., all wallets funded from same source)

3. **Fingerprinting (FingerprintJS):**
   - Browser fingerprint (canvas, WebGL, fonts)
   - Device ID (mobile apps)
   - Cross-reference with IP address

4. **Machine Learning (Heuristics):**
   - Train model on known Sybil patterns
   - Flag high-risk accounts for manual review
   - Example features:
     - Points earned per hour (too fast = suspicious)
     - Referral network structure (circular = suspicious)
     - Comment sentiment (generic = suspicious)

5. **Community Reporting:**
   - Discord bot for reporting (`/report @username reason`)
   - Moderator dashboard (review queue)

### 4.3 Estimated Sybil Rate

**Conservative Estimate:**
- Total participants: 20,000
- Sybil accounts: 1,000-2,000 (5-10%)
- Detected and banned: 70% (700-1,400)
- Undetected Sybils claiming: 300-600 accounts

**Damage Limitation:**
- 500 Sybils × 100 KAMIYO avg = 50k KAMIYO lost (<0.1% of 70M airdrop)
- Acceptable loss given viral growth benefits

**Mitigation:**
- Unclaimed Sybil tokens return to treasury (many bots don't claim)
- Cap per wallet (10k KAMIYO) limits mega-Sybils

---

## 5. Technical Architecture

### 5.1 System Components

```
┌─────────────────────────────────────────────────────────┐
│              KAMIYO Points System (Frontend)            │
│         (Next.js App: points.kamiyo.ai)                 │
└─────────────────────────────────────────────────────────┘
                           │
                           │ API Calls
                           ▼
┌─────────────────────────────────────────────────────────┐
│             Points Backend (FastAPI)                    │
│  - User authentication (wallet sig, OAuth)              │
│  - Point calculation engine                             │
│  - Sybil detection logic                                │
│  - Admin dashboard (manual review)                      │
└─────────────────────────────────────────────────────────┘
         │              │             │              │
         │ PostgreSQL   │ Redis       │ Solana RPC   │ X API
         ▼              ▼             ▼              ▼
┌─────────────┐  ┌───────────┐  ┌──────────┐  ┌─────────┐
│  User DB    │  │ Cache     │  │ On-Chain │  │ Social  │
│  Points DB  │  │ Sessions  │  │ Verifier │  │ Verify  │
│  Referrals  │  │ Locking   │  │          │  │         │
└─────────────┘  └───────────┘  └──────────┘  └─────────┘
```

### 5.2 Database Schema

**Users Table:**
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) UNIQUE NOT NULL,
    twitter_id VARCHAR(255) UNIQUE,
    twitter_username VARCHAR(255),
    discord_id VARCHAR(255),
    telegram_id VARCHAR(255),
    referral_code VARCHAR(10) UNIQUE,
    referred_by VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    last_active TIMESTAMP,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT
);
```

**Points Table:**
```sql
CREATE TABLE points (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL, -- e.g., 'twitter_follow', 'testnet_payment'
    points_earned INTEGER NOT NULL,
    metadata JSONB, -- Additional data (e.g., transaction hash)
    created_at TIMESTAMP DEFAULT NOW(),
    verified BOOLEAN DEFAULT FALSE, -- Manual review status
    INDEX (user_id, action_type)
);
```

**Referrals Table:**
```sql
CREATE TABLE referrals (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER REFERENCES users(id),
    referee_id INTEGER REFERENCES users(id),
    points_awarded INTEGER DEFAULT 0,
    completed_actions INTEGER DEFAULT 0, -- Track progress (need ≥3 to qualify)
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX (referrer_id)
);
```

**Claims Table:**
```sql
CREATE TABLE claims (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    points_total INTEGER NOT NULL,
    kamiyo_amount BIGINT NOT NULL, -- In lamports (10^9 per KAMIYO)
    claimed BOOLEAN DEFAULT FALSE,
    claim_tx_hash VARCHAR(88), -- Solana transaction signature
    claimed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 5.3 API Endpoints

**Authentication:**
```
POST /api/auth/wallet
- Body: { wallet: "...", signature: "...", message: "..." }
- Returns: JWT token

POST /api/auth/twitter
- OAuth flow (redirects to X)
- Links X account to wallet
```

**Points:**
```
GET /api/points/:wallet
- Returns: { total_points: 5230, breakdown: {...}, rank: 1523 }

POST /api/points/claim
- Body: { action: "twitter_follow", metadata: {...} }
- Returns: { points_awarded: 50, new_total: 5280 }

GET /api/leaderboard
- Returns: Top 100 users by points
```

**Referrals:**
```
GET /api/referral/code/:wallet
- Returns: { code: "ABC123", referrals: 23, points_earned: 2300 }

POST /api/referral/use
- Body: { code: "ABC123" }
- Credits referrer once referee completes 3 actions
```

**Claims:**
```
POST /api/claim/calculate
- Body: { wallet: "..." }
- Returns: { points: 5230, kamiyo: 650, breakdown: {...} }

POST /api/claim/submit
- Body: { wallet: "...", signature: "..." }
- Initiates KAMIYO transfer
- Returns: { tx_hash: "...", amount: 650 }
```

**Admin:**
```
GET /api/admin/review-queue
- Returns: Accounts flagged for manual review

POST /api/admin/ban
- Body: { user_id: 123, reason: "Sybil attack" }
- Bans user, revokes points
```

### 5.4 On-Chain Verification

**Solana Transaction Verification:**

```typescript
async function verifyTestnetPayment(userWallet: string): Promise<boolean> {
  const connection = new Connection(DEVNET_RPC);

  // Fetch recent transactions for user wallet
  const signatures = await connection.getSignaturesForAddress(
    new PublicKey(userWallet),
    { limit: 100 }
  );

  // Look for x402 program interactions
  for (const sig of signatures) {
    const tx = await connection.getParsedTransaction(sig.signature);
    const programIds = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());

    if (programIds.includes(X402_PROGRAM_ID)) {
      return true; // User made x402 payment
    }
  }

  return false;
}
```

**Staking Verification:**

```typescript
async function verifyStaking(userWallet: string): Promise<boolean> {
  const connection = new Connection(DEVNET_RPC);
  const stakingProgram = new PublicKey(STAKING_PROGRAM_ID);

  // Derive user's staking account PDA
  const [stakingAccount] = await PublicKey.findProgramAddress(
    [Buffer.from("staking"), new PublicKey(userWallet).toBuffer()],
    stakingProgram
  );

  const account = await connection.getAccountInfo(stakingAccount);
  if (!account) return false;

  // Decode account data to check staked amount
  const stakedAmount = account.data.readBigUInt64LE(8); // Assuming offset 8
  return stakedAmount > 0;
}
```

### 5.5 Scalability Considerations

**Expected Load:**
- 20,000 users × 10 actions/day = 200k API calls/day
- Peak: 1,000 users claiming simultaneously at Week 19 (TGE)

**Infrastructure:**
- Backend: 4× FastAPI workers (AWS EC2 or Railway)
- Database: PostgreSQL (managed, 100 GB storage)
- Cache: Redis (in-memory, 8 GB)
- RPC: Helius or QuickNode (Solana devnet/mainnet)

**Optimization:**
- Cache point calculations (update every 10 minutes)
- Batch on-chain verification (check once per hour, not per action)
- Rate limiting (10 req/min per user)
- CDN for frontend (Vercel)

---

## 6. Campaign Timeline

### Week 14: Campaign Launch

**Objective:** Initial buzz, early adopter signups

**Activities:**
- Announce points system on X (@KamiyoHQ)
- Launch landing page (`points.kamiyo.ai`)
- Open wallet registration
- Deploy testnet (devnet) for users to test x402 payments
- First meme contest (Week 14 theme: "AI Alignment")

**Targets:**
- 1,000 signups
- 500 X followers gained
- 50 testnet transactions

### Week 15: Social Amplification

**Objective:** Viral growth via referrals

**Activities:**
- Launch referral system (users get unique codes)
- Announce top referrer bonuses (50k KAMIYO for #1)
- Partner with crypto influencers (5 micro-influencers, $500 each)
- Second meme contest (Week 15 theme: "KAMIYO vs Traditional Payments")

**Targets:**
- 5,000 total signups (+4k)
- 5,000 X followers (+4.5k)
- 1,000 referrals generated

### Week 16: Platform Engagement

**Objective:** Drive testnet usage

**Activities:**
- Host AMA on X Spaces (team explains x402 protocol)
- Launch tutorial video series (YouTube)
- Bonus points week (2x points for testnet actions)
- Third meme contest (Week 16 theme: "When Your AI Agent Gets Paid")

**Targets:**
- 10,000 total signups (+5k)
- 20,000 X followers (+15k)
- 2,000 testnet transactions

### Week 17: Quality Over Quantity

**Objective:** Filter Sybils, reward quality contributors

**Activities:**
- Manual review of high-point accounts (top 100)
- Ban Sybil clusters (aggressive cleanup)
- Spotlight top contributors (Twitter threads featuring power users)
- Launch bug bounty (points for finding issues)
- Fourth meme contest (Week 17 theme: "KAMIYO Alignment Economy")

**Targets:**
- 15,000 total signups (+5k)
- 35,000 X followers (+15k)
- 500 Sybils banned

### Week 18: Final Push

**Objective:** Last chance to earn points before TGE

**Activities:**
- Announce TGE date (Week 19)
- Final referral leaderboard update (top 10 announced)
- Bonus points for staking on testnet (500 pts)
- Fifth meme contest (Week 18 theme: "1 Week Until $KAMIYO Launch")
- Freeze points system (Week 18 ends = no more accrual)

**Targets:**
- 20,000 total signups (+5k)
- 50,000 X followers (+15k)
- 5,000 testnet transactions

### Week 19: TGE & Claims

**Objective:** Token launch, airdrop distribution

**Activities:**
- TGE on Raydium (KAMIYO goes live)
- Open claim portal (`claim.kamiyo.ai`)
- Announce point totals (users can see claimable KAMIYO)
- First wave of claims (expect 30% to claim Week 19)
- Announce top referrers (distribute bonuses)

**Targets:**
- 10,000 users claim KAMIYO (50% of eligible)
- 35M KAMIYO distributed (50% of 70M pool)

### Week 20-31: Claim Window

**Ongoing:**
- Email reminders for unclaimed tokens
- Weekly leaderboard updates
- Monitor Sybil claims (ban if detected)

**Week 32:**
- Claim window closes
- Unclaimed tokens (~7-10M KAMIYO) returned to treasury

---

## 7. Risk Analysis

### Risk 1: Sybil Attacks Overwhelm Airdrop

**Scenario:** 10,000 Sybils claim 5M KAMIYO (50% of total), diluting real users.

**Likelihood:** Medium (Sybils are inevitable)
**Impact:** High (damages community trust)

**Mitigations:**
- Multi-layer detection (5 layers as described)
- 10k KAMIYO cap per wallet (limits damage)
- Manual review for high-point accounts
- Post-claim analysis (ban Sybils retroactively, claw back tokens)

**Residual Risk:** Low (expect <5% loss to Sybils)

### Risk 2: Referral Gaming (Circular Referrals)

**Scenario:** Users create 10 accounts, refer each other in a loop, farm points.

**Likelihood:** Medium
**Impact:** Medium (wastes airdrop budget)

**Mitigations:**
- Graph analysis to detect circular referral networks
- Referrer only credited if referee completes ≥3 independent actions
- IP clustering detection (same IP = same person)

**Residual Risk:** Low (graph analysis catches most loops)

### Risk 3: Low Engagement (Fewer Than 10k Users)

**Scenario:** Campaign flops, only 5,000 users participate, weak network effects.

**Likelihood:** Low (crypto airdrop culture is strong)
**Impact:** Medium (less viral growth, but more KAMIYO per user)

**Mitigations:**
- Aggressive marketing (influencer partnerships, Reddit, CT)
- Lower point thresholds if needed (adjust conversion rates mid-campaign)
- Extend campaign timeline (add Week 18.5 if needed)

**Residual Risk:** Low (historical airdrops attract 10k+ easily)

### Risk 4: Technical Failures (Backend Downtime During TGE)

**Scenario:** 1,000 users try to claim simultaneously, backend crashes.

**Likelihood:** Medium (TGE is high-traffic event)
**Impact:** High (user frustration, bad UX)

**Mitigations:**
- Load testing (simulate 10k concurrent users)
- Queue system (rate limit claims, process in batches)
- 90-day claim window (reduces urgency, spreads traffic)
- Status page (transparency if issues occur)

**Residual Risk:** Low (with proper testing)

### Risk 5: Regulatory Scrutiny (Airdrop = Security?)

**Scenario:** SEC views airdrop as unregistered security offering.

**Likelihood:** Low (utility token defense, no sale involved)
**Impact:** High (could halt US distribution)

**Mitigations:**
- Legal review (consult attorney before launch)
- Geographic restrictions (block US IPs if needed)
- Educational content (airdrop is utility reward, not investment)

**Residual Risk:** Medium (regulatory landscape uncertain)

---

## 8. Success Metrics

### KPIs (Key Performance Indicators)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| **Total Signups** | 20,000 | TBD | TBD |
| **X Followers** | 50,000 | TBD | TBD |
| **Testnet Transactions** | 5,000 | TBD | TBD |
| **Referrals Generated** | 10,000 | TBD | TBD |
| **Meme Submissions** | 500 | TBD | TBD |
| **KAMIYO Distributed** | 70M | TBD | TBD |
| **Claim Rate** | 85%+ | TBD | TBD |
| **Sybil Rate** | <5% | TBD | TBD |

### Post-Campaign Analysis

**Week 20 (Post-TGE Review):**

Questions to answer:
1. Did we hit 20k users? If not, why?
2. What was the average points per user?
3. Which actions drove most engagement? (Social vs on-chain)
4. What was the Sybil detection accuracy?
5. Did top referrers correlate with quality users or Sybil farms?
6. What % of users claimed tokens?
7. What was the cost per user acquired (marketing spend / total users)?

**Iterate for Season 2:**
- If social actions were farmed → Reduce X points, increase on-chain points
- If testnet usage was low → Simplify UX, add more tutorials
- If Sybil rate was high → Tighten verification (require KYC for >5k points)

---

## 9. Appendix

### A. Example User Journey

**Meet Alice (Power User):**

**Week 14:**
- Signs up via referral link (50 pts bonus)
- Follows @KamiyoHQ (50 pts)
- Retweets announcement (25 pts)
- Joins Discord + Telegram (50 pts)
- Connects wallet, makes first testnet payment (150 pts)
- Early adopter bonus (500 pts)
- **Total: 825 pts**

**Week 15:**
- Refers 3 friends who complete actions (300 pts)
- Submits meme, wins Week 15 contest (25 + 200 = 225 pts)
- Daily check-ins on Discord (7 days × 5 = 35 pts)
- Quality replies to KAMIYO threads (5 days × 50 = 250 pts)
- **Total: 1,635 pts (cumulative)**

**Week 16:**
- Makes 10 more testnet payments (50 pts)
- Creates 2 escrow contracts (100 pts)
- Writes tutorial on x402 protocol (300 pts)
- Refers 5 more friends (500 pts)
- **Total: 2,585 pts**

**Week 17:**
- Stakes KAMIYO on testnet (200 pts)
- Provides testnet liquidity for 7 days (500 pts)
- Daily check-ins (7 days × 5 = 35 pts)
- **Total: 3,320 pts**

**Week 18:**
- Testnet staking bonus (500 pts)
- Final push: refers 10 more friends (1,000 pts)
- Submits Week 18 meme (25 pts)
- **Total: 4,845 pts**

**Week 19 (TGE):**
- Buys KAMIYO on DEX (100 pts)
- Stakes KAMIYO on mainnet (300 pts)
- Makes first mainnet x402 payment (150 pts)
- **Final Total: 5,395 pts**

**Redemption:**
- 5,395 points → ~850 KAMIYO (via tiered conversion)
- Plus: Placed 15th in referral leaderboard → +5,000 KAMIYO bonus
- **Total Airdrop: 5,850 KAMIYO**
- **Value at $0.01:** $58.50

**Alice's Effort:**
- Time spent: ~15 hours over 5 weeks
- Hourly rate: $58.50 / 15 = $3.90/hour (below minimum wage but she had fun + believes in project)

### B. Comparison to Other Airdrops

| Project | Airdrop Size | Participants | Avg per User | Claim Rate | Sybil Rate | Our Approach |
|---------|-------------|-------------|-------------|-----------|-----------|-------------|
| **Uniswap (UNI)** | 400 UNI ($1,600 in 2020) | 250k | $1,600 | ~45% | Low (retroactive snapshot) | Retroactive = less farming |
| **dYdX** | 75M DYDX (~$1k avg) | 64k | $1,000 | 70% | Medium | Trader-focused, KYC required |
| **Arbitrum (ARB)** | 1.16B ARB (~$1k avg) | 625k | $1,000 | 86% | High (many Sybils) | Points system = farming |
| **KAMIYO (Ours)** | 70M KAMIYO ($700k at $0.01) | 20k (target) | $35 | 85% (target) | <5% (target) | Hybrid: Points + on-chain verification |

**Insight:** Our avg per user ($35) is lower than major airdrops, but:
- Fair launch (no VCs dumping)
- Broader distribution (20k users vs 625k whales in Arbitrum)
- Focus on quality over quantity (Sybil resistance)

### C. Marketing Budget

| Category | Allocation | Activities |
|----------|-----------|------------|
| **Influencer Partnerships** | 10k KAMIYO ($100 at $0.01) | 5 micro-influencers, $20 each in KAMIYO |
| **Contest Prizes** | 5k KAMIYO ($50) | 5 weekly meme contests, 1k KAMIYO each |
| **Referral Bonuses** | 150k KAMIYO ($1,500) | Top 10 referrers, 5-50k KAMIYO each |
| **Bug Bounty** | 10k KAMIYO ($100) | Security/UX bugs |
| **Paid Ads** | $2,000 cash | X ads, Reddit ads (paid in fiat) |
| **Total (KAMIYO)** | 175k KAMIYO (~$1,750 value) | |
| **Total (Fiat)** | $2,000 | |
| **Grand Total** | ~$3,750 | Cost to acquire 20k users = $0.19/user |

**CAC (Customer Acquisition Cost):** $0.19/user (exceptionally low for crypto)

---

## Conclusion

The KAMIYO Points System ("Align-to-Earn") is a comprehensive, Sybil-resistant, and community-driven airdrop mechanism that:

1. **Rewards Genuine Engagement:** Social + on-chain actions ensure participants are invested
2. **Prevents Abuse:** 5-layer Sybil detection, 10k cap per wallet, manual review
3. **Drives Viral Growth:** Referral system with top-referrer bonuses
4. **Fair Distribution:** 70M KAMIYO across 20k users (avg 3,500 KAMIYO = $35)
5. **Sustainable Economics:** Only 7% of total supply airdropped (93% retained for staking, liquidity, treasury)

**Next Steps:**
- Week 12: Deploy points backend + frontend
- Week 13: Internal testing (simulate 1k users)
- Week 14: Public launch, monitor closely
- Week 19: TGE, distribute tokens
- Week 20: Post-mortem analysis, iterate for Season 2

For questions or contributions: community@kamiyo.ai

---

**Document Status:** Final v1.0 (ready for implementation)
**Approval Required:** Core team + legal review (airdrop compliance)
