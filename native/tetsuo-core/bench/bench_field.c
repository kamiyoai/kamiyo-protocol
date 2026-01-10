/*
 * tetsuo-core: Field arithmetic benchmarks
 *
 * Measures throughput of core operations:
 * - Montgomery multiplication
 * - Field inversion (Fermat's little theorem)
 * - Batch inversion (Montgomery's trick)
 * - Multi-scalar multiplication (Pippenger)
 */

#include "../src/tetsuo.h"
#include "../src/field.h"
#include "../src/arena.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/time.h>
#endif

#define WARMUP_ITERS 1000
#define BENCH_ITERS 100000
#define BATCH_SIZE 256

typedef struct {
    const char *name;
    uint64_t total_ns;
    uint64_t iters;
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

static void random_field(field_t *f) {
    for (int i = 0; i < 4; i++) {
        f->limbs[i] = ((uint64_t)rand() << 32) | rand();
    }
    /* Reduce mod p */
    if (field_cmp(f, (const field_t *)FIELD_MODULUS) >= 0) {
        field_sub(f, f, (const field_t *)FIELD_MODULUS);
    }
    field_to_mont(f, f);
}

static void print_result(bench_result_t *r) {
    double ns_per_op = (double)r->total_ns / r->iters;
    double ops_per_sec = 1e9 / ns_per_op;

    if (ops_per_sec >= 1e6) {
        printf("  %-24s %8.2f ns/op  %8.2f M ops/sec\n",
               r->name, ns_per_op, ops_per_sec / 1e6);
    } else {
        printf("  %-24s %8.2f ns/op  %8.2f K ops/sec\n",
               r->name, ns_per_op, ops_per_sec / 1e3);
    }
}

static void bench_mul(bench_result_t *r) {
    field_t a, b, c;
    random_field(&a);
    random_field(&b);

    /* Warmup */
    for (int i = 0; i < WARMUP_ITERS; i++) {
        field_mul(&c, &a, &b);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < BENCH_ITERS; i++) {
        field_mul(&c, &a, &b);
    }
    uint64_t end = get_ns();

    r->name = "field_mul";
    r->total_ns = end - start;
    r->iters = BENCH_ITERS;
}

static void bench_sqr(bench_result_t *r) {
    field_t a, c;
    random_field(&a);

    for (int i = 0; i < WARMUP_ITERS; i++) {
        field_sqr(&c, &a);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < BENCH_ITERS; i++) {
        field_sqr(&c, &a);
    }
    uint64_t end = get_ns();

    r->name = "field_sqr";
    r->total_ns = end - start;
    r->iters = BENCH_ITERS;
}

static void bench_add(bench_result_t *r) {
    field_t a, b, c;
    random_field(&a);
    random_field(&b);

    for (int i = 0; i < WARMUP_ITERS; i++) {
        field_add(&c, &a, &b);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < BENCH_ITERS; i++) {
        field_add(&c, &a, &b);
    }
    uint64_t end = get_ns();

    r->name = "field_add";
    r->total_ns = end - start;
    r->iters = BENCH_ITERS;
}

static void bench_inv(bench_result_t *r) {
    field_t a, c;
    random_field(&a);

    int iters = BENCH_ITERS / 100;  /* Inversion is much slower */

    for (int i = 0; i < WARMUP_ITERS / 100; i++) {
        field_inv(&c, &a);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < iters; i++) {
        field_inv(&c, &a);
    }
    uint64_t end = get_ns();

    r->name = "field_inv";
    r->total_ns = end - start;
    r->iters = iters;
}

static void bench_batch_inv(bench_result_t *r) {
    field_t inputs[BATCH_SIZE];
    field_t outputs[BATCH_SIZE];

    for (int i = 0; i < BATCH_SIZE; i++) {
        random_field(&inputs[i]);
    }

    int batches = BENCH_ITERS / BATCH_SIZE;

    for (int i = 0; i < WARMUP_ITERS / BATCH_SIZE; i++) {
        field_batch_inv(outputs, inputs, BATCH_SIZE);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < batches; i++) {
        field_batch_inv(outputs, inputs, BATCH_SIZE);
    }
    uint64_t end = get_ns();

    r->name = "field_batch_inv (256)";
    r->total_ns = end - start;
    r->iters = batches * BATCH_SIZE;  /* Per-element */
}

static void bench_batch_mul(bench_result_t *r) {
    field_t a[BATCH_SIZE];
    field_t b[BATCH_SIZE];
    field_t c[BATCH_SIZE];

    for (int i = 0; i < BATCH_SIZE; i++) {
        random_field(&a[i]);
        random_field(&b[i]);
    }

    int batches = BENCH_ITERS / BATCH_SIZE;

    for (int i = 0; i < WARMUP_ITERS / BATCH_SIZE; i++) {
        field_batch_mul(c, a, b, BATCH_SIZE);
    }

    uint64_t start = get_ns();
    for (int i = 0; i < batches; i++) {
        field_batch_mul(c, a, b, BATCH_SIZE);
    }
    uint64_t end = get_ns();

    r->name = "field_batch_mul (256)";
    r->total_ns = end - start;
    r->iters = batches * BATCH_SIZE;
}

static void bench_arena(bench_result_t *r) {
    arena_t *arena = arena_create(1024 * 1024);

    for (int i = 0; i < WARMUP_ITERS; i++) {
        arena_alloc(arena, 64);
        if (i % 100 == 0) arena_reset(arena);
    }

    arena_reset(arena);

    uint64_t start = get_ns();
    for (int i = 0; i < BENCH_ITERS; i++) {
        arena_alloc(arena, 64);
        if (i % 1000 == 0) arena_reset(arena);
    }
    uint64_t end = get_ns();

    arena_destroy(arena);

    r->name = "arena_alloc (64 bytes)";
    r->total_ns = end - start;
    r->iters = BENCH_ITERS;
}

int main(void) {
    srand((unsigned)time(NULL));

    printf("\n");
    printf("╔═══════════════════════════════════════════════════════════╗\n");
    printf("║           tetsuo-core Field Arithmetic Benchmark          ║\n");
    printf("╠═══════════════════════════════════════════════════════════╣\n");
    printf("║  BN254 256-bit prime field (Montgomery representation)    ║\n");
    printf("╚═══════════════════════════════════════════════════════════╝\n");
    printf("\n");

#ifdef __x86_64__
    printf("Platform: x86_64 (ASM optimizations enabled)\n");
#else
    printf("Platform: Portable C implementation\n");
#endif

    printf("Iterations: %d (warmup: %d)\n", BENCH_ITERS, WARMUP_ITERS);
    printf("Batch size: %d\n\n", BATCH_SIZE);

    bench_result_t results[8];
    int n = 0;

    printf("Running benchmarks...\n\n");

    bench_add(&results[n++]);
    bench_mul(&results[n++]);
    bench_sqr(&results[n++]);
    bench_inv(&results[n++]);
    bench_batch_mul(&results[n++]);
    bench_batch_inv(&results[n++]);
    bench_arena(&results[n++]);

    printf("Results:\n");
    printf("─────────────────────────────────────────────────────\n");
    for (int i = 0; i < n; i++) {
        print_result(&results[i]);
    }
    printf("─────────────────────────────────────────────────────\n");

    /* Compute batch speedup */
    double inv_ns = (double)results[3].total_ns / results[3].iters;
    double batch_inv_ns = (double)results[5].total_ns / results[5].iters;
    printf("\nBatch inversion speedup: %.1fx\n", inv_ns / batch_inv_ns);

    printf("\n");
    return 0;
}
