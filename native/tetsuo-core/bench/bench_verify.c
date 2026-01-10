/*
 * tetsuo-core: Verification benchmarks
 */

#include "../src/tetsuo.h"
#include "../src/verify.h"
#include "../src/arena.h"
#include "../src/field.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/time.h>
#endif

#define WARMUP_ITERS 100
#define BENCH_ITERS 10000
#define BATCH_SIZES_COUNT 5

static const size_t BATCH_SIZES[] = {1, 16, 64, 128, 256};

typedef struct {
    const char *name;
    uint64_t total_ns;
    uint64_t iters;
    size_t batch_size;
} bench_result_t;

static uint64_t get_ns(void) {
#ifdef _WIN32
    LARGE_INTEGER freq, count;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&count);
    return (uint64_t)(count.QuadPart * 1000000000ULL / freq.QuadPart);
#else
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + ts.tv_nsec;
#endif
}

static void random_bytes(uint8_t *buf, size_t len) {
    for (size_t i = 0; i < len; i++) {
        buf[i] = (uint8_t)rand();
    }
}

static void create_random_proof(tetsuo_proof_t *proof) {
    uint8_t agent_pk[32], commitment[32], proof_data[128];
    random_bytes(agent_pk, 32);
    random_bytes(commitment, 32);
    random_bytes(proof_data, 128);

    tetsuo_proof_create(
        proof,
        TETSUO_PROOF_REPUTATION,
        (uint8_t)(rand() % 100),
        agent_pk,
        commitment,
        proof_data,
        128
    );
}

static void print_result(bench_result_t *r) {
    double ns_per_op = (double)r->total_ns / r->iters;
    double ops_per_sec = 1e9 / ns_per_op;

    if (r->batch_size > 0) {
        double ns_per_proof = ns_per_op / r->batch_size;
        printf("  %-28s %8.2f us/batch  %8.2f ns/proof  %8.2f K proofs/sec\n",
               r->name, ns_per_op / 1000.0, ns_per_proof, ops_per_sec * r->batch_size / 1e3);
    } else {
        if (ops_per_sec >= 1e6) {
            printf("  %-28s %8.2f ns/op  %8.2f M ops/sec\n",
                   r->name, ns_per_op, ops_per_sec / 1e6);
        } else {
            printf("  %-28s %8.2f ns/op  %8.2f K ops/sec\n",
                   r->name, ns_per_op, ops_per_sec / 1e3);
        }
    }
}

static void bench_single_verify(bench_result_t *r) {
    tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
    tetsuo_proof_t proof;
    create_random_proof(&proof);

    /* Warmup */
    for (int i = 0; i < WARMUP_ITERS; i++) {
        tetsuo_verify(ctx, &proof);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < BENCH_ITERS; i++) {
        tetsuo_verify(ctx, &proof);
    }
    uint64_t end = get_ns();

    r->name = "single_verify";
    r->total_ns = end - start;
    r->iters = BENCH_ITERS;
    r->batch_size = 0;

    tetsuo_ctx_destroy(ctx);
}

static void bench_batch_verify(bench_result_t *r, size_t batch_size) {
    tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
    tetsuo_proof_t *proofs = malloc(batch_size * sizeof(tetsuo_proof_t));

    for (size_t i = 0; i < batch_size; i++) {
        create_random_proof(&proofs[i]);
    }

    int iters = BENCH_ITERS / batch_size;
    if (iters < 10) iters = 10;

    /* Warmup */
    for (int i = 0; i < WARMUP_ITERS / 10; i++) {
        tetsuo_batch_t *batch = tetsuo_batch_create(ctx, batch_size);
        for (size_t j = 0; j < batch_size; j++) {
            tetsuo_batch_add(batch, &proofs[j]);
        }
        tetsuo_batch_verify(batch);
        tetsuo_batch_destroy(batch);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < iters; i++) {
        tetsuo_batch_t *batch = tetsuo_batch_create(ctx, batch_size);
        for (size_t j = 0; j < batch_size; j++) {
            tetsuo_batch_add(batch, &proofs[j]);
        }
        tetsuo_batch_verify(batch);
        tetsuo_batch_destroy(batch);
    }
    uint64_t end = get_ns();

    static char name_buf[64];
    snprintf(name_buf, sizeof(name_buf), "batch_verify (%zu)", batch_size);
    r->name = name_buf;
    r->total_ns = end - start;
    r->iters = iters;
    r->batch_size = batch_size;

    free(proofs);
    tetsuo_ctx_destroy(ctx);
}

static void bench_proof_create(bench_result_t *r) {
    tetsuo_proof_t proof;
    uint8_t agent_pk[32], commitment[32], proof_data[128];

    random_bytes(agent_pk, 32);
    random_bytes(commitment, 32);
    random_bytes(proof_data, 128);

    /* Warmup */
    for (int i = 0; i < WARMUP_ITERS; i++) {
        tetsuo_proof_create(&proof, TETSUO_PROOF_REPUTATION, 50, agent_pk, commitment, proof_data, 128);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < BENCH_ITERS; i++) {
        tetsuo_proof_create(&proof, TETSUO_PROOF_REPUTATION, 50, agent_pk, commitment, proof_data, 128);
    }
    uint64_t end = get_ns();

    r->name = "proof_create";
    r->total_ns = end - start;
    r->iters = BENCH_ITERS;
    r->batch_size = 0;
}

static void bench_nullifier(bench_result_t *r) {
    uint8_t agent_pk[32], out[32];
    random_bytes(agent_pk, 32);

    /* Warmup */
    for (int i = 0; i < WARMUP_ITERS; i++) {
        tetsuo_compute_nullifier(out, agent_pk, i);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < BENCH_ITERS; i++) {
        tetsuo_compute_nullifier(out, agent_pk, i);
    }
    uint64_t end = get_ns();

    r->name = "compute_nullifier";
    r->total_ns = end - start;
    r->iters = BENCH_ITERS;
    r->batch_size = 0;
}

static void bench_ctx_lifecycle(bench_result_t *r) {
    int iters = BENCH_ITERS / 10;

    /* Warmup */
    for (int i = 0; i < WARMUP_ITERS / 10; i++) {
        tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
        tetsuo_ctx_destroy(ctx);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < iters; i++) {
        tetsuo_ctx_t *ctx = tetsuo_ctx_create(NULL);
        tetsuo_ctx_destroy(ctx);
    }
    uint64_t end = get_ns();

    r->name = "ctx_create_destroy";
    r->total_ns = end - start;
    r->iters = iters;
    r->batch_size = 0;
}

int main(void) {
    srand((unsigned)time(NULL));

    printf("\n");
    printf("+-----------------------------------------------------------+\n");
    printf("|         tetsuo-core Verification Benchmark                |\n");
    printf("+-----------------------------------------------------------+\n");
    printf("|  Measuring proof verification throughput                  |\n");
    printf("+-----------------------------------------------------------+\n");
    printf("\n");

    printf("Iterations: %d (warmup: %d)\n\n", BENCH_ITERS, WARMUP_ITERS);

    tetsuo_init();

    bench_result_t results[16];
    int n = 0;

    printf("Running benchmarks...\n\n");

    bench_single_verify(&results[n++]);
    bench_proof_create(&results[n++]);
    bench_nullifier(&results[n++]);
    bench_ctx_lifecycle(&results[n++]);

    printf("Core Operations:\n");
    printf("-----------------------------------------------------------\n");
    for (int i = 0; i < n; i++) {
        print_result(&results[i]);
    }
    printf("\n");

    /* Batch benchmarks */
    printf("Batch Verification (varying batch sizes):\n");
    printf("-----------------------------------------------------------\n");
    for (int i = 0; i < BATCH_SIZES_COUNT; i++) {
        bench_result_t batch_result;
        bench_batch_verify(&batch_result, BATCH_SIZES[i]);
        print_result(&batch_result);
    }

    tetsuo_cleanup();

    printf("\n");
    return 0;
}
