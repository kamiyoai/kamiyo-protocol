# Blindfold Partnership Roadmap

Integration between KAMIYO trust infrastructure and Blindfold privacy cards.

## Overview

KAMIYO provides stake-backed agent identity, escrow, and ZK reputation proofs.
Blindfold provides privacy-preserving crypto → fiat via virtual Mastercards.

Together: agents can receive payments privately with reputation-gated card limits.

## Technical Context

### KAMIYO
- Program: `8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM`
- Noir circuits: `reputation-proof`, `smt-exclusion`, `oracle-vote`, `aggregate-vote`
- SDK: `@kamiyo/sdk` with Shield, PrivateReputation, Voting classes

### Blindfold
- Program: `4VBEvYSEFBr7B3b6ahgUdMnR9hPZLnZJy6rHVM8kcMsn`
- Privacy flow: Holding wallet → ChangeNow splits → Mixer → ZK pool → Relayer
- API: `/api/zk-pay/*`, `/api/zk-swap/*`, `/api/zk-transfer/*`
- Database: Supabase (payments, holding_wallets, gift_cards)

---

## Phase 1: Escrow → Card Bridge

**Goal**: KAMIYO escrow release triggers Blindfold card funding.

### Implementation

#### 1.1 Create @kamiyo/blindfold package

```
packages/kamiyo-blindfold/
├── src/
│   ├── index.ts
│   ├── client.ts          # Blindfold API client
│   ├── pda.ts             # PDA derivation helpers
│   ├── types.ts           # IDL types from Blindfold program
│   └── escrow-hook.ts     # Escrow release → Blindfold deposit
└── package.json
```

**PDA helpers:**
```typescript
// Pool PDA: seeds = ["pool", token_mint]
// UserBalance PDA: seeds = ["user_balance", wallet, token_mint]
// Proof PDA: seeds = ["proof", nonce (u64 LE bytes)]
```

**API client:**
```typescript
class BlindfoldClient {
  createPayment(amount: number, recipientEmail: string, useZkProof?: boolean): Promise<PaymentResponse>
  createHoldingWallet(paymentId: string): Promise<HoldingWalletResponse>
  checkFunds(paymentId: string): Promise<FundsStatus>
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>
}
```

#### 1.2 Escrow release hook

On KAMIYO escrow release, optionally route funds to Blindfold:

```typescript
async function onEscrowRelease(escrow: Escrow, recipient: PublicKey, amount: BN) {
  if (escrow.metadata?.blindfoldCard) {
    const blindfold = new BlindfoldClient();
    const payment = await blindfold.createPayment(
      amount.toNumber() / LAMPORTS_PER_SOL,
      escrow.metadata.recipientEmail,
      true // useZkProof
    );
    const holding = await blindfold.createHoldingWallet(payment.paymentId);
    // Transfer funds to holding wallet
    await transferToHoldingWallet(recipient, holding.address, amount);
  }
}
```

### Deliverables
- [ ] `@kamiyo/blindfold` package with API client
- [ ] PDA derivation matching Blindfold program
- [ ] Escrow release hook for card funding
- [ ] Integration test: escrow → holding wallet → card

---

## Phase 2: Reputation-Gated Card Tiers

**Goal**: Use KAMIYO reputation proofs to unlock higher Blindfold card limits.

### Tier Structure

| Tier | Reputation | Card Limit | Requirements |
|------|------------|------------|--------------|
| Basic | Any | $100 | Valid agent PDA |
| Standard | ≥70% | $500 | reputation-proof |
| Premium | ≥85% | $2,000 | reputation-proof |
| Elite | ≥95% | $10,000 | reputation-proof + history |

### Implementation

#### 2.1 Verification API (Blindfold side)

Add to Blindfold repo:

```typescript
// api/kamiyo/verify-reputation.ts
export default async function handler(req, res) {
  const { agentPk, commitment, threshold, proofBytes } = req.body;

  // Verify proof on-chain or via KAMIYO API
  const verified = await verifyReputationProof(proofBytes, {
    agentPk,
    commitment,
    threshold
  });

  const tier = getTierFromThreshold(threshold);
  const limit = TIER_LIMITS[tier];

  return res.json({ verified, tier, limit });
}
```

#### 2.2 Card issuance gate

Modify Blindfold's `markGiftCardCreated` in `database-supabase.ts`:

```typescript
// Before creating Reloadly order:
if (payment.requires_reputation_check) {
  const { verified, tier, limit } = await fetch('/api/kamiyo/verify-reputation', {
    method: 'POST',
    body: JSON.stringify({
      agentPk: payment.agent_pk,
      commitment: payment.reputation_commitment,
      threshold: TIER_THRESHOLDS[payment.requested_tier],
      proofBytes: payment.reputation_proof
    })
  }).then(r => r.json());

  if (!verified) {
    throw new Error('Reputation verification failed');
  }

  if (payment.usd_amount > limit) {
    throw new Error(`Amount exceeds tier limit: $${limit}`);
  }
}
```

#### 2.3 SDK integration

```typescript
// In @kamiyo/blindfold
async createReputationGatedPayment(
  amount: number,
  recipientEmail: string,
  reputationProof: ReputationProofResult
): Promise<PaymentResponse> {
  return this.createPayment(amount, recipientEmail, true, {
    requires_reputation_check: true,
    agent_pk: reputationProof.publicInputs.agentPk.toString(),
    reputation_commitment: reputationProof.publicInputs.commitment.toString(),
    reputation_proof: Buffer.from(reputationProof.proofBytes).toString('base64'),
    requested_tier: this.getTierForThreshold(reputationProof.publicInputs.threshold)
  });
}
```

### Deliverables
- [ ] `/api/kamiyo/verify-reputation` endpoint in Blindfold
- [ ] Tier-based card limit enforcement
- [ ] SDK method for reputation-gated payments
- [ ] Test: agent with 90% rep → $2k card approved

---

## Phase 3: Shared Blacklist

**Goal**: Bad actors on KAMIYO are blocked from Blindfold cards.

### SMT Architecture

```
KAMIYO maintains SMT blacklist:
- Root stored on-chain in BlacklistRegistry PDA
- Agents added on: 3+ dispute losses, fraud detection, manual ban
- Agents removed after: appeal success, time-based expiry

Blindfold checks exclusion proof:
- Before card issuance, verify agent NOT in blacklist
- Uses smt-exclusion Noir circuit
- No identity disclosure (just proof of non-membership)
```

### Implementation

#### 3.1 Blacklist registry (KAMIYO)

```rust
// programs/kamiyo/src/blacklist.rs
#[account]
pub struct BlacklistRegistry {
    pub root: [u8; 32],        // SMT root
    pub leaf_count: u64,       // Number of blacklisted agents
    pub last_updated: i64,     // Unix timestamp
    pub authority: Pubkey,     // Update authority
}

pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, agent_pk: Pubkey) -> Result<()> {
    // Verify caller is dispute program or admin
    // Update SMT root
    // Emit event for indexers
}
```

#### 3.2 Exclusion proof API (Blindfold)

```typescript
// api/kamiyo/verify-exclusion.ts
export default async function handler(req, res) {
  const { agentPk, root, siblings } = req.body;

  // Verify SMT exclusion proof
  const notBlacklisted = await verifyExclusionProof({
    root,
    key: agentPk,
    siblings // 256 siblings for SMT
  });

  return res.json({ notBlacklisted });
}
```

#### 3.3 Integration in card flow

```typescript
// Before card issuance:
const { notBlacklisted } = await fetch('/api/kamiyo/verify-exclusion', {
  method: 'POST',
  body: JSON.stringify({
    agentPk: payment.agent_pk,
    root: await getBlacklistRoot(),
    siblings: payment.exclusion_proof_siblings
  })
}).then(r => r.json());

if (!notBlacklisted) {
  throw new Error('Agent is blacklisted');
}
```

### Deliverables
- [ ] BlacklistRegistry on-chain account
- [ ] `add_to_blacklist` / `remove_from_blacklist` instructions
- [ ] SMT management in SDK (add, remove, generate exclusion proof)
- [ ] `/api/kamiyo/verify-exclusion` endpoint in Blindfold
- [ ] Test: blacklisted agent → card rejected

---

## Phase 4: End-to-End Privacy Flow

**Goal**: Complete privacy loop from work to spend.

### Flow

```
1. Consumer creates KAMIYO escrow with provider
   └── Escrow includes: blindfoldCard: true, recipientEmail

2. Provider delivers work

3. Consumer releases escrow (or dispute resolved)
   └── Triggers: escrow-hook → Blindfold holding wallet

4. Blindfold processes payment
   └── Holding wallet → ChangeNow splits → Mixer → ZK pool

5. Provider requests card (with reputation proof)
   └── Blindfold verifies: reputation ≥ tier threshold
   └── Blindfold verifies: not blacklisted

6. Card issued at appropriate tier
   └── Reloadly creates virtual Mastercard
   └── Email sent to provider

7. Provider spends privately
   └── No trail back to original escrow
```

### Privacy Guarantees

| Step | What's Hidden |
|------|---------------|
| Escrow creation | Consumer-provider link (on-chain but pseudonymous) |
| Escrow release | Amount correlation (via ChangeNow splits) |
| ZK pool | Deposit-withdrawal link |
| Reputation proof | Exact score (only proves threshold) |
| Exclusion proof | Blacklist contents |
| Card spend | Agent identity |

### Deliverables
- [ ] Full integration test script
- [ ] Demo video showing complete flow
- [ ] Documentation for agent builders

---

## Database Schema Updates

### Blindfold (Supabase)

```sql
-- Add KAMIYO integration fields to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS agent_pk VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reputation_commitment VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reputation_proof TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS exclusion_proof_siblings TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS requested_tier VARCHAR(20);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS requires_reputation_check BOOLEAN DEFAULT false;

-- Blacklist sync table (optional, for caching)
CREATE TABLE IF NOT EXISTS kamiyo_blacklist_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    root VARCHAR(255) NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## API Summary

### KAMIYO Endpoints (new)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/blacklist/root` | Get current blacklist SMT root |
| `POST /api/blacklist/exclusion-proof` | Generate exclusion proof for agent |

### Blindfold Endpoints (new)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/kamiyo/verify-reputation` | Verify reputation proof, return tier |
| `POST /api/kamiyo/verify-exclusion` | Verify agent not blacklisted |

---

## Links

- Blindfold Docs: https://blindfoldfinance.gitbook.io/docs
- Blindfold Site: https://www.blindfoldfinance.com
- KAMIYO Docs: https://kamiyo.ai/docs
