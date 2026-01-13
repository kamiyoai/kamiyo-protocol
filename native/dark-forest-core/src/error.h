/*
 * Error codes and resource limits
 */

#ifndef DARK_FOREST_ERROR_H
#define DARK_FOREST_ERROR_H

/* Error codes - negative values indicate errors */
typedef enum {
    DARK_FOREST_OK = 0,

    /* General errors */
    DARK_FOREST_ERR_INVALID_ARG = -1,
    DARK_FOREST_ERR_NULL_PTR = -2,
    DARK_FOREST_ERR_OUT_OF_MEMORY = -3,
    DARK_FOREST_ERR_NOT_INITIALIZED = -4,

    /* Resource limits */
    DARK_FOREST_ERR_BATCH_FULL = -10,
    DARK_FOREST_ERR_ARENA_EXHAUSTED = -11,
    DARK_FOREST_ERR_SIZE_LIMIT = -12,

    /* Cryptographic errors */
    DARK_FOREST_ERR_RNG_FAILED = -20,
    DARK_FOREST_ERR_INVALID_POINT = -21,
    DARK_FOREST_ERR_NOT_ON_CURVE = -22,
    DARK_FOREST_ERR_INVALID_PROOF = -23,
    DARK_FOREST_ERR_PAIRING_FAILED = -24,

    /* Proof verification results (not errors, but result codes) */
    DARK_FOREST_VERIFY_OK = 0,
    DARK_FOREST_VERIFY_INVALID = 1,
    DARK_FOREST_VERIFY_BELOW_THRESHOLD = 2,
    DARK_FOREST_VERIFY_EXPIRED = 3,
    DARK_FOREST_VERIFY_MALFORMED = 4,
    DARK_FOREST_VERIFY_BLACKLISTED = 5,
} dark_forest_error_t;

/* Get human-readable error message */
const char *dark_forest_error_str(dark_forest_error_t err);

/* Resource limits (can be overridden at compile time) */
#ifndef DARK_FOREST_MAX_BATCH_SIZE
#define DARK_FOREST_MAX_BATCH_SIZE 1024
#endif

#ifndef DARK_FOREST_MAX_ARENA_SIZE
#define DARK_FOREST_MAX_ARENA_SIZE (64 * 1024 * 1024)  /* 64 MB */
#endif

#ifndef DARK_FOREST_MAX_PROOF_SIZE
#define DARK_FOREST_MAX_PROOF_SIZE 4096
#endif

#ifndef DARK_FOREST_MAX_VK_SIZE
#define DARK_FOREST_MAX_VK_SIZE (1024 * 1024)  /* 1 MB */
#endif

#endif /* DARK_FOREST_ERROR_H */
