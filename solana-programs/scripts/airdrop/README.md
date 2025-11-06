# KAMIYO Airdrop Merkle Tree Scripts

This directory contains scripts to generate merkle trees for the KAMIYO airdrop program.

## Overview

The KAMIYO airdrop uses a merkle tree to efficiently store eligibility information on-chain. Instead of storing a full list of eligible wallets and their allocations (which would be prohibitively expensive), we:

1. Generate a merkle tree off-chain from the allocation data
2. Store only the merkle root (32 bytes) on-chain
3. Users provide merkle proofs when claiming to verify their eligibility

## Scripts

### TypeScript Version: `generate-merkle-tree.ts`

**Requirements:**
```bash
npm install @solana/web3.js js-sha3
```

**Usage:**
```bash
ts-node generate-merkle-tree.ts <input_csv> <output_json>
```

**Example:**
```bash
ts-node generate-merkle-tree.ts example-allocations.csv merkle-tree.json
```

### Python Version: `generate_merkle_tree.py`

**Requirements:**
```bash
pip install base58 pycryptodome
```

**Usage:**
```bash
python generate_merkle_tree.py <input_csv> <output_json>
```

**Example:**
```bash
python generate_merkle_tree.py example-allocations.csv merkle-tree.json
```

## Input Format

The input CSV file should have the following format:

```csv
wallet_address,points,allocation_kamiyo
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU,5000,10000
5Ghq4q5XLB4JUFy5YvGGaF5Vz8ZQjX8fJYy7TLZ8dZ8m,2500,5000
9Xkg9q5XLB4JUFy5YvGGaF5Vz8ZQjX8fJYy7TLZ8dZ8m,1000,2000
```

**Columns:**
- `wallet_address`: Solana wallet address (base58)
- `points`: Points earned from the Align-to-Earn system
- `allocation_kamiyo`: KAMIYO allocation in tokens (not lamports)

**Constraints:**
- Minimum allocation: 100 KAMIYO
- Maximum allocation: 10,000 KAMIYO (hardcap per wallet)
- Total allocation: Should sum to ≤100,000,000 KAMIYO

## Output Format

The output JSON contains:

```json
{
  "merkleRoot": "a1b2c3d4...",
  "totalAllocations": 1000,
  "totalTokens": "100000000000000000",
  "totalTokensKAMIYO": 100000000,
  "treeHeight": 10,
  "leaves": [...],
  "proofs": [
    {
      "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "amount": "10000000000000",
      "amountKAMIYO": 10000,
      "proof": [
        "hash1...",
        "hash2...",
        ...
      ]
    }
  ],
  "generatedAt": "2025-10-28T12:00:00.000Z"
}
```

**Fields:**
- `merkleRoot`: 32-byte hex string to store on-chain
- `totalAllocations`: Number of eligible wallets
- `totalTokens`: Total allocation in lamports (string for precision)
- `totalTokensKAMIYO`: Total allocation in KAMIYO (human-readable)
- `treeHeight`: Number of levels in the tree
- `leaves`: All leaf nodes with hashes
- `proofs`: Merkle proofs for each wallet to claim
- `generatedAt`: Timestamp of generation

## How Merkle Trees Work

### Concept

A merkle tree is a binary tree where:
- **Leaves**: Each eligible wallet gets a leaf node (hash of wallet + amount)
- **Branches**: Parent nodes are hashes of their two children
- **Root**: The top node represents the entire tree with a single 32-byte hash

### Why Use Merkle Trees?

**Without merkle tree (naive approach):**
- Store all 20,000 wallets and amounts on-chain
- Cost: ~20,000 accounts × 72 bytes × 0.00001 SOL = ~14.4 SOL
- Plus: Complex account management, high rent costs

**With merkle tree:**
- Store only 1 merkle root (32 bytes) on-chain
- Cost: ~0.002 SOL for the root
- Users provide proofs when claiming (no on-chain storage needed)
- **96%+ cost savings**

### Merkle Proof Verification

When a user claims:

1. **User provides:**
   - Wallet address
   - Allocation amount
   - Merkle proof (array of sibling hashes)

2. **On-chain verification:**
   - Hash leaf = keccak256(wallet || amount)
   - For each proof element:
     - parent = keccak256(sort(current, proof_element))
   - Check if computed root == stored root

3. **If valid:** Transfer tokens
4. **If invalid:** Reject claim

### Example

```
Tree with 4 users:

                 ROOT
                /    \
              H12     H34
             /  \    /  \
           H1   H2  H3  H4
           |    |   |   |
         User1 U2  U3  U4

User1's proof: [H2, H34]
Verification:
  - Compute H1 = hash(User1, amount)
  - Compute H12 = hash(H1, H2)
  - Compute ROOT = hash(H12, H34)
  - Check ROOT == stored_root ✓
```

## Integration with Points System

The allocation data comes from the Align-to-Earn points system:

### Point Sources

| Source | Points | Cap |
|--------|--------|-----|
| Twitter follow | 50 | 1x |
| Discord join | 50 | 1x |
| Quality replies | 10 | 50/day |
| Testnet usage | 100 | 1x |
| x402 payments | 5 | Unlimited |
| Referrals | 100 | Unlimited |
| Early adopter | 500 | 1x |

### Allocation Formula

```
user_allocation = (user_points / total_points) * 100M KAMIYO
```

**Example:**
- User earns 5,000 points
- Total points across all users: 10,000,000
- Allocation = (5,000 / 10,000,000) × 100M = 50,000 KAMIYO
- But capped at 10,000 KAMIYO maximum

### Anti-Sybil Filters

Before generating the merkle tree, filter eligible users:

```python
def filter_eligible(users):
    eligible = []
    for user in users:
        # Check Twitter account age
        if user.twitter_age < 30: continue

        # Check minimum activity
        if user.points < 100: continue

        # Check not flagged as bot
        if user.risk_score > 0.7: continue

        eligible.append(user)
    return eligible
```

## Deployment Workflow

### Phase 1: Generate Merkle Tree

```bash
# From points system database, export allocations
psql -d kamiyo -c "COPY (
  SELECT wallet_address, total_points, final_allocation
  FROM airdrop_points
  WHERE total_points >= 100 AND risk_score < 0.5
) TO '/tmp/allocations.csv' CSV HEADER"

# Generate merkle tree
python generate_merkle_tree.py /tmp/allocations.csv merkle-tree.json

# Review output
cat merkle-tree.json | jq '.merkleRoot'
```

### Phase 2: Initialize On-Chain

```bash
# Extract merkle root
MERKLE_ROOT=$(cat merkle-tree.json | jq -r '.merkleRoot')

# Initialize airdrop program
anchor run initialize-airdrop --provider.cluster devnet \
  --program-id <AIRDROP_PROGRAM_ID> \
  --merkle-root $MERKLE_ROOT
```

### Phase 3: Distribute Proofs

**Option 1: API Endpoint**
```typescript
// api/airdrop/proof/:wallet
app.get('/airdrop/proof/:wallet', (req, res) => {
  const merkleData = JSON.parse(fs.readFileSync('merkle-tree.json'));
  const proof = merkleData.proofs.find(p => p.address === req.params.wallet);

  if (!proof) {
    return res.status(404).json({ error: 'Not eligible' });
  }

  res.json(proof);
});
```

**Option 2: Frontend Generation**
```typescript
// Load merkle tree on frontend
import merkleData from './merkle-tree.json';

function getUserProof(walletAddress: string) {
  return merkleData.proofs.find(p => p.address === walletAddress);
}
```

### Phase 4: User Claims

```typescript
// User claims on frontend
const proof = getUserProof(wallet.publicKey.toBase58());

await program.methods
  .claim(new BN(proof.amount), proof.proof.map(h => Buffer.from(h, 'hex')))
  .accounts({
    claimant: wallet.publicKey,
    airdropConfig,
    claimStatus,
    vault,
    claimantTokenAccount,
    // ...
  })
  .rpc();
```

## Multi-Phase Airdrops

You can update the merkle root for multiple phases:

### Phase 1: Early Supporters (Week 14)
```bash
python generate_merkle_tree.py phase1-allocations.csv phase1-tree.json
# Initialize with phase1 root
```

### Phase 2: Beta Testers (Week 16)
```bash
# Combine Phase 1 + new Phase 2 users
cat phase1-allocations.csv phase2-new.csv > phase2-all.csv
python generate_merkle_tree.py phase2-all.csv phase2-tree.json

# Update merkle root on-chain
anchor run update-merkle-root --merkle-root <PHASE2_ROOT>
```

**Note:** Users who already claimed in Phase 1 cannot claim again (ClaimStatus PDA prevents double-claims).

## Security Considerations

### Merkle Tree Generation

1. **Deterministic Ordering**: Leaves are sorted by hash to ensure consistent root
2. **Keccak256 Hashing**: Matches Solana's `solana_program::keccak` implementation
3. **Little-Endian Encoding**: Amount is encoded as LE u64 (matches Rust)
4. **Address Validation**: All addresses are validated before hashing

### On-Chain Verification

1. **Proof Verification**: Merkle proof must be valid to claim
2. **Double-Claim Prevention**: ClaimStatus PDA enforced by Anchor `init` constraint
3. **Amount Validation**: Claimed amount must match the amount in the proof
4. **Time Window**: Claims only accepted within 90-day period
5. **Authority Checks**: Only admin can update root or reclaim tokens

## Troubleshooting

### Issue: "Invalid wallet address"
**Solution:** Ensure addresses are valid base58-encoded Solana public keys (44 chars)

### Issue: "Tree heights don't match"
**Solution:** Ensure you're using the same hashing algorithm (keccak256) and encoding (LE u64)

### Issue: "Proof verification fails on-chain"
**Solution:**
- Check that amount is in lamports (multiply by 1e9)
- Verify address matches exactly (case-sensitive)
- Ensure proof array is in correct order

### Issue: "Total allocation exceeds 100M"
**Solution:** Apply caps (10k max per wallet) and filters (min 100 KAMIYO) before generating tree

## Testing

Run the example to verify everything works:

```bash
# Generate tree from example data
ts-node generate-merkle-tree.ts example-allocations.csv test-tree.json

# Check output
cat test-tree.json | jq '.'

# Verify proof for first user
WALLET="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
cat test-tree.json | jq ".proofs[] | select(.address == \"$WALLET\")"
```

## Additional Resources

- [Merkle Trees Explained](https://en.wikipedia.org/wiki/Merkle_tree)
- [Solana Program Library](https://github.com/solana-labs/solana-program-library)
- [Anchor Framework](https://www.anchor-lang.com/)
- [KAMIYO Tokenomics](../../docs/phase1/KAMIYO_TOKENOMICS_WHITEPAPER.md)
- [Points System Design](../../docs/phase1/points_system_design.md)
