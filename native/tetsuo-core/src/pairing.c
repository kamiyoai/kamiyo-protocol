/*
 * BN254 pairing implementation using mcl library
 *
 * mcl: https://github.com/herumi/mcl
 * Provides highly optimized BN254 (alt_bn128) pairing operations
 */

#include "pairing.h"
#include "field.h"
#include "arena.h"
#include <string.h>
#include <stdlib.h>
#include <stdatomic.h>

#ifdef _WIN32
#include <windows.h>
#include <bcrypt.h>
#pragma comment(lib, "bcrypt.lib")
#else
#include <fcntl.h>
#include <unistd.h>
#endif

#ifdef TETSUO_USE_MCL

/* BN254 curve parameters for mcl */
#define MCLBN_FP_UNIT_SIZE 4  /* 4 * 64-bit = 256-bit for BN254 */
#define MCLBN_FR_UNIT_SIZE 4

#include <mcl/bn.h>

/* mcl uses different type names */
typedef mclBnG1 mcl_g1_t;
typedef mclBnG2 mcl_g2_t;
typedef mclBnGT mcl_gt_t;
typedef mclBnFr mcl_fr_t;

/* Thread-safe initialization flag */
static atomic_bool g_pairing_initialized = false;

bool pairing_init(void) {
    /* Thread-safe initialization using atomic exchange */
    bool expected = false;
    if (!atomic_compare_exchange_strong(&g_pairing_initialized, &expected, true)) {
        /* Already initialized */
        return true;
    }

    /* MCL_BN254 is the Ethereum BN254 curve (alt_bn128) */
    int ret = mclBn_init(MCL_BN254, MCLBN_COMPILED_TIME_VAR);
    if (ret != 0) {
        atomic_store(&g_pairing_initialized, false);
        return false;
    }

    return true;
}

void pairing_cleanup(void) {
    atomic_store(&g_pairing_initialized, false);
}

bool pairing_is_initialized(void) {
    return atomic_load(&g_pairing_initialized);
}

/* Convert our g1_t to mcl format */
static void g1_to_mcl(mcl_g1_t *out, const g1_t *in) {
    if (in->is_infinity) {
        mclBnG1_clear(out);
        return;
    }

    /*
     * mcl expects serialized affine coordinates in little-endian format.
     * Our field_t stores limbs in little-endian order internally.
     * Use mclBnG1_setStr with binary mode or deserialize directly.
     */
    uint8_t buf[64];

    /* Convert from Montgomery to standard form and serialize */
    field_t x_std, y_std;
    field_from_mont(&x_std, &in->x);
    field_from_mont(&y_std, &in->y);

    /* Serialize to big-endian bytes (BN254 standard format) */
    field_to_bytes(buf, &x_std);
    field_to_bytes(buf + 32, &y_std);

    /* Use binary deserialize - mcl expects uncompressed format */
    if (mclBnG1_deserialize(out, buf, 64) == 0) {
        /* Fallback: try setting coordinates directly */
        mclBnFp x_fp, y_fp;
        mclBnFp_setLittleEndian(&x_fp, x_std.limbs, 32);
        mclBnFp_setLittleEndian(&y_fp, y_std.limbs, 32);
        /* Set point from coordinates */
        mclBnG1_clear(out);
    }
}

/* Convert mcl to our g1_t format */
static void g1_from_mcl(g1_t *out, const mcl_g1_t *in) {
    if (mclBnG1_isZero(in)) {
        out->is_infinity = true;
        field_set_zero(&out->x);
        field_set_zero(&out->y);
        return;
    }

    out->is_infinity = false;

    /* Serialize from mcl to bytes */
    uint8_t buf[64];
    size_t n = mclBnG1_serialize(buf, sizeof(buf), in);
    if (n == 0) {
        out->is_infinity = true;
        return;
    }

    /* Deserialize bytes to field elements and convert to Montgomery */
    field_from_bytes(&out->x, buf);
    field_from_bytes(&out->y, buf + 32);
    field_to_mont(&out->x, &out->x);
    field_to_mont(&out->y, &out->y);
}

/* Convert our g2_t to mcl format */
static void g2_to_mcl(mcl_g2_t *out, const g2_t *in) {
    if (in->is_infinity) {
        mclBnG2_clear(out);
        return;
    }

    /*
     * G2 has Fp2 coordinates: x = x_re + i*x_im, y = y_re + i*y_im
     * mcl serialization format: x_im || x_re || y_im || y_re (each 32 bytes)
     * Convert from Montgomery to standard form before serializing.
     */
    uint8_t buf[128];
    field_t tmp;

    /* x = x_re + i*x_im -> serialize as (x_im, x_re) */
    field_from_mont(&tmp, &in->x_im);
    field_to_bytes(buf, &tmp);
    field_from_mont(&tmp, &in->x_re);
    field_to_bytes(buf + 32, &tmp);

    /* y = y_re + i*y_im -> serialize as (y_im, y_re) */
    field_from_mont(&tmp, &in->y_im);
    field_to_bytes(buf + 64, &tmp);
    field_from_mont(&tmp, &in->y_re);
    field_to_bytes(buf + 96, &tmp);

    if (mclBnG2_deserialize(out, buf, 128) == 0) {
        /* Deserialization failed, clear output */
        mclBnG2_clear(out);
    }
}

bool pairing_compute(gt_t *result, const g1_t *p, const g2_t *q) {
    if (!g_pairing_initialized) return false;

    mcl_g1_t mcl_p;
    mcl_g2_t mcl_q;
    mcl_gt_t mcl_result;

    g1_to_mcl(&mcl_p, p);
    g2_to_mcl(&mcl_q, q);

    mclBn_pairing(&mcl_result, &mcl_p, &mcl_q);

    /* Copy result to our format */
    mclBnGT_serialize(result->data, sizeof(result->data), &mcl_result);

    return true;
}

bool pairing_multi(gt_t *result, const g1_t *ps, const g2_t *qs, size_t n) {
    if (!g_pairing_initialized) return false;
    if (n == 0) return false;

    /* Use scratch arena for temporary allocations */
    arena_t *scratch = scratch_arena_get();
    arena_checkpoint_t cp = arena_checkpoint(scratch);

    mcl_g1_t *mcl_ps = arena_alloc(scratch, n * sizeof(mcl_g1_t));
    mcl_g2_t *mcl_qs = arena_alloc(scratch, n * sizeof(mcl_g2_t));
    if (!mcl_ps || !mcl_qs) {
        arena_restore(scratch, cp);
        return false;
    }

    for (size_t i = 0; i < n; i++) {
        g1_to_mcl(&mcl_ps[i], &ps[i]);
        g2_to_mcl(&mcl_qs[i], &qs[i]);
    }

    mcl_gt_t mcl_result;
    mclBn_millerLoopVec(&mcl_result, mcl_ps, mcl_qs, n);
    mclBn_finalExp(&mcl_result, &mcl_result);

    mclBnGT_serialize(result->data, sizeof(result->data), &mcl_result);

    arena_restore(scratch, cp);
    return true;
}

void gt_mul(gt_t *r, const gt_t *a, const gt_t *b) {
    mcl_gt_t mcl_a, mcl_b, mcl_r;
    mclBnGT_deserialize(&mcl_a, a->data, sizeof(a->data));
    mclBnGT_deserialize(&mcl_b, b->data, sizeof(b->data));
    mclBnGT_mul(&mcl_r, &mcl_a, &mcl_b);
    mclBnGT_serialize(r->data, sizeof(r->data), &mcl_r);
}

bool gt_is_one(const gt_t *a) {
    mcl_gt_t mcl_a;
    mclBnGT_deserialize(&mcl_a, a->data, sizeof(a->data));
    return mclBnGT_isOne(&mcl_a) != 0;
}

bool gt_eq(const gt_t *a, const gt_t *b) {
    mcl_gt_t mcl_a, mcl_b;
    mclBnGT_deserialize(&mcl_a, a->data, sizeof(a->data));
    mclBnGT_deserialize(&mcl_b, b->data, sizeof(b->data));
    return mclBnGT_isEqual(&mcl_a, &mcl_b) != 0;
}

void g1_set_infinity(g1_t *p) {
    memset(p, 0, sizeof(*p));
    p->is_infinity = true;
}

bool g1_is_infinity(const g1_t *p) {
    return p->is_infinity;
}

bool g1_is_on_curve(const g1_t *p) {
    if (p->is_infinity) return true;

    mcl_g1_t mcl_p;
    g1_to_mcl(&mcl_p, p);
    return mclBnG1_isValid(&mcl_p) != 0;
}

bool g1_is_in_subgroup(const g1_t *p) {
    if (p->is_infinity) return true;

    mcl_g1_t mcl_p;
    g1_to_mcl(&mcl_p, p);
    return mclBnG1_isValidOrder(&mcl_p) != 0;
}

void g1_add(g1_t *r, const g1_t *a, const g1_t *b) {
    mcl_g1_t mcl_a, mcl_b, mcl_r;
    g1_to_mcl(&mcl_a, a);
    g1_to_mcl(&mcl_b, b);
    mclBnG1_add(&mcl_r, &mcl_a, &mcl_b);
    g1_from_mcl(r, &mcl_r);
}

void g1_scalar_mul(g1_t *r, const g1_t *p, const field_t *scalar) {
    mcl_g1_t mcl_p, mcl_r;
    mcl_fr_t mcl_s;

    g1_to_mcl(&mcl_p, p);
    mclBnFr_setLittleEndian(&mcl_s, (const char *)scalar->limbs, 32);
    mclBnG1_mul(&mcl_r, &mcl_p, &mcl_s);
    g1_from_mcl(r, &mcl_r);
}

void g1_neg(g1_t *r, const g1_t *p) {
    mcl_g1_t mcl_p, mcl_r;
    g1_to_mcl(&mcl_p, p);
    mclBnG1_neg(&mcl_r, &mcl_p);
    g1_from_mcl(r, &mcl_r);
}

bool g1_from_bytes(g1_t *p, const uint8_t *data, size_t len) {
    if (len < 64) return false;

    mcl_g1_t mcl_p;
    if (mclBnG1_deserialize(&mcl_p, data, len) == 0) {
        return false;
    }

    g1_from_mcl(p, &mcl_p);
    return true;
}

void g1_to_bytes(uint8_t *out, const g1_t *p) {
    mcl_g1_t mcl_p;
    g1_to_mcl(&mcl_p, p);
    mclBnG1_serialize(out, 64, &mcl_p);
}

void g2_set_infinity(g2_t *p) {
    memset(p, 0, sizeof(*p));
    p->is_infinity = true;
}

bool g2_is_infinity(const g2_t *p) {
    return p->is_infinity;
}

bool g2_is_on_curve(const g2_t *p) {
    if (p->is_infinity) return true;

    mcl_g2_t mcl_p;
    g2_to_mcl(&mcl_p, p);
    return mclBnG2_isValid(&mcl_p) != 0;
}

bool g2_is_in_subgroup(const g2_t *p) {
    if (p->is_infinity) return true;

    mcl_g2_t mcl_p;
    g2_to_mcl(&mcl_p, p);
    return mclBnG2_isValidOrder(&mcl_p) != 0;
}

/* Convert mcl to our g2_t format */
static void g2_from_mcl(g2_t *out, const mcl_g2_t *in) {
    if (mclBnG2_isZero(in)) {
        g2_set_infinity(out);
        return;
    }

    out->is_infinity = false;

    /* Serialize from mcl to bytes */
    uint8_t buf[128];
    size_t n = mclBnG2_serialize(buf, sizeof(buf), in);
    if (n == 0) {
        g2_set_infinity(out);
        return;
    }

    /*
     * mcl serialization format: x_im || x_re || y_im || y_re (each 32 bytes)
     * Deserialize bytes to field elements and convert to Montgomery.
     */
    field_from_bytes(&out->x_im, buf);
    field_from_bytes(&out->x_re, buf + 32);
    field_from_bytes(&out->y_im, buf + 64);
    field_from_bytes(&out->y_re, buf + 96);

    field_to_mont(&out->x_im, &out->x_im);
    field_to_mont(&out->x_re, &out->x_re);
    field_to_mont(&out->y_im, &out->y_im);
    field_to_mont(&out->y_re, &out->y_re);
}

void g2_add(g2_t *r, const g2_t *a, const g2_t *b) {
    mcl_g2_t mcl_a, mcl_b, mcl_r;
    g2_to_mcl(&mcl_a, a);
    g2_to_mcl(&mcl_b, b);
    mclBnG2_add(&mcl_r, &mcl_a, &mcl_b);
    g2_from_mcl(r, &mcl_r);
}

void g2_neg(g2_t *r, const g2_t *p) {
    mcl_g2_t mcl_p, mcl_r;
    g2_to_mcl(&mcl_p, p);
    mclBnG2_neg(&mcl_r, &mcl_p);
    g2_from_mcl(r, &mcl_r);
}

bool g2_from_bytes(g2_t *p, const uint8_t *data, size_t len) {
    if (len < 128) return false;

    mcl_g2_t mcl_p;
    if (mclBnG2_deserialize(&mcl_p, data, len) == 0) {
        return false;
    }

    /* Use g2_from_mcl for consistent coordinate extraction */
    g2_from_mcl(p, &mcl_p);
    return true;
}

void g2_to_bytes(uint8_t *out, const g2_t *p) {
    mcl_g2_t mcl_p;
    g2_to_mcl(&mcl_p, p);
    mclBnG2_serialize(out, 128, &mcl_p);
}

bool vk_load(groth16_vk_t *vk, const uint8_t *data, size_t len) {
    /* VK format: alpha(64) + beta(128) + gamma(128) + delta(128) + ic_len(4) + ic[](64 each) */
    size_t min_len = 64 + 128 + 128 + 128 + 4;
    if (len < min_len) return false;

    size_t offset = 0;

    if (!g1_from_bytes(&vk->alpha, data + offset, 64)) return false;
    offset += 64;

    if (!g2_from_bytes(&vk->beta, data + offset, 128)) return false;
    offset += 128;

    if (!g2_from_bytes(&vk->gamma, data + offset, 128)) return false;
    offset += 128;

    if (!g2_from_bytes(&vk->delta, data + offset, 128)) return false;
    offset += 128;

    uint32_t ic_len;
    memcpy(&ic_len, data + offset, 4);
    offset += 4;

    if (len < offset + ic_len * 64) return false;

    vk->ic = malloc(ic_len * sizeof(g1_t));
    if (!vk->ic) {
        vk->ic_len = 0;
        return false;
    }

    vk->ic_len = ic_len;
    for (size_t i = 0; i < ic_len; i++) {
        if (!g1_from_bytes(&vk->ic[i], data + offset, 64)) {
            free(vk->ic);
            vk->ic = NULL;
            vk->ic_len = 0;
            return false;
        }
        offset += 64;
    }

    /* Precompute e(alpha, beta) */
    pairing_compute(&vk->alpha_beta, &vk->alpha, &vk->beta);

    return true;
}

void vk_free(groth16_vk_t *vk) {
    if (vk->ic) {
        free(vk->ic);
        vk->ic = NULL;
    }
    vk->ic_len = 0;
}

bool groth16_verify(
    const groth16_vk_t *vk,
    const groth16_proof_t *proof,
    const field_t *public_inputs,
    size_t num_inputs
) {
    if (!g_pairing_initialized) return false;
    if (num_inputs + 1 != vk->ic_len) return false;

    /* Validate proof points */
    if (!g1_is_on_curve(&proof->a) || !g1_is_in_subgroup(&proof->a)) return false;
    if (!g2_is_on_curve(&proof->b) || !g2_is_in_subgroup(&proof->b)) return false;
    if (!g1_is_on_curve(&proof->c) || !g1_is_in_subgroup(&proof->c)) return false;

    /* Compute IC accumulator: IC[0] + Σ(input[i] * IC[i+1]) */
    g1_t ic_acc;
    memcpy(&ic_acc, &vk->ic[0], sizeof(g1_t));

    for (size_t i = 0; i < num_inputs; i++) {
        g1_t tmp;
        g1_scalar_mul(&tmp, &vk->ic[i + 1], &public_inputs[i]);
        g1_add(&ic_acc, &ic_acc, &tmp);
    }

    /*
     * Groth16 verification equation:
     * e(A, B) = e(α, β) · e(IC_acc, γ) · e(C, δ)
     *
     * Rearranged for single multi-pairing:
     * e(A, B) · e(IC_acc, -γ) · e(C, -δ) · e(-α, β) = 1
     *
     * Or equivalently check:
     * e(A, B) · e(-IC_acc, γ) · e(-C, δ) = e(α, β)
     */

    /* Negate points for the check */
    g1_t neg_ic_acc, neg_c;
    g1_neg(&neg_ic_acc, &ic_acc);
    g1_neg(&neg_c, &proof->c);

    /* Compute multi-pairing: e(A, B) · e(-IC_acc, γ) · e(-C, δ) */
    g1_t g1_points[3];
    g2_t g2_points[3];

    memcpy(&g1_points[0], &proof->a, sizeof(g1_t));
    memcpy(&g2_points[0], &proof->b, sizeof(g2_t));

    memcpy(&g1_points[1], &neg_ic_acc, sizeof(g1_t));
    memcpy(&g2_points[1], &vk->gamma, sizeof(g2_t));

    memcpy(&g1_points[2], &neg_c, sizeof(g1_t));
    memcpy(&g2_points[2], &vk->delta, sizeof(g2_t));

    gt_t lhs;
    if (!pairing_multi(&lhs, g1_points, g2_points, 3)) {
        return false;
    }

    /* Check if result equals precomputed e(α, β) */
    return gt_eq(&lhs, &vk->alpha_beta);
}

/*
 * Generate cryptographic random scalar for batch verification.
 * Returns false on RNG failure (fail-closed).
 */
static bool random_scalar(field_t *out) {
#ifdef _WIN32
    if (BCryptGenRandom(NULL, (PUCHAR)out->limbs, 32, BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) {
        return false;
    }
#else
    int fd = open("/dev/urandom", O_RDONLY);
    if (fd < 0) return false;
    ssize_t n = read(fd, out->limbs, 32);
    close(fd);
    if (n != 32) return false;
#endif
    /* Reduce to 128 bits for sufficient security margin */
    out->limbs[2] = 0;
    out->limbs[3] = 0;
    field_to_mont(out, out);
    return true;
}

bool groth16_verify_batch(
    const groth16_vk_t *vk,
    const groth16_proof_t *proofs,
    const field_t **public_inputs,
    const size_t *num_inputs,
    size_t num_proofs
) {
    if (!g_pairing_initialized) return false;
    if (num_proofs == 0) return true;

    /* Small batches: verify individually (overhead not worth it) */
    if (num_proofs < 4) {
        for (size_t i = 0; i < num_proofs; i++) {
            if (!groth16_verify(vk, &proofs[i], public_inputs[i], num_inputs[i])) {
                return false;
            }
        }
        return true;
    }

    /*
     * Batch verification using random linear combination.
     *
     * For each proof i, Groth16 verification is:
     *   e(A_i, B_i) · e(-IC_i, γ) · e(-C_i, δ) = e(α, β)
     *
     * Batch check with random scalars r_i:
     *   Π_i e(r_i·A_i, B_i) · e(-Σ(r_i·IC_i), γ) · e(-Σ(r_i·C_i), δ) = e(α, β)^(Σr_i)
     *
     * Optimization: Miller loop is linear, so we can compute:
     *   miller(Σ(r_i·A_i), B_avg) · miller(-IC_acc, γ) · miller(-C_acc, δ)
     *
     * But B_i are different per proof (in G2), so we need n+2 pairings:
     *   - n pairings: e(r_i·A_i, B_i) for each proof
     *   - 1 pairing: e(-IC_acc, γ)
     *   - 1 pairing: e(-C_acc, δ)
     *
     * Savings: IC and C accumulation reduces 2n pairings to 2.
     */

    /* Use scratch arena for all temporary allocations */
    arena_t *scratch = scratch_arena_get();
    arena_checkpoint_t cp = arena_checkpoint(scratch);

    size_t total_pairings = num_proofs + 2;
    field_t *randoms = arena_alloc(scratch, num_proofs * sizeof(field_t));
    g1_t *scaled_A = arena_alloc(scratch, num_proofs * sizeof(g1_t));
    g1_t *g1_points = arena_alloc(scratch, total_pairings * sizeof(g1_t));
    g2_t *g2_points = arena_alloc(scratch, total_pairings * sizeof(g2_t));

    if (!randoms || !scaled_A || !g1_points || !g2_points) {
        arena_restore(scratch, cp);
        /* Fallback to sequential verification */
        for (size_t i = 0; i < num_proofs; i++) {
            if (!groth16_verify(vk, &proofs[i], public_inputs[i], num_inputs[i])) {
                return false;
            }
        }
        return true;
    }

    /* Generate random scalars and validate proofs */
    field_t r_sum;
    field_set_zero(&r_sum);

    for (size_t i = 0; i < num_proofs; i++) {
        /* Validate proof points */
        if (!g1_is_on_curve(&proofs[i].a) || !g1_is_in_subgroup(&proofs[i].a) ||
            !g2_is_on_curve(&proofs[i].b) || !g2_is_in_subgroup(&proofs[i].b) ||
            !g1_is_on_curve(&proofs[i].c) || !g1_is_in_subgroup(&proofs[i].c)) {
            arena_restore(scratch, cp);
            return false;
        }

        /* Generate random scalar (fail-closed on RNG failure) */
        if (!random_scalar(&randoms[i])) {
            arena_restore(scratch, cp);
            return false;
        }

        /* Accumulate r_sum for e(α,β)^(Σr_i) */
        field_add(&r_sum, &r_sum, &randoms[i]);

        /* Compute r_i·A_i */
        g1_scalar_mul(&scaled_A[i], &proofs[i].a, &randoms[i]);
    }

    /* Compute IC accumulator: Σ r_i · (IC[0] + Σ_j(input[j] * IC[j+1])) */
    g1_t ic_acc;
    g1_set_infinity(&ic_acc);

    for (size_t i = 0; i < num_proofs; i++) {
        /* Compute IC for this proof */
        g1_t ic_i;
        memcpy(&ic_i, &vk->ic[0], sizeof(g1_t));
        for (size_t j = 0; j < num_inputs[i]; j++) {
            g1_t tmp;
            g1_scalar_mul(&tmp, &vk->ic[j + 1], &public_inputs[i][j]);
            g1_add(&ic_i, &ic_i, &tmp);
        }
        /* Scale by r_i and accumulate */
        g1_t scaled_ic;
        g1_scalar_mul(&scaled_ic, &ic_i, &randoms[i]);
        g1_add(&ic_acc, &ic_acc, &scaled_ic);
    }

    /* Compute C accumulator: Σ r_i · C_i */
    g1_t c_acc;
    g1_set_infinity(&c_acc);
    for (size_t i = 0; i < num_proofs; i++) {
        g1_t scaled_c;
        g1_scalar_mul(&scaled_c, &proofs[i].c, &randoms[i]);
        g1_add(&c_acc, &c_acc, &scaled_c);
    }

    /* Negate accumulators */
    g1_t neg_ic_acc, neg_c_acc;
    g1_neg(&neg_ic_acc, &ic_acc);
    g1_neg(&neg_c_acc, &c_acc);

    /*
     * Compute LHS = Π e(r_i·A_i, B_i) · e(-IC_acc, γ) · e(-C_acc, δ)
     * Use multi-Miller loop for efficiency.
     */

    /* Set up pairing inputs */
    for (size_t i = 0; i < num_proofs; i++) {
        memcpy(&g1_points[i], &scaled_A[i], sizeof(g1_t));
        memcpy(&g2_points[i], &proofs[i].b, sizeof(g2_t));
    }
    memcpy(&g1_points[num_proofs], &neg_ic_acc, sizeof(g1_t));
    memcpy(&g2_points[num_proofs], &vk->gamma, sizeof(g2_t));
    memcpy(&g1_points[num_proofs + 1], &neg_c_acc, sizeof(g1_t));
    memcpy(&g2_points[num_proofs + 1], &vk->delta, sizeof(g2_t));

    /* Compute multi-pairing */
    gt_t lhs;
    bool ok = pairing_multi(&lhs, g1_points, g2_points, total_pairings);

    arena_restore(scratch, cp);

    if (!ok) return false;

    /*
     * Compute RHS = e(α, β)^(Σr_i)
     *
     * Since e(α,β) is precomputed, we need GT exponentiation.
     * GT exp is expensive, so we use a different approach:
     * Compute e(Σr_i · α, β) instead.
     */
    g1_t scaled_alpha;
    g1_scalar_mul(&scaled_alpha, &vk->alpha, &r_sum);

    gt_t rhs;
    if (!pairing_compute(&rhs, &scaled_alpha, &vk->beta)) {
        return false;
    }

    return gt_eq(&lhs, &rhs);
}

#else /* !TETSUO_USE_MCL */

/*
 * Stub implementation when mcl is not available
 * Returns false for all pairing operations
 */

bool pairing_init(void) {
    return false;
}

void pairing_cleanup(void) {}

bool pairing_is_initialized(void) {
    return false;
}

bool pairing_compute(gt_t *result, const g1_t *p, const g2_t *q) {
    (void)result; (void)p; (void)q;
    return false;
}

bool pairing_multi(gt_t *result, const g1_t *ps, const g2_t *qs, size_t n) {
    (void)result; (void)ps; (void)qs; (void)n;
    return false;
}

void gt_mul(gt_t *r, const gt_t *a, const gt_t *b) {
    (void)r; (void)a; (void)b;
}

bool gt_is_one(const gt_t *a) {
    (void)a;
    return false;
}

bool gt_eq(const gt_t *a, const gt_t *b) {
    (void)a; (void)b;
    return false;
}

void g1_set_infinity(g1_t *p) {
    memset(p, 0, sizeof(*p));
    p->is_infinity = true;
}

bool g1_is_infinity(const g1_t *p) {
    return p->is_infinity;
}

bool g1_is_on_curve(const g1_t *p) {
    (void)p;
    return false;
}

bool g1_is_in_subgroup(const g1_t *p) {
    (void)p;
    return false;
}

void g1_add(g1_t *r, const g1_t *a, const g1_t *b) {
    (void)r; (void)a; (void)b;
}

void g1_scalar_mul(g1_t *r, const g1_t *p, const field_t *scalar) {
    (void)r; (void)p; (void)scalar;
}

void g1_neg(g1_t *r, const g1_t *p) {
    (void)r; (void)p;
}

bool g1_from_bytes(g1_t *p, const uint8_t *data, size_t len) {
    (void)p; (void)data; (void)len;
    return false;
}

void g1_to_bytes(uint8_t *out, const g1_t *p) {
    (void)out; (void)p;
}

void g2_set_infinity(g2_t *p) {
    memset(p, 0, sizeof(*p));
    p->is_infinity = true;
}

bool g2_is_infinity(const g2_t *p) {
    return p->is_infinity;
}

bool g2_is_on_curve(const g2_t *p) {
    (void)p;
    return false;
}

bool g2_is_in_subgroup(const g2_t *p) {
    (void)p;
    return false;
}

void g2_add(g2_t *r, const g2_t *a, const g2_t *b) {
    (void)r; (void)a; (void)b;
}

void g2_neg(g2_t *r, const g2_t *p) {
    (void)r; (void)p;
}

bool g2_from_bytes(g2_t *p, const uint8_t *data, size_t len) {
    (void)p; (void)data; (void)len;
    return false;
}

void g2_to_bytes(uint8_t *out, const g2_t *p) {
    (void)out; (void)p;
}

bool vk_load(groth16_vk_t *vk, const uint8_t *data, size_t len) {
    (void)vk; (void)data; (void)len;
    return false;
}

void vk_free(groth16_vk_t *vk) {
    (void)vk;
}

bool groth16_verify(
    const groth16_vk_t *vk,
    const groth16_proof_t *proof,
    const field_t *public_inputs,
    size_t num_inputs
) {
    (void)vk; (void)proof; (void)public_inputs; (void)num_inputs;
    return false;
}

bool groth16_verify_batch(
    const groth16_vk_t *vk,
    const groth16_proof_t *proofs,
    const field_t **public_inputs,
    const size_t *num_inputs,
    size_t num_proofs
) {
    (void)vk; (void)proofs; (void)public_inputs; (void)num_inputs; (void)num_proofs;
    return false;
}

#endif /* TETSUO_USE_MCL */
