# KAMIYO + Blindfold Integration

Agents earn on-chain reputation. You verify ZK proofs to gate card tiers. Agent proves "my score is >= 85%" without revealing actual score.

## Architecture (Option A Confirmed)

KAMIYO hosts the verifier API. Blindfold calls our endpoints before card issuance.

```
Agent requests card with proof attached
  -> Blindfold calls https://api.kamiyo.ai/verify/reputation
  -> Blindfold calls https://api.kamiyo.ai/verify/exclusion
  -> Issues card at matching tier (or rejects)
```

## KAMIYO Verifier API

Base URL: `https://api.kamiyo.ai`

### POST /verify/reputation

Verifies a ZK proof that agent reputation meets a threshold.

**Request:**
```json
{
  "agent_pk": "BASE58_PUBKEY",
  "commitment": "HEX_STRING",
  "threshold": 85,
  "proof_bytes": "BASE64_ENCODED_PROOF"
}
```

**Response (success):**
```json
{
  "verified": true,
  "tier": "premium",
  "limit": 2000
}
```

**Response (failure):**
```json
{
  "verified": false,
  "error": "Proof verification failed"
}
```

### POST /verify/exclusion

Verifies an SMT exclusion proof (agent not on blacklist).

**Request:**
```json
{
  "agent_pk": "BASE58_PUBKEY",
  "root": "HEX_STRING",
  "siblings": ["HEX_STRING", "HEX_STRING", ...]
}
```

Note: `siblings` must contain exactly 256 hex strings.

**Response (success):**
```json
{
  "not_blacklisted": true
}
```

**Response (failure):**
```json
{
  "not_blacklisted": false,
  "error": "Root mismatch: provided root does not match on-chain registry"
}
```

### GET /blacklist/root

Returns the current blacklist SMT root.

**Response:**
```json
{
  "root": "HEX_STRING"
}
```

### GET /blacklist/proof/:agent_pk

**Response (not blacklisted):**
```json
{
  "root": "HEX_STRING",
  "siblings": ["HEX_STRING", ...],
  "blacklisted": false
}
```

**Response (blacklisted):**
```json
{
  "error": "Agent is blacklisted",
  "blacklisted": true
}
```

## What Blindfold Needs to Implement

### 1. Database changes

```sql
ALTER TABLE payments ADD COLUMN agent_pk VARCHAR(255);
ALTER TABLE payments ADD COLUMN reputation_commitment VARCHAR(255);
ALTER TABLE payments ADD COLUMN reputation_proof TEXT;
ALTER TABLE payments ADD COLUMN exclusion_proof_siblings TEXT;
ALTER TABLE payments ADD COLUMN requested_tier VARCHAR(20);
ALTER TABLE payments ADD COLUMN requires_reputation_check BOOLEAN DEFAULT false;
```

### 2. Accept new fields in payment creation

`/api/crypto-payment/create` needs these optional fields:

```typescript
agent_pk?: string;
reputation_commitment?: string;
reputation_proof?: string;           // base64
exclusion_proof_siblings?: string;   // JSON array of hex strings
requested_tier?: 'basic' | 'standard' | 'premium' | 'elite';
requires_reputation_check?: boolean;
```

Store them in `payments` table.

### 3. Gate card issuance

Before calling Reloadly:

```typescript
async function issueCard(payment) {
  if (!payment.requires_reputation_check) {
    return proceedWithReloadly(payment);
  }

  const repCheck = await fetch('https://api.kamiyo.ai/verify/reputation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_pk: payment.agent_pk,
      commitment: payment.reputation_commitment,
      threshold: TIER_THRESHOLDS[payment.requested_tier],
      proof_bytes: payment.reputation_proof,
    }),
  }).then(r => r.json());

  if (!repCheck.verified) {
    throw new Error(repCheck.error || 'Reputation verification failed');
  }

  if (payment.usd_amount > repCheck.limit) {
    throw new Error(`Amount exceeds tier limit: $${repCheck.limit}`);
  }

  const exclusionProof = await fetch(
    `https://api.kamiyo.ai/blacklist/proof/${payment.agent_pk}`
  ).then(r => r.json());

  if (exclusionProof.blacklisted) {
    throw new Error('Agent is blacklisted');
  }

  // Optional: cryptographic verification
  const exclusionCheck = await fetch('https://api.kamiyo.ai/verify/exclusion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_pk: payment.agent_pk,
      root: exclusionProof.root,
      siblings: exclusionProof.siblings,
    }),
  }).then(r => r.json());

  if (!exclusionCheck.not_blacklisted) {
    throw new Error('Exclusion verification failed');
  }

  return proceedWithReloadly(payment);
}
```

**Minimal version:**

```typescript
async function issueCard(payment) {
  if (!payment.requires_reputation_check) {
    return proceedWithReloadly(payment);
  }

  const repCheck = await fetch('https://api.kamiyo.ai/verify/reputation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_pk: payment.agent_pk,
      commitment: payment.reputation_commitment,
      threshold: TIER_THRESHOLDS[payment.requested_tier],
      proof_bytes: payment.reputation_proof,
    }),
  }).then(r => r.json());

  if (!repCheck.verified || payment.usd_amount > repCheck.limit) {
    throw new Error(repCheck.error || 'Reputation check failed');
  }

  const blacklistCheck = await fetch(
    `https://api.kamiyo.ai/blacklist/proof/${payment.agent_pk}`
  ).then(r => r.json());

  if (blacklistCheck.blacklisted) {
    throw new Error('Agent is blacklisted');
  }

  return proceedWithReloadly(payment);
}
```

## Tiers

| Tier | Min Score | Limit |
|------|-----------|-------|
| basic | 0 | $100 |
| standard | 70 | $500 |
| premium | 85 | $2,000 |
| elite | 95 | $10,000 |

```typescript
const TIER_THRESHOLDS = { basic: 0, standard: 70, premium: 85, elite: 95 };
const TIER_LIMITS = { basic: 100, standard: 500, premium: 2000, elite: 10000 };
```

## Our SDK

We've built `@kamiyo/blindfold` that generates proofs and formats requests:

```typescript
import { BlindfoldClient } from '@kamiyo/blindfold';

const client = new BlindfoldClient({ apiKey: 'your-key' });

const payment = await client.createReputationGatedPayment({
  amount: 500,
  currency: 'SOL',
  recipientEmail: 'agent@example.com',
  agentPk: wallet.publicKey,
  reputationProof: await generateReputationProof(wallet, 85),
  exclusionProof: await generateExclusionProof(wallet),
  requestedTier: 'premium',
});
```

## Proof Formats

**Reputation proof:**
- Noir/Barretenberg format
- ~2KB base64
- Public inputs: agentPk, commitment, threshold

**Exclusion proof:**
- 256 SMT siblings (hex strings)
- Public inputs: agentPk, root

## Error Codes

| Error | Meaning |
|-------|---------|
| `Proof verification failed` | Invalid ZK proof |
| `Root mismatch` | Stale blacklist root, refetch from /blacklist/root |
| `Agent is blacklisted` | Agent on blacklist |
| `Amount exceeds tier limit` | Requested amount > tier allows |
| `Invalid agent_pk` | Malformed public key |

## Next Steps

1. We deploy verifier API to `api.kamiyo.ai`
2. You implement DB changes and payment flow
3. We provide staging credentials and test vectors
4. Integration testing

dev@kamiyo.ai
