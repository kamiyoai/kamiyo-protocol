# AgenC ZK Reputation Module

Privacy-preserving reputation proofs for the [AgenC](https://github.com/tetsuo-ai/AgenC) framework.

Agents prove their reputation exceeds a threshold without revealing the actual score. Native C implementation for sub-millisecond verification.

## Overview

Current AgenC stores reputation publicly:

```c
// AgenC AgentRegistration (public)
typedef struct {
    uint8_t agent_id[32];
    uint16_t reputation;  // Anyone can see
    // ...
} AgentRegistration;
```

With ZK module, reputation is private:

```c
// AgenC AgentRegistration (private)
typedef struct {
    uint8_t agent_id[32];
    uint8_t commitment[32];   // Poseidon(score, secret)
    uint8_t verified_tier;    // Proven via ZK, not actual score
    // ...
} AgentRegistration;
```

## API

```c
#include "agenc_zk.h"

// Initialize
agenc_zk_init();

// Generate commitment (on agent registration)
uint8_t commitment[32];
agenc_zk_commit(score, secret, commitment);

// Verify proof (agent-to-agent trust)
agenc_zk_ctx_t *ctx = agenc_zk_ctx_create(vk_data, vk_len);
agenc_zk_result_t r = agenc_zk_verify(ctx, &proof, commitment, threshold);

// Tier utilities
agenc_zk_tier_t tier = agenc_zk_get_tier(threshold);
bool qualifies = agenc_zk_qualifies(score, AGENC_TIER_GOLD);
```

## Tier Thresholds

| Tier     | Threshold | AgenC Mapping |
|----------|-----------|---------------|
| Bronze   | 2500      | Basic agent   |
| Silver   | 5000      | Verified      |
| Gold     | 7500      | Trusted       |
| Platinum | 9000      | Elite         |

## Build

```bash
cd native/tetsuo-core
make static
# Output: lib/libtetsuo.a
```

## Integration with AgenC

### 1. Link the library

```makefile
LDFLAGS += -L/path/to/tetsuo-core/lib -ltetsuo
CFLAGS += -I/path/to/tetsuo-core/src
```

### 2. Modify AgentRegistration

```c
// In state management
typedef struct {
    uint8_t agent_id[32];
    pubkey_t authority;
    uint32_t capabilities;
    uint8_t status;
    // Replace:
    // uint16_t reputation;
    // With:
    uint8_t reputation_commitment[32];
    uint8_t verified_tier;
    // ...
} AgentRegistration;
```

### 3. Registration flow

```c
// Agent generates commitment locally
uint8_t secret[32];
generate_random(secret, 32);  // Keep secret safe!

uint8_t commitment[32];
agenc_zk_commit(my_score, secret, commitment);

// Register with commitment (not score)
register_agent(agent_id, commitment, capabilities, ...);
```

### 4. Verification flow

```c
// Agent A wants to verify Agent B's reputation
// A sends challenge: "prove score >= 7500 (Gold)"

// B generates proof (using TypeScript SDK - runs locally)
// const proof = await prover.generateProof({ score, secret, threshold: 75 });

// A verifies (native C - <1ms)
agenc_zk_result_t r = agenc_zk_verify(ctx, &proof, b_commitment, 7500);
if (r == AGENC_ZK_OK) {
    // B is Gold tier or above
    // A does NOT know B's actual score
}
```

## Proof Generation

Proof generation requires witness computation and currently uses the TypeScript SDK:

```typescript
import { TetsuoProver } from '@kamiyo/tetsuo';

const prover = new TetsuoProver();
const proof = await prover.generateProof({
  score: 85,
  secret: mySecret,
  threshold: 75,  // Gold
});

// Send proof.proof_data to verifier
```

Verification is native C for maximum performance.

## Security Properties

1. **Zero Knowledge**: Verifier learns only that score >= threshold
2. **Soundness**: Cannot fake proofs for scores below threshold
3. **Non-transferable**: Proofs are bound to commitment
4. **Deterministic**: Same inputs produce same commitment

## Performance

| Operation          | Time    | Notes                    |
|--------------------|---------|--------------------------|
| Commitment         | <1ms    | Native Poseidon          |
| Proof Generation   | ~400ms  | TypeScript/snarkjs       |
| Verification (JS)  | ~8ms    | snarkjs                  |
| Verification (C)   | <1ms    | Native pairing           |
| Batch Verification | ~0.5ms  | Per proof, amortized     |

## Example

See `examples/agent_trust_demo.c` for a complete example.

```bash
cd examples
cc -O3 -I../src agent_trust_demo.c ../lib/libtetsuo.a -o agent_trust
./agent_trust
```

## License

BUSL-1.1 (same as KAMIYO Protocol)
