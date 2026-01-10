/*
 * tetsuo-core: Finite field arithmetic
 * BN254 base field with Montgomery representation
 */

#include "field.h"
#include <stdlib.h>

#if defined(__x86_64__) && defined(__BMI2__)
#define USE_ASM_X64 1
#else
#define USE_ASM_X64 0
#endif

#if USE_ASM_X64

static inline uint64_t add_256(uint64_t *r, const uint64_t *a, const uint64_t *b) {
    uint64_t carry;
    __asm__ volatile (
        "movq   (%[a]), %%rax\n\t"
        "addq   (%[b]), %%rax\n\t"
        "movq   %%rax, (%[r])\n\t"
        "movq   8(%[a]), %%rax\n\t"
        "adcq   8(%[b]), %%rax\n\t"
        "movq   %%rax, 8(%[r])\n\t"
        "movq   16(%[a]), %%rax\n\t"
        "adcq   16(%[b]), %%rax\n\t"
        "movq   %%rax, 16(%[r])\n\t"
        "movq   24(%[a]), %%rax\n\t"
        "adcq   24(%[b]), %%rax\n\t"
        "movq   %%rax, 24(%[r])\n\t"
        "setc   %%al\n\t"
        "movzbq %%al, %[carry]"
        : [carry] "=r" (carry)
        : [r] "r" (r), [a] "r" (a), [b] "r" (b)
        : "rax", "memory", "cc"
    );
    return carry;
}

static inline uint64_t sub_256(uint64_t *r, const uint64_t *a, const uint64_t *b) {
    uint64_t borrow;
    __asm__ volatile (
        "movq   (%[a]), %%rax\n\t"
        "subq   (%[b]), %%rax\n\t"
        "movq   %%rax, (%[r])\n\t"
        "movq   8(%[a]), %%rax\n\t"
        "sbbq   8(%[b]), %%rax\n\t"
        "movq   %%rax, 8(%[r])\n\t"
        "movq   16(%[a]), %%rax\n\t"
        "sbbq   16(%[b]), %%rax\n\t"
        "movq   %%rax, 16(%[r])\n\t"
        "movq   24(%[a]), %%rax\n\t"
        "sbbq   24(%[b]), %%rax\n\t"
        "movq   %%rax, 24(%[r])\n\t"
        "setc   %%al\n\t"
        "movzbq %%al, %[borrow]"
        : [borrow] "=r" (borrow)
        : [r] "r" (r), [a] "r" (a), [b] "r" (b)
        : "rax", "memory", "cc"
    );
    return borrow;
}

static void mont_reduce(uint64_t *r, uint64_t *t) {
    uint64_t k, tmp[4];

    for (int i = 0; i < 4; i++) {
        k = t[i] * FIELD_INV;

        __asm__ volatile (
            "movq   %[k], %%rdx\n\t"
            "mulxq  %[p0], %%rax, %%rcx\n\t"
            "addq   %%rax, %[t0]\n\t"
            "mulxq  %[p1], %%rax, %%r8\n\t"
            "adcq   %%rcx, %%rax\n\t"
            "addq   %%rax, %[t1]\n\t"
            "mulxq  %[p2], %%rax, %%rcx\n\t"
            "adcq   %%r8, %%rax\n\t"
            "addq   %%rax, %[t2]\n\t"
            "mulxq  %[p3], %%rax, %%r8\n\t"
            "adcq   %%rcx, %%rax\n\t"
            "addq   %%rax, %[t3]\n\t"
            "adcq   %%r8, %[t4]\n\t"
            "adcq   $0, %[t5]\n\t"
            "adcq   $0, %[t6]\n\t"
            "adcq   $0, %[t7]"
            : [t0] "+r" (t[i]), [t1] "+r" (t[i+1]), [t2] "+r" (t[i+2]),
              [t3] "+r" (t[i+3]), [t4] "+r" (t[i+4]), [t5] "+r" (t[i+5]),
              [t6] "+r" (t[i+6]), [t7] "+r" (t[i+7])
            : [k] "r" (k),
              [p0] "m" (FIELD_MODULUS[0]), [p1] "m" (FIELD_MODULUS[1]),
              [p2] "m" (FIELD_MODULUS[2]), [p3] "m" (FIELD_MODULUS[3])
            : "rax", "rcx", "rdx", "r8", "cc"
        );
    }

    r[0] = t[4]; r[1] = t[5]; r[2] = t[6]; r[3] = t[7];

    uint64_t borrow = sub_256(tmp, r, FIELD_MODULUS);
    /* If no borrow (borrow=0), r >= p, use tmp. If borrow (borrow=1), r < p, keep r */
    uint64_t mask = borrow - 1;  /* 0 if borrow, all 1s if no borrow */
    r[0] = (r[0] & ~mask) | (tmp[0] & mask);
    r[1] = (r[1] & ~mask) | (tmp[1] & mask);
    r[2] = (r[2] & ~mask) | (tmp[2] & mask);
    r[3] = (r[3] & ~mask) | (tmp[3] & mask);
}

static void mul_256x256(uint64_t *r, const uint64_t *a, const uint64_t *b) {
    uint64_t t0, t1, t2, t3, t4, t5, t6, t7;
    uint64_t c0, c1, c2;

    __asm__ volatile (
        "movq   (%[a]), %%rdx\n\t"
        "mulxq  (%[b]), %[t0], %[c0]\n\t"
        "mulxq  8(%[b]), %[t1], %[c1]\n\t"
        "addq   %[c0], %[t1]\n\t"
        "mulxq  16(%[b]), %[t2], %[c0]\n\t"
        "adcq   %[c1], %[t2]\n\t"
        "mulxq  24(%[b]), %[t3], %[t4]\n\t"
        "adcq   %[c0], %[t3]\n\t"
        "adcq   $0, %[t4]\n\t"

        "movq   8(%[a]), %%rdx\n\t"
        "xorq   %[t5], %[t5]\n\t"
        "mulxq  (%[b]), %[c0], %[c1]\n\t"
        "addq   %[c0], %[t1]\n\t"
        "mulxq  8(%[b]), %[c0], %[c2]\n\t"
        "adcq   %[c1], %[c0]\n\t"
        "addq   %[c0], %[t2]\n\t"
        "mulxq  16(%[b]), %[c0], %[c1]\n\t"
        "adcq   %[c2], %[c0]\n\t"
        "addq   %[c0], %[t3]\n\t"
        "mulxq  24(%[b]), %[c0], %[c2]\n\t"
        "adcq   %[c1], %[c0]\n\t"
        "addq   %[c0], %[t4]\n\t"
        "adcq   %[c2], %[t5]\n\t"

        "movq   16(%[a]), %%rdx\n\t"
        "xorq   %[t6], %[t6]\n\t"
        "mulxq  (%[b]), %[c0], %[c1]\n\t"
        "addq   %[c0], %[t2]\n\t"
        "mulxq  8(%[b]), %[c0], %[c2]\n\t"
        "adcq   %[c1], %[c0]\n\t"
        "addq   %[c0], %[t3]\n\t"
        "mulxq  16(%[b]), %[c0], %[c1]\n\t"
        "adcq   %[c2], %[c0]\n\t"
        "addq   %[c0], %[t4]\n\t"
        "mulxq  24(%[b]), %[c0], %[c2]\n\t"
        "adcq   %[c1], %[c0]\n\t"
        "addq   %[c0], %[t5]\n\t"
        "adcq   %[c2], %[t6]\n\t"

        "movq   24(%[a]), %%rdx\n\t"
        "xorq   %[t7], %[t7]\n\t"
        "mulxq  (%[b]), %[c0], %[c1]\n\t"
        "addq   %[c0], %[t3]\n\t"
        "mulxq  8(%[b]), %[c0], %[c2]\n\t"
        "adcq   %[c1], %[c0]\n\t"
        "addq   %[c0], %[t4]\n\t"
        "mulxq  16(%[b]), %[c0], %[c1]\n\t"
        "adcq   %[c2], %[c0]\n\t"
        "addq   %[c0], %[t5]\n\t"
        "mulxq  24(%[b]), %[c0], %[c2]\n\t"
        "adcq   %[c1], %[c0]\n\t"
        "addq   %[c0], %[t6]\n\t"
        "adcq   %[c2], %[t7]"

        : [t0] "=&r" (t0), [t1] "=&r" (t1), [t2] "=&r" (t2), [t3] "=&r" (t3),
          [t4] "=&r" (t4), [t5] "=&r" (t5), [t6] "=&r" (t6), [t7] "=&r" (t7),
          [c0] "=&r" (c0), [c1] "=&r" (c1), [c2] "=&r" (c2)
        : [a] "r" (a), [b] "r" (b)
        : "rdx", "cc"
    );

    r[0] = t0; r[1] = t1; r[2] = t2; r[3] = t3;
    r[4] = t4; r[5] = t5; r[6] = t6; r[7] = t7;
}

static void sqr_256(uint64_t *r, const uint64_t *a) {
    uint64_t t0, t1, t2, t3, t4, t5, t6, t7;
    uint64_t c0, c1, c2;

    __asm__ volatile (
        "movq   (%[a]), %%rdx\n\t"
        "mulxq  %%rdx, %[t0], %[t1]\n\t"
        "mulxq  8(%[a]), %[c0], %[c1]\n\t"
        "mulxq  16(%[a]), %[t2], %[t3]\n\t"
        "mulxq  24(%[a]), %[t4], %[t5]\n\t"

        "addq   %[c0], %[c0]\n\t"
        "adcq   %[c1], %[t2]\n\t"
        "adcq   $0, %[t3]\n\t"
        "addq   %[c0], %[t1]\n\t"
        "adcq   %[c1], %[t2]\n\t"

        "movq   8(%[a]), %%rdx\n\t"
        "mulxq  %%rdx, %[c0], %[c1]\n\t"
        "addq   %[c0], %[t2]\n\t"
        "adcq   %[c1], %[t3]\n\t"
        "mulxq  16(%[a]), %[c0], %[c1]\n\t"
        "addq   %[c0], %[c0]\n\t"
        "adcq   %[c1], %[c1]\n\t"
        "addq   %[c0], %[t3]\n\t"
        "adcq   %[c1], %[t4]\n\t"
        "mulxq  24(%[a]), %[c0], %[c1]\n\t"
        "addq   %[c0], %[c0]\n\t"
        "adcq   %[c1], %[c1]\n\t"
        "addq   %[c0], %[t4]\n\t"
        "adcq   %[c1], %[t5]\n\t"

        "movq   16(%[a]), %%rdx\n\t"
        "mulxq  %%rdx, %[c0], %[c1]\n\t"
        "xorq   %[t6], %[t6]\n\t"
        "addq   %[c0], %[t4]\n\t"
        "adcq   %[c1], %[t5]\n\t"
        "mulxq  24(%[a]), %[c0], %[c1]\n\t"
        "addq   %[c0], %[c0]\n\t"
        "adcq   %[c1], %[c1]\n\t"
        "addq   %[c0], %[t5]\n\t"
        "adcq   %[c1], %[t6]\n\t"

        "movq   24(%[a]), %%rdx\n\t"
        "mulxq  %%rdx, %[c0], %[t7]\n\t"
        "addq   %[c0], %[t6]\n\t"
        "adcq   $0, %[t7]"

        : [t0] "=&r" (t0), [t1] "=&r" (t1), [t2] "=&r" (t2), [t3] "=&r" (t3),
          [t4] "=&r" (t4), [t5] "=&r" (t5), [t6] "=&r" (t6), [t7] "=&r" (t7),
          [c0] "=&r" (c0), [c1] "=&r" (c1), [c2] "=&r" (c2)
        : [a] "r" (a)
        : "rdx", "cc"
    );

    r[0] = t0; r[1] = t1; r[2] = t2; r[3] = t3;
    r[4] = t4; r[5] = t5; r[6] = t6; r[7] = t7;
}

#else

static inline uint64_t add_256(uint64_t *r, const uint64_t *a, const uint64_t *b) {
    __uint128_t acc = 0;
    for (int i = 0; i < 4; i++) {
        acc += (__uint128_t)a[i] + b[i];
        r[i] = (uint64_t)acc;
        acc >>= 64;
    }
    return (uint64_t)acc;
}

static inline uint64_t sub_256(uint64_t *r, const uint64_t *a, const uint64_t *b) {
    __int128_t acc = 0;
    for (int i = 0; i < 4; i++) {
        acc += (__int128_t)a[i] - b[i];
        r[i] = (uint64_t)acc;
        acc >>= 64;
    }
    return (acc < 0) ? 1 : 0;
}

static void mul_256x256(uint64_t *r, const uint64_t *a, const uint64_t *b) {
    __uint128_t acc;
    uint64_t carry = 0;

    for (int i = 0; i < 8; i++) r[i] = 0;

    for (int i = 0; i < 4; i++) {
        carry = 0;
        for (int j = 0; j < 4; j++) {
            acc = (__uint128_t)a[i] * b[j] + r[i + j] + carry;
            r[i + j] = (uint64_t)acc;
            carry = (uint64_t)(acc >> 64);
        }
        r[i + 4] = carry;
    }
}

static void sqr_256(uint64_t *r, const uint64_t *a) {
    mul_256x256(r, a, a);
}

static void mont_reduce(uint64_t *r, uint64_t *t) {
    __uint128_t acc;
    uint64_t k, carry;

    for (int i = 0; i < 4; i++) {
        k = t[i] * FIELD_INV;
        carry = 0;
        for (int j = 0; j < 4; j++) {
            acc = (__uint128_t)k * FIELD_MODULUS[j] + t[i + j] + carry;
            t[i + j] = (uint64_t)acc;
            carry = (uint64_t)(acc >> 64);
        }
        for (int j = i + 4; j < 8 && carry; j++) {
            acc = (__uint128_t)t[j] + carry;
            t[j] = (uint64_t)acc;
            carry = (uint64_t)(acc >> 64);
        }
    }

    r[0] = t[4]; r[1] = t[5]; r[2] = t[6]; r[3] = t[7];

    uint64_t tmp[4];
    uint64_t borrow = sub_256(tmp, r, FIELD_MODULUS);
    uint64_t mask = borrow - 1;
    r[0] = (r[0] & ~mask) | (tmp[0] & mask);
    r[1] = (r[1] & ~mask) | (tmp[1] & mask);
    r[2] = (r[2] & ~mask) | (tmp[2] & mask);
    r[3] = (r[3] & ~mask) | (tmp[3] & mask);
}

#endif

void field_add(field_t *r, const field_t *a, const field_t *b) {
    uint64_t tmp[4];
    uint64_t carry = add_256(r->limbs, a->limbs, b->limbs);
    uint64_t borrow = sub_256(tmp, r->limbs, FIELD_MODULUS);
    /* If carry or no borrow, use reduced result */
    /* carry=1 means definitely >= p, borrow=0 means r >= p */
    uint64_t use_reduced = carry | (borrow ^ 1);
    uint64_t mask = -(uint64_t)use_reduced;
    r->limbs[0] = (r->limbs[0] & ~mask) | (tmp[0] & mask);
    r->limbs[1] = (r->limbs[1] & ~mask) | (tmp[1] & mask);
    r->limbs[2] = (r->limbs[2] & ~mask) | (tmp[2] & mask);
    r->limbs[3] = (r->limbs[3] & ~mask) | (tmp[3] & mask);
}

void field_sub(field_t *r, const field_t *a, const field_t *b) {
    uint64_t tmp[4];
    uint64_t borrow = sub_256(r->limbs, a->limbs, b->limbs);
    add_256(tmp, r->limbs, FIELD_MODULUS);
    /* If borrow, use corrected result */
    uint64_t mask = -(uint64_t)borrow;
    r->limbs[0] = (r->limbs[0] & ~mask) | (tmp[0] & mask);
    r->limbs[1] = (r->limbs[1] & ~mask) | (tmp[1] & mask);
    r->limbs[2] = (r->limbs[2] & ~mask) | (tmp[2] & mask);
    r->limbs[3] = (r->limbs[3] & ~mask) | (tmp[3] & mask);
}

void field_mul(field_t *r, const field_t *a, const field_t *b) {
    uint64_t t[8];
    mul_256x256(t, a->limbs, b->limbs);
    mont_reduce(r->limbs, t);
}

void field_sqr(field_t *r, const field_t *a) {
    uint64_t t[8];
    sqr_256(t, a->limbs);
    mont_reduce(r->limbs, t);
}

void field_neg(field_t *r, const field_t *a) {
    if (field_is_zero(a)) {
        field_set_zero(r);
    } else {
        sub_256(r->limbs, FIELD_MODULUS, a->limbs);
    }
}

void field_inv(field_t *r, const field_t *a) {
    static const uint64_t exp[4] = {
        0x3C208C16D87CFD45ULL,
        0x97816A916871CA8DULL,
        0xB85045B68181585DULL,
        0x30644E72E131A029ULL
    };

    field_t base, result;
    field_copy(&base, a);
    field_set_one(&result);

    for (int i = 0; i < 4; i++) {
        uint64_t e = exp[i];
        for (int j = 0; j < 64; j++) {
            if (e & 1) {
                field_mul(&result, &result, &base);
            }
            field_sqr(&base, &base);
            e >>= 1;
        }
    }

    field_copy(r, &result);
}

void field_batch_inv(field_t *r, const field_t *a, size_t count) {
    if (count == 0) return;
    if (count == 1) {
        field_inv(r, a);
        return;
    }

    field_t *acc = (field_t *)malloc(count * sizeof(field_t));
    if (!acc) {
        for (size_t i = 0; i < count; i++) {
            field_inv(&r[i], &a[i]);
        }
        return;
    }

    field_copy(&acc[0], &a[0]);
    for (size_t i = 1; i < count; i++) {
        field_mul(&acc[i], &acc[i-1], &a[i]);
    }

    field_t inv_all;
    field_inv(&inv_all, &acc[count-1]);

    for (size_t i = count - 1; i > 0; i--) {
        field_mul(&r[i], &inv_all, &acc[i-1]);
        field_mul(&inv_all, &inv_all, &a[i]);
    }
    field_copy(&r[0], &inv_all);

    volatile uint8_t *p = (volatile uint8_t *)acc;
    for (size_t i = 0; i < count * sizeof(field_t); i++) {
        p[i] = 0;
    }
    free(acc);
}

void field_pow(field_t *r, const field_t *a, const uint64_t *exp, size_t exp_len) {
    field_t base, result;
    field_copy(&base, a);
    field_set_one(&result);

    for (size_t i = 0; i < exp_len; i++) {
        uint64_t e = exp[i];
        for (int j = 0; j < 64; j++) {
            if (e & 1) {
                field_mul(&result, &result, &base);
            }
            field_sqr(&base, &base);
            e >>= 1;
        }
    }

    field_copy(r, &result);
}

void field_to_mont(field_t *r, const field_t *a) {
    field_mul(r, a, (const field_t *)FIELD_R2);
}

void field_from_mont(field_t *r, const field_t *a) {
    uint64_t t[8] = {a->limbs[0], a->limbs[1], a->limbs[2], a->limbs[3], 0, 0, 0, 0};
    mont_reduce(r->limbs, t);
}

bool field_eq(const field_t *a, const field_t *b) {
    uint64_t diff = 0;
    diff |= a->limbs[0] ^ b->limbs[0];
    diff |= a->limbs[1] ^ b->limbs[1];
    diff |= a->limbs[2] ^ b->limbs[2];
    diff |= a->limbs[3] ^ b->limbs[3];
    return diff == 0;
}

bool field_is_zero(const field_t *a) {
    return (a->limbs[0] | a->limbs[1] | a->limbs[2] | a->limbs[3]) == 0;
}

void field_set_zero(field_t *r) {
    r->limbs[0] = r->limbs[1] = r->limbs[2] = r->limbs[3] = 0;
}

void field_set_one(field_t *r) {
    r->limbs[0] = FIELD_R[0];
    r->limbs[1] = FIELD_R[1];
    r->limbs[2] = FIELD_R[2];
    r->limbs[3] = FIELD_R[3];
}

void field_copy(field_t *r, const field_t *a) {
    r->limbs[0] = a->limbs[0];
    r->limbs[1] = a->limbs[1];
    r->limbs[2] = a->limbs[2];
    r->limbs[3] = a->limbs[3];
}

int field_cmp(const field_t *a, const field_t *b) {
    /* Constant-time comparison */
    uint64_t gt = 0, lt = 0;
    for (int i = 3; i >= 0; i--) {
        uint64_t a_gt_b = (b->limbs[i] - a->limbs[i]) >> 63;
        uint64_t b_gt_a = (a->limbs[i] - b->limbs[i]) >> 63;
        /* Only update if we haven't determined order yet */
        uint64_t undecided = (gt | lt) ^ 1;
        gt |= (a_gt_b & undecided);
        lt |= (b_gt_a & undecided);
    }
    return (int)gt - (int)lt;
}

void field_from_bytes(field_t *r, const uint8_t *bytes) {
    for (int i = 0; i < 4; i++) {
        r->limbs[3-i] = ((uint64_t)bytes[i*8+0] << 56) |
                        ((uint64_t)bytes[i*8+1] << 48) |
                        ((uint64_t)bytes[i*8+2] << 40) |
                        ((uint64_t)bytes[i*8+3] << 32) |
                        ((uint64_t)bytes[i*8+4] << 24) |
                        ((uint64_t)bytes[i*8+5] << 16) |
                        ((uint64_t)bytes[i*8+6] << 8) |
                        ((uint64_t)bytes[i*8+7]);
    }
}

void field_to_bytes(uint8_t *bytes, const field_t *a) {
    for (int i = 0; i < 4; i++) {
        uint64_t limb = a->limbs[3-i];
        bytes[i*8+0] = (uint8_t)(limb >> 56);
        bytes[i*8+1] = (uint8_t)(limb >> 48);
        bytes[i*8+2] = (uint8_t)(limb >> 40);
        bytes[i*8+3] = (uint8_t)(limb >> 32);
        bytes[i*8+4] = (uint8_t)(limb >> 24);
        bytes[i*8+5] = (uint8_t)(limb >> 16);
        bytes[i*8+6] = (uint8_t)(limb >> 8);
        bytes[i*8+7] = (uint8_t)(limb);
    }
}

void field_batch_mul(field_t *r, const field_t *a, const field_t *b, size_t count) {
    size_t i = 0;
    for (; i + 4 <= count; i += 4) {
        field_mul(&r[i], &a[i], &b[i]);
        field_mul(&r[i+1], &a[i+1], &b[i+1]);
        field_mul(&r[i+2], &a[i+2], &b[i+2]);
        field_mul(&r[i+3], &a[i+3], &b[i+3]);
    }
    for (; i < count; i++) {
        field_mul(&r[i], &a[i], &b[i]);
    }
}

void field_secure_zero(field_t *f) {
    volatile uint64_t *p = (volatile uint64_t *)f->limbs;
    p[0] = 0; p[1] = 0; p[2] = 0; p[3] = 0;
}
