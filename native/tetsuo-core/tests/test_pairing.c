/*
 * Pairing module tests
 */

#include "pairing.h"
#include "field.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int tests_run = 0;
static int tests_passed = 0;

#define TEST(name) do { \
    printf("  %-40s ", #name); \
    tests_run++; \
    if (test_##name()) { \
        printf("OK\n"); \
        tests_passed++; \
    } else { \
        printf("FAIL\n"); \
    } \
} while(0)

static int test_pairing_init(void) {
    bool result = pairing_init();
    return result == true;
}

static int test_pairing_is_initialized(void) {
    return pairing_is_initialized() == true;
}

static int test_g1_infinity(void) {
    g1_t p;
    g1_set_infinity(&p);
    return g1_is_infinity(&p) == true;
}

static int test_g2_infinity(void) {
    g2_t p;
    g2_set_infinity(&p);
    return g2_is_infinity(&p) == true;
}

static int test_gt_identity(void) {
    /* Skip if pairing not available */
    if (!pairing_is_initialized()) return 1;

    g1_t g1_inf;
    g2_t g2_inf;
    gt_t result;

    g1_set_infinity(&g1_inf);
    g2_set_infinity(&g2_inf);

    /* Pairing with infinity should give identity */
    bool ok = pairing_compute(&result, &g1_inf, &g2_inf);
    if (!ok) return 0;

    return gt_is_one(&result);
}

static int test_groth16_rejects_invalid(void) {
    /* Verify that groth16_verify rejects invalid proofs */
    if (!pairing_is_initialized()) return 1;

    groth16_vk_t vk;
    memset(&vk, 0, sizeof(vk));

    /* Create a minimal VK with 1 IC element */
    g1_set_infinity(&vk.alpha);
    g2_set_infinity(&vk.beta);
    g2_set_infinity(&vk.gamma);
    g2_set_infinity(&vk.delta);

    /* Allocate IC array */
    vk.ic = malloc(2 * sizeof(g1_t));
    if (!vk.ic) return 0;
    vk.ic_len = 2;
    g1_set_infinity(&vk.ic[0]);
    g1_set_infinity(&vk.ic[1]);

    /* Create an invalid proof (all infinity points) */
    groth16_proof_t proof;
    g1_set_infinity(&proof.a);
    g2_set_infinity(&proof.b);
    g1_set_infinity(&proof.c);

    field_t input;
    memset(&input, 0, sizeof(input));
    input.limbs[0] = 42;

    /* Should fail because proof points are at infinity */
    bool result = groth16_verify(&vk, &proof, &input, 1);

    free(vk.ic);

    /* Verification should fail for this invalid proof */
    return result == false;
}

static int test_groth16_api_available(void) {
    /* Just verify the API is callable */
    if (!pairing_is_initialized()) return 1;

    /* Create minimal VK */
    groth16_vk_t vk;
    memset(&vk, 0, sizeof(vk));
    vk.ic_len = 0;
    vk.ic = NULL;

    groth16_proof_t proof;
    memset(&proof, 0, sizeof(proof));

    /* Should fail due to ic_len mismatch */
    bool result = groth16_verify(&vk, &proof, NULL, 0);

    /* Expected: false (ic_len=0, but num_inputs+1=1) */
    return result == false;
}

int main(void) {
    printf("\ntetsuo-core: Pairing Module Tests\n");
    printf("========================================================\n\n");

    TEST(pairing_init);
    TEST(pairing_is_initialized);
    TEST(g1_infinity);
    TEST(g2_infinity);
    TEST(gt_identity);
    TEST(groth16_api_available);
    TEST(groth16_rejects_invalid);

    printf("\n========================================================\n");
    if (tests_passed == tests_run) {
        printf("All tests passed.\n");
        return 0;
    } else {
        printf("FAILED: %d/%d tests passed.\n", tests_passed, tests_run);
        return 1;
    }
}
