/*
 * BN254 pairing and curve operations
 *
 * G1/G2/GT types, Groth16 verification via mcl.
 */

#ifndef TETSUO_PAIRING_H
#define TETSUO_PAIRING_H

#include "field.h"
#include <stdbool.h>
#include <stdint.h>

/*
 * G1 point (on BN254 curve over base field)
 * Affine coordinates for simplicity
 */
typedef struct {
    field_t x;
    field_t y;
    bool is_infinity;
} g1_t;

/*
 * G2 point (on BN254 twist curve over extension field Fp2)
 * Each coordinate is an element of Fp2 = Fp[u]/(u^2 + 1)
 */
typedef struct {
    field_t x_re;  /* Real part of x */
    field_t x_im;  /* Imaginary part of x */
    field_t y_re;  /* Real part of y */
    field_t y_im;  /* Imaginary part of y */
    bool is_infinity;
} g2_t;

/*
 * GT element (target group, subgroup of Fp12)
 * Stored as opaque 384-byte buffer (mcl internal format)
 */
typedef struct {
    uint8_t data[384];
} gt_t;

/*
 * Groth16 verification key
 */
typedef struct groth16_vk {
    g1_t alpha;      /* α·G1 */
    g2_t beta;       /* β·G2 */
    g2_t gamma;      /* γ·G2 */
    g2_t delta;      /* δ·G2 */
    g1_t *ic;        /* IC points for public inputs */
    size_t ic_len;   /* Number of IC points */
    /* Precomputed pairings for efficiency */
    gt_t alpha_beta; /* e(α, β) */
} groth16_vk_t;

/*
 * Groth16 proof
 */
typedef struct {
    g1_t a;          /* A ∈ G1 */
    g2_t b;          /* B ∈ G2 */
    g1_t c;          /* C ∈ G1 */
} groth16_proof_t;

/* Initialize pairing library. Must be called before other functions. */
bool pairing_init(void);

/* Clean up pairing library resources */
void pairing_cleanup(void);

/* Check if pairing library is initialized */
bool pairing_is_initialized(void);

/*
 * Compute pairing e(P, Q) where P ∈ G1, Q ∈ G2
 * Result is in GT (subgroup of Fp12)
 */
bool pairing_compute(gt_t *result, const g1_t *p, const g2_t *q);

/*
 * Compute product of pairings: e(P1,Q1) * e(P2,Q2) * ... * e(Pn,Qn)
 * More efficient than computing and multiplying individually
 */
bool pairing_multi(gt_t *result, const g1_t *ps, const g2_t *qs, size_t n);

/* GT multiplication: r = a * b */
void gt_mul(gt_t *r, const gt_t *a, const gt_t *b);

/* Check if GT element equals 1 (identity) */
bool gt_is_one(const gt_t *a);

/* Check if two GT elements are equal */
bool gt_eq(const gt_t *a, const gt_t *b);

/*
 * G1 operations
 */
void g1_set_infinity(g1_t *p);
bool g1_is_infinity(const g1_t *p);
bool g1_is_on_curve(const g1_t *p);
bool g1_is_in_subgroup(const g1_t *p);
void g1_add(g1_t *r, const g1_t *a, const g1_t *b);
void g1_scalar_mul(g1_t *r, const g1_t *p, const field_t *scalar);
void g1_neg(g1_t *r, const g1_t *p);
bool g1_from_bytes(g1_t *p, const uint8_t *data, size_t len);
void g1_to_bytes(uint8_t *out, const g1_t *p);

/*
 * G2 operations
 */
void g2_set_infinity(g2_t *p);
bool g2_is_infinity(const g2_t *p);
bool g2_is_on_curve(const g2_t *p);
bool g2_is_in_subgroup(const g2_t *p);
void g2_add(g2_t *r, const g2_t *a, const g2_t *b);
void g2_neg(g2_t *r, const g2_t *p);
bool g2_from_bytes(g2_t *p, const uint8_t *data, size_t len);
void g2_to_bytes(uint8_t *out, const g2_t *p);

/*
 * Verification key operations
 */
bool vk_load(groth16_vk_t *vk, const uint8_t *data, size_t len);
void vk_free(groth16_vk_t *vk);

/*
 * Groth16 verification
 *
 * Verifies: e(A, B) = e(α, β) · e(Σ IC[i]·input[i], γ) · e(C, δ)
 *
 * Returns true if proof is valid, false otherwise.
 */
bool groth16_verify(
    const groth16_vk_t *vk,
    const groth16_proof_t *proof,
    const field_t *public_inputs,
    size_t num_inputs
);

/*
 * Batch Groth16 verification using random linear combination
 *
 * More efficient than verifying proofs individually.
 * Uses random coefficients to combine multiple verification equations.
 */
bool groth16_verify_batch(
    const groth16_vk_t *vk,
    const groth16_proof_t *proofs,
    const field_t **public_inputs,
    const size_t *num_inputs,
    size_t num_proofs
);

#endif /* TETSUO_PAIRING_H */
