/*
 * tetsuo-core: High-performance finite field arithmetic
 *
 * 256-bit prime field for BN254 curve operations
 * Hand-optimized with x86-64 assembly for critical paths
 */

#ifndef TETSUO_FIELD_H
#define TETSUO_FIELD_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#ifdef __x86_64__
#include <immintrin.h>
#endif

/* BN254 base field prime: p = 21888242871839275222246405745257275088696311157297823662689037894645226208583 */
static const uint64_t FIELD_MODULUS[4] = {
    0x3C208C16D87CFD47ULL,
    0x97816A916871CA8DULL,
    0xB85045B68181585DULL,
    0x30644E72E131A029ULL
};

/* R = 2^256 mod p (Montgomery form) */
static const uint64_t FIELD_R[4] = {
    0xD35D438DC58F0D9DULL,
    0x0A78EB28F5C70B3DULL,
    0x666EA36F7879462CULL,
    0x0E0A77C19A07DF2FULL
};

/* R^2 mod p */
static const uint64_t FIELD_R2[4] = {
    0xF32CFC5B538AFA89ULL,
    0xB5E71911D44501FBULL,
    0x47AB1EFF0A417FF6ULL,
    0x06D89F71CAB8351FULL
};

/* -p^(-1) mod 2^64 */
static const uint64_t FIELD_INV = 0x87D20782E4866389ULL;

typedef struct {
    uint64_t limbs[4];
} field_t;

typedef struct {
    field_t x;
    field_t y;
    field_t z;
} point_t;

/* Core field operations */
void field_add(field_t *r, const field_t *a, const field_t *b);
void field_sub(field_t *r, const field_t *a, const field_t *b);
void field_mul(field_t *r, const field_t *a, const field_t *b);
void field_sqr(field_t *r, const field_t *a);
void field_inv(field_t *r, const field_t *a);
void field_neg(field_t *r, const field_t *a);
void field_pow(field_t *r, const field_t *a, const uint64_t *exp, size_t exp_len);

/* Montgomery conversion */
void field_to_mont(field_t *r, const field_t *a);
void field_from_mont(field_t *r, const field_t *a);

/* Utility */
bool field_eq(const field_t *a, const field_t *b);
bool field_is_zero(const field_t *a);
void field_set_zero(field_t *r);
void field_set_one(field_t *r);
void field_copy(field_t *r, const field_t *a);
int field_cmp(const field_t *a, const field_t *b);

/* Batch operations (SIMD-accelerated) */
void field_batch_mul(field_t *r, const field_t *a, const field_t *b, size_t count);
void field_batch_inv(field_t *r, const field_t *a, size_t count);

/* Serialization */
void field_from_bytes(field_t *r, const uint8_t *bytes);
void field_to_bytes(uint8_t *bytes, const field_t *a);

/* Security */
void field_secure_zero(field_t *f);

#endif /* TETSUO_FIELD_H */
