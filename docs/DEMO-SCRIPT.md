# KAMIYO Demo Recording Script

## Overview

**Duration:** 60-90 seconds
**Audience:** Solana degens, investors
**Message:** "Escrow protection for AI agents. Don't get rugged."

---

## Pre-Recording Setup

### 1. Environment
```bash
# Terminal 1: Have SDK ready
cd /Users/dennisgoslar/Documents/Dennis/kamiyo-protocol
export SOLANA_PRIVATE_KEY="your-devnet-key"

# Fund wallet on devnet
solana airdrop 2 --url devnet
```

### 2. Browser Tabs (Playwright will open)
- Tab 1: protocol.kamiyo.ai
- Tab 2: solscan.io/account/{wallet}?cluster=devnet
- Tab 3: solscan.io/account/8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM?cluster=devnet (program)

### 3. Screen Layout
- Browser: 70% of screen (left)
- Terminal: 30% of screen (right, optional)

---

## Demo Script

### Scene 1: The Setup (10s)

**Visual:** Protocol dashboard homepage

**Action:**
- Show KAMIYO logo/dashboard
- Quick scroll to show "Agent Identity" and "Escrow" sections

**Narration (overlay text):**
> "Your AI agent needs to pay for services"

---

### Scene 2: Create Escrow (15s)

**Visual:** Dashboard escrow creation OR terminal command

**Action (Option A - Dashboard):**
1. Click "Create Agreement"
2. Enter provider address: `8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM`
3. Enter amount: `0.1 SOL`
4. Click "Lock Funds"

**Action (Option B - Terminal):**
```typescript
await client.createAgreement({
  provider: providerPubkey,
  amount: 100_000_000, // 0.1 SOL
  timeLockSeconds: 86400,
  transactionId: 'demo-001'
});
```

**Narration:**
> "Funds locked in escrow. Provider can see the money but can't touch it."

---

### Scene 3: Show On-Chain (10s)

**Visual:** Solscan transaction page

**Action:**
1. Switch to Solscan tab
2. Show transaction confirmed
3. Highlight escrow PDA balance

**Narration:**
> "Verified on Solana. 400ms finality."

---

### Scene 4: The Problem (10s)

**Visual:** Red overlay or "X" animation

**Action:**
- Show fake "API Response: 500 Error" or "Service Down"
- Or show quality score < threshold

**Narration:**
> "Service didn't deliver? Provider ghosted?"

---

### Scene 5: Dispute (15s)

**Visual:** Dashboard dispute flow OR terminal

**Action (Option A - Dashboard):**
1. Click "Dispute" button
2. Show status change to "Disputed"

**Action (Option B - Terminal):**
```typescript
await client.markDisputed('demo-001');
```

**Narration:**
> "One click. Dispute filed on-chain."

---

### Scene 6: Oracle Vote (15s)

**Visual:** Voting animation or dashboard oracle section

**Action:**
- Show oracles submitting votes (commit phase)
- Show reveal phase
- Show median score calculated

**Narration:**
> "Oracles vote privately. ZK proofs prevent collusion."

---

### Scene 7: Settlement (10s)

**Visual:** Solscan showing refund transaction

**Action:**
1. Show settlement transaction
2. Highlight funds returning to agent wallet

**Narration:**
> "Quality score: 35%. Agent refunded 100%."

---

### Scene 8: End Card (5s)

**Visual:** KAMIYO logo + links

**Text overlay:**
```
KAMIYO
Trust layer for autonomous agents

protocol.kamiyo.ai
github.com/kamiyo-ai/kamiyo-protocol
```

---

## Playwright Commands

After restart, I'll execute these in sequence:

```
1. playwright: navigate to https://protocol.kamiyo.ai
2. playwright: screenshot "scene1-dashboard"
3. playwright: click [Create Agreement button]
4. playwright: fill provider address field
5. playwright: fill amount field
6. playwright: click [Lock Funds]
7. playwright: wait for transaction confirmation
8. playwright: open new tab https://solscan.io/tx/{txid}?cluster=devnet
9. playwright: screenshot "scene3-solscan"
10. playwright: navigate back to dashboard
11. playwright: click [Dispute]
12. playwright: screenshot "scene5-disputed"
13. playwright: navigate to solscan settlement tx
14. playwright: screenshot "scene7-refund"
```

---

## Timing Breakdown

| Scene | Duration | Cumulative |
|-------|----------|------------|
| 1. Setup | 10s | 10s |
| 2. Create Escrow | 15s | 25s |
| 3. On-Chain | 10s | 35s |
| 4. Problem | 10s | 45s |
| 5. Dispute | 15s | 60s |
| 6. Oracle Vote | 15s | 75s |
| 7. Settlement | 10s | 85s |
| 8. End Card | 5s | 90s |

---

## Recording Tips

1. **Resolution:** 1920x1080 minimum
2. **Browser zoom:** 125-150% for readability
3. **Clean browser:** No bookmarks bar, no extensions visible
4. **Dark mode:** Matches Solana aesthetic
5. **Cursor:** Use a large, visible cursor or highlight clicks
6. **Speed:** I'll pause 2-3s between actions for viewer comprehension

---

## Fallback: Terminal-Only Demo

If dashboard UI isn't ready:

```bash
# Scene 2: Create escrow
npx ts-node -e "
import { KamiyoClient } from '@kamiyo/sdk';
// ... create agreement
"

# Scene 5: Dispute
npx ts-node -e "
// ... mark disputed
"

# Show Solscan in browser for visual confirmation
```

---

## Post-Recording

1. **Trim** dead air and loading screens
2. **Add** text overlays for narration
3. **Speed up** blockchain confirmations (2x)
4. **Add** subtle background music (optional)
5. **Export** as MP4, 1080p, <15MB for Twitter

---

## Ready Checklist

- [ ] Devnet wallet funded (2+ SOL)
- [ ] Claude Code restarted with Playwright MCP
- [ ] Screen recorder ready (OBS/Screen Studio)
- [ ] Browser in dark mode, 125% zoom
- [ ] protocol.kamiyo.ai accessible
- [ ] Say "start the demo" when ready
