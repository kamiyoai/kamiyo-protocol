# tetsuo-core

High-performance native proof verification engine for TETSUO × KAMIYO integration.

## Status

**Current: Full Groth16 verification available with mcl integration.**

The library supports two modes:
1. **With mcl (`USE_MCL=1`)**: Full cryptographic Groth16 verification using BN254 optimal ate pairing
2. **Without mcl**: Structural validation only (proof parsing, timestamps, thresholds, curve membership)

## Features

**Complete:**
- Montgomery arithmetic - Optimized 256-bit field operations for BN254
- Dedicated squaring - 27% faster than multiplication via Karatsuba-style optimization
- Montgomery's trick - 98x speedup for batch inversions
- Custom arena allocator - Zero-fragmentation, cache-aligned memory management
- x86-64 assembly - BMI2 MULX instruction chains when available
- Constant-time operations - All field ops, comparisons, and selections are constant-time
- Secure RNG - /dev/urandom (Unix) or BCryptGenRandom (Windows)
- Poseidon hash - x^5 S-box, 8 full + 57 partial rounds
- Pippenger MSM - Multi-scalar multiplication for batch verification
- Curve point validation - Prevents invalid curve attacks
- Input validation - Bounds checking and error propagation
- **BN254 pairing** - Via mcl library integration (G1, G2, GT operations, Miller loop, final exp)
- **Groth16 verification** - Full pairing-based proof verification

## Build

```bash
# Without pairing (structural validation only)
make                    # Release build with LTO
make DEBUG=1            # Debug build with sanitizers
make test               # Run all tests
make bench              # Build benchmarks

# With mcl pairing (full Groth16 verification)
# First install mcl: brew install mcl (macOS) or apt install libmcl-dev (Linux)
make USE_MCL=1          # Build with pairing support
make USE_MCL=1 test     # Run tests with pairing
```

## Performance

BN254 256-bit field on Apple M1:

| Operation | Time | Throughput |
|-----------|------|------------|
| field_add | 14 ns | 71 M/s |
| field_mul | 74 ns | 13 M/s |
| field_sqr | 54 ns | 18 M/s |
| field_inv | 16 μs | 62 K/s |
| batch_inv (256) | 165 ns/elem | 6 M/s |
| arena_alloc | 4 ns | 266 M/s |
| pairing (mcl) | ~1.2 ms | 830/s |
| groth16_verify | ~3.8 ms | 260/s |

Batch inversion achieves **98x** speedup over individual inversions.

## API

```c
#include <tetsuo.h>

tetsuo_init();

tetsuo_config_t config = {
    .min_threshold = 70,
    .max_proof_age = 3600,
};
tetsuo_ctx_t *ctx = tetsuo_ctx_create(&config);

// Single verification
tetsuo_result_t result = tetsuo_verify(ctx, &proof);

// Batch verification
tetsuo_batch_t *batch = tetsuo_batch_create(ctx, 256);
for (int i = 0; i < n; i++) {
    tetsuo_batch_add(batch, &proofs[i]);
}
tetsuo_batch_verify(batch);

tetsuo_result_t results[256];
size_t count;
tetsuo_batch_get_results(batch, results, &count);

tetsuo_ctx_destroy(ctx);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Public API (tetsuo.h)                   │
├─────────────────────────────────────────────────────────────┤
│  Verification Engine (verify.c)                             │
│  ├── Groth16 proof parsing                                  │
│  ├── Batch verification (random linear combination)         │
│  ├── Pippenger multi-scalar multiplication                  │
│  ├── Poseidon hash (t=3, alpha=5, R_F=8, R_P=57)           │
│  ├── Curve point validation                                 │
│  └── SMT exclusion proof verification                       │
├─────────────────────────────────────────────────────────────┤
│  Pairing (pairing.c)           │  Field Arithmetic (field.c)
│  ├── G1/G2/GT operations       │  ├── Montgomery mul/sqr
│  ├── Optimal ate pairing       │  ├── Fermat inversion
│  ├── Multi-pairing (Miller)    │  ├── Batch inversion
│  ├── Final exponentiation      │  ├── x86-64 ASM (BMI2)
│  └── mcl library wrapper       │  └── Constant-time selection
├─────────────────────────────────────────────────────────────┤
│  Arena Allocator (arena.c)                                  │
│  ├── mmap-backed blocks        ├── Checkpoint/restore       │
│  ├── Lock-free refcount        ├── Thread-local scratch     │
│  └── Overflow protection                                    │
└─────────────────────────────────────────────────────────────┘
```

## Security

- Constant-time field operations prevent timing side-channels
- Constant-time comparisons and conditional selections
- Secure random number generation (fails closed, no fallback)
- Curve point validation prevents invalid curve attacks
- Subgroup membership checks for G1/G2 points
- Memory zeroization after sensitive operations
- Integer overflow protection in allocator
- Input validation and bounds checking
- Thread-local arenas prevent data races

## Thread Safety

- Context objects are not thread-safe; use one per thread
- Arena operations are lock-free for allocations
- Call `scratch_arena_destroy()` before thread exit to prevent leaks
- mcl library is thread-safe after initialization

## Installing mcl

**macOS:**
```bash
brew install mcl
```

**Ubuntu/Debian:**
```bash
apt install libmcl-dev
```

**From source:**
```bash
git clone https://github.com/herumi/mcl
cd mcl
make -j4
sudo make install
```

## License

MIT
