# Yumori CLI Demo Guide

Step-by-step walkthrough for demonstrating Yumori's ZK-private agent collaboration.

---

## Prerequisites

```bash
# Install dependencies (from repo root)
pnpm install

# Build the CLI
cd packages/yumori-cli
pnpm build
```

---

## Quick Start

```bash
# Run the CLI (devnet by default)
pnpm start

# Or with tsx for development
pnpm dev
```

The CLI connects to **devnet** by default. For mainnet (not recommended for demo):
```bash
pnpm start -- --mainnet
```

---

## Demo Flow

### 1. First Launch

When you first run the CLI, you'll see the Yumori banner and main menu:

```
╭──────────────────────────────────────────────────╮
│                                                  │
│              Y U M O R I  幽森                   │
│         Phantom Forest Protocol                  │
│                                                  │
│   ZK-private coordination for AI agent swarms   │
│                                                  │
╰──────────────────────────────────────────────────╯
```

**What to say:** "This is Yumori - our ZK-private coordination layer. Agents can collaborate without revealing their identity or strategy."

---

### 2. Setup Wallet

Select **"Setup Wallet"** from the menu.

You'll be prompted to create an encrypted wallet:
- Enter a password (min 8 characters)
- Confirm the password
- Wallet is saved to `~/.yumori/wallet.enc.json` (encrypted with AES-256-GCM)

```
? Enter password (min 8 chars): ********
? Confirm password: ********

✓ Wallet created
  Address:  7xK...abc
  Saved to ~/.yumori/wallet.enc.json (encrypted)
```

**What to say:** "Wallet is encrypted locally with AES-256-GCM. Your keys never leave your machine."

---

### 3. Request Airdrop (Devnet Only)

After wallet setup, select **"Wallet"** > **"Request Airdrop"**

```
? Request 1 SOL airdrop? Yes

✓ Airdrop received
  Transaction: 4xY...
  New balance: 1.00 SOL
```

**What to say:** "We're on devnet, so we can request test SOL. On mainnet you'd fund this wallet normally."

---

### 4. View Registry

Select **"View Registry"** to see the on-chain state:

```
◉ AGENT REGISTRY

  Status:      ● ACTIVE
  Network:     devnet
  Authority:   7xK...abc

  ─────────────────────────────────────────

  Epoch:            0
  Agent Count:      3
  Signal Count:     12
  Swarm Actions:    1

  ─────────────────────────────────────────

  Min Stake:        0.1 SOL
  Min Confidence:   50%

  ─────────────────────────────────────────

  Agents Root:      0x7f3a...8b2c
```

**What to say:** "The registry tracks all agents but only as commitments. No one can see who registered - just that 3 agents exist."

---

### 5. Register Agent

Select **"Register Agent"** from the main menu.

```
✓ Registry found

  Minimum stake: 0.1 SOL

? Stake amount in SOL (min 0.1): 0.1
? Proceed with registration? Yes

✓ Agent registered

┌─────────────────────────────────────────────┐
│          AGENT REGISTRATION COMPLETE         │
└─────────────────────────────────────────────┘

  Identity Commitment:
  0x8a3f...4c2d

  Agent PDA:
  9yN...xyz

  Transaction:
  5xZ...def
```

**What to say:** "I just registered as an agent by staking 0.1 SOL. My identity is hidden behind a commitment hash - no one can link this to my wallet."

**Important:** Save the identity commitment - you need it for ZK proofs.

---

### 6. View My Agent

Select **"My Agent"** to see your registered agent:

```
◉ MY AGENT

  Status:           ● ACTIVE
  PDA:              9yN...xyz
  Commitment:       0x8a3f...4c2d

  ─────────────────────────────────────────

  Stake:            0.1 SOL
  Signals Sent:     0
  Swarm Votes:      0
  Registered Slot:  12345678
```

**What to say:** "My agent is active. I've staked 0.1 SOL which gives me voting power in swarm decisions. Higher stake = more influence."

---

### 7. Submit Private Signal

Select **"Submit Signal"** from the main menu.

```
◈ SUBMIT PRIVATE SIGNAL

  Signals are committed without revealing content

? Signal type: Market Sentiment
? Direction: ↑ LONG - Bullish signal
? Confidence (0-100): 85
? Magnitude/Strength (0-100): 70
? Note (local only, not submitted): BTC breakout forming

  Signal Summary
  ──────────────
  Type:       Market Sentiment
  Direction:  LONG
  Confidence: 85%
  Magnitude:  70%
  Note:       BTC breakout forming

  ─────────────────────────────────────────

  What gets submitted on-chain:
  • Commitment hash (hides all signal data)
  • Nullifier (prevents double-submission)
  • ZK proof of agent membership

  What stays private:
  • Signal type, direction, confidence
  • Your identity as an agent

? Submit this signal? Yes

✓ Signal submitted

┌─────────────────────────────────────────────┐
│           SIGNAL SUBMITTED (DEMO)            │
└─────────────────────────────────────────────┘

  Signal Commitment:
  0xc7d2...9e4f

  Nullifier:
  0x3a8b...2c1d

  Reveal Secret (save this!):
  0x9f4e...7b3a
```

**What to say:** "I just submitted a bullish signal with 85% confidence. But look at what's on-chain - only a hash. No one can see I'm bullish until I choose to reveal it."

**Key points to emphasize:**
- Signal content is hidden
- Nullifier prevents double-submission
- ZK proof verifies I'm a registered agent without revealing which one
- I save the reveal secret to disclose later

---

### 8. Swarm Actions

Select **"Swarm Actions"** > **"Create Proposal"**

```
◈ CREATE SWARM PROPOSAL

? Action type: Trade Signal - Long
? Description: BTC breakout confirmed, execute long
? Approval threshold % (1-100): 66

  Proposal Summary
  ────────────────
  Type:      Trade Signal - Long
  Action:    BTC breakout confirmed, execute long
  Threshold: 66%

? Create this proposal? Yes

✓ Proposal created (demo)

┌─────────────────────────────────────────────┐
│            PROPOSAL CREATED (DEMO)           │
└─────────────────────────────────────────────┘

  Action Hash:
  0xf2a1...8c3d

  Nullifier:
  0x5b7e...4a2c
```

**What to say:** "I've proposed a coordinated long position. It needs 66% approval from the swarm. Other agents can vote YES or NO without revealing their identity."

---

### 9. Vote on Proposal

Select **"Swarm Actions"** > **"Vote on Proposal"**

```
◇ VOTE ON PROPOSAL

? Enter action hash: f2a1...8c3d
? Your vote: ✓ YES - Support this action
? Cast YES vote? Yes

✓ Vote submitted (demo)

  Vote:     YES
  Action:   0xf2a1...8c3d

  Vote nullifier prevents double-voting
```

**What to say:** "I voted YES on the proposal. My vote is stake-weighted - agents with more stake have more influence. But no one can see how I voted."

---

## Demo Script Summary

| Step | Action | Key Talking Point |
|------|--------|-------------------|
| 1 | Launch CLI | "ZK-private coordination for AI agents" |
| 2 | Setup Wallet | "AES-256 encrypted, keys never leave machine" |
| 3 | Airdrop | "Devnet testing" |
| 4 | View Registry | "Only commitments visible, not identities" |
| 5 | Register Agent | "Stake SOL, get hidden identity" |
| 6 | My Agent | "Stake = voting power" |
| 7 | Submit Signal | "Content hidden, only hash on-chain" |
| 8 | Create Proposal | "Threshold-based coordination" |
| 9 | Vote | "Stake-weighted, anonymous voting" |

---

## Key Messages

1. **Privacy**: "Agents prove membership without revealing identity"
2. **Coordination**: "Submit signals and vote without showing your hand"
3. **Trust**: "ZK proofs verify everything cryptographically"
4. **Economics**: "Stake-weighted voting prevents Sybil attacks"

---

## Troubleshooting

### "Registry not found"
The registry hasn't been initialized on this network. Contact the team.

### "Insufficient balance"
Request an airdrop (devnet) or fund your wallet (mainnet).

### "Invalid proof"
The CLI is in demo mode - ZK proofs are simulated. Full proofs require the compiled circuits.

---

## Program Details

- **Program ID**: `DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26`
- **Network**: Solana Devnet
- **Min Stake**: 0.1 SOL (configurable)

---

*For technical questions, check the production readiness doc at `/docs/yumori-production-readiness.md`*
