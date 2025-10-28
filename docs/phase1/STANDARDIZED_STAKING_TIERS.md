# KAMIYO Standardized Staking Tiers Reference

**Version:** 1.2 (Aligned with Subscription Tiers)
**Date:** October 27, 2025
**Status:** CANONICAL - Use this for all Phase 2+ implementation

---

## Official 4-Tier Structure

All KAMIYO features use these standardized tiers, **matching existing Kamiyo subscription tiers** (Free/Pro/Team/Enterprise). This document supersedes any conflicting tier definitions in other Phase 1 documents.

**Key Concept:** Users can unlock tiers either by:
- **Staking KAMIYO** (stake amounts below), OR
- **Stripe Subscription** (monthly payment)

Same tier name = same benefits, different unlock mechanism.

| Tier Name | Stake Required | Stripe Alternative | x402 Fee Discount | Governance Weight | Priority Access | Escrow Priority | Bridge Discount | Verifier Discount | Analytics Access |
|-----------|---------------|-------------------|------------------|-------------------|-----------------|-----------------|-----------------|-------------------|------------------|
| **Free** | 0 KAMIYO | Free account | 0% | No voting | No | 0 queue slots | 0% off | 0% off | Public data only |
| **Pro** | 1,000 - 9,999 KAMIYO | $29/month | 10% | 1x weight | No | +5 queue slots | 25% off | 25% off | Basic Analytics |
| **Team** | 10,000 - 99,999 KAMIYO | $99/month | 20% | 2x weight | 7-day early access | +10 queue slots | 50% off | 50% off | Advanced Analytics |
| **Enterprise** | 100,000+ KAMIYO | $499/month | 30% | 5x weight | Immediate access + beta | +20 queue slots | 100% off (free) | 100% off + priority | Full Suite + White-label |

---

## Detailed Tier Benefits

### Free Tier (0 KAMIYO / Free Account)
**Target User:** Hobbyists, API explorers, students

**Unlock Method:**
- **Option A:** Create free account (no payment, no staking)
- **Option B:** Automatic (default tier)

**Benefits:**
- ✅ Access to public exploit data (24-hour delay)
- ✅ 100 free API requests/month
- ✅ Community support (Discord)
- ❌ No fee discounts
- ❌ No governance voting
- ❌ No priority features

**Estimated Monthly Value:** $0

---

### Pro Tier (1k - 10k KAMIYO / $29/month)
**Target User:** Professional developers, small AI agents

**Unlock Method:**
- **Option A:** Stake 1,000+ KAMIYO (pay via staking instead of cash)
- **Option B:** Subscribe via Stripe at $29/month

**Benefits:**
- ✅ 10% discount on x402 transaction fees
- ✅ 1x voting weight in governance
- ✅ +5 escrow queue priority slots
- ✅ 25% discount on bridge fees
- ✅ 25% discount on AI verifier costs
- ✅ Basic analytics dashboard
- ✅ Real-time data access (no delay)
- ✅ 10,000 API requests/month
- ✅ Email support (48-72hr response)

**Estimated Monthly Savings:** $5-20 (based on $100-500 monthly x402 usage)

**Break-Even Analysis:** If you stake 1k KAMIYO @ $0.01 = $10 investment vs $29/month subscription = breaks even in <1 month

---

### Team Tier (10k - 100k KAMIYO / $99/month)
**Target User:** Teams, medium AI agents, growing startups

**Unlock Method:**
- **Option A:** Stake 10,000+ KAMIYO
- **Option B:** Subscribe via Stripe at $99/month

**Benefits:**
- ✅ 20% discount on x402 transaction fees
- ✅ 2x voting weight in governance
- ✅ 7-day early access to new features
- ✅ +10 escrow queue priority slots
- ✅ 50% discount on bridge fees
- ✅ 50% discount on AI verifier costs
- ✅ Advanced analytics (custom dashboards)
- ✅ Webhook notifications (up to 10 endpoints)
- ✅ 100,000 API requests/month
- ✅ Multiple team members (up to 5 seats)
- ✅ Priority email support (24-48hr response)
- ✅ Video onboarding call

**Estimated Monthly Savings:** $20-100 (based on $500-2000 monthly x402 usage)

**Break-Even Analysis:** Stake 10k KAMIYO @ $0.01 = $100 investment vs $99/month = breaks even in ~1 month

---

### Enterprise Tier (100k+ KAMIYO / $499/month)
**Target User:** DAOs, large AI agent networks, institutional partners

**Unlock Method:**
- **Option A:** Stake 100,000+ KAMIYO
- **Option B:** Subscribe via Stripe at $499/month (or custom contract)

**Benefits:**
- ✅ 30% discount on x402 transaction fees
- ✅ 5x voting weight in governance
- ✅ Immediate access to all new features + beta programs
- ✅ +20 escrow queue priority slots
- ✅ 100% free cross-chain bridges (all supported chains)
- ✅ 100% free AI verifier + priority routing
- ✅ Full analytics suite + AI insights
- ✅ Custom webhooks (unlimited endpoints)
- ✅ API rate limit: Unlimited (dedicated infrastructure)
- ✅ Unlimited team members
- ✅ White-label platform option (custom branding)
- ✅ Dedicated account manager
- ✅ Direct technical support (Slack connect, <6hr SLA)
- ✅ Custom SLA agreements
- ✅ Strategic partnership opportunities
- ✅ Revenue sharing options (negotiate custom deals)

**Estimated Monthly Savings:** $500+ (based on $10k+ monthly x402 usage)

**Break-Even Analysis:** Stake 100k KAMIYO @ $0.01 = $1,000 investment vs $499/month = breaks even in ~2 months

---

## Tier Calculation Logic

### Pseudocode for Tier Determination

```python
def get_user_tier(user_id: str) -> str:
    """
    Determine user's tier based on EITHER staked KAMIYO OR Stripe subscription.
    Highest tier from either source wins.

    Args:
        user_id: User identifier

    Returns:
        Tier name: "Free", "Pro", "Team", or "Enterprise"
    """
    # Check Stripe subscription tier
    stripe_tier = get_stripe_subscription_tier(user_id)

    # Check staked KAMIYO amount
    staked_kamiyo = get_staked_kamiyo_amount(user_id)

    if staked_kamiyo >= 100_000:
        staking_tier = "Enterprise"
    elif staked_kamiyo >= 10_000:
        staking_tier = "Team"
    elif staked_kamiyo >= 1_000:
        staking_tier = "Pro"
    else:
        staking_tier = "Free"

    # Return highest tier (Enterprise > Team > Pro > Free)
    tier_hierarchy = {"Free": 0, "Pro": 1, "Team": 2, "Enterprise": 3}

    if tier_hierarchy[stripe_tier] >= tier_hierarchy[staking_tier]:
        return stripe_tier
    else:
        return staking_tier

def get_fee_discount_percentage(tier: str) -> float:
    """
    Get x402 fee discount percentage for a given tier.

    Returns:
        Discount percentage (0.0 to 0.30)
    """
    discounts = {
        "Free": 0.00,
        "Pro": 0.10,
        "Team": 0.20,
        "Enterprise": 0.30
    }
    return discounts.get(tier, 0.00)

def get_governance_weight(tier: str) -> int:
    """
    Get voting weight multiplier for governance.

    Note: Only stakers get governance votes, not Stripe subscribers.

    Returns:
        Multiplier (0x to 5x)
    """
    weights = {
        "Free": 0,      # No voting power
        "Pro": 1,       # 1x weight
        "Team": 2,      # 2x weight
        "Enterprise": 5 # 5x weight
    }
    return weights.get(tier, 0)
```

---

## Implementation Notes for Phase 2+

### Solana Staking Program (Task 2.3)
- Store user's staked amount in `UserStake` account
- Tier is calculated dynamically (not stored)
- Frontend queries stake amount, calculates tier client-side

### Backend x402 Integration (Phase 3)
- Middleware checks user's stake balance via Solana RPC
- Applies discount before payment verification
- Caches tier calculation (5-minute TTL) to reduce RPC calls

### Frontend Display (Phase 4)
- Show user's current tier prominently
- Display "Next tier at X KAMIYO" with progress bar
- Highlight unlocked benefits

---

## Migration from Phase 1 Docs

**Documents Updated:**
- ✅ This document is now canonical
- ⚠️ Tokenomics whitepaper has 5 tiers (0-999, 1k-10k, 10k-100k, 100k-1M, 1M+) - **Conceptually compatible**, just rename ranges to Bronze/Silver/Gold/Platinum
- ⚠️ Alignment features architecture has 4 tiers but different thresholds - **Use this document's thresholds**

**Action for Future:** Update tokenomics whitepaper and alignment architecture to use exact thresholds from this document before mainnet launch. For Phase 2-5 development, use THIS document as source of truth.

---

## Rationale for Tier Structure

**Why these thresholds?**

1. **Pro (1k):** Low barrier to entry vs $29/month subscription (@ $0.01 price = $10 one-time stake vs $348/year recurring)
2. **Team (10k):** Better deal than $99/month subscription (@ $0.01 = $100 stake vs $1,188/year)
3. **Enterprise (100k):** Much better deal than $499/month subscription (@ $0.01 = $1,000 stake vs $5,988/year)

**Why match existing subscription tiers?**
- Consistent user experience (same tier names across platform)
- Easy mental model (users already understand Free/Pro/Team/Enterprise)
- Staking = alternative payment method (not a separate system)
- Incentivizes staking over subscriptions (stake 1k KAMIYO once vs pay $29 every month)

**Why these discount percentages?**
- 10-30% range is meaningful but not destructive to revenue
- Linear progression (10% → 20% → 25% → 30%) with diminishing returns (prevents runaway staking for marginal gains)
- 30% cap ensures platform still generates revenue from biggest users

---

## FAQ

**Q: Can I move between tiers?**
A: Yes, tiers update immediately when you stake/unstake. Stake more to upgrade, unstake to downgrade.

**Q: Is there a cooldown for tier changes?**
A: No cooldown for tier changes themselves, but unstaking has a 14-day cooldown (standard staking contract rule).

**Q: Do I keep my tier during unstaking cooldown?**
A: No, once you initiate unstake, your tier downgrades immediately (tokens are no longer counted as staked).

**Q: Can I stack benefits from multiple wallets?**
A: No, tiers are per-wallet. Splitting stake across wallets doesn't combine benefits.

**Q: What if I'm exactly at a threshold (e.g., 10,000 KAMIYO)?**
A: You get the higher tier (10,000 = Silver, not Bronze).

**Q: Do airdrops count toward tier calculation?**
A: Only **staked** KAMIYO counts, not just wallet balance. You must actively stake airdropped tokens.

**Q: Can I have both a Stripe subscription AND stake KAMIYO?**
A: Yes! If you have Pro subscription ($29/month) AND stake 10k KAMIYO, you get Team tier benefits (the higher of the two).

**Q: If I stake KAMIYO, do I still pay the subscription fee?**
A: No! Once you stake enough KAMIYO to unlock a tier, you can cancel your Stripe subscription. Staking replaces the monthly payment.

**Q: Which is better: staking or subscription?**
A: **Staking is better long-term** because:
- One-time stake vs recurring monthly payments
- You can unstake and get tokens back (vs spent subscription fees)
- Staking earns APY rewards (10-25%) + unlocks tier benefits
- Staking gives governance votes (subscribers don't vote)

**Example:**
- Stripe Pro = $29/month = $348/year
- Stake 1k KAMIYO @ $0.01 = $10 one-time + earn APY
- After 1 year, you saved $338 and still have your 1k KAMIYO

**Q: Why would anyone use subscriptions then?**
A: If you don't have KAMIYO yet or prefer predictable monthly costs vs token price volatility.

---

## Phase 2 Implementation Checklist

- [ ] Staking contract (Task 2.3) uses these thresholds: 1k (Pro), 10k (Team), 100k (Enterprise)
- [ ] Frontend displays tier badges (Free/Pro/Team/Enterprise) - match existing subscription UI
- [ ] x402 middleware checks BOTH Stripe subscription AND staked KAMIYO, uses highest tier
- [ ] Governance contract multiplies votes by governance weight (only for stakers, not subscribers)
- [ ] Subscription management page shows: "Unlock this tier by staking X KAMIYO instead of paying monthly"
- [ ] Escrow queue prioritizes by tier
- [ ] Bridge fee calculator applies tier-based discount
- [ ] Verifier invoices apply tier-based discount

---

**This is the official tier specification, aligned with existing Kamiyo subscription tiers (Free/Pro/Team/Enterprise). All conflicting definitions in other Phase 1 docs are superseded by this document for implementation purposes.**

---

## Comparison: Staking vs Subscription

| Tier | Stripe Monthly | Annual Cost | Stake Alternative | Stake Cost @ $0.01 | Annual Savings | APY Earnings (15% avg) | Net Benefit Year 1 |
|------|---------------|-------------|-------------------|-------------------|----------------|------------------------|-------------------|
| **Pro** | $29/month | $348 | 1,000 KAMIYO | $10 | $338 | $1.50 | **$339.50** |
| **Team** | $99/month | $1,188 | 10,000 KAMIYO | $100 | $1,088 | $15 | **$1,103** |
| **Enterprise** | $499/month | $5,988 | 100,000 KAMIYO | $1,000 | $4,988 | $150 | **$5,138** |

**Conclusion:** Staking is 30-50x better ROI than subscriptions in Year 1, assuming $0.01 token price.

---

END OF STANDARDIZED STAKING TIERS REFERENCE
