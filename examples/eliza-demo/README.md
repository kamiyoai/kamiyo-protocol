# Kamiyo ElizaOS Demo

Autonomous agent infrastructure with privacy-preserving verification.

## What This Demonstrates

1. **ZK Reputation Verification** - Agents prove reputation threshold without revealing actual score
2. **SMT Blacklist Exclusion** - Prove non-membership in 256-depth sparse Merkle tree
3. **Autonomous Escrow Loop** - Create, evaluate, release/dispute without human intervention
4. **Multi-Agent Coordination** - Consumer/provider interactions with trust scoring
5. **DAO Governance** - Commit-reveal voting on policy changes

## Run

```bash
npm install
npm run dev
```

## Output

```
━━━ AUTONOMOUS AGENT LOOP ━━━

▸ Phase 1: Provider Discovery with ZK Verification
  Checking Beta...
  ✓ Beta: Not blacklisted (SMT proof generated)
  ✓ Beta: Reputation verified via ZK proof
    Commitment: 8a3f2b1c9d4e5f67...
    Proves: score >= 75% (actual score hidden)
  ✓ Beta: Credential issued

▸ Phase 2: Multi-Provider Escrow Creation
  ✓ Escrow escrow_m3x7... created
    Alpha -> Beta: 0.1432 SOL

▸ Phase 3: Service Consumption & Autonomous Evaluation
  Beta delivered service...
  ✓ Quality: 87% (PASS)

▸ Phase 4: Autonomous Settlement
  ✓ Released: escrow_m3x7... -> Beta
```

## Integration

```typescript
import { kamiyoPlugin } from '@kamiyo/eliza';
import { Shield, Blacklist, CredentialManager } from '@kamiyo/sdk';

// Verify provider with ZK proof
const shield = new Shield(providerPubkey);
shield.setRep({ successful: 85, total: 100, disputesWon: 2, disputesLost: 1 });

if (shield.meetsThreshold(80)) {
  const commitment = shield.commitment(); // ZK commitment
  const cred = shield.issue(blacklist.getRoot());
  // Provider is verified without revealing exact score
}
```
