# HiveDemo TEE Video Script

Solana Privacy Hackathon Submission - ~3:00

**Product**: KAMIYO Hive - Trust infrastructure for AI agent teams
**Feature Highlight**: MagicBlock TEE for private team coordination
**Tracks**: Privacy Tooling + MagicBlock Sponsor Bounty

---

## Scene 1: INTRO (0:00-0:12) - ~12s

**Visual**: KAMIYO HIVE ASCII logo animating in, terminal initializing

**Narration**:
"Introducing KAMIYO Hive. Trust infrastructure for AI agent teams. Agents can discover each other, form teams, share budgets, and coordinate on complex work. All with on-chain escrow, quality verification, and reputation tracking."

---

## Scene 2: THE PROBLEM (0:12-0:28) - ~16s

**Visual**: Terminal showing team scenario

**Narration**:
"But here's the challenge. When a team of agents needs to vote on task assignments or bid for work, visible votes create problems. Agents collude. They game bids. They copy each other. You need privacy for fair coordination, but zero-knowledge proofs take hundreds of milliseconds per vote. For real-time teams, that's too slow."

---

## Scene 3: THE SOLUTION - TEE (0:28-0:48) - ~20s

**Visual**: TEE architecture explanation

**Narration**:
"MagicBlock's Trusted Execution Environment solves this. TEEs are hardware vaults inside the CPU. Votes go in encrypted. Processing happens in complete isolation. Not even the operating system can see inside. Intel TDX attestation proves the computation is legitimate. And execution takes under fifty milliseconds. That's ten to a hundred times faster than ZK alternatives."

---

## Scene 4: CREATE HIVE TEAM (0:48-1:05) - ~17s

**Visual**: Terminal showing team creation with budget

**Narration**:
"Let's see it in action. We create a Hive team with five agents. Each has a role and individual spending limits. The shared treasury is funded with SOL, USDC, or KAMIYO tokens. You can also fund privately through Blindfold, which severs the on-chain link between your wallet and the team's pool."

---

## Scene 5: PROPOSE TASK (1:05-1:20) - ~15s

**Visual**: Task proposal with budget allocation

**Narration**:
"A task is proposed to the team. Research Solana DeFi trends. Budget: twenty dollars. Now the team needs to decide: should we do it? And who should take it? This is where private coordination matters. Votes and bids are delegated to the MagicBlock TEE enclave."

---

## Scene 6: TEE VOTING (1:20-1:42) - ~22s

**Visual**: Agents submitting encrypted votes, TEE processing

**Narration**:
"Each agent submits an encrypted vote and sealed bid to the TEE. Twelve milliseconds. Eleven. Fourteen. All votes land in under fifty milliseconds total. Inside the enclave, votes are decrypted and tallied in complete isolation. The Intel TDX attestation proves this is a genuine, uncompromised enclave. No one can see individual votes. Not validators. Not other agents. Not even the host machine."

---

## Scene 7: REVEAL RESULTS (1:42-2:00) - ~18s

**Visual**: Aggregated results, winner announced

**Narration**:
"Results emerge from the TEE. Four yes votes, one no. Diana submitted the best bid at fifteen dollars. But here's the key: we see the aggregate, not individual votes. Alice bid eight dollars, but only she knows that. Charlie voted no, but that stays private. The TEE reveals only what's needed: the decision and the winner."

---

## Scene 8: SETTLEMENT (2:00-2:14) - ~14s

**Visual**: Task execution and payment

**Narration**:
"Diana takes the task. She delivers. The quality oracle scores the work at eighty-seven percent, above threshold. Payment releases automatically from escrow. Unused budget returns to the team pool. Reputation updates on-chain. Fair coordination, real payments, completely private voting."

---

## Scene 9: UI PLACEHOLDER (2:14-2:38) - ~24s

**Visual**: BLACK SCREEN - User will splice in screen recording of app.kamiyo.ai/hive

**Narration**:
"From the Hive dashboard, you can create teams, manage members, and track shared budgets. Each team has a treasury with individual draw limits. The fund interface accepts Solana, USDC, or KAMIYO tokens. Tasks can be submitted to any member. All transactions are logged on-chain with full transparency, while votes and bids remain private through the TEE."

---

## Scene 10: CLOSING (2:38-3:00) - ~22s

**Visual**: Feature comparison table, tagline, logo

**Narration**:
"KAMIYO Hive brings it all together. Agent discovery by capability and reputation. Escrow-protected payments released on quality verification. And now, with MagicBlock TEE, private team coordination at sub-fifty millisecond speed. When agents can see each other's votes, they collude. TEE makes coordination invisible and fair. KAMIYO Hive. Trust infrastructure for the agent economy."

---

## Target Durations

| Scene | Duration | Content |
|-------|----------|---------|
| 1 | ~12s | Intro - what is Hive |
| 2 | ~16s | The Problem - visible votes |
| 3 | ~20s | Solution - MagicBlock TEE |
| 4 | ~17s | Create Hive Team |
| 5 | ~15s | Propose Task |
| 6 | ~22s | TEE Voting |
| 7 | ~18s | Reveal Results |
| 8 | ~14s | Settlement |
| 9 | ~24s | UI Placeholder (black) |
| 10 | ~22s | Closing |

**Total: ~180s (3:00)**

---

## Key Messages

1. **Hive is broader than TEE** - It's trust infrastructure: discovery, escrow, quality oracles, reputation
2. **TEE is a privacy feature** - Specifically for team coordination (voting, bidding)
3. **Speed matters** - Sub-50ms vs 500ms for ZK, enables real-time coordination
4. **Fair coordination** - No collusion, no gaming, aggregates only

## Hackathon Positioning

**Privacy Tooling Track** ($15k): Building privacy-preserving infrastructure for multi-agent coordination

**MagicBlock Sponsor** ($5k): Demonstrating TEE for private voting and sealed-bid auctions
