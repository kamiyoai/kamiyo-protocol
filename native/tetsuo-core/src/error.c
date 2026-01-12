/*
 * Error code to string mapping
 */

#include "error.h"

const char *tetsuo_error_str(tetsuo_error_t err) {
    switch (err) {
        case TETSUO_OK:
            return "OK";

        /* General errors */
        case TETSUO_ERR_INVALID_ARG:
            return "Invalid argument";
        case TETSUO_ERR_NULL_PTR:
            return "Null pointer";
        case TETSUO_ERR_OUT_OF_MEMORY:
            return "Out of memory";
        case TETSUO_ERR_NOT_INITIALIZED:
            return "Not initialized";

        /* Resource limits */
        case TETSUO_ERR_BATCH_FULL:
            return "Batch full";
        case TETSUO_ERR_ARENA_EXHAUSTED:
            return "Arena exhausted";
        case TETSUO_ERR_SIZE_LIMIT:
            return "Size limit exceeded";

        /* Cryptographic errors */
        case TETSUO_ERR_RNG_FAILED:
            return "RNG failed";
        case TETSUO_ERR_INVALID_POINT:
            return "Invalid point";
        case TETSUO_ERR_NOT_ON_CURVE:
            return "Point not on curve";
        case TETSUO_ERR_INVALID_PROOF:
            return "Invalid proof";
        case TETSUO_ERR_PAIRING_FAILED:
            return "Pairing failed";

        /* Verification results (not errors) */
        /* TETSUO_VERIFY_OK == TETSUO_OK == 0, handled above */
        case TETSUO_VERIFY_INVALID:
            return "Verification invalid";
        case TETSUO_VERIFY_BELOW_THRESHOLD:
            return "Below threshold";
        case TETSUO_VERIFY_EXPIRED:
            return "Proof expired";
        case TETSUO_VERIFY_MALFORMED:
            return "Malformed proof";
        case TETSUO_VERIFY_BLACKLISTED:
            return "Blacklisted";

        default:
            return "Unknown error";
    }
}
