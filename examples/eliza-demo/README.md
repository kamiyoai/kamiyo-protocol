# Kamiyo ElizaOS Demo

Autonomous agent infrastructure with SLA enforcement and ZK reputation verification.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/kamiyo-ai/kamiyo-protocol?quickstart=1)

## Try It

**Option 1: GitHub Codespaces (recommended)**

Click the badge above or go to the repo and click "Code" → "Codespaces" → "Create codespace". Setup runs automatically.

```bash
cd examples/eliza-demo
pnpm run dev
```

**Option 2: Local**

```bash
git clone https://github.com/kamiyo-ai/kamiyo-protocol
cd kamiyo-protocol
pnpm install
pnpm --filter @kamiyo/sdk build
pnpm --filter @kamiyo/eliza build
cd examples/eliza-demo
pnpm install
pnpm run dev
```

## What This Demonstrates

The demo runs an autonomous agent loop showing Kamiyo's core capabilities:

### 1. ZK Reputation Verification
Agents prove they meet a reputation threshold without revealing their actual score. The verifier only learns "this agent has >= 75% success rate" - not the exact number.

### 2. SMT Blacklist Exclusion
Agents prove they're NOT on a blacklist using sparse Merkle tree exclusion proofs. No central authority needed to verify.

### 3. Autonomous Escrow + SLA
- Consumer agent creates escrow for work
- Provider agent delivers
- Quality is evaluated automatically
- If quality >= threshold: funds release
- If quality < threshold: dispute triggers, partial refund calculated

### 4. Automatic Blacklisting
Providers with repeated low quality get added to the blacklist. Future consumers can verify non-membership with ZK proofs.

## Output

```
━━━ AUTONOMOUS AGENT LOOP ━━━

▸ Phase 1: Provider Discovery with ZK Verification
  Checking Beta...
  ✓ Beta: Not blacklisted (SMT proof: 256 siblings)
  ✓ Beta: ZK proof verified (>= 75%)
    Commitment: 8a3f2b1c9d4e5f67...
  ✓ Beta: Credential issued (TTL: 24h)

▸ Phase 2: Multi-Provider Escrow Creation
  ✓ Escrow escrow_m3x7... created
    Alpha -> Beta: 0.001432 SOL

▸ Phase 3: Service Consumption & Autonomous Evaluation
  Beta delivered service...
  ✓ Quality: 87% (PASS)

▸ Phase 4: Autonomous Settlement
  ✓ Released: escrow_m3x7... -> Beta
```

## Live Mode

Run with real Solana transactions:

```bash
# Generate a devnet wallet
solana-keygen new -o ~/.config/solana/devnet.json

# Get devnet SOL
solana airdrop 1 --url devnet

# Export key and run
export SOLANA_PRIVATE_KEY=$(cat ~/.config/solana/devnet.json)
export KAMIYO_NETWORK=devnet
npm run dev
```

## Integration

```typescript
import { KamiyoClient, Shield, Blacklist } from '@kamiyo/sdk';

// Verify provider with ZK proof
const shield = new Shield(providerPubkey);
shield.setRep({ successful: 85, total: 100, disputesWon: 2, disputesLost: 1 });

if (shield.meetsThreshold(80)) {
  const commitment = shield.commitment();
  // Provider proves >= 80% without revealing 85%
}

// Check blacklist
const blacklist = new Blacklist();
const proof = blacklist.exclusionProof(providerPubkey);
// proof.verify() returns true if provider is NOT blacklisted
```

## Config

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_PRIVATE_KEY` | Keypair JSON array for live mode | - |
| `KAMIYO_NETWORK` | `mainnet` or `devnet` | `devnet` |
| `KAMIYO_QUALITY_THRESHOLD` | SLA threshold (0-100) | `80` |
