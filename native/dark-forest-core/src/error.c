/*
 * Error code to string mapping
 */

#include "error.h"

const char *dark_forest_error_str(dark_forest_error_t err) {
    switch (err) {
        case DARK_FOREST_OK:
            return "OK";

        /* General errors */
        case DARK_FOREST_ERR_INVALID_ARG:
            return "Invalid argument";
        case DARK_FOREST_ERR_NULL_PTR:
            return "Null pointer";
        case DARK_FOREST_ERR_OUT_OF_MEMORY:
            return "Out of memory";
        case DARK_FOREST_ERR_NOT_INITIALIZED:
            return "Not initialized";

        /* Resource limits */
        case DARK_FOREST_ERR_BATCH_FULL:
            return "Batch full";
        case DARK_FOREST_ERR_ARENA_EXHAUSTED:
            return "Arena exhausted";
        case DARK_FOREST_ERR_SIZE_LIMIT:
            return "Size limit exceeded";

        /* Cryptographic errors */
        case DARK_FOREST_ERR_RNG_FAILED:
            return "RNG failed";
        case DARK_FOREST_ERR_INVALID_POINT:
            return "Invalid point";
        case DARK_FOREST_ERR_NOT_ON_CURVE:
            return "Point not on curve";
        case DARK_FOREST_ERR_INVALID_PROOF:
            return "Invalid proof";
        case DARK_FOREST_ERR_PAIRING_FAILED:
            return "Pairing failed";

        /* Verification results (not errors) */
        /* DARK_FOREST_VERIFY_OK == DARK_FOREST_OK == 0, handled above */
        case DARK_FOREST_VERIFY_INVALID:
            return "Verification invalid";
        case DARK_FOREST_VERIFY_BELOW_THRESHOLD:
            return "Below threshold";
        case DARK_FOREST_VERIFY_EXPIRED:
            return "Proof expired";
        case DARK_FOREST_VERIFY_MALFORMED:
            return "Malformed proof";
        case DARK_FOREST_VERIFY_BLACKLISTED:
            return "Blacklisted";

        default:
            return "Unknown error";
    }
}
