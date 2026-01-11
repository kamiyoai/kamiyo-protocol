/*
 * agenc_zk.h - ZK Reputation Module for AgenC
 *
 * Privacy-preserving reputation proofs for agent-to-agent trust.
 * Agents prove their reputation exceeds a threshold without revealing
 * the actual score.
 *
 * Integration with AgenC (https://github.com/tetsuo-ai/AgenC):
 *   #include "agenc_zk.h"
 *
 *   // Agent commits to reputation on registration
 *   agenc_zk_commit(score, secret, commitment);
 *
 *   // Agent proves tier to another agent
 *   agenc_zk_verify(proof, commitment, threshold);
 */

#ifndef AGENC_ZK_H
#define AGENC_ZK_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Export macro */
#ifdef _WIN32
#define AGENC_ZK_API __declspec(dllexport)
#else
#define AGENC_ZK_API __attribute__((visibility("default")))
#endif

/* Result codes */
typedef enum {
    AGENC_ZK_OK = 0,
    AGENC_ZK_ERR_INVALID_SCORE = 1,      /* Score not in 0-10000 range */
    AGENC_ZK_ERR_INVALID_THRESHOLD = 2,  /* Threshold not in 0-10000 range */
    AGENC_ZK_ERR_INVALID_PROOF = 3,      /* Proof verification failed */
    AGENC_ZK_ERR_BELOW_THRESHOLD = 4,    /* Score below threshold */
    AGENC_ZK_ERR_COMMITMENT_MISMATCH = 5,/* Proof commitment doesn't match */
    AGENC_ZK_ERR_INVALID_PARAM = 100,    /* NULL pointer or invalid param */
    AGENC_ZK_ERR_NOT_INITIALIZED = 101,  /* Library not initialized */
} agenc_zk_result_t;

/* Reputation tiers (matching AgenC capability levels) */
typedef enum {
    AGENC_TIER_UNVERIFIED = 0,  /* Default, no proof submitted */
    AGENC_TIER_BRONZE = 1,      /* Score >= 2500 */
    AGENC_TIER_SILVER = 2,      /* Score >= 5000 */
    AGENC_TIER_GOLD = 3,        /* Score >= 7500 */
    AGENC_TIER_PLATINUM = 4,    /* Score >= 9000 */
} agenc_zk_tier_t;

/* Tier thresholds (out of 10000) */
#define AGENC_THRESHOLD_BRONZE   2500
#define AGENC_THRESHOLD_SILVER   5000
#define AGENC_THRESHOLD_GOLD     7500
#define AGENC_THRESHOLD_PLATINUM 9000

/*
 * ZK Proof structure (330 bytes, wire-compatible with tetsuo_proof_t)
 *
 * proof_data layout (256 bytes):
 *   [0-63]    A point (G1): x (32) + y (32)
 *   [64-191]  B point (G2): x_re (32) + x_im (32) + y_re (32) + y_im (32)
 *   [192-255] C point (G1): x (32) + y (32)
 */
#pragma pack(push, 1)
typedef struct {
    uint8_t type;           /* Proof type (0 = reputation) */
    uint8_t version;        /* Protocol version */
    uint16_t threshold;     /* Proven threshold (big-endian) */
    uint32_t timestamp;     /* Generation timestamp */
    uint8_t agent_id[32];   /* Agent identifier */
    uint8_t commitment[32]; /* Poseidon(score, secret) */
    uint8_t proof_data[256];/* Groth16 proof */
} agenc_zk_proof_t;
#pragma pack(pop)

/* Verification context handle */
typedef struct agenc_zk_ctx agenc_zk_ctx_t;

/*
 * Initialize the ZK module
 * Must be called before any other functions
 * Thread-safe, can be called multiple times
 */
AGENC_ZK_API agenc_zk_result_t agenc_zk_init(void);

/*
 * Cleanup and free all resources
 */
AGENC_ZK_API void agenc_zk_cleanup(void);

/*
 * Create a verification context
 * vk_data: Verification key bytes (from circuit setup)
 * vk_len: Length of verification key
 * Returns: Context handle or NULL on failure
 */
AGENC_ZK_API agenc_zk_ctx_t *agenc_zk_ctx_create(
    const uint8_t *vk_data,
    size_t vk_len
);

/*
 * Destroy a verification context
 */
AGENC_ZK_API void agenc_zk_ctx_destroy(agenc_zk_ctx_t *ctx);

/*
 * Generate a reputation commitment
 *
 * The commitment is Poseidon(score, secret) and can be stored publicly.
 * The score and secret must be kept private by the agent.
 *
 * score: Reputation score (0-10000)
 * secret: 32-byte random secret (caller must generate securely)
 * commitment: Output buffer for 32-byte commitment
 */
AGENC_ZK_API agenc_zk_result_t agenc_zk_commit(
    uint16_t score,
    const uint8_t secret[32],
    uint8_t commitment[32]
);

/*
 * Verify a ZK reputation proof
 *
 * Verifies that the prover knows a score >= threshold for the given commitment.
 * Does NOT reveal the actual score.
 *
 * ctx: Verification context
 * proof: ZK proof to verify
 * commitment: Expected commitment (from agent's public registration)
 * threshold: Minimum score threshold to verify
 *
 * Returns: AGENC_ZK_OK if proof is valid, error code otherwise
 */
AGENC_ZK_API agenc_zk_result_t agenc_zk_verify(
    agenc_zk_ctx_t *ctx,
    const agenc_zk_proof_t *proof,
    const uint8_t commitment[32],
    uint16_t threshold
);

/*
 * Get the tier for a given threshold
 */
AGENC_ZK_API agenc_zk_tier_t agenc_zk_get_tier(uint16_t threshold);

/*
 * Get the threshold for a given tier
 */
AGENC_ZK_API uint16_t agenc_zk_get_threshold(agenc_zk_tier_t tier);

/*
 * Check if a score qualifies for a tier
 */
AGENC_ZK_API bool agenc_zk_qualifies(uint16_t score, agenc_zk_tier_t tier);

/*
 * Batch verification for multiple proofs
 * More efficient than verifying one by one
 */
typedef struct agenc_zk_batch agenc_zk_batch_t;

AGENC_ZK_API agenc_zk_batch_t *agenc_zk_batch_create(
    agenc_zk_ctx_t *ctx,
    size_t capacity
);

AGENC_ZK_API agenc_zk_result_t agenc_zk_batch_add(
    agenc_zk_batch_t *batch,
    const agenc_zk_proof_t *proof,
    const uint8_t commitment[32],
    uint16_t threshold
);

AGENC_ZK_API agenc_zk_result_t agenc_zk_batch_verify(agenc_zk_batch_t *batch);

AGENC_ZK_API void agenc_zk_batch_get_results(
    agenc_zk_batch_t *batch,
    agenc_zk_result_t *results,
    size_t *count
);

AGENC_ZK_API void agenc_zk_batch_destroy(agenc_zk_batch_t *batch);

#ifdef __cplusplus
}
#endif

#endif /* AGENC_ZK_H */
