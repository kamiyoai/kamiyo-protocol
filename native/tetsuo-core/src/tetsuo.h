/*
 * tetsuo-core: Public API
 *
 * Native proof verification engine for TETSUO × KAMIYO
 * High-performance implementation optimized for batch operations
 */

#ifndef TETSUO_H
#define TETSUO_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Version info */
#define TETSUO_VERSION_MAJOR 0
#define TETSUO_VERSION_MINOR 1
#define TETSUO_VERSION_PATCH 0

/* Export macro */
#ifdef _WIN32
#define TETSUO_API __declspec(dllexport)
#else
#define TETSUO_API __attribute__((visibility("default")))
#endif

/* Handle types */
typedef struct tetsuo_ctx tetsuo_ctx_t;
typedef struct tetsuo_batch tetsuo_batch_t;

/* Result codes */
typedef enum {
    TETSUO_OK = 0,
    TETSUO_ERR_INVALID_PROOF = 1,
    TETSUO_ERR_BELOW_THRESHOLD = 2,
    TETSUO_ERR_EXPIRED = 3,
    TETSUO_ERR_MALFORMED = 4,
    TETSUO_ERR_BLACKLISTED = 5,
    TETSUO_ERR_OUT_OF_MEMORY = 100,
    TETSUO_ERR_INVALID_PARAM = 101,
} tetsuo_result_t;

/* Proof types */
typedef enum {
    TETSUO_PROOF_REPUTATION = 0,
    TETSUO_PROOF_PAYMENT = 1,
    TETSUO_PROOF_INFERENCE = 2,
} tetsuo_proof_type_t;

/*
 * Wire format for proofs (330 bytes total)
 *
 * proof_data layout (256 bytes):
 *   [0-63]    A point (G1): x (32) + y (32)
 *   [64-191]  B point (G2): x_re (32) + x_im (32) + y_re (32) + y_im (32)
 *   [192-255] C point (G1): x (32) + y (32)
 */
#pragma pack(push, 1)
typedef struct {
    uint8_t type;
    uint8_t version;
    uint16_t flags;
    uint32_t timestamp;
    uint8_t agent_pk[32];
    uint8_t commitment[32];
    uint8_t proof_data[256];
} tetsuo_proof_t;
#pragma pack(pop)

/* Configuration */
typedef struct {
    uint32_t max_proof_age;      /* Maximum age in seconds (0 = no limit) */
    uint8_t min_threshold;       /* Minimum reputation threshold */
    uint8_t blacklist_root[32];  /* SMT root for blacklist */
    const uint8_t *vk_data;      /* Verification key bytes */
    size_t vk_len;               /* Verification key length */
} tetsuo_config_t;

/* Verification statistics */
typedef struct {
    uint64_t total_verified;
    uint64_t total_failed;
    uint64_t total_batches;
    uint64_t avg_batch_size;
    uint64_t peak_memory_usage;
    double avg_verify_time_us;
} tetsuo_stats_t;

/*
 * Initialize the library
 * Must be called before any other functions
 * Returns TETSUO_OK on success
 */
TETSUO_API tetsuo_result_t tetsuo_init(void);

/*
 * Cleanup and free all resources
 */
TETSUO_API void tetsuo_cleanup(void);

/*
 * Create a verification context
 * config: Configuration options (can be NULL for defaults)
 * Returns: Context handle or NULL on failure
 */
TETSUO_API tetsuo_ctx_t *tetsuo_ctx_create(const tetsuo_config_t *config);

/*
 * Destroy a verification context
 */
TETSUO_API void tetsuo_ctx_destroy(tetsuo_ctx_t *ctx);

/*
 * Update context configuration
 */
TETSUO_API tetsuo_result_t tetsuo_ctx_set_time(tetsuo_ctx_t *ctx, uint64_t timestamp);
TETSUO_API tetsuo_result_t tetsuo_ctx_set_threshold(tetsuo_ctx_t *ctx, uint8_t threshold);
TETSUO_API tetsuo_result_t tetsuo_ctx_set_blacklist(tetsuo_ctx_t *ctx, const uint8_t *root);

/*
 * Verify a single proof
 * ctx: Verification context
 * proof: Proof data
 * Returns: TETSUO_OK if valid, error code otherwise
 */
TETSUO_API tetsuo_result_t tetsuo_verify(tetsuo_ctx_t *ctx, const tetsuo_proof_t *proof);

/*
 * Create a batch verification context
 * ctx: Parent verification context
 * capacity: Maximum number of proofs in batch
 * Returns: Batch handle or NULL on failure
 */
TETSUO_API tetsuo_batch_t *tetsuo_batch_create(tetsuo_ctx_t *ctx, size_t capacity);

/*
 * Add a proof to the batch
 * batch: Batch context
 * proof: Proof data
 * Returns: TETSUO_OK on success
 */
TETSUO_API tetsuo_result_t tetsuo_batch_add(tetsuo_batch_t *batch, const tetsuo_proof_t *proof);

/*
 * Verify all proofs in the batch
 * Uses optimized batch verification with random linear combination
 * Returns: TETSUO_OK if all proofs verified, error code otherwise
 */
TETSUO_API tetsuo_result_t tetsuo_batch_verify(tetsuo_batch_t *batch);

/*
 * Get individual results after batch verification
 * batch: Batch context
 * results: Array to receive results (must have capacity elements)
 * count: Receives number of results
 */
TETSUO_API void tetsuo_batch_get_results(
    tetsuo_batch_t *batch,
    tetsuo_result_t *results,
    size_t *count
);

/*
 * Reset batch for reuse
 */
TETSUO_API void tetsuo_batch_reset(tetsuo_batch_t *batch);

/*
 * Destroy batch context
 */
TETSUO_API void tetsuo_batch_destroy(tetsuo_batch_t *batch);

/*
 * Get verification statistics
 */
TETSUO_API void tetsuo_get_stats(tetsuo_ctx_t *ctx, tetsuo_stats_t *stats);

/*
 * Utility: Create proof from components
 */
TETSUO_API tetsuo_result_t tetsuo_proof_create(
    tetsuo_proof_t *proof,
    tetsuo_proof_type_t type,
    uint8_t threshold,
    const uint8_t *agent_pk,
    const uint8_t *commitment,
    const uint8_t *proof_bytes,
    size_t proof_len
);

/*
 * Utility: Compute nullifier
 */
TETSUO_API void tetsuo_compute_nullifier(
    uint8_t *out,
    const uint8_t *agent_pk,
    uint64_t nonce
);

/*
 * Utility: Verify SMT exclusion proof
 */
TETSUO_API bool tetsuo_verify_exclusion(
    const uint8_t *root,
    const uint8_t *leaf,
    const uint8_t *proof,
    size_t proof_len
);

#ifdef __cplusplus
}
#endif

#endif /* TETSUO_H */
