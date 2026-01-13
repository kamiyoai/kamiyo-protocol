/*
 * Public API - thin wrapper over verify_ctx and batch_ctx
 */

#include "dark_forest.h"
#include "verify.h"
#include "arena.h"
#include "field.h"
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <stdatomic.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/time.h>
#endif

/* Internal context structure */
struct dark_forest_ctx {
    arena_t *arena;
    verify_ctx_t *verify;
    dark_forest_stats_t stats;
    uint64_t start_time;
};

struct dark_forest_batch {
    dark_forest_ctx_t *parent;
    batch_ctx_t *batch;
};

/* Global state - thread-safe initialization */
static atomic_bool g_initialized = false;

static uint64_t get_time_us(void) {
#ifdef _WIN32
    LARGE_INTEGER freq, count;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&count);
    return (uint64_t)(count.QuadPart * 1000000 / freq.QuadPart);
#else
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (uint64_t)tv.tv_sec * 1000000 + tv.tv_usec;
#endif
}

dark_forest_result_t dark_forest_init(void) {
    /* Thread-safe initialization using atomic exchange */
    bool expected = false;
    if (atomic_compare_exchange_strong(&g_initialized, &expected, true)) {
        /* We performed initialization */
        return DARK_FOREST_OK;
    }
    /* Already initialized by another thread */
    return DARK_FOREST_OK;
}

void dark_forest_cleanup(void) {
    atomic_store(&g_initialized, false);
}

dark_forest_ctx_t *dark_forest_ctx_create(const dark_forest_config_t *config) {
    if (!atomic_load(&g_initialized)) {
        if (dark_forest_init() != DARK_FOREST_OK) {
            return NULL;
        }
    }

    arena_t *arena = arena_create(0);
    if (!arena) return NULL;

    dark_forest_ctx_t *ctx = arena_alloc(arena, sizeof(dark_forest_ctx_t));
    if (!ctx) {
        arena_destroy(arena);
        return NULL;
    }

    ctx->arena = arena;
    ctx->verify = verify_ctx_create(arena);
    if (!ctx->verify) {
        arena_destroy(arena);
        return NULL;
    }

    memset(&ctx->stats, 0, sizeof(dark_forest_stats_t));

    if (config) {
        if (config->max_proof_age > 0) {
            ctx->verify->max_proof_age = config->max_proof_age;
        }
        ctx->verify->min_threshold = config->min_threshold;

        if (config->blacklist_root[0] || config->blacklist_root[1]) {
            memcpy(ctx->verify->blacklist_root, config->blacklist_root, 32);
        }

        if (config->vk_data && config->vk_len > 0) {
            verify_ctx_load_vk(ctx->verify, config->vk_data, config->vk_len);
        }
    }

    return ctx;
}

void dark_forest_ctx_destroy(dark_forest_ctx_t *ctx) {
    if (!ctx) return;
    arena_destroy(ctx->arena);
}

dark_forest_result_t dark_forest_ctx_set_time(dark_forest_ctx_t *ctx, uint64_t timestamp) {
    if (!ctx) return DARK_FOREST_ERR_INVALID_PARAM;
    verify_ctx_set_time(ctx->verify, timestamp);
    return DARK_FOREST_OK;
}

dark_forest_result_t dark_forest_ctx_set_threshold(dark_forest_ctx_t *ctx, uint8_t threshold) {
    if (!ctx) return DARK_FOREST_ERR_INVALID_PARAM;
    verify_ctx_set_threshold(ctx->verify, threshold);
    return DARK_FOREST_OK;
}

dark_forest_result_t dark_forest_ctx_set_blacklist(dark_forest_ctx_t *ctx, const uint8_t *root) {
    if (!ctx || !root) return DARK_FOREST_ERR_INVALID_PARAM;
    verify_ctx_set_blacklist(ctx->verify, root);
    return DARK_FOREST_OK;
}

static dark_forest_result_t convert_result(verify_result_t r) {
    switch (r) {
        case VERIFY_OK: return DARK_FOREST_OK;
        case VERIFY_INVALID_PROOF: return DARK_FOREST_ERR_INVALID_PROOF;
        case VERIFY_BELOW_THRESHOLD: return DARK_FOREST_ERR_BELOW_THRESHOLD;
        case VERIFY_EXPIRED: return DARK_FOREST_ERR_EXPIRED;
        case VERIFY_MALFORMED: return DARK_FOREST_ERR_MALFORMED;
        case VERIFY_BLACKLISTED: return DARK_FOREST_ERR_BLACKLISTED;
        default: return DARK_FOREST_ERR_INVALID_PROOF;
    }
}

dark_forest_result_t dark_forest_verify(dark_forest_ctx_t *ctx, const dark_forest_proof_t *proof) {
    if (!ctx || !proof) return DARK_FOREST_ERR_INVALID_PARAM;

    uint64_t start = get_time_us();

    verify_result_t r = verify_proof(ctx->verify, (const proof_wire_t *)proof);

    uint64_t elapsed = get_time_us() - start;

    ctx->stats.total_verified++;
    if (r != VERIFY_OK) {
        ctx->stats.total_failed++;
    }

    /* Update running average */
    ctx->stats.avg_verify_time_us =
        (ctx->stats.avg_verify_time_us * (ctx->stats.total_verified - 1) + elapsed) /
        ctx->stats.total_verified;

    size_t mem = arena_used(ctx->arena);
    if (mem > ctx->stats.peak_memory_usage) {
        ctx->stats.peak_memory_usage = mem;
    }

    return convert_result(r);
}

dark_forest_batch_t *dark_forest_batch_create(dark_forest_ctx_t *ctx, size_t capacity) {
    if (!ctx || capacity == 0) return NULL;

    dark_forest_batch_t *batch = arena_alloc(ctx->arena, sizeof(dark_forest_batch_t));
    if (!batch) return NULL;

    batch->parent = ctx;
    batch->batch = batch_create(ctx->verify, capacity);
    if (!batch->batch) return NULL;

    return batch;
}

dark_forest_result_t dark_forest_batch_add(dark_forest_batch_t *batch, const dark_forest_proof_t *proof) {
    if (!batch || !proof) return DARK_FOREST_ERR_INVALID_PARAM;
    batch_add(batch->batch, (const proof_wire_t *)proof);
    return DARK_FOREST_OK;
}

dark_forest_result_t dark_forest_batch_verify(dark_forest_batch_t *batch) {
    if (!batch) return DARK_FOREST_ERR_INVALID_PARAM;

    uint64_t start = get_time_us();

    bool ok = batch_verify(batch->batch);

    uint64_t elapsed = get_time_us() - start;

    batch->parent->stats.total_batches++;
    batch->parent->stats.total_verified += batch->batch->count;

    /* Count failures */
    for (size_t i = 0; i < batch->batch->count; i++) {
        if (batch->batch->results[i] != VERIFY_OK) {
            batch->parent->stats.total_failed++;
        }
    }

    /* Update average batch size */
    batch->parent->stats.avg_batch_size =
        (batch->parent->stats.avg_batch_size * (batch->parent->stats.total_batches - 1) +
         batch->batch->count) / batch->parent->stats.total_batches;

    /* Update timing - per proof */
    double per_proof = (double)elapsed / batch->batch->count;
    batch->parent->stats.avg_verify_time_us =
        (batch->parent->stats.avg_verify_time_us *
         (batch->parent->stats.total_verified - batch->batch->count) +
         per_proof * batch->batch->count) / batch->parent->stats.total_verified;

    size_t mem = arena_used(batch->parent->arena);
    if (mem > batch->parent->stats.peak_memory_usage) {
        batch->parent->stats.peak_memory_usage = mem;
    }

    return ok ? DARK_FOREST_OK : DARK_FOREST_ERR_INVALID_PROOF;
}

void dark_forest_batch_get_results(dark_forest_batch_t *batch, dark_forest_result_t *results, size_t *count) {
    if (!batch || !results || !count) return;

    *count = batch->batch->count;
    for (size_t i = 0; i < batch->batch->count; i++) {
        results[i] = convert_result(batch->batch->results[i]);
    }
}

void dark_forest_batch_reset(dark_forest_batch_t *batch) {
    if (!batch) return;
    batch_reset(batch->batch);
}

void dark_forest_batch_destroy(dark_forest_batch_t *batch) {
    /* Memory managed by parent arena */
    (void)batch;
}

void dark_forest_get_stats(dark_forest_ctx_t *ctx, dark_forest_stats_t *stats) {
    if (!ctx || !stats) return;
    memcpy(stats, &ctx->stats, sizeof(dark_forest_stats_t));
}

dark_forest_result_t dark_forest_proof_create(
    dark_forest_proof_t *proof,
    dark_forest_proof_type_t type,
    uint8_t threshold,
    const uint8_t *agent_pk,
    const uint8_t *commitment,
    const uint8_t *proof_bytes,
    size_t proof_len
) {
    if (!proof || !agent_pk || !commitment) {
        return DARK_FOREST_ERR_INVALID_PARAM;
    }

    memset(proof, 0, sizeof(dark_forest_proof_t));

    proof->type = (uint8_t)type;
    proof->version = 1;
    proof->flags = threshold;
    proof->timestamp = (uint32_t)time(NULL);

    memcpy(proof->agent_pk, agent_pk, 32);
    memcpy(proof->commitment, commitment, 32);

    if (proof_bytes && proof_len > 0) {
        size_t copy_len = proof_len < 256 ? proof_len : 256;
        memcpy(proof->proof_data, proof_bytes, copy_len);
    }

    return DARK_FOREST_OK;
}

void dark_forest_compute_nullifier(uint8_t *out, const uint8_t *agent_pk, uint64_t nonce) {
    if (!out || !agent_pk) return;

    field_t pk, result;
    field_from_bytes(&pk, agent_pk);
    field_to_mont(&pk, &pk);

    compute_nullifier(&result, &pk, nonce);

    field_from_mont(&result, &result);
    field_to_bytes(out, &result);
}

bool dark_forest_verify_exclusion(
    const uint8_t *root,
    const uint8_t *leaf,
    const uint8_t *proof,
    size_t proof_len
) {
    if (!root || !leaf || !proof) return false;

    field_t leaf_field;
    field_from_bytes(&leaf_field, leaf);
    field_to_mont(&leaf_field, &leaf_field);

    return verify_exclusion_proof(root, &leaf_field, proof, proof_len);
}
