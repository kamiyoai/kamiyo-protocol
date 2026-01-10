/*
 * tetsuo-core: Proof verification engine
 *
 * High-throughput batch verification for reputation and payment proofs
 * Optimized for the TETSUO × KAMIYO integration
 */

#ifndef TETSUO_VERIFY_H
#define TETSUO_VERIFY_H

#include "field.h"
#include "arena.h"
#include <stdint.h>
#include <stdbool.h>

/* Proof types */
typedef enum {
    PROOF_REPUTATION = 0,
    PROOF_PAYMENT = 1,
    PROOF_INFERENCE = 2,
} proof_type_t;

/* Verification result codes */
typedef enum {
    VERIFY_OK = 0,
    VERIFY_INVALID_PROOF = 1,
    VERIFY_BELOW_THRESHOLD = 2,
    VERIFY_EXPIRED = 3,
    VERIFY_MALFORMED = 4,
    VERIFY_BLACKLISTED = 5,
} verify_result_t;

/* Compressed proof format (wire representation) */
typedef struct {
    uint8_t type;
    uint8_t version;
    uint16_t flags;
    uint32_t timestamp;
    uint8_t agent_pk[32];
    uint8_t commitment[32];
    uint8_t proof_data[128];
} __attribute__((packed)) proof_wire_t;

/* Expanded proof for verification */
typedef struct {
    proof_type_t type;
    uint32_t timestamp;
    uint8_t threshold;
    field_t agent_pk;
    field_t commitment;
    field_t nullifier;
    point_t proof_point_a;
    point_t proof_point_b;
    point_t proof_point_c;
} proof_t;

/* Forward declaration for Groth16 VK */
struct groth16_vk;

/* Verification context */
typedef struct {
    arena_t *arena;
    uint64_t current_time;
    uint32_t max_proof_age;
    uint8_t min_threshold;
    /* Blacklist SMT root */
    uint8_t blacklist_root[32];
    /* Verification keys (precomputed) */
    point_t *vk_alpha;
    point_t *vk_beta;
    point_t *vk_gamma;
    point_t *vk_delta;
    field_t *vk_ic;
    size_t vk_ic_len;
    /* Groth16 verification key (for pairing-based verification) */
    struct groth16_vk *groth16_vk;
} verify_ctx_t;

/* Batch verification state */
typedef struct {
    verify_ctx_t *ctx;
    proof_t *proofs;
    verify_result_t *results;
    size_t count;
    size_t capacity;
    /* Randomness for batch verification */
    field_t *randoms;
    /* Accumulated pairing inputs */
    point_t *acc_g1;
    point_t *acc_g2;
} batch_ctx_t;

/* Context management */
verify_ctx_t *verify_ctx_create(arena_t *arena);
void verify_ctx_set_time(verify_ctx_t *ctx, uint64_t timestamp);
void verify_ctx_set_threshold(verify_ctx_t *ctx, uint8_t threshold);
void verify_ctx_set_blacklist(verify_ctx_t *ctx, const uint8_t *root);
bool verify_ctx_load_vk(verify_ctx_t *ctx, const uint8_t *vk_data, size_t len);

/* Single proof verification */
verify_result_t verify_proof(verify_ctx_t *ctx, const proof_wire_t *proof);
verify_result_t verify_proof_ex(verify_ctx_t *ctx, const proof_t *proof);

/* Batch verification */
batch_ctx_t *batch_create(verify_ctx_t *ctx, size_t capacity);
bool batch_add(batch_ctx_t *batch, const proof_wire_t *proof);
bool batch_verify(batch_ctx_t *batch);
void batch_get_results(batch_ctx_t *batch, verify_result_t *results);
void batch_reset(batch_ctx_t *batch);

/* Proof parsing */
bool proof_parse(proof_t *out, const proof_wire_t *wire);
bool proof_serialize(proof_wire_t *out, const proof_t *proof);

/* Utility */
void compute_nullifier(field_t *out, const field_t *agent_pk, uint64_t nonce);
bool verify_exclusion_proof(const uint8_t *root, const field_t *leaf,
                            const uint8_t *proof_data, size_t proof_len);

#endif /* TETSUO_VERIFY_H */
