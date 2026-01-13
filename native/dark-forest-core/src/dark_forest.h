/*
 * dark_forest-core public API
 *
 * Groth16 proof verification for ZK reputation.
 * Single and batch modes, arena-backed memory.
 */

#ifndef DARK_FOREST_H
#define DARK_FOREST_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Version info */
#define DARK_FOREST_VERSION_MAJOR 0
#define DARK_FOREST_VERSION_MINOR 1
#define DARK_FOREST_VERSION_PATCH 0

/* Export macro */
#ifdef _WIN32
#define DARK_FOREST_API __declspec(dllexport)
#else
#define DARK_FOREST_API __attribute__((visibility("default")))
#endif

/* Handle types */
typedef struct dark_forest_ctx dark_forest_ctx_t;
typedef struct dark_forest_batch dark_forest_batch_t;

/* Result codes */
typedef enum {
    DARK_FOREST_OK = 0,
    DARK_FOREST_ERR_INVALID_PROOF = 1,
    DARK_FOREST_ERR_BELOW_THRESHOLD = 2,
    DARK_FOREST_ERR_EXPIRED = 3,
    DARK_FOREST_ERR_MALFORMED = 4,
    DARK_FOREST_ERR_BLACKLISTED = 5,
    DARK_FOREST_ERR_OUT_OF_MEMORY = 100,
    DARK_FOREST_ERR_INVALID_PARAM = 101,
} dark_forest_result_t;

/* Proof types */
typedef enum {
    DARK_FOREST_PROOF_REPUTATION = 0,
    DARK_FOREST_PROOF_PAYMENT = 1,
    DARK_FOREST_PROOF_INFERENCE = 2,
} dark_forest_proof_type_t;

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
} dark_forest_proof_t;
#pragma pack(pop)

/* Configuration */
typedef struct {
    uint32_t max_proof_age;      /* Maximum age in seconds (0 = no limit) */
    uint8_t min_threshold;       /* Minimum reputation threshold */
    uint8_t blacklist_root[32];  /* SMT root for blacklist */
    const uint8_t *vk_data;      /* Verification key bytes */
    size_t vk_len;               /* Verification key length */
} dark_forest_config_t;

/* Verification statistics */
typedef struct {
    uint64_t total_verified;
    uint64_t total_failed;
    uint64_t total_batches;
    uint64_t avg_batch_size;
    uint64_t peak_memory_usage;
    double avg_verify_time_us;
} dark_forest_stats_t;

/*
 * Initialize the library
 * Must be called before any other functions
 * Returns DARK_FOREST_OK on success
 */
DARK_FOREST_API dark_forest_result_t dark_forest_init(void);

/*
 * Cleanup and free all resources
 */
DARK_FOREST_API void dark_forest_cleanup(void);

/*
 * Create a verification context
 * config: Configuration options (can be NULL for defaults)
 * Returns: Context handle or NULL on failure
 */
DARK_FOREST_API dark_forest_ctx_t *dark_forest_ctx_create(const dark_forest_config_t *config);

/*
 * Destroy a verification context
 */
DARK_FOREST_API void dark_forest_ctx_destroy(dark_forest_ctx_t *ctx);

/*
 * Update context configuration
 */
DARK_FOREST_API dark_forest_result_t dark_forest_ctx_set_time(dark_forest_ctx_t *ctx, uint64_t timestamp);
DARK_FOREST_API dark_forest_result_t dark_forest_ctx_set_threshold(dark_forest_ctx_t *ctx, uint8_t threshold);
DARK_FOREST_API dark_forest_result_t dark_forest_ctx_set_blacklist(dark_forest_ctx_t *ctx, const uint8_t *root);

/*
 * Verify a single proof
 * ctx: Verification context
 * proof: Proof data
 * Returns: DARK_FOREST_OK if valid, error code otherwise
 */
DARK_FOREST_API dark_forest_result_t dark_forest_verify(dark_forest_ctx_t *ctx, const dark_forest_proof_t *proof);

/*
 * Create a batch verification context
 * ctx: Parent verification context
 * capacity: Maximum number of proofs in batch
 * Returns: Batch handle or NULL on failure
 */
DARK_FOREST_API dark_forest_batch_t *dark_forest_batch_create(dark_forest_ctx_t *ctx, size_t capacity);

/*
 * Add a proof to the batch
 * batch: Batch context
 * proof: Proof data
 * Returns: DARK_FOREST_OK on success
 */
DARK_FOREST_API dark_forest_result_t dark_forest_batch_add(dark_forest_batch_t *batch, const dark_forest_proof_t *proof);

/*
 * Verify all proofs in the batch
 * Uses optimized batch verification with random linear combination
 * Returns: DARK_FOREST_OK if all proofs verified, error code otherwise
 */
DARK_FOREST_API dark_forest_result_t dark_forest_batch_verify(dark_forest_batch_t *batch);

/*
 * Get individual results after batch verification
 * batch: Batch context
 * results: Array to receive results (must have capacity elements)
 * count: Receives number of results
 */
DARK_FOREST_API void dark_forest_batch_get_results(
    dark_forest_batch_t *batch,
    dark_forest_result_t *results,
    size_t *count
);

/*
 * Reset batch for reuse
 */
DARK_FOREST_API void dark_forest_batch_reset(dark_forest_batch_t *batch);

/*
 * Destroy batch context
 */
DARK_FOREST_API void dark_forest_batch_destroy(dark_forest_batch_t *batch);

/*
 * Get verification statistics
 */
DARK_FOREST_API void dark_forest_get_stats(dark_forest_ctx_t *ctx, dark_forest_stats_t *stats);

/*
 * Utility: Create proof from components
 */
DARK_FOREST_API dark_forest_result_t dark_forest_proof_create(
    dark_forest_proof_t *proof,
    dark_forest_proof_type_t type,
    uint8_t threshold,
    const uint8_t *agent_pk,
    const uint8_t *commitment,
    const uint8_t *proof_bytes,
    size_t proof_len
);

/*
 * Utility: Compute nullifier
 */
DARK_FOREST_API void dark_forest_compute_nullifier(
    uint8_t *out,
    const uint8_t *agent_pk,
    uint64_t nonce
);

/*
 * Utility: Verify SMT exclusion proof
 */
DARK_FOREST_API bool dark_forest_verify_exclusion(
    const uint8_t *root,
    const uint8_t *leaf,
    const uint8_t *proof,
    size_t proof_len
);

#ifdef __cplusplus
}
#endif

#endif /* DARK_FOREST_H */
