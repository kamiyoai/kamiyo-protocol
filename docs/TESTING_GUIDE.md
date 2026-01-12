# TETSUO ZK Reputation System - Testing Guide

This guide covers how to test the complete TETSUO stack from circuits to contracts to SDK.

## Prerequisites

- Node.js 20+
- Foundry (forge, cast)
- pnpm or npm

## 1. Circuit Artifacts

The ZK circuits must be compiled before running tests. Check if artifacts exist:

```bash
ls packages/kamiyo-tetsuo/artifacts/
```

Expected files:
- `reputation_threshold.wasm` - Circuit WASM
- `reputation_threshold_final.zkey` - Proving key
- `verification_key.json` - Verification key

If missing, build from source:

```bash
cd circuits
./scripts/build.sh
```

## 2. TETSUO SDK Tests

The SDK provides proof generation and verification in TypeScript.

```bash
cd packages/kamiyo-tetsuo
npm test
```

### What's tested:

- **Tier utilities**: `getTierThreshold`, `getQualifyingTier`, `qualifiesForTier`
- **Tier constants**: `DEFAULT_TIERS`, `TIER_THRESHOLDS`, `TIER_NAMES`
- **Commitment generation**: Poseidon hash of (score, secret)
- **Proof generation**: Groth16 proofs for tier thresholds
- **Proof verification**: Local verification with snarkjs
- **Edge cases**: Invalid scores, thresholds, tampered proofs

### Expected output:

```
✓ test/prover.test.ts (38 tests)
Test Files  1 passed (1)
Tests       38 passed (38)
```

## 3. ZK Reputation Contracts

Solidity contracts for on-chain verification.

```bash
cd contracts/zk-reputation
forge test -vvv
```

### What's tested:

**ZKReputation (V1)**:
- Agent registration with commitment
- Threshold to tier mapping
- Duplicate registration prevention

**ZKReputationV2**:
- UUPS upgradeable proxy
- Commitment uniqueness enforcement
- Agent unregistration
- Commitment updates with proof
- Tier decay over time
- Pause/unpause functionality
- Storage gap for future upgrades

### Expected output:

```
Ran 22 tests: 22 passed, 0 failed
```

## 4. Hyperliquid Contracts

Copy trading with ZK reputation tiers.

```bash
cd contracts/hyperliquid
forge test -vvv
```

### What's tested:

**AgentRegistry**:
- Agent registration with stake
- Stake management (add, withdraw)
- Deactivation/reactivation
- Slashing mechanism

**KamiyoVault**:
- Position opening with tier limits
- Position closing and disputes
- Emergency withdrawals
- Batch position updates

**ReputationLimits**:
- Tier-based copy limits
- ZK proof verification for tier upgrades
- Copier count enforcement

### Expected output:

```
Ran 68 tests: 68 passed, 0 failed
```

## 5. Monad Contracts

Agent proxy and reputation mirror contracts.

```bash
cd contracts/monad
forge test -vvv
```

### What's tested:

- Agent proxy initialization
- Reputation updates
- Swarm simulation execution
- Reputation mirroring with ZK proofs

### Expected output:

```
Ran 53 tests: 53 passed, 0 failed
```

## 6. Kamiyo SDK

Core SDK with privacy primitives and voting.

```bash
cd packages/kamiyo-sdk
npm test
```

### What's tested:

- Reputation API
- Shield credentials and blacklists
- Private voting with commitments
- E2E flows (PDAs, instructions)

### Expected output:

```
Test Suites: 8 passed
Tests: 115 passed, 2 skipped
```

## 7. Full Test Suite

Run everything from the repo root:

```bash
# TypeScript packages
cd packages/kamiyo-tetsuo && npm test && cd ..
cd packages/kamiyo-sdk && npm test && cd ..

# Solidity contracts
cd contracts/zk-reputation && forge test && cd ..
cd contracts/hyperliquid && forge test && cd ..
cd contracts/monad && forge test && cd ..
```

## 8. Manual Proof Generation

Test proof generation manually:

```bash
cd packages/kamiyo-tetsuo
npx ts-node -e "
const { TetsuoProver } = require('./dist');

async function main() {
  const prover = new TetsuoProver();

  // Generate commitment for score 85
  const commitment = await prover.generateCommitment(85);
  console.log('Commitment:', commitment.value.toString(16).slice(0, 16) + '...');

  // Generate proof for Gold tier (threshold 75)
  const proof = await prover.generateProof({
    score: 85,
    secret: commitment.secret,
    threshold: 75
  });
  console.log('Proof generated');
  console.log('Public inputs:', proof.publicInputs.map(x => x.toString()));

  // Verify locally
  const result = await prover.verifyProof(proof);
  console.log('Valid:', result.valid);
}

main().catch(console.error);
"
```

## Troubleshooting

### "Worker is not a constructor"

The vitest config uses `pool: 'forks'` to work around snarkjs Worker compatibility. If you see this error, ensure `vitest.config.ts` exists.

### "Bundled circuit artifacts not found"

Run the circuit build script or provide explicit paths:

```typescript
const prover = new TetsuoProver({
  wasmPath: '/path/to/circuit.wasm',
  zkeyPath: '/path/to/circuit.zkey',
});
```

### Forge test failures

Ensure submodules are initialized:

```bash
git submodule update --init --recursive
```

## Test Coverage Summary

| Component | Tests | Coverage |
|-----------|-------|----------|
| TETSUO SDK | 38 | Proof gen/verify, tiers |
| ZK Reputation | 22 | V1 + V2 contracts |
| Hyperliquid | 68 | Registry, vault, limits |
| Monad | 53 | Proxy, mirror, simulator |
| Kamiyo SDK | 115 | Privacy, voting, shield |
| **Total** | **296** | |
