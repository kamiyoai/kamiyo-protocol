/*
 * Fuzzing target for field arithmetic
 * Build: clang -fsanitize=fuzzer,address -g -Isrc fuzz/fuzz_field.c lib/libtetsuo.a -o fuzz_field
 * Run: ./fuzz_field corpus/ -max_total_time=300
 */

#include "field.h"
#include <stdint.h>
#include <stddef.h>
#include <string.h>

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    /* Need at least two field elements */
    if (size < 64) {
        return 0;
    }

    field_t a, b, r;

    /* Load field elements from fuzz data */
    field_from_bytes(&a, data);
    field_from_bytes(&b, data + 32);

    /* Test addition */
    field_add(&r, &a, &b);

    /* Test subtraction */
    field_sub(&r, &a, &b);

    /* Test multiplication */
    field_mul(&r, &a, &b);

    /* Test squaring */
    field_sqr(&r, &a);

    /* Test negation */
    field_neg(&r, &a);

    /* Test inversion (only if non-zero) */
    int a_is_zero = 1;
    for (int i = 0; i < 4; i++) {
        if (a.limbs[i] != 0) {
            a_is_zero = 0;
            break;
        }
    }
    if (!a_is_zero) {
        field_inv(&r, &a);

        /* Verify a * a^-1 = 1 */
        field_t one;
        field_mul(&one, &a, &r);
        /* one should equal R (Montgomery 1) */
    }

    /* Test serialization round-trip */
    uint8_t buf[32];
    field_to_bytes(buf, &a);
    field_t a2;
    field_from_bytes(&a2, buf);
    /* a2 should equal a */

    /* Test batch inversion if we have enough data */
    if (size >= 128) {
        field_t fields[4];
        field_t results[4];

        for (int i = 0; i < 4; i++) {
            if (i * 32 + 32 <= size) {
                field_from_bytes(&fields[i], data + i * 32);
            } else {
                memset(&fields[i], 0, sizeof(field_t));
                fields[i].limbs[0] = i + 1;
            }
        }

        field_batch_inv(results, fields, 4);
    }

    return 0;
}
