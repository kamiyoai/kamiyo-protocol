/*
 * Fuzzing target for proof parsing
 * Build: clang -fsanitize=fuzzer,address -g -Isrc fuzz/fuzz_proof.c lib/libtetsuo.a -o fuzz_proof
 * Run: ./fuzz_proof corpus/ -max_total_time=300
 */

#include "tetsuo.h"
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
    static tetsuo_ctx_t *ctx = NULL;

    if (!initialized) {
        tetsuo_init();
        tetsuo_config_t config = {
            .min_threshold = 0,
            .max_proof_age = UINT32_MAX,
        };
        ctx = tetsuo_ctx_create(&config);
        initialized = 1;
    }

    if (!ctx) return 0;

    /* Create proof from fuzz data */
    tetsuo_proof_t proof;
    memcpy(&proof, data, sizeof(proof_wire_t));

    /* Try to verify - should not crash */
    tetsuo_result_t result = tetsuo_verify(ctx, &proof);
    (void)result;

    /* Also try batch verification */
    if (size >= sizeof(proof_wire_t) * 2) {
        tetsuo_batch_t *batch = tetsuo_batch_create(ctx, 4);
        if (batch) {
            tetsuo_batch_add(batch, &proof);

            tetsuo_proof_t proof2;
            memcpy(&proof2, data + sizeof(proof_wire_t),
                   size - sizeof(proof_wire_t) > sizeof(proof_wire_t)
                       ? sizeof(proof_wire_t)
                       : size - sizeof(proof_wire_t));
            tetsuo_batch_add(batch, &proof2);

            tetsuo_batch_verify(batch);
        }
    }

    return 0;
}
