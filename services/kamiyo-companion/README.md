# KAMIYO Companion

AI thinking partner with blockchain-verified trust.

## Features

### Phase 1: X Bot
- Thinking partner responses
- Task breakdown
- Body doubling
- Crisis safety detection

### Phase 2: Subscriptions
- Persistent context memory (SQLite)
- Tier-based access (Free / Companion / Pro)
- Token-gated access (hold KAMIYO = free tier upgrade)
- SOL payments for non-holders

### Phase 3: Reputation
- Session ratings (1-5)
- On-chain reputation tracking
- ZK proof eligibility

## Tiers

| Tier | Access | Messages/Day | Features |
|------|--------|--------------|----------|
| Free | Public X | 10 | Basic responses |
| Companion | 100K KAMIYO or 0.5 SOL/mo | 100 | Context memory, private mode |
| Pro | 1M KAMIYO or 1 SOL/mo | Unlimited | Research tasks, API access |

## Commands

Users can DM or mention the bot with:

```
!wallet <address>  - Link Solana wallet
!upgrade companion - Show upgrade instructions
!verify <tx>       - Verify SOL payment
!rate 1-5          - Rate current session
!status            - Show tier and stats
!clear             - Clear conversation history
!help              - Show commands
```

## Setup

### 1. Twitter API

Get credentials from [developer.twitter.com](https://developer.twitter.com):
- API Key + Secret
- Access Token + Secret (with read/write)

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
TREASURY_WALLET=<your-solana-wallet>
```

### 3. Run

```bash
npm install
npm run dev     # development
npm run build   # production build
npm start       # production
```

## Architecture

```
src/
  index.ts      # Main bot, Twitter polling
  db.ts         # SQLite database (users, sessions, payments)
  tiers.ts      # Subscription tier logic
  payments.ts   # SOL payment verification
  reputation.ts # Session ratings, ZK proofs
```

## Database

SQLite database at `./data/companion.db`:

- `users` - User profiles, wallets, tiers
- `conversations` - Message history (paid tiers)
- `sessions` - Session tracking, ratings
- `payments` - Payment records

## Token Integration

- Hold 100K KAMIYO = Companion tier (free)
- Hold 1M KAMIYO = Pro tier (free)
- Token balances checked on each interaction
- No lock-up required, just hold in linked wallet

## Blinks (Pay on X)

KAMIYO Companion supports Solana Blinks for frictionless payments directly on X.

### How it works

1. User sees a Blink on X (shared subscription link)
2. Phantom/Backpack unfurls it with Subscribe buttons
3. User clicks, signs transaction in wallet
4. Subscription activated instantly

### Running the Actions server

```bash
npm run dev:actions    # development
npm run start:actions  # production
```

### Blink URL

Share this URL on X:
```
https://companion.kamiyo.ai/api/actions/subscribe
```

Or test locally:
```
https://dial.to/?action=solana-action:http://localhost:3001/api/actions/subscribe
```

### Requirements

- Domain must serve `actions.json` at root
- HTTPS required for production
- Phantom or Backpack wallet extension
