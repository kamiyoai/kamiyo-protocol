/*
 * tetsuo-core: Verification engine tests
 */

#include "../src/tetsuo.h"
#include "../src/verify.h"
#include "../src/arena.h"
#include "../src/field.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#define TEST(name) \
    do { \
        printf("  %-40s ", #name); \
        fflush(stdout); \
        test_##name(); \
        printf("OK\n"); \
    } while (0)

static void test_ctx_create_destroy(void) {
    tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
    assert(ctx != NULL);
    tetsuo_ctx_destroy(ctx);
}

static void test_ctx_with_config(void) {
    tetsuo_config_t config = {
        .min_threshold = 50,
        .max_proof_age = 3600,
    };
    memset(config.blacklist_root, 0, 32);
    config.vk_data = NULL;
    config.vk_len = 0;

    tetsuo_ctx_t *ctx = tetsuo_ctx_create(&config);
    assert(ctx != NULL);
    tetsuo_ctx_destroy(ctx);
}

static void test_batch_create(void) {
    tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
    assert(ctx != NULL);

    tetsuo_batch_t *batch = tetsuo_batch_create(ctx, 256);
    assert(batch != NULL);

    tetsuo_batch_destroy(batch);
    tetsuo_ctx_destroy(ctx);
}

static void test_proof_create(void) {
    tetsuo_proof_t proof;
    uint8_t agent_pk[32] = {0};
    uint8_t commitment[32] = {0};

    agent_pk[0] = 0x42;
    commitment[0] = 0x13;

    tetsuo_result_t r = tetsuo_proof_create(
        &proof,
        TETSUO_PROOF_REPUTATION,
        75,
        agent_pk,
        commitment,
        NULL,
        0
    );

    assert(r == TETSUO_OK); (void)r;
    assert(proof.type == TETSUO_PROOF_REPUTATION);
    assert(proof.version == 1);
    assert(proof.flags == 75);
    assert(memcmp(proof.agent_pk, agent_pk, 32) == 0);
    assert(memcmp(proof.commitment, commitment, 32) == 0);
}

static void test_proof_malformed(void) {
    tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
    assert(ctx != NULL);

    tetsuo_proof_t proof;
    memset(&proof, 0, sizeof(proof));
    proof.version = 99;  /* Invalid version */

    tetsuo_result_t r = tetsuo_verify(ctx, &proof);
    assert(r == TETSUO_ERR_MALFORMED); (void)r;

    tetsuo_ctx_destroy(ctx);
}

static void test_threshold_check(void) {
    tetsuo_config_t config = {
        .min_threshold = 50,
        .max_proof_age = 0,
    };

    tetsuo_ctx_t *ctx = tetsuo_ctx_create(&config);
    assert(ctx != NULL);

    tetsuo_proof_t proof;
    uint8_t agent_pk[32] = {1};
    uint8_t commitment[32] = {2};

    /* Create proof with threshold below minimum */
    tetsuo_proof_create(&proof, TETSUO_PROOF_REPUTATION, 30, agent_pk, commitment, NULL, 0);

    tetsuo_result_t r = tetsuo_verify(ctx, &proof);
    assert(r == TETSUO_ERR_BELOW_THRESHOLD); (void)r;

    tetsuo_ctx_destroy(ctx);
}

static void test_nullifier_computation(void) {
    uint8_t agent_pk[32] = {0};
    uint8_t nullifier1[32], nullifier2[32];

    agent_pk[0] = 0x42;

    tetsuo_compute_nullifier(nullifier1, agent_pk, 0);
    tetsuo_compute_nullifier(nullifier2, agent_pk, 1);

    /* Different nonces should produce different nullifiers */
    int same = memcmp(nullifier1, nullifier2, 32) == 0;
    assert(!same); (void)same;
}

static void test_nullifier_deterministic(void) {
    uint8_t agent_pk[32] = {0};
    uint8_t nullifier1[32], nullifier2[32];

    agent_pk[0] = 0x42;

    tetsuo_compute_nullifier(nullifier1, agent_pk, 12345);
    tetsuo_compute_nullifier(nullifier2, agent_pk, 12345);

    /* Same inputs should produce same output */
    assert(memcmp(nullifier1, nullifier2, 32) == 0);
}

static void test_batch_empty(void) {
    tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
    tetsuo_batch_t *batch = tetsuo_batch_create(ctx, 256);

    tetsuo_result_t r = tetsuo_batch_verify(batch);
    assert(r == TETSUO_OK); (void)r;

    tetsuo_batch_destroy(batch);
    tetsuo_ctx_destroy(ctx);
}

static void test_batch_add_verify(void) {
    tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
    tetsuo_batch_t *batch = tetsuo_batch_create(ctx, 256);

    uint8_t agent_pk[32] = {1, 2, 3};
    uint8_t commitment[32] = {4, 5, 6};
    uint8_t proof_data[128];
    memset(proof_data, 0x42, 128);

    tetsuo_proof_t proof;
    tetsuo_proof_create(&proof, TETSUO_PROOF_REPUTATION, 80, agent_pk, commitment, proof_data, 128);

    tetsuo_result_t r = tetsuo_batch_add(batch, &proof);
    assert(r == TETSUO_OK); (void)r;

    r = tetsuo_batch_verify(batch);
    assert(r == TETSUO_OK);

    tetsuo_batch_destroy(batch);
    tetsuo_ctx_destroy(ctx);
}

static void test_arena_basic(void) {
    arena_t *arena = arena_create(4096);
    assert(arena != NULL);

    void *p1 = arena_alloc(arena, 64);
    assert(p1 != NULL); (void)p1;

    void *p2 = arena_alloc(arena, 128);
    assert(p2 != NULL);
    assert(p2 != p1); (void)p2;

    arena_destroy(arena);
}

static void test_arena_checkpoint(void) {
    arena_t *arena = arena_create(4096);

    void *p1 = arena_alloc(arena, 64);
    (void)p1;
    arena_checkpoint_t cp = arena_checkpoint(arena);

    void *p2 = arena_alloc(arena, 128);
    (void)p2;

    size_t used_before = arena_used(arena);
    arena_restore(arena, cp);
    size_t used_after = arena_used(arena);

    assert(used_after < used_before);
    (void)used_before; (void)used_after;

    arena_destroy(arena);
}

static void test_stats(void) {
    tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
    tetsuo_stats_t stats;

    tetsuo_get_stats(ctx, &stats);
    assert(stats.total_verified == 0);
    assert(stats.total_failed == 0);

    tetsuo_ctx_destroy(ctx);
}

static void test_point_infinity(void) {
    point_t p;
    field_set_zero(&p.x);
    field_set_one(&p.y);
    field_set_zero(&p.z);

    /* Verify z=0 indicates infinity */
    assert(field_is_zero(&p.z));
}

static void test_poseidon_consistency(void) {
    /* Test that poseidon produces consistent outputs */
    field_t input1, input2;
    field_set_zero(&input1);
    field_set_zero(&input2);
    input1.limbs[0] = 1;
    input2.limbs[0] = 1;
    field_to_mont(&input1, &input1);
    field_to_mont(&input2, &input2);

    /* Same input should give same output - tested via nullifier */
    uint8_t pk[32] = {0};
    pk[0] = 1;
    uint8_t out1[32], out2[32];
    tetsuo_compute_nullifier(out1, pk, 0);
    tetsuo_compute_nullifier(out2, pk, 0);
    assert(memcmp(out1, out2, 32) == 0);
}

int main(void) {
    printf("\n");
    printf("tetsuo-core: Verification Engine Tests\n");
    printf("========================================================\n\n");

    tetsuo_init();

    TEST(ctx_create_destroy);
    TEST(ctx_with_config);
    TEST(batch_create);
    TEST(proof_create);
    TEST(proof_malformed);
    TEST(threshold_check);
    TEST(nullifier_computation);
    TEST(nullifier_deterministic);
    TEST(batch_empty);
    TEST(batch_add_verify);
    TEST(arena_basic);
    TEST(arena_checkpoint);
    TEST(stats);
    TEST(point_infinity);
    TEST(poseidon_consistency);

    tetsuo_cleanup();

    printf("\n========================================================\n");
    printf("All tests passed.\n\n");

    return 0;
}
