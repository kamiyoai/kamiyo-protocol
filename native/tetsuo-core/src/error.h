/*
 * Error codes and resource limits
 */

#ifndef TETSUO_ERROR_H
#define TETSUO_ERROR_H

/* Error codes - negative values indicate errors */
typedef enum {
    TETSUO_OK = 0,

    /* General errors */
    TETSUO_ERR_INVALID_ARG = -1,
    TETSUO_ERR_NULL_PTR = -2,
    TETSUO_ERR_OUT_OF_MEMORY = -3,
    TETSUO_ERR_NOT_INITIALIZED = -4,

    /* Resource limits */
    TETSUO_ERR_BATCH_FULL = -10,
    TETSUO_ERR_ARENA_EXHAUSTED = -11,
    TETSUO_ERR_SIZE_LIMIT = -12,

    /* Cryptographic errors */
    TETSUO_ERR_RNG_FAILED = -20,
    TETSUO_ERR_INVALID_POINT = -21,
    TETSUO_ERR_NOT_ON_CURVE = -22,
    TETSUO_ERR_INVALID_PROOF = -23,
    TETSUO_ERR_PAIRING_FAILED = -24,

    /* Proof verification results (not errors, but result codes) */
    TETSUO_VERIFY_OK = 0,
    TETSUO_VERIFY_INVALID = 1,
    TETSUO_VERIFY_BELOW_THRESHOLD = 2,
    TETSUO_VERIFY_EXPIRED = 3,
    TETSUO_VERIFY_MALFORMED = 4,
    TETSUO_VERIFY_BLACKLISTED = 5,
} tetsuo_error_t;

/* Get human-readable error message */
const char *tetsuo_error_str(tetsuo_error_t err);

/* Resource limits (can be overridden at compile time) */
#ifndef TETSUO_MAX_BATCH_SIZE
#define TETSUO_MAX_BATCH_SIZE 1024
#endif

#ifndef TETSUO_MAX_ARENA_SIZE
#define TETSUO_MAX_ARENA_SIZE (64 * 1024 * 1024)  /* 64 MB */
#endif

#ifndef TETSUO_MAX_PROOF_SIZE
#define TETSUO_MAX_PROOF_SIZE 4096
#endif

#ifndef TETSUO_MAX_VK_SIZE
#define TETSUO_MAX_VK_SIZE (1024 * 1024)  /* 1 MB */
#endif

#endif /* TETSUO_ERROR_H */
