/*
 * AgenC ZK module - wraps tetsuo_ctx for reputation proofs
 */

#include "agenc_zk.h"
#include "tetsuo.h"
#include "field.h"
#include <stdlib.h>
#include <string.h>
#include <stdatomic.h>

/* Forward declaration for internal Poseidon */
extern void poseidon_hash_public(field_t *out, const field_t *inputs, size_t count);

/* Global initialization state */
static atomic_bool g_agenc_initialized = false;

/* Internal context structure */
struct agenc_zk_ctx {
    tetsuo_ctx_t *tetsuo_ctx;
};

struct agenc_zk_batch {
    agenc_zk_ctx_t *ctx;
    tetsuo_batch_t *batch;
    uint8_t *commitments;    /* Array of expected commitments */
    uint16_t *thresholds;    /* Array of expected thresholds */
    size_t count;
    size_t capacity;
};

agenc_zk_result_t agenc_zk_init(void) {
    bool expected = false;
    if (atomic_compare_exchange_strong(&g_agenc_initialized, &expected, true)) {
        tetsuo_result_t r = tetsuo_init();
        if (r != TETSUO_OK) {
            atomic_store(&g_agenc_initialized, false);
            return AGENC_ZK_ERR_NOT_INITIALIZED;
        }
    }
    return AGENC_ZK_OK;
}

void agenc_zk_cleanup(void) {
    if (atomic_load(&g_agenc_initialized)) {
        tetsuo_cleanup();
        atomic_store(&g_agenc_initialized, false);
    }
}

agenc_zk_ctx_t *agenc_zk_ctx_create(const uint8_t *vk_data, size_t vk_len) {
    if (!atomic_load(&g_agenc_initialized)) {
        if (agenc_zk_init() != AGENC_ZK_OK) {
            return NULL;
        }
    }

    agenc_zk_ctx_t *ctx = malloc(sizeof(agenc_zk_ctx_t));
    if (!ctx) return NULL;

    tetsuo_config_t config = {
        .max_proof_age = 0,       /* No expiry for agent proofs */
        .min_threshold = 0,
        .vk_data = vk_data,
        .vk_len = vk_len,
    };
    memset(config.blacklist_root, 0, 32);

    ctx->tetsuo_ctx = tetsuo_ctx_create(&config);
    if (!ctx->tetsuo_ctx) {
        free(ctx);
        return NULL;
    }

    return ctx;
}

void agenc_zk_ctx_destroy(agenc_zk_ctx_t *ctx) {
    if (!ctx) return;
    if (ctx->tetsuo_ctx) {
        tetsuo_ctx_destroy(ctx->tetsuo_ctx);
    }
    free(ctx);
}

/*
 * Generate commitment: Poseidon(score, secret)
 *
 * Score is scaled from 0-10000 to a field element.
 * Secret is interpreted as a 256-bit field element.
 */
agenc_zk_result_t agenc_zk_commit(
    uint16_t score,
    const uint8_t secret[32],
    uint8_t commitment[32]
) {
    if (!secret || !commitment) {
        return AGENC_ZK_ERR_INVALID_PARAM;
    }
    if (score > 10000) {
        return AGENC_ZK_ERR_INVALID_SCORE;
    }

    field_t inputs[2];
    field_t output;

    /* Convert score to field element */
    field_set_zero(&inputs[0]);
    inputs[0].limbs[0] = score;
    field_to_mont(&inputs[0], &inputs[0]);

    /* Convert secret to field element */
    field_from_bytes(&inputs[1], secret);
    field_to_mont(&inputs[1], &inputs[1]);

    /* Compute Poseidon hash */
    poseidon_hash_public(&output, inputs, 2);

    /* Convert output to bytes */
    field_from_mont(&output, &output);
    field_to_bytes(commitment, &output);

    return AGENC_ZK_OK;
}

agenc_zk_result_t agenc_zk_verify(
    agenc_zk_ctx_t *ctx,
    const agenc_zk_proof_t *proof,
    const uint8_t commitment[32],
    uint16_t threshold
) {
    if (!ctx || !proof || !commitment) {
        return AGENC_ZK_ERR_INVALID_PARAM;
    }
    if (threshold > 10000) {
        return AGENC_ZK_ERR_INVALID_THRESHOLD;
    }

    /* Check commitment matches */
    if (memcmp(proof->commitment, commitment, 32) != 0) {
        return AGENC_ZK_ERR_COMMITMENT_MISMATCH;
    }

    /* Check threshold matches */
    uint16_t proof_threshold = (proof->threshold >> 8) | (proof->threshold << 8); /* big-endian */
    if (proof_threshold < threshold) {
        return AGENC_ZK_ERR_BELOW_THRESHOLD;
    }

    /* Verify the Groth16 proof */
    tetsuo_result_t r = tetsuo_verify(ctx->tetsuo_ctx, (const tetsuo_proof_t *)proof);

    switch (r) {
        case TETSUO_OK:
            return AGENC_ZK_OK;
        case TETSUO_ERR_INVALID_PROOF:
            return AGENC_ZK_ERR_INVALID_PROOF;
        case TETSUO_ERR_BELOW_THRESHOLD:
            return AGENC_ZK_ERR_BELOW_THRESHOLD;
        default:
            return AGENC_ZK_ERR_INVALID_PROOF;
    }
}

agenc_zk_tier_t agenc_zk_get_tier(uint16_t threshold) {
    if (threshold >= AGENC_THRESHOLD_PLATINUM) return AGENC_TIER_PLATINUM;
    if (threshold >= AGENC_THRESHOLD_GOLD) return AGENC_TIER_GOLD;
    if (threshold >= AGENC_THRESHOLD_SILVER) return AGENC_TIER_SILVER;
    if (threshold >= AGENC_THRESHOLD_BRONZE) return AGENC_TIER_BRONZE;
    return AGENC_TIER_UNVERIFIED;
}

uint16_t agenc_zk_get_threshold(agenc_zk_tier_t tier) {
    switch (tier) {
        case AGENC_TIER_PLATINUM: return AGENC_THRESHOLD_PLATINUM;
        case AGENC_TIER_GOLD: return AGENC_THRESHOLD_GOLD;
        case AGENC_TIER_SILVER: return AGENC_THRESHOLD_SILVER;
        case AGENC_TIER_BRONZE: return AGENC_THRESHOLD_BRONZE;
        default: return 0;
    }
}

bool agenc_zk_qualifies(uint16_t score, agenc_zk_tier_t tier) {
    return score >= agenc_zk_get_threshold(tier);
}

/* Batch verification */
agenc_zk_batch_t *agenc_zk_batch_create(agenc_zk_ctx_t *ctx, size_t capacity) {
    if (!ctx || capacity == 0) return NULL;

    agenc_zk_batch_t *batch = malloc(sizeof(agenc_zk_batch_t));
    if (!batch) return NULL;

    batch->ctx = ctx;
    batch->batch = tetsuo_batch_create(ctx->tetsuo_ctx, capacity);
    if (!batch->batch) {
        free(batch);
        return NULL;
    }

    batch->commitments = malloc(capacity * 32);
    batch->thresholds = malloc(capacity * sizeof(uint16_t));
    if (!batch->commitments || !batch->thresholds) {
        if (batch->commitments) free(batch->commitments);
        if (batch->thresholds) free(batch->thresholds);
        tetsuo_batch_destroy(batch->batch);
        free(batch);
        return NULL;
    }

    batch->count = 0;
    batch->capacity = capacity;

    return batch;
}

agenc_zk_result_t agenc_zk_batch_add(
    agenc_zk_batch_t *batch,
    const agenc_zk_proof_t *proof,
    const uint8_t commitment[32],
    uint16_t threshold
) {
    if (!batch || !proof || !commitment) {
        return AGENC_ZK_ERR_INVALID_PARAM;
    }
    if (batch->count >= batch->capacity) {
        return AGENC_ZK_ERR_INVALID_PARAM;
    }

    /* Store expected values for post-verification check */
    memcpy(batch->commitments + batch->count * 32, commitment, 32);
    batch->thresholds[batch->count] = threshold;
    batch->count++;

    /* Add to tetsuo batch */
    tetsuo_batch_add(batch->batch, (const tetsuo_proof_t *)proof);

    return AGENC_ZK_OK;
}

agenc_zk_result_t agenc_zk_batch_verify(agenc_zk_batch_t *batch) {
    if (!batch) return AGENC_ZK_ERR_INVALID_PARAM;

    tetsuo_result_t r = tetsuo_batch_verify(batch->batch);
    return (r == TETSUO_OK) ? AGENC_ZK_OK : AGENC_ZK_ERR_INVALID_PROOF;
}

void agenc_zk_batch_get_results(
    agenc_zk_batch_t *batch,
    agenc_zk_result_t *results,
    size_t *count
) {
    if (!batch || !results || !count) return;

    tetsuo_result_t *tetsuo_results = malloc(batch->count * sizeof(tetsuo_result_t));
    if (!tetsuo_results) {
        *count = 0;
        return;
    }

    size_t n;
    tetsuo_batch_get_results(batch->batch, tetsuo_results, &n);

    for (size_t i = 0; i < n; i++) {
        switch (tetsuo_results[i]) {
            case TETSUO_OK:
                results[i] = AGENC_ZK_OK;
                break;
            case TETSUO_ERR_INVALID_PROOF:
                results[i] = AGENC_ZK_ERR_INVALID_PROOF;
                break;
            case TETSUO_ERR_BELOW_THRESHOLD:
                results[i] = AGENC_ZK_ERR_BELOW_THRESHOLD;
                break;
            default:
                results[i] = AGENC_ZK_ERR_INVALID_PROOF;
                break;
        }
    }

    free(tetsuo_results);
    *count = n;
}

void agenc_zk_batch_destroy(agenc_zk_batch_t *batch) {
    if (!batch) return;
    if (batch->commitments) free(batch->commitments);
    if (batch->thresholds) free(batch->thresholds);
    if (batch->batch) tetsuo_batch_destroy(batch->batch);
    free(batch);
}
