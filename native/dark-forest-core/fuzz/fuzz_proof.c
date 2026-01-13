/*
 * Fuzzing target for proof parsing
 * Build: clang -fsanitize=fuzzer,address -g -Isrc fuzz/fuzz_proof.c lib/libdark_forest.a -o fuzz_proof
 * Run: ./fuzz_proof corpus/ -max_total_time=300
 */

#include "dark_forest.h"
#include "verify.h"
#include <stdint.h>
#include <stddef.h>
#include <string.h>

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    /* Need at least proof_wire_t size */
    if (size < sizeof(proof_wire_t)) {
        return 0;
    }

    /* Initialize library once */
    static int initialized = 0;
    static dark_forest_ctx_t *ctx = NULL;

    if (!initialized) {
        dark_forest_init();
        dark_forest_config_t config = {
            .min_threshold = 0,
            .max_proof_age = UINT32_MAX,
        };
        ctx = dark_forest_ctx_create(&config);
        initialized = 1;
    }

    if (!ctx) return 0;

    /* Create proof from fuzz data */
    dark_forest_proof_t proof;
    memcpy(&proof, data, sizeof(proof_wire_t));

    /* Try to verify - should not crash */
    dark_forest_result_t result = dark_forest_verify(ctx, &proof);
    (void)result;

    /* Also try batch verification */
    if (size >= sizeof(proof_wire_t) * 2) {
        dark_forest_batch_t *batch = dark_forest_batch_create(ctx, 4);
        if (batch) {
            dark_forest_batch_add(batch, &proof);

            dark_forest_proof_t proof2;
            memcpy(&proof2, data + sizeof(proof_wire_t),
                   size - sizeof(proof_wire_t) > sizeof(proof_wire_t)
                       ? sizeof(proof_wire_t)
                       : size - sizeof(proof_wire_t));
            dark_forest_batch_add(batch, &proof2);

            dark_forest_batch_verify(batch);
        }
    }

    return 0;
}
