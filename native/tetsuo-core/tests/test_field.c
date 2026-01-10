/*
 * tetsuo-core: Field arithmetic tests
 */

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

static void test_add_identity(void) {
    field_t a, zero, result;

    /* Random element */
    a.limbs[0] = 0x123456789abcdef0ULL;
    a.limbs[1] = 0xfedcba9876543210ULL;
    a.limbs[2] = 0x0011223344556677ULL;
    a.limbs[3] = 0x1234567890abcdefULL & 0x30644e72e131a028ULL;  /* Ensure < p */
    field_to_mont(&a, &a);

    field_set_zero(&zero);

    field_add(&result, &a, &zero);
    assert(field_eq(&result, &a));

    field_add(&result, &zero, &a);
    assert(field_eq(&result, &a));
}

static void test_add_inverse(void) {
    field_t a, neg_a, result;

    a.limbs[0] = 0xdeadbeefcafebabeULL;
    a.limbs[1] = 0x1234567890abcdefULL;
    a.limbs[2] = 0xfedcba0987654321ULL;
    a.limbs[3] = 0x1000000000000000ULL;
    field_to_mont(&a, &a);

    field_neg(&neg_a, &a);
    field_add(&result, &a, &neg_a);

    assert(field_is_zero(&result));
}

static void test_mul_identity(void) {
    field_t a, one, result;

    a.limbs[0] = 0xaabbccddeeff0011ULL;
    a.limbs[1] = 0x2233445566778899ULL;
    a.limbs[2] = 0x99887766554433ULL;
    a.limbs[3] = 0x1234ULL;
    field_to_mont(&a, &a);

    field_set_one(&one);

    field_mul(&result, &a, &one);
    assert(field_eq(&result, &a));

    field_mul(&result, &one, &a);
    assert(field_eq(&result, &a));
}

static void test_mul_zero(void) {
    field_t a, zero, result;

    a.limbs[0] = 0x1111111111111111ULL;
    a.limbs[1] = 0x2222222222222222ULL;
    a.limbs[2] = 0x3333333333333333ULL;
    a.limbs[3] = 0x0444444444444444ULL;
    field_to_mont(&a, &a);

    field_set_zero(&zero);

    field_mul(&result, &a, &zero);
    assert(field_is_zero(&result));
}

static void test_mul_commutative(void) {
    field_t a, b, ab, ba;

    a.limbs[0] = 0x1234ULL;
    a.limbs[1] = 0x5678ULL;
    a.limbs[2] = 0x9abcULL;
    a.limbs[3] = 0xdef0ULL;
    field_to_mont(&a, &a);

    b.limbs[0] = 0xfedcULL;
    b.limbs[1] = 0xba98ULL;
    b.limbs[2] = 0x7654ULL;
    b.limbs[3] = 0x3210ULL;
    field_to_mont(&b, &b);

    field_mul(&ab, &a, &b);
    field_mul(&ba, &b, &a);

    assert(field_eq(&ab, &ba));
}

static void test_sqr_consistency(void) {
    field_t a, sqr_result, mul_result;

    a.limbs[0] = 0xabcdULL;
    a.limbs[1] = 0xef01ULL;
    a.limbs[2] = 0x2345ULL;
    a.limbs[3] = 0x6789ULL;
    field_to_mont(&a, &a);

    field_sqr(&sqr_result, &a);
    field_mul(&mul_result, &a, &a);

    assert(field_eq(&sqr_result, &mul_result));
}

static void test_inv(void) {
    field_t a, inv_a, result, one;

    a.limbs[0] = 0x1234567890abcdefULL;
    a.limbs[1] = 0xfedcba0987654321ULL;
    a.limbs[2] = 0x0011223344556677ULL;
    a.limbs[3] = 0x8899aabbccddeeffULL & 0x30644e72e131a028ULL;
    field_to_mont(&a, &a);

    field_inv(&inv_a, &a);
    field_mul(&result, &a, &inv_a);

    field_set_one(&one);
    assert(field_eq(&result, &one));
}

static void test_batch_inv(void) {
    field_t inputs[8], outputs[8], check[8], one;

    for (int i = 0; i < 8; i++) {
        inputs[i].limbs[0] = i + 1;
        inputs[i].limbs[1] = i * 2 + 3;
        inputs[i].limbs[2] = i * 4 + 5;
        inputs[i].limbs[3] = i * 8 + 7;
        field_to_mont(&inputs[i], &inputs[i]);
    }

    field_batch_inv(outputs, inputs, 8);
    field_set_one(&one);

    for (int i = 0; i < 8; i++) {
        field_mul(&check[i], &inputs[i], &outputs[i]);
        assert(field_eq(&check[i], &one));
    }
}

static void test_serialization(void) {
    field_t original, restored;
    uint8_t bytes[32];

    original.limbs[0] = 0x0102030405060708ULL;
    original.limbs[1] = 0x090a0b0c0d0e0f10ULL;
    original.limbs[2] = 0x1112131415161718ULL;
    original.limbs[3] = 0x191a1b1c1d1e1f20ULL;

    field_to_bytes(bytes, &original);
    field_from_bytes(&restored, bytes);

    assert(field_eq(&original, &restored));
}

static void test_mont_roundtrip(void) {
    field_t original, mont, restored;

    original.limbs[0] = 0x42ULL;
    original.limbs[1] = 0;
    original.limbs[2] = 0;
    original.limbs[3] = 0;

    field_to_mont(&mont, &original);
    field_from_mont(&restored, &mont);

    assert(field_eq(&original, &restored));
}

int main(void) {
    printf("\n");
    printf("tetsuo-core: Field Arithmetic Tests\n");
    printf("════════════════════════════════════════════════\n\n");

    TEST(add_identity);
    TEST(add_inverse);
    TEST(mul_identity);
    TEST(mul_zero);
    TEST(mul_commutative);
    TEST(sqr_consistency);
    TEST(inv);
    TEST(batch_inv);
    TEST(serialization);
    TEST(mont_roundtrip);

    printf("\n════════════════════════════════════════════════\n");
    printf("All tests passed.\n\n");

    return 0;
}
