/*
 * Poseidon hash fuzzer
 *
 * Feeds random inputs to poseidon_hash_public to detect:
 * - Crashes on edge case inputs
 * - Undefined behavior in field operations
 * - Memory corruption
 */

#include "field.h"
#include <stdint.h>
#include <stddef.h>
#include <string.h>

/* From verify.c */
extern void poseidon_hash_public(field_t *out, const field_t *inputs, size_t count);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    field_t out;

    /* Test with 1 input (32 bytes) */
    if (size >= 32) {
        field_t in1;
        field_from_bytes(&in1, data);
        field_to_mont(&in1, &in1);
        poseidon_hash_public(&out, &in1, 1);
    }

    /* Test with 2 inputs (64 bytes) - commitment use case */
    if (size >= 64) {
        field_t inputs[2];
        field_from_bytes(&inputs[0], data);
        field_from_bytes(&inputs[1], data + 32);
        field_to_mont(&inputs[0], &inputs[0]);
        field_to_mont(&inputs[1], &inputs[1]);
        poseidon_hash_public(&out, inputs, 2);
    }

    /* Test with 3 inputs (96 bytes) - proof public input */
    if (size >= 96) {
        field_t inputs[3];
        field_from_bytes(&inputs[0], data);
        field_from_bytes(&inputs[1], data + 32);
        field_from_bytes(&inputs[2], data + 64);
        field_to_mont(&inputs[0], &inputs[0]);
        field_to_mont(&inputs[1], &inputs[1]);
        field_to_mont(&inputs[2], &inputs[2]);
        poseidon_hash_public(&out, inputs, 3);
    }

    /* Test with variable count up to 8 inputs */
    if (size >= 256) {
        field_t inputs[8];
        for (size_t i = 0; i < 8; i++) {
            field_from_bytes(&inputs[i], data + i * 32);
            field_to_mont(&inputs[i], &inputs[i]);
        }

        /* Vary count based on input */
        size_t count = (data[0] % 8) + 1;
        poseidon_hash_public(&out, inputs, count);
    }

    return 0;
}
